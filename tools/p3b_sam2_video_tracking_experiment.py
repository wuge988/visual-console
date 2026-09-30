#!/usr/bin/env python3
"""P3-B bounded SAM 2.1 VideoPredictor experiment harness.

Runs one of at most three authorized SAM2 video-tracking attempts against the
current Support V3 evidence. Each attempt stops at a Human Visual Gate.
No reconstruction, Archive promotion, production registration, or source mutation
is authorized here.

Attempt 1: one automatically selected clean mask seed.
Attempt 2: two automatically selected clean mask seeds.
Attempt 3: one auto-derived box + positive point + support-negative points.

SAM 3.1 fallback is not executed by this harness; it becomes eligible only after
three recorded SAM2 VideoPredictor Human Gate FAIL results.
"""
from __future__ import annotations

import argparse
import gc
import hashlib
import json
import math
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

import cv2
import numpy as np
from PIL import Image, ImageDraw

PILOT_ID = "P3B-M3D01-DC-ZY-SZ-31001"
ITEM_ID = "DC-ZY-SZ-31001"
MIN_USABLE_FRAMES = 16
MAX_ATTEMPTS = 3
NEUTRAL_GRAY = 127

ATTEMPT_STRATEGIES = {
    1: "SINGLE_AUTO_CLEAN_MASK_SEED",
    2: "DUAL_AUTO_CLEAN_MASK_SEEDS",
    3: "AUTO_BOX_POSITIVE_AND_SUPPORT_NEGATIVE_POINTS",
}


@dataclass
class TrackRow:
    sequence: int
    source_file: str
    source_sha256: str
    reference_mask_file: str
    tracked_mask_file: str | None = None
    tracked_masked_file: str | None = None
    delta_file: str | None = None
    area_ratio: float | None = None
    reference_iou: float | None = None
    border_ratio: float | None = None
    accepted: bool = False
    reject_reason: str | None = None


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def ensure_empty_or_create(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)
    if any(path.iterdir()):
        raise RuntimeError(f"P3B_TRACK_OUTPUT_DIR_NOT_EMPTY:{path}")


def iou(a: np.ndarray, b: np.ndarray) -> float:
    a = a.astype(bool)
    b = b.astype(bool)
    union = np.logical_or(a, b).sum()
    if union == 0:
        return 1.0
    return float(np.logical_and(a, b).sum() / union)


def border_ratio(mask: np.ndarray) -> float:
    mask = mask.astype(bool)
    if not mask.any():
        return 1.0
    h, w = mask.shape
    thickness = max(2, int(round(min(h, w) * 0.012)))
    border = np.zeros_like(mask, dtype=bool)
    border[:thickness, :] = True
    border[-thickness:, :] = True
    border[:, :thickness] = True
    border[:, -thickness:] = True
    return float(np.logical_and(mask, border).sum() / max(1, mask.sum()))


