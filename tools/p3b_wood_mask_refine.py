#!/usr/bin/env python3
"""P3-B bounded wood-mask refinement harness.

Consumes an existing automatic mask run that reached Human Visual Gate, refines
it with a bounded SAM2 proposal union plus deterministic white-support
suppression, and stops at a second Human Visual Gate.

Evaluation-only: no production registration, Archive mutation, reconstruction,
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
from typing import Any, Iterable

import cv2
import numpy as np
from PIL import Image, ImageDraw

PILOT_ID = "P3B-M3D01-DC-ZY-SZ-31001"
ITEM_ID = "DC-ZY-SZ-31001"
MIN_USABLE_FRAMES = 16
DEFAULT_SAM_MODEL = "facebook/sam2.1-hiera-base-plus"
SAM2_COMMIT = "2b90b9f5ceec907a1c18123530e92e794ad901a4"
NEUTRAL_GRAY = 127


@dataclass
class RefineRow:
    sequence: int
    source_file: str
    source_sha256: str
    input_mask_file: str
    refined_mask_file: str | None = None
    refined_masked_file: str | None = None
    delta_file: str | None = None
    primary_area_ratio: float | None = None
    refined_area_ratio: float | None = None
    added_ratio_vs_primary: float | None = None
    removed_support_ratio_vs_primary: float | None = None
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
        raise RuntimeError(f"P3B_MASK_REFINE_OUTPUT_DIR_NOT_EMPTY:{path}")


def warm_ratio(image_rgb: np.ndarray, mask: np.ndarray) -> float:
    pixels = image_rgb[mask.astype(bool)]
    if len(pixels) == 0:
        return 0.0
    rgb = pixels.astype(np.int16)
    r, g, b = rgb[:, 0], rgb[:, 1], rgb[:, 2]
    warm = (r >= g - 10) & (g >= b - 18) & ((r - b) >= 10) & (r >= 40)
    return float(warm.mean())


def mask_border_ratio(mask: np.ndarray) -> float:
    mask = mask.astype(bool)
    if not mask.any():
        return 1.0
    h, w = mask.shape
    border = np.zeros_like(mask, dtype=bool)
    thickness = max(2, int(round(min(h, w) * 0.015)))
    border[:thickness, :] = True
    border[-thickness:, :] = True
    border[:, :thickness] = True
    border[:, -thickness:] = True
    return float(np.logical_and(mask, border).sum() / max(1, mask.sum()))


def expanded_bbox(mask: np.ndarray, pad_ratio: float = 0.18) -> tuple[int, int, int, int]:
    ys, xs = np.nonzero(mask)
    h, w = mask.shape
    if len(xs) == 0:
        return 0, 0, w, h
    x0, x1 = int(xs.min()), int(xs.max())
    y0, y1 = int(ys.min()), int(ys.max())
    px = max(20, int(round((x1 - x0 + 1) * pad_ratio)))
    py = max(20, int(round((y1 - y0 + 1) * pad_ratio)))
    return max(0, x0 - px), max(0, y0 - py), min(w, x1 + px + 1), min(h, y1 + py + 1)


def center_in_bbox(mask: np.ndarray, bbox: tuple[int, int, int, int]) -> bool:
    ys, xs = np.nonzero(mask)
    if len(xs) == 0:
        return False
    cx, cy = float(xs.mean()), float(ys.mean())
    x0, y0, x1, y1 = bbox
    return x0 <= cx < x1 and y0 <= cy < y1


def white_support_like(image_rgb: np.ndarray) -> np.ndarray:
    rgb = image_rgb.astype(np.int16)
    lo = rgb.min(axis=2)
    hi = rgb.max(axis=2)
    chroma = hi - lo
    # White plastic supports are bright and near-achromatic. The high threshold
    # intentionally avoids stripping pale tan wood.
    return (lo >= 195) & (chroma <= 24)


def warm_pixels(image_rgb: np.ndarray) -> np.ndarray:
    rgb = image_rgb.astype(np.int16)
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    return (r >= g - 10) & (g >= b - 18) & ((r - b) >= 10) & (r >= 40) & (r <= 248)


def remove_tiny_components(mask: np.ndarray, min_pixels: int) -> np.ndarray:
    src = mask.astype(np.uint8)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(src, connectivity=8)
    keep = np.zeros_like(src)
    for idx in range(1, count):
        if int(stats[idx, cv2.CC_STAT_AREA]) >= min_pixels:
            keep[labels == idx] = 1
    return keep.astype(bool)


def refine_mask(image_rgb: np.ndarray, primary: np.ndarray, proposals: list[dict[str, Any]]):
    primary = primary.astype(bool)
    h, w = primary.shape
    image_area = max(1, h * w)
    primary_area = max(1, int(primary.sum()))
    bbox = expanded_bbox(primary)
    x0, y0, x1, y1 = bbox

    dilate_px = max(7, int(round(min(h, w) * 0.025)))
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (dilate_px | 1, dilate_px | 1))
    near_primary = cv2.dilate(primary.astype(np.uint8), kernel, iterations=1).astype(bool)

    union = primary.copy()
    selected_proposals = 0
    for proposal in proposals:
        cand = np.asarray(proposal.get("segmentation"), dtype=bool)
        if cand.shape != primary.shape or not cand.any():
            continue
        area_ratio = float(cand.sum() / image_area)
        if not (0.001 <= area_ratio <= 0.30):
            continue
        border = mask_border_ratio(cand)
        if border > 0.10:
            continue
        warm = warm_ratio(image_rgb, cand)
        if warm < 0.16:
            continue
        cand_area = max(1, int(cand.sum()))
        overlap = float(np.logical_and(cand, primary).sum() / cand_area)
        near_overlap = float(np.logical_and(cand, near_primary).sum() / cand_area)
        if overlap >= 0.025 or near_overlap >= 0.08 or center_in_bbox(cand, bbox):
            union |= cand
            selected_proposals += 1

    # Add only warm, wood-like pixels near the current union and inside the
    # expanded primary bounding box. This recovers pale split branches without
    # opening the entire background/turntable.
    bbox_mask = np.zeros_like(primary)
    bbox_mask[y0:y1, x0:x1] = True
    union_near = cv2.dilate(union.astype(np.uint8), kernel, iterations=1).astype(bool)
    color_add = warm_pixels(image_rgb) & bbox_mask & union_near
    union |= color_add

    support = white_support_like(image_rgb) & union
    refined = union & ~support

    close_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    refined = cv2.morphologyEx(refined.astype(np.uint8), cv2.MORPH_CLOSE, close_kernel, iterations=1).astype(bool)
    refined = remove_tiny_components(refined, max(60, int(round(image_area * 0.00012))))

    primary_ratio = float(primary.sum() / image_area)
    refined_ratio = float(refined.sum() / image_area)
    added = np.logical_and(refined, ~primary)
    removed = np.logical_and(primary, ~refined)
    added_ratio = float(added.sum() / primary_area)
    removed_ratio = float(removed.sum() / primary_area)

    reject = None
    if not (0.02 <= refined_ratio <= 0.48):
        reject = "REFINED_MASK_AREA_OUT_OF_RANGE"
    elif mask_border_ratio(refined) > 0.20:
        reject = "REFINED_MASK_BORDER_TOUCH_EXCESSIVE"
    elif added_ratio > 0.85:
        reject = "REFINEMENT_ADDED_AREA_EXCESSIVE"
    elif selected_proposals == 0:
        reject = "NO_ADDITIONAL_SAM2_PROPOSAL_SELECTED"

    metrics = {
        "primary_area_ratio": primary_ratio,
        "refined_area_ratio": refined_ratio,
        "added_ratio_vs_primary": added_ratio,
        "removed_support_ratio_vs_primary": removed_ratio,
        "selected_proposals": selected_proposals,
    }
    return refined, added, removed, metrics, reject


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
        draw.text((x0 + 6, y0 + thumb_h + 5), label[:58], fill=(235, 235, 235))
    canvas.save(output, quality=92)


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mask-dir", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--item-id", default=ITEM_ID)
    parser.add_argument("--sam-model", default=DEFAULT_SAM_MODEL)
    parser.add_argument("--background", type=int, default=NEUTRAL_GRAY)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.item_id != ITEM_ID:
        raise RuntimeError(f"P3B_PILOT_ITEM_MISMATCH:{args.item_id}")

    mask_dir = Path(args.mask_dir).resolve()
    manifest_path = mask_dir / "evaluation_manifest.json"
    if not manifest_path.is_file():
        raise RuntimeError(f"P3B_MASK_MANIFEST_MISSING:{manifest_path}")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("pilot_id") != PILOT_ID or manifest.get("item_id") != ITEM_ID:
        raise RuntimeError("P3B_MASK_MANIFEST_IDENTITY_MISMATCH")
    if manifest.get("authority") != "EVALUATION_ONLY" or manifest.get("production_registration") is not False:
        raise RuntimeError("P3B_MASK_MANIFEST_AUTHORITY_INVALID")
    if manifest.get("gate_state", {}).get("FRAME_QC") != "PASS":
        raise RuntimeError("P3B_MASK_PARENT_FRAME_QC_NOT_PASS")

    rows_in = list(manifest.get("masking", {}).get("rows") or [])
    accepted_in = [row for row in rows_in if row.get("accepted")]
    if len(accepted_in) < MIN_USABLE_FRAMES:
        raise RuntimeError(f"P3B_MASK_REFINE_INPUT_INSUFFICIENT:{len(accepted_in)}")

    out = Path(args.out).resolve()
    ensure_empty_or_create(out)
    masks_out = out / "masks_refined"
    masked_out = out / "frames_refined"
    delta_out = out / "delta"
    masks_out.mkdir()
    masked_out.mkdir()
    delta_out.mkdir()

    try:
        import torch
        from sam2.automatic_mask_generator import SAM2AutomaticMaskGenerator
    except Exception as exc:
        raise RuntimeError(f"P3B_SAM2_IMPORT_FAILED:{type(exc).__name__}:{exc}") from exc
    if not torch.cuda.is_available():
        raise RuntimeError("P3B_SAM2_CUDA_REQUIRED")

    generator = SAM2AutomaticMaskGenerator.from_pretrained(
        args.sam_model,
        device="cuda",
        apply_postprocessing=False,
        points_per_side=24,
        points_per_batch=32,
        pred_iou_thresh=0.72,
        stability_score_thresh=0.86,
        min_mask_region_area=80,
        output_mode="binary_mask",
    )

    rows: list[RefineRow] = []
    mask_sheet = []
    masked_sheet = []
    delta_sheet = []
    source_hashes_before: dict[str, str] = {}
    accepted = 0

    for seq, parent in enumerate(rows_in):
        if not parent.get("accepted"):
            continue
        raw_path = mask_dir / "frames_raw" / f"frame_{seq:03d}.png"
        mask_path = Path(str(parent["mask_file"])).resolve()
        if not raw_path.is_file() or not mask_path.is_file():
            raise RuntimeError(f"P3B_MASK_REFINE_INPUT_MISSING:seq={seq}")
        source_hashes_before[str(raw_path)] = sha256_file(raw_path)

        image_rgb = np.asarray(Image.open(raw_path).convert("RGB"))
        primary = np.asarray(Image.open(mask_path).convert("L")) >= 128
        if primary.shape != image_rgb.shape[:2]:
            raise RuntimeError(f"P3B_MASK_REFINE_DIMENSION_MISMATCH:seq={seq}")

        proposals = generator.generate(image_rgb)
        refined, added, removed, metrics, reject = refine_mask(image_rgb, primary, proposals)

        row = RefineRow(
            sequence=seq,
            source_file=str(raw_path),
            source_sha256=source_hashes_before[str(raw_path)],
            input_mask_file=str(mask_path),
            primary_area_ratio=metrics["primary_area_ratio"],
            refined_area_ratio=metrics["refined_area_ratio"],
            added_ratio_vs_primary=metrics["added_ratio_vs_primary"],
            removed_support_ratio_vs_primary=metrics["removed_support_ratio_vs_primary"],
        )

        mask_out = masks_out / f"frame_{seq:03d}.png"
        Image.fromarray(refined.astype(np.uint8) * 255).save(mask_out)

        background = np.full_like(image_rgb, args.background, dtype=np.uint8)
        masked = np.where(refined[..., None], image_rgb, background)
        masked_path = masked_out / f"frame_{seq:03d}.png"
        Image.fromarray(masked).save(masked_path)

        delta = image_rgb.copy()
        delta[added] = np.array([40, 220, 70], dtype=np.uint8)
        delta[removed] = np.array([230, 40, 180], dtype=np.uint8)
        delta_path = delta_out / f"frame_{seq:03d}.png"
        Image.fromarray(delta).save(delta_path)

        row.refined_mask_file = str(mask_out)
        row.refined_masked_file = str(masked_path)
        row.delta_file = str(delta_path)
        row.accepted = reject is None
        row.reject_reason = reject
        if row.accepted:
            accepted += 1

        rows.append(row)
        status = "OK" if row.accepted else f"REJECT {reject}"
        mask_sheet.append((mask_out, f"{seq:02d} {status} area={row.refined_area_ratio:.3f}"))
        masked_sheet.append((masked_path, f"{seq:02d} add={row.added_ratio_vs_primary:.2f} rm={row.removed_support_ratio_vs_primary:.2f}"))
        delta_sheet.append((delta_path, f"{seq:02d} green=added magenta=removed"))

    for source_file, before in source_hashes_before.items():
        if sha256_file(Path(source_file)) != before:
            raise RuntimeError(f"P3B_SOURCE_FRAME_MUTATED:{source_file}")

    contact_sheet(mask_sheet, out / "refined_mask_contact_sheet.jpg")
    contact_sheet(masked_sheet, out / "refined_masked_contact_sheet.jpg")
    contact_sheet(delta_sheet, out / "refinement_delta_contact_sheet.jpg")

    result = {
        "schema_version": "1.0",
        "pilot_id": PILOT_ID,
        "phase": "P3-B",
        "authority": "EVALUATION_ONLY",
        "production_registration": False,
        "pdp_blocking": False,
        "item_id": ITEM_ID,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "parent_mask_manifest": str(manifest_path),
        "parent_mask_manifest_sha256": sha256_file(manifest_path),
        "refinement": {
            "method": "SAM2_PROPOSAL_UNION_PLUS_DETERMINISTIC_WHITE_SUPPORT_SUPPRESSION",
            "sam2_commit": SAM2_COMMIT,
            "model_id": args.sam_model,
            "manual_per_frame_clicks": False,
            "accepted_count": accepted,
            "rejected_count": len(rows) - accepted,
            "minimum_required": MIN_USABLE_FRAMES,
            "rows": [asdict(row) for row in rows],
            "refined_mask_contact_sheet": str(out / "refined_mask_contact_sheet.jpg"),
            "refined_masked_contact_sheet": str(out / "refined_masked_contact_sheet.jpg"),
            "refinement_delta_contact_sheet": str(out / "refinement_delta_contact_sheet.jpg"),
        },
        "source_frames_mutated": False,
        "gate_state": {
            "VIDEO_SOURCE": "PASS",
            "FRAME_QC": "PASS",
            "WOOD_ONLY_MASK": "REFINED_AUTO_CANDIDATE_READY_HUMAN_GATE_REQUIRED" if accepted >= MIN_USABLE_FRAMES else "FAIL_TOO_FEW_REFINED_MASKS",
            "RECONSTRUCTION": "BLOCKED_UNTIL_REFINED_MASK_HUMAN_GATE_PASS",
            "EXACT_PIECE_3D_IDENTITY": "BLOCKED_UNTIL_RECONSTRUCTION",
        },
        "archive_eligible": False,
    }
    result_path = out / "evaluation_manifest.json"
    result_path.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")

    if accepted < MIN_USABLE_FRAMES:
        raise RuntimeError(f"P3B_MASK_REFINE_INSUFFICIENT:accepted={accepted}:minimum={MIN_USABLE_FRAMES}")

    print("P3B_MASK_REFINEMENT_AUTO_CANDIDATE=PASS")
    print(f"usable_refined_masks={accepted}")
    print(f"rejected_refined_masks={len(rows) - accepted}")
    print("source_frames_mutated=false")
    print("production_registration=false")
    print("next_gate=WOOD_ONLY_MASK_REFINED_HUMAN_VISUAL_GATE")
    print("RECONSTRUCTION=BLOCKED_UNTIL_REFINED_MASK_HUMAN_GATE_PASS")
    print(f"manifest={result_path}")
    print(f"refined_mask_contact_sheet={out / 'refined_mask_contact_sheet.jpg'}")
    print(f"refined_masked_contact_sheet={out / 'refined_masked_contact_sheet.jpg'}")
    print(f"refinement_delta_contact_sheet={out / 'refinement_delta_contact_sheet.jpg'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
