#!/usr/bin/env python3
"""P3-B SAM 3.1 bounded video benchmark.

Runs a single production-oriented SAM 3.1 benchmark after all three authorized
SAM 2.1 VideoPredictor Human Gates failed.

The benchmark uses SAM 3.1 text semantics ("driftwood") plus one positive wood
point and automatically derived negative support points. It consumes the same
30 Frame-QC source views and Support V3 masks only as evidence/reference.

Evaluation-only: no reconstruction, production registration, Archive mutation,
or source-frame mutation.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

import cv2
import numpy as np
import torch
from PIL import Image, ImageDraw

PILOT_ID = "P3B-M3D01-DC-ZY-SZ-31001"
ITEM_ID = "DC-ZY-SZ-31001"
MIN_USABLE_FRAMES = 16
NEUTRAL_GRAY = 127


@dataclass
class Row:
    sequence: int
    source_file: str
    source_sha256: str
    reference_mask_file: str
    mask_file: str | None = None
    masked_file: str | None = None
    delta_file: str | None = None
    area_ratio: float | None = None
    reference_iou: float | None = None
    border_ratio: float | None = None
    accepted: bool = False
    reject_reason: str | None = None


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def ensure_empty_or_create(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)
    if any(path.iterdir()):
        raise RuntimeError(f"P3B_SAM31_OUTPUT_DIR_NOT_EMPTY:{path}")


def load_mask(path: Path) -> np.ndarray:
    return np.asarray(Image.open(path).convert("L")) >= 128


def iou(a: np.ndarray, b: np.ndarray) -> float:
    a, b = a.astype(bool), b.astype(bool)
    u = np.logical_or(a, b).sum()
    return 1.0 if u == 0 else float(np.logical_and(a, b).sum() / u)


def border_ratio(mask: np.ndarray) -> float:
    mask = mask.astype(bool)
    if not mask.any():
        return 1.0
    h, w = mask.shape
    t = max(2, int(round(min(h, w) * 0.012)))
    border = np.zeros_like(mask, bool)
    border[:t] = True
    border[-t:] = True
    border[:, :t] = True
    border[:, -t:] = True
    return float(np.logical_and(mask, border).sum() / max(1, mask.sum()))


def contact_sheet(items: Iterable[tuple[Path, str]], output: Path, cols: int = 5) -> None:
    entries = list(items)
    if not entries:
        return
    tw, th, lh = 300, 210, 30
    rows = math.ceil(len(entries) / cols)
    canvas = Image.new("RGB", (cols * tw, rows * (th + lh)), (28, 28, 28))
    draw = ImageDraw.Draw(canvas)
    for i, (path, label) in enumerate(entries):
        im = Image.open(path).convert("RGB")
        im.thumbnail((tw - 8, th - 8), Image.Resampling.LANCZOS)
        x0, y0 = (i % cols) * tw, (i // cols) * (th + lh)
        canvas.paste(im, (x0 + (tw-im.width)//2, y0 + (th-im.height)//2))
        draw.text((x0+6, y0+th+5), label[:62], fill=(235,235,235))
    canvas.save(output, quality=92)


def load_parent(support_v3_dir: Path):
    manifest_path = support_v3_dir / "evaluation_manifest.json"
    if not manifest_path.is_file():
        raise RuntimeError(f"P3B_SAM31_PARENT_MANIFEST_MISSING:{manifest_path}")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("pilot_id") != PILOT_ID or manifest.get("item_id") != ITEM_ID:
        raise RuntimeError("P3B_SAM31_PARENT_IDENTITY_MISMATCH")
    if manifest.get("authority") != "EVALUATION_ONLY" or manifest.get("production_registration") is not False:
        raise RuntimeError("P3B_SAM31_PARENT_AUTHORITY_INVALID")
    rows = [r for r in manifest.get("support_suppression_v3", {}).get("rows", []) if r.get("accepted")]
    rows.sort(key=lambda r: int(r["sequence"]))
    if len(rows) < MIN_USABLE_FRAMES:
        raise RuntimeError(f"P3B_SAM31_PARENT_INSUFFICIENT:{len(rows)}")
    return manifest_path, rows


def copy_frames(rows: list[dict], out_dir: Path) -> None:
    """SAM3 indexes folder frames by sorted zero-based position, not manifest sequence."""
    out_dir.mkdir()
    for frame_idx, r in enumerate(rows):
        src = Path(str(r["source_file"])).resolve()
        Image.open(src).convert("RGB").save(
            out_dir / f"{frame_idx:05d}.jpg", quality=98, subsampling=0
        )


def choose_prompt_points(image_rgb: np.ndarray, reference: np.ndarray):
    h, w = reference.shape

    dist = cv2.distanceTransform(reference.astype(np.uint8), cv2.DIST_L2, 5)
    py, px = np.unravel_index(int(np.argmax(dist)), dist.shape)
    points = [[float(px), float(py)]]
    labels = [1]

    hsv = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2HSV)
    sat, val = hsv[:, :, 1], hsv[:, :, 2]
    ys, xs = np.nonzero(reference)
    if len(xs):
        y0, y1 = int(ys.min()), int(ys.max()) + 1
        lower = np.arange(h)[:,None] >= (y0 + int(round(0.48 * max(1, y1-y0))))
        support_like = reference & lower & (sat <= 70) & (val >= 130)
        count, comp_labels, stats, centroids = cv2.connectedComponentsWithStats(support_like.astype(np.uint8), 8)
        comps = []
        for idx in range(1, count):
            area = int(stats[idx, cv2.CC_STAT_AREA])
            sw = int(stats[idx, cv2.CC_STAT_WIDTH])
            sh = int(stats[idx, cv2.CC_STAT_HEIGHT])
            if area >= 20 and sh >= 5 and sh / max(1, sw) >= 0.65:
                comps.append((area, centroids[idx]))
        comps.sort(reverse=True, key=lambda x: x[0])
        for _, c in comps[:3]:
            points.append([float(c[0]), float(c[1])])
            labels.append(0)

    return np.asarray(points, np.float32), np.asarray(labels, np.int32)


def normalize_points(points: np.ndarray, w: int, h: int) -> torch.Tensor:
    pts = points.copy()
    pts[:,0] /= float(w)
    pts[:,1] /= float(h)
    return torch.tensor(pts, dtype=torch.float32)


def output_mask_for_obj(outputs, obj_id: int) -> np.ndarray | None:
    ids = outputs["out_obj_ids"]
    if hasattr(ids, "detach"):
        ids = ids.detach().cpu().numpy()
    ids = np.asarray(ids).astype(int).tolist()
    if obj_id not in ids:
        return None
    idx = ids.index(obj_id)
    masks = outputs["out_binary_masks"]
    mask = masks[idx]
    if hasattr(mask, "detach"):
        mask = mask.detach().cpu().numpy()
    return np.asarray(mask).squeeze().astype(bool)


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--support-v3-dir", required=True)
    p.add_argument("--checkpoint", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--text-prompt", default="driftwood")
    p.add_argument("--item-id", default=ITEM_ID)
    return p.parse_args()


def main() -> int:
    args = parse_args()
    if args.item_id != ITEM_ID:
        raise RuntimeError(f"P3B_PILOT_ITEM_MISMATCH:{args.item_id}")

    parent_dir = Path(args.support_v3_dir).resolve()
    manifest_path, rows = load_parent(parent_dir)
    checkpoint = Path(args.checkpoint).resolve()
    if not checkpoint.is_file():
        raise RuntimeError(f"P3B_SAM31_CHECKPOINT_MISSING:{checkpoint}")

    out = Path(args.out).resolve()
    ensure_empty_or_create(out)
    frames_dir = out / "frames"
    masks_dir = out / "masks"
    masked_dir = out / "masked"
    delta_dir = out / "delta_vs_support_v3"
    masks_dir.mkdir(); masked_dir.mkdir(); delta_dir.mkdir()
    copy_frames(rows, frames_dir)

    source_hashes = {str(Path(str(r["source_file"])).resolve()): sha256_file(Path(str(r["source_file"])).resolve()) for r in rows}

    from sam3.model_builder import build_sam3_multiplex_video_predictor

    predictor = build_sam3_multiplex_video_predictor(
        checkpoint_path=str(checkpoint),
        max_num_objects=4,
        multiplex_count=4,
        use_fa3=False,
        use_rope_real=False,
        compile=False,
        warm_up=False,
        async_loading_frames=False,
    )

    response = predictor.handle_request(dict(type="start_session", resource_path=str(frames_dir)))
    session_id = response["session_id"]

    seed_row = rows[0]
    seed_seq = int(seed_row["sequence"])
    seed_frame_idx = 0  # first copied frame; manifest sequence retained for evidence
    seed_source = Path(str(seed_row["source_file"])).resolve()
    seed_reference_path = Path(str(seed_row["output_mask_file"])).resolve()
    seed_reference = load_mask(seed_reference_path)
    seed_rgb = np.asarray(Image.open(seed_source).convert("RGB")).copy()
    h, w = seed_reference.shape

    response = predictor.handle_request(dict(
        type="add_prompt",
        session_id=session_id,
        frame_index=seed_frame_idx,
        text=args.text_prompt,
    ))
    initial = response["outputs"]

    ids = initial["out_obj_ids"]
    if hasattr(ids, "detach"):
        ids = ids.detach().cpu().numpy()
    ids = np.asarray(ids).astype(int).tolist()
    if not ids:
        raise RuntimeError("P3B_SAM31_TEXT_PROMPT_NO_OBJECTS")

    best_obj = None
    best_iou = -1.0
    for oid in ids:
        m = output_mask_for_obj(initial, oid)
        if m is None:
            continue
        if m.shape != seed_reference.shape:
            m = cv2.resize(m.astype(np.uint8), (w,h), interpolation=cv2.INTER_NEAREST).astype(bool)
        score = iou(m, seed_reference)
        if score > best_iou:
            best_iou, best_obj = score, oid
    if best_obj is None:
        raise RuntimeError("P3B_SAM31_TEXT_PROMPT_NO_MATCHING_OBJECT")

    for oid in ids:
        if oid != best_obj:
            predictor.handle_request(dict(type="remove_object", session_id=session_id, obj_id=oid))

    points_abs, point_labels = choose_prompt_points(seed_rgb, seed_reference)
    predictor.handle_request(dict(
        type="add_prompt",
        session_id=session_id,
        frame_index=seed_frame_idx,
        points=normalize_points(points_abs, w, h),
        point_labels=torch.tensor(point_labels, dtype=torch.int32),
        obj_id=best_obj,
    ))

    # Materialize only the selected binary mask on CPU. Do not retain 30 model
    # output dicts/GPU tensors on an 8-GB Windows test device.
    masks_by_frame_idx = {}
    try:
        for resp in predictor.handle_stream_request(
            dict(type="propagate_in_video", session_id=session_id)
        ):
            frame_idx = int(resp["frame_index"])
            selected = output_mask_for_obj(resp["outputs"], best_obj)
            if selected is not None:
                masks_by_frame_idx[frame_idx] = selected.copy()
    finally:
        predictor.handle_request(
            dict(type="close_session", session_id=session_id)
        )

    rows_out = []
    mask_sheet=[]; masked_sheet=[]; delta_sheet=[]
    accepted=0; prev=None; adjacent=[]

    for frame_idx, r in enumerate(rows):
        seq=int(r["sequence"])
        src=Path(str(r["source_file"])).resolve()
        ref_path=Path(str(r["output_mask_file"])).resolve()
        ref=load_mask(ref_path)
        tracked=masks_by_frame_idx.get(frame_idx)
        reject=None
        if tracked is None:
            reject="SAM31_OBJECT_MISSING"
            tracked=np.zeros_like(ref)
        if tracked.shape != ref.shape:
            tracked=cv2.resize(tracked.astype(np.uint8),(ref.shape[1],ref.shape[0]),interpolation=cv2.INTER_NEAREST).astype(bool)

        area=float(tracked.mean())
        ref_iou=iou(tracked,ref)
        br=border_ratio(tracked)
        if reject is None:
            if not (0.02 <= area <= 0.48):
                reject="SAM31_MASK_AREA_OUT_OF_RANGE"
            elif br > 0.20:
                reject="SAM31_BORDER_TOUCH_EXCESSIVE"

        mask_path=masks_dir/f"frame_{seq:03d}.png"
        Image.fromarray(tracked.astype(np.uint8)*255).save(mask_path)
        rgb=np.asarray(Image.open(src).convert("RGB")).copy()
        bg=np.full_like(rgb,NEUTRAL_GRAY)
        masked=np.where(tracked[...,None],rgb,bg)
        masked_path=masked_dir/f"frame_{seq:03d}.png"
        Image.fromarray(masked).save(masked_path)

        add=tracked & ~ref
        rm=ref & ~tracked
        delta=rgb.copy()
        delta[add]=np.array([40,220,70],np.uint8)
        delta[rm]=np.array([230,40,180],np.uint8)
        delta_path=delta_dir/f"frame_{seq:03d}.png"
        Image.fromarray(delta).save(delta_path)

        row=Row(seq,str(src),source_hashes[str(src)],str(ref_path),str(mask_path),str(masked_path),str(delta_path),area,ref_iou,br,reject is None,reject)
        rows_out.append(row)
        if row.accepted: accepted+=1
        if prev is not None: adjacent.append(iou(prev,tracked))
        prev=tracked

        status="OK" if row.accepted else f"REJECT {reject}"
        mask_sheet.append((mask_path,f"{seq:02d} {status} area={area:.3f} iou={ref_iou:.2f}"))
        masked_sheet.append((masked_path,f"{seq:02d} iou={ref_iou:.2f} border={br:.3f}"))
        delta_sheet.append((delta_path,f"{seq:02d} green=added magenta=removed"))

    for source,before in source_hashes.items():
        if sha256_file(Path(source)) != before:
            raise RuntimeError(f"P3B_SOURCE_FRAME_MUTATED:{source}")

    contact_sheet(mask_sheet,out/"sam31_mask_contact_sheet.jpg")
    contact_sheet(masked_sheet,out/"sam31_masked_contact_sheet.jpg")
    contact_sheet(delta_sheet,out/"sam31_delta_contact_sheet.jpg")

    median_adj=float(np.median(adjacent)) if adjacent else None
    manifest={
        "schema_version":"1.0",
        "pilot_id":PILOT_ID,
        "phase":"P3-B",
        "authority":"EVALUATION_ONLY",
        "production_registration":False,
        "pdp_blocking":False,
        "item_id":ITEM_ID,
        "created_at":datetime.now(timezone.utc).isoformat(),
        "parent_support_v3_manifest":str(manifest_path),
        "parent_support_v3_manifest_sha256":sha256_file(manifest_path),
        "model":{
            "family":"SAM_3_1",
            "predictor":"Sam3MultiplexVideoPredictor",
            "checkpoint":str(checkpoint),
            "checkpoint_sha256":sha256_file(checkpoint),
            "use_fa3":False,
            "compile":False,
        },
        "prompt":{
            "seed_sequence":seed_seq,
            "seed_frame_index":seed_frame_idx,
            "frame_index_policy":"zero_based_sorted_copies",
            "text":args.text_prompt,
            "selected_obj_id":best_obj,
            "initial_reference_iou":best_iou,
            "points_xy_abs":points_abs.tolist(),
            "point_labels":point_labels.tolist(),
        },
        "tracking":{
            "accepted_count":accepted,
            "rejected_count":len(rows_out)-accepted,
            "median_adjacent_mask_iou":median_adj,
            "rows":[asdict(x) for x in rows_out],
            "mask_contact_sheet":str(out/"sam31_mask_contact_sheet.jpg"),
            "masked_contact_sheet":str(out/"sam31_masked_contact_sheet.jpg"),
            "delta_contact_sheet":str(out/"sam31_delta_contact_sheet.jpg"),
        },
        "source_frames_mutated":False,
        "gate_state":{
            "VIDEO_SOURCE":"PASS",
            "FRAME_QC":"PASS",
            "WOOD_ONLY_MASK":"SAM31_BENCHMARK_CANDIDATE_READY_HUMAN_GATE_REQUIRED" if accepted>=MIN_USABLE_FRAMES else "FAIL_TOO_FEW_SAM31_MASKS",
            "RECONSTRUCTION":"BLOCKED_UNTIL_SAM31_HUMAN_GATE_PASS",
        },
        "archive_eligible":False,
    }
    mp=out/"evaluation_manifest.json"
    mp.write_text(json.dumps(manifest,indent=2,ensure_ascii=False),encoding="utf-8")
    if accepted < MIN_USABLE_FRAMES:
        raise RuntimeError(f"P3B_SAM31_INSUFFICIENT:accepted={accepted}:minimum={MIN_USABLE_FRAMES}")

    print("P3B_SAM31_VIDEO_BENCHMARK_AUTO_CANDIDATE=PASS")
    print(f"text_prompt={args.text_prompt}")
    print(f"selected_obj_id={best_obj}")
    print(f"initial_reference_iou={best_iou:.4f}")
    print(f"usable_masks={accepted}")
    print(f"rejected_masks={len(rows_out)-accepted}")
    print(f"median_adjacent_mask_iou={median_adj:.4f}" if median_adj is not None else "median_adjacent_mask_iou=NA")
    print("source_frames_mutated=false")
    print("production_registration=false")
    print("next_gate=SAM31_VIDEO_HUMAN_VISUAL_GATE")
    print("RECONSTRUCTION=BLOCKED_UNTIL_SAM31_HUMAN_GATE_PASS")
    print(f"manifest={mp}")
    print(f"mask_contact_sheet={out/'sam31_mask_contact_sheet.jpg'}")
    print(f"masked_contact_sheet={out/'sam31_masked_contact_sheet.jpg'}")
    print(f"delta_contact_sheet={out/'sam31_delta_contact_sheet.jpg'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