def contact_sheet(items: Iterable[tuple[Path, str]], output: Path, cols: int = 5) -> None:
    entries = list(items)
    if not entries:
        return
    thumb_w, thumb_h, label_h = 300, 210, 30
    rows = math.ceil(len(entries) / cols)
    canvas = Image.new("RGB", (cols * thumb_w, rows * (thumb_h + label_h)), (28, 28, 28))
    draw = ImageDraw.Draw(canvas)
    for i, (path, label) in enumerate(entries):
        image = Image.open(path).convert("RGB")
        image.thumbnail((thumb_w - 8, thumb_h - 8), Image.Resampling.LANCZOS)
        x0 = (i % cols) * thumb_w
        y0 = (i // cols) * (thumb_h + label_h)
        canvas.paste(image, (x0 + (thumb_w - image.width) // 2, y0 + (thumb_h - image.height) // 2))
        draw.text((x0 + 6, y0 + thumb_h + 5), label[:62], fill=(235, 235, 235))
    canvas.save(output, quality=92)


def load_support_v3_rows(support_v3_dir: Path):
    manifest_path = support_v3_dir / "evaluation_manifest.json"
    if not manifest_path.is_file():
        raise RuntimeError(f"P3B_TRACK_SUPPORT_V3_MANIFEST_MISSING:{manifest_path}")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("pilot_id") != PILOT_ID or manifest.get("item_id") != ITEM_ID:
        raise RuntimeError("P3B_TRACK_SUPPORT_V3_IDENTITY_MISMATCH")
    if manifest.get("authority") != "EVALUATION_ONLY" or manifest.get("production_registration") is not False:
        raise RuntimeError("P3B_TRACK_SUPPORT_V3_AUTHORITY_INVALID")
    if manifest.get("gate_state", {}).get("FRAME_QC") != "PASS":
        raise RuntimeError("P3B_TRACK_PARENT_FRAME_QC_NOT_PASS")
    rows = list(manifest.get("support_suppression_v3", {}).get("rows") or [])
    rows = [r for r in rows if r.get("accepted")]
    rows.sort(key=lambda r: int(r["sequence"]))
    if len(rows) < MIN_USABLE_FRAMES:
        raise RuntimeError(f"P3B_TRACK_SUPPORT_V3_INSUFFICIENT:{len(rows)}")
    return manifest_path, manifest, rows


def load_parent_v2_rows(v3_manifest: dict):
    v2_path = Path(str(v3_manifest["parent_support_v2_manifest"])).resolve()
    if not v2_path.is_file():
        return {}
    v2 = json.loads(v2_path.read_text(encoding="utf-8"))
    return {int(r["sequence"]): r for r in v2.get("support_suppression_v2", {}).get("rows", [])}


def choose_clean_seed_rows(rows: list[dict], v2_rows: dict[int, dict], attempt: int) -> list[dict]:
    clean = []
    for r in rows:
        seq = int(r["sequence"])
        residual = int(r.get("residual_support_components_removed") or 0)
        v2_removed = int((v2_rows.get(seq) or {}).get("support_components_removed") or 0)
        if residual == 0 and v2_removed > 0:
            clean.append(r)
    if not clean:
        clean = [r for r in rows if int(r.get("residual_support_components_removed") or 0) == 0]
    if not clean:
        clean = rows[:]

    n = len(rows)
    if attempt == 1:
        target = (n - 1) / 2
        return [min(clean, key=lambda r: (abs(int(r["sequence"]) - target), -float(r.get("mask_area_after") or 0.0)))]

    if attempt == 2:
        targets = [(n - 1) * 0.30, (n - 1) * 0.70]
        picked = []
        remaining = clean[:]
        for target in targets:
            if not remaining:
                break
            best = min(remaining, key=lambda r: (abs(int(r["sequence"]) - target), -float(r.get("mask_area_after") or 0.0)))
            picked.append(best)
            remaining = [r for r in remaining if int(r["sequence"]) != int(best["sequence"])]
        if len(picked) < 2:
            raise RuntimeError("P3B_TRACK_DUAL_SEED_UNAVAILABLE")
        return sorted(picked, key=lambda r: int(r["sequence"]))

    target = (n - 1) / 2
    candidates = []
    for r in rows:
        seq = int(r["sequence"])
        v2_removed = int((v2_rows.get(seq) or {}).get("support_components_removed") or 0)
        if v2_removed > 0:
            candidates.append(r)
    if not candidates:
        candidates = clean
    return [min(candidates, key=lambda r: (abs(int(r["sequence"]) - target), -float(r.get("mask_area_after") or 0.0)))]


def copy_tracking_frames(rows: list[dict], frames_dir: Path) -> None:
    frames_dir.mkdir()
    for r in rows:
        seq = int(r["sequence"])
        src = Path(str(r["source_file"])).resolve()
        if not src.is_file():
            raise RuntimeError(f"P3B_TRACK_SOURCE_FRAME_MISSING:{src}")
        image = Image.open(src).convert("RGB")
        dst = frames_dir / f"{seq:05d}.jpg"
        image.save(dst, quality=98, subsampling=0)


def load_mask(path: Path) -> np.ndarray:
    return np.asarray(Image.open(path).convert("L")) >= 128


def derive_attempt3_prompts(seed_row: dict, v2_row: dict | None):
    mask = load_mask(Path(str(seed_row["output_mask_file"])).resolve())
    ys, xs = np.nonzero(mask)
    if len(xs) == 0:
        raise RuntimeError("P3B_TRACK_ATTEMPT3_EMPTY_SEED_MASK")
    x0, y0, x1, y1 = int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1
    pad_x = max(4, int(round((x1 - x0) * 0.03)))
    pad_y = max(4, int(round((y1 - y0) * 0.03)))
    h, w = mask.shape
    box = np.array([max(0, x0-pad_x), max(0, y0-pad_y), min(w-1, x1+pad_x), min(h-1, y1+pad_y)], dtype=np.float32)

    dist = cv2.distanceTransform(mask.astype(np.uint8), cv2.DIST_L2, 5)
    py, px = np.unravel_index(int(np.argmax(dist)), dist.shape)
    points = [[float(px), float(py)]]
    labels = [1]

    removed = np.zeros_like(mask)
    if v2_row:
        parent_raw = str(v2_row.get("input_refined_mask_file") or "")
        if parent_raw:
            parent_path = Path(parent_raw).resolve()
            if parent_path.is_file():
                parent = load_mask(parent_path)
                removed |= parent & ~mask

    count, comp_labels, stats, centroids = cv2.connectedComponentsWithStats(removed.astype(np.uint8), 8)
    comps = []
    for idx in range(1, count):
        area = int(stats[idx, cv2.CC_STAT_AREA])
        if area >= 20:
            comps.append((area, centroids[idx]))
    comps.sort(reverse=True, key=lambda x: x[0])
    for _, centroid in comps[:3]:
        points.append([float(centroid[0]), float(centroid[1])])
        labels.append(0)

    return box, np.asarray(points, dtype=np.float32), np.asarray(labels, dtype=np.int32)


def run_tracking(attempt, frames_dir, seed_rows, v2_rows, checkpoint, model_config):
    import torch
    from sam2.build_sam import build_sam2_video_predictor

    if not torch.cuda.is_available():
        raise RuntimeError("P3B_TRACK_CUDA_REQUIRED")

    predictor = build_sam2_video_predictor(
        model_config,
        str(checkpoint),
        device="cuda",
        apply_postprocessing=False,
        vos_optimized=False,
    )

    state = predictor.init_state(
        str(frames_dir),
        offload_video_to_cpu=True,
        offload_state_to_cpu=True,
        async_loading_frames=False,
    )

    seed_sequences = [int(r["sequence"]) for r in seed_rows]
    prompt_summary = {"seed_sequences": seed_sequences}

    with torch.inference_mode(), torch.autocast("cuda", dtype=torch.bfloat16):
        if attempt in (1, 2):
            for seed in seed_rows:
                seq = int(seed["sequence"])
                seed_mask = load_mask(Path(str(seed["output_mask_file"])).resolve())
                predictor.add_new_mask(state, frame_idx=seq, obj_id=1, mask=seed_mask)
            prompt_summary["prompt_type"] = "MASK"
        else:
            seed = seed_rows[0]
            seq = int(seed["sequence"])
            box, points, labels = derive_attempt3_prompts(seed, v2_rows.get(seq))
            predictor.add_new_points_or_box(
                state,
                frame_idx=seq,
                obj_id=1,
                points=points,
                labels=labels,
                box=box,
            )
            prompt_summary["prompt_type"] = "BOX_PLUS_POINTS"
            prompt_summary["box_xyxy"] = box.tolist()
            prompt_summary["points_xy"] = points.tolist()
            prompt_summary["point_labels"] = labels.tolist()

        results: dict[int, np.ndarray] = {}
        start = min(seed_sequences)

        for frame_idx, obj_ids, mask_logits in predictor.propagate_in_video(
            state, start_frame_idx=start, reverse=False
        ):
            results[int(frame_idx)] = (mask_logits[0] > 0).detach().cpu().numpy().squeeze().astype(bool)

        if start > 0:
            for frame_idx, obj_ids, mask_logits in predictor.propagate_in_video(
                state, start_frame_idx=start, reverse=True
            ):
                results[int(frame_idx)] = (mask_logits[0] > 0).detach().cpu().numpy().squeeze().astype(bool)

    del state
    del predictor
    gc.collect()
    torch.cuda.empty_cache()
    return results, prompt_summary


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--support-v3-dir", required=True)
    p.add_argument("--checkpoint", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--attempt", type=int, required=True, choices=[1, 2, 3])
    p.add_argument("--model-config", default="configs/sam2.1/sam2.1_hiera_b+.yaml")
    p.add_argument("--item-id", default=ITEM_ID)
    p.add_argument("--background", type=int, default=NEUTRAL_GRAY)
    return p.parse_args()


def main() -> int:
    args = parse_args()
    if args.item_id != ITEM_ID:
        raise RuntimeError(f"P3B_PILOT_ITEM_MISMATCH:{args.item_id}")

    support_v3_dir = Path(args.support_v3_dir).resolve()
    manifest_path, v3_manifest, rows = load_support_v3_rows(support_v3_dir)
    v2_rows = load_parent_v2_rows(v3_manifest)

    checkpoint = Path(args.checkpoint).resolve()
    if not checkpoint.is_file():
        raise RuntimeError(f"P3B_TRACK_CHECKPOINT_MISSING:{checkpoint}")

    out = Path(args.out).resolve()
    ensure_empty_or_create(out)
    frames_dir = out / "tracking_frames"
    masks_dir = out / "tracking_masks"
    masked_dir = out / "tracking_masked"
    delta_dir = out / "tracking_delta_vs_support_v3"
    masks_dir.mkdir()
    masked_dir.mkdir()
    delta_dir.mkdir()

    source_hashes_before = {
        str(Path(str(r["source_file"])).resolve()): sha256_file(Path(str(r["source_file"])).resolve())
        for r in rows
    }
    copy_tracking_frames(rows, frames_dir)

    seed_rows = choose_clean_seed_rows(rows, v2_rows, args.attempt)
    results, prompt_summary = run_tracking(
        args.attempt, frames_dir, seed_rows, v2_rows, checkpoint, args.model_config
    )

    tracked_rows: list[TrackRow] = []
    mask_sheet = []
    masked_sheet = []
    delta_sheet = []
    accepted_count = 0
    adjacent_ious = []
    previous_mask = None

    for r in rows:
        seq = int(r["sequence"])
        source_file = Path(str(r["source_file"])).resolve()
        reference_mask_file = Path(str(r["output_mask_file"])).resolve()
        tracked = results.get(seq)
        if tracked is None:
            tracked_rows.append(TrackRow(
                sequence=seq,
                source_file=str(source_file),
                source_sha256=source_hashes_before[str(source_file)],
                reference_mask_file=str(reference_mask_file),
                reject_reason="TRACK_RESULT_MISSING",
            ))
            continue

        image_rgb = np.asarray(Image.open(source_file).convert("RGB")).copy()
        reference = load_mask(reference_mask_file)
        if tracked.shape != reference.shape:
            tracked = cv2.resize(
                tracked.astype(np.uint8),
                (reference.shape[1], reference.shape[0]),
                interpolation=cv2.INTER_NEAREST,
            ).astype(bool)

        area = float(tracked.mean())
        ref_iou = iou(tracked, reference)
        br = border_ratio(tracked)

        reject = None
        if not (0.02 <= area <= 0.48):
            reject = "TRACK_MASK_AREA_OUT_OF_RANGE"
        elif ref_iou < 0.45:
            reject = "TRACK_REFERENCE_IOU_TOO_LOW"
        elif br > 0.20:
            reject = "TRACK_BORDER_TOUCH_EXCESSIVE"

        mask_path = masks_dir / f"frame_{seq:03d}.png"
        Image.fromarray(tracked.astype(np.uint8) * 255).save(mask_path)

        background = np.full_like(image_rgb, args.background, dtype=np.uint8)
        masked = np.where(tracked[..., None], image_rgb, background)
        masked_path = masked_dir / f"frame_{seq:03d}.png"
        Image.fromarray(masked).save(masked_path)

        added = tracked & ~reference
        removed = reference & ~tracked
        delta = image_rgb.copy()
        delta[added] = np.array([40, 220, 70], dtype=np.uint8)
        delta[removed] = np.array([230, 40, 180], dtype=np.uint8)
        delta_path = delta_dir / f"frame_{seq:03d}.png"
        Image.fromarray(delta).save(delta_path)

        row = TrackRow(
            sequence=seq,
            source_file=str(source_file),
            source_sha256=source_hashes_before[str(source_file)],
            reference_mask_file=str(reference_mask_file),
            tracked_mask_file=str(mask_path),
            tracked_masked_file=str(masked_path),
            delta_file=str(delta_path),
            area_ratio=area,
            reference_iou=ref_iou,
            border_ratio=br,
            accepted=reject is None,
            reject_reason=reject,
        )
        tracked_rows.append(row)
        if row.accepted:
            accepted_count += 1

        if previous_mask is not None:
            adjacent_ious.append(iou(previous_mask, tracked))
        previous_mask = tracked

        status = "OK" if row.accepted else f"REJECT {reject}"
        mask_sheet.append((mask_path, f"{seq:02d} {status} area={area:.3f} iou={ref_iou:.2f}"))
        masked_sheet.append((masked_path, f"{seq:02d} iou={ref_iou:.2f} border={br:.3f}"))
        delta_sheet.append((delta_path, f"{seq:02d} green=added magenta=removed"))

    for source_file, before in source_hashes_before.items():
        if sha256_file(Path(source_file)) != before:
            raise RuntimeError(f"P3B_SOURCE_FRAME_MUTATED:{source_file}")

    contact_sheet(mask_sheet, out / "tracking_mask_contact_sheet.jpg")
    contact_sheet(masked_sheet, out / "tracking_masked_contact_sheet.jpg")
    contact_sheet(delta_sheet, out / "tracking_delta_contact_sheet.jpg")

    checkpoint_sha = sha256_file(checkpoint)
    median_adjacent_iou = float(np.median(adjacent_ious)) if adjacent_ious else None

    result = {
        "schema_version": "1.0",
        "pilot_id": PILOT_ID,
        "phase": "P3-B",
        "authority": "EVALUATION_ONLY",
        "production_registration": False,
        "pdp_blocking": False,
        "item_id": ITEM_ID,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "experiment_policy": {
            "sam2_video_max_attempts": MAX_ATTEMPTS,
            "attempt": args.attempt,
            "strategy": ATTEMPT_STRATEGIES[args.attempt],
            "sam3_1_fallback_authorized_after_three_human_failures": True,
        },
        "parent_support_v3_manifest": str(manifest_path),
        "parent_support_v3_manifest_sha256": sha256_file(manifest_path),
        "model": {
            "family": "SAM_2_1",
            "predictor": "SAM2VideoPredictor",
            "config": args.model_config,
            "checkpoint": str(checkpoint),
            "checkpoint_sha256": checkpoint_sha,
        },
        "prompt": prompt_summary,
        "tracking": {
            "accepted_count": accepted_count,
            "rejected_count": len(tracked_rows) - accepted_count,
            "minimum_required": MIN_USABLE_FRAMES,
            "median_adjacent_mask_iou": median_adjacent_iou,
            "rows": [asdict(r) for r in tracked_rows],
            "mask_contact_sheet": str(out / "tracking_mask_contact_sheet.jpg"),
            "masked_contact_sheet": str(out / "tracking_masked_contact_sheet.jpg"),
            "delta_contact_sheet": str(out / "tracking_delta_contact_sheet.jpg"),
        },
        "source_frames_mutated": False,
        "gate_state": {
            "VIDEO_SOURCE": "PASS",
            "FRAME_QC": "PASS",
            "WOOD_ONLY_MASK": "SAM2_VIDEO_TRACKING_CANDIDATE_READY_HUMAN_GATE_REQUIRED" if accepted_count >= MIN_USABLE_FRAMES else "FAIL_TOO_FEW_TRACKED_MASKS",
            "RECONSTRUCTION": "BLOCKED_UNTIL_SAM2_VIDEO_TRACKING_HUMAN_GATE_PASS",
            "SAM3_1_FALLBACK": "NOT_ELIGIBLE_BEFORE_THREE_SAM2_VIDEO_HUMAN_FAILS",
        },
        "archive_eligible": False,
    }
    result_path = out / "evaluation_manifest.json"
    result_path.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")

    if accepted_count < MIN_USABLE_FRAMES:
        raise RuntimeError(f"P3B_TRACK_INSUFFICIENT:accepted={accepted_count}:minimum={MIN_USABLE_FRAMES}")

    print("P3B_SAM2_VIDEO_TRACKING_AUTO_CANDIDATE=PASS")
    print(f"attempt={args.attempt}")
    print(f"strategy={ATTEMPT_STRATEGIES[args.attempt]}")
    print(f"seed_sequences={','.join(str(x) for x in prompt_summary['seed_sequences'])}")
    print(f"usable_tracked_masks={accepted_count}")
    print(f"rejected_tracked_masks={len(tracked_rows) - accepted_count}")
    if median_adjacent_iou is None:
        print("median_adjacent_mask_iou=NA")
    else:
        print(f"median_adjacent_mask_iou={median_adjacent_iou:.4f}")
    print("source_frames_mutated=false")
    print("production_registration=false")
    print("next_gate=SAM2_VIDEO_TRACKING_HUMAN_VISUAL_GATE")
    print("RECONSTRUCTION=BLOCKED_UNTIL_SAM2_VIDEO_TRACKING_HUMAN_GATE_PASS")
    print(f"manifest={result_path}")
    print(f"mask_contact_sheet={out / 'tracking_mask_contact_sheet.jpg'}")
    print(f"masked_contact_sheet={out / 'tracking_masked_contact_sheet.jpg'}")
    print(f"delta_contact_sheet={out / 'tracking_delta_contact_sheet.jpg'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
