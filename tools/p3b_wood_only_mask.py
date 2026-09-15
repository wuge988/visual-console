#!/usr/bin/env python3
"""P3-B wood-only mask evaluation harness.

Consumes the already-approved P3-B Frame-QC selection, generates automatic SAM 2.1
wood-only mask candidates, and stops at a Human Visual Gate. Evaluation-only:
no workflow registration, reconstruction, Archive mutation, or source-frame mutation.
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
class MaskRow:
    source_index: int
    timestamp_sec: float
    sharpness: float
    source_file: str
    source_sha256: str
    mask_file: str | None = None
    masked_file: str | None = None
    mask_score: float | None = None
    mask_area_ratio: float | None = None
    predicted_iou: float | None = None
    stability_score: float | None = None
    warm_ratio: float | None = None
    border_ratio: float | None = None
    center_distance: float | None = None
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
        raise RuntimeError(f"P3B_MASK_OUTPUT_DIR_NOT_EMPTY:{path}")


def resize_long_edge(image_rgb: np.ndarray, long_edge: int) -> np.ndarray:
    h, w = image_rgb.shape[:2]
    current = max(h, w)
    if current <= long_edge:
        return image_rgb
    scale = long_edge / current
    target = (max(1, int(round(w * scale))), max(1, int(round(h * scale))))
    return cv2.resize(image_rgb, target, interpolation=cv2.INTER_AREA)


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


def warm_ratio(image_rgb: np.ndarray, mask: np.ndarray) -> float:
    pixels = image_rgb[mask.astype(bool)]
    if len(pixels) == 0:
        return 0.0
    rgb = pixels.astype(np.int16)
    r, g, b = rgb[:, 0], rgb[:, 1], rgb[:, 2]
    warm = (r >= g - 8) & (g >= b - 14) & ((r - b) >= 12) & (r >= 45)
    return float(warm.mean())


def center_distance(mask: np.ndarray) -> float:
    ys, xs = np.nonzero(mask)
    if len(xs) == 0:
        return 1.0
    h, w = mask.shape
    cx = float(xs.mean()) / max(1.0, w - 1)
    cy = float(ys.mean()) / max(1.0, h - 1)
    return float(math.hypot(cx - 0.5, cy - 0.5) / math.sqrt(0.5**2 + 0.5**2))


def candidate_score(image_rgb: np.ndarray, proposal: dict[str, Any]) -> tuple[float, dict[str, float]]:
    mask = np.asarray(proposal["segmentation"], dtype=bool)
    h, w = mask.shape
    area = float(mask.sum() / max(1, h * w))
    border = mask_border_ratio(mask)
    warm = warm_ratio(image_rgb, mask)
    center = center_distance(mask)
    pred = float(proposal.get("predicted_iou", 0.0) or 0.0)
    stability = float(proposal.get("stability_score", 0.0) or 0.0)
    area_target = 0.20
    area_term = max(0.0, 1.0 - abs(area - area_target) / 0.20)
    plausible = 0.02 <= area <= 0.48
    score = (
        2.2 * warm
        + 1.2 * pred
        + 1.0 * stability
        + 0.9 * area_term
        + 0.7 * (1.0 - center)
        - 2.0 * border
        - (2.5 if not plausible else 0.0)
    )
    return score, {
        "area_ratio": area,
        "border_ratio": border,
        "warm_ratio": warm,
        "center_distance": center,
        "predicted_iou": pred,
        "stability_score": stability,
    }


def select_mask(image_rgb: np.ndarray, proposals: list[dict[str, Any]]):
    ranked: list[tuple[float, dict[str, float], np.ndarray]] = []
    for proposal in proposals:
        mask = np.asarray(proposal.get("segmentation"), dtype=bool)
        if mask.ndim != 2 or mask.shape != image_rgb.shape[:2]:
            continue
        score, metrics = candidate_score(image_rgb, proposal)
        ranked.append((score, metrics, mask))
    if not ranked:
        return None, float("-inf"), None, "NO_VALID_MASK_PROPOSAL"
    ranked.sort(key=lambda row: row[0], reverse=True)
    score, metrics, mask = ranked[0]
    if not (0.02 <= metrics["area_ratio"] <= 0.48):
        return None, score, metrics, "MASK_AREA_OUT_OF_RANGE"
    if metrics["border_ratio"] > 0.20:
        return None, score, metrics, "MASK_BORDER_TOUCH_EXCESSIVE"
    if metrics["warm_ratio"] < 0.18:
        return None, score, metrics, "MASK_WARM_EVIDENCE_TOO_LOW"
    if score < 1.55:
        return None, score, metrics, "MASK_SCORE_TOO_LOW"
    return mask, score, metrics, None


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
        draw.text((x0 + 6, y0 + thumb_h + 5), label[:52], fill=(235, 235, 235))
    canvas.save(output, quality=92)


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--frame-qc-dir", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--item-id", default=ITEM_ID)
    parser.add_argument("--sam-model", default=DEFAULT_SAM_MODEL)
    parser.add_argument("--long-edge", type=int, default=960)
    parser.add_argument("--background", type=int, default=NEUTRAL_GRAY)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.item_id != ITEM_ID:
        raise RuntimeError(f"P3B_PILOT_ITEM_MISMATCH:{args.item_id}")
    if not (0 <= args.background <= 255):
        raise RuntimeError("P3B_MASK_BACKGROUND_MUST_BE_0_255")

    frame_qc_dir = Path(args.frame_qc_dir).resolve()
    manifest_path = frame_qc_dir / "evaluation_manifest.json"
    if not manifest_path.is_file():
        raise RuntimeError(f"P3B_FRAME_QC_MANIFEST_MISSING:{manifest_path}")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("pilot_id") != PILOT_ID or manifest.get("item_id") != ITEM_ID:
        raise RuntimeError("P3B_FRAME_QC_MANIFEST_IDENTITY_MISMATCH")
    if manifest.get("authority") != "EVALUATION_ONLY" or manifest.get("production_registration") is not False:
        raise RuntimeError("P3B_FRAME_QC_MANIFEST_AUTHORITY_INVALID")
    if manifest.get("gate_state", {}).get("FRAME_QC") != "PASS":
        raise RuntimeError("P3B_FRAME_QC_NOT_PASS")

    frame_rows = list(manifest.get("frame_qc", {}).get("rows") or [])
    if len(frame_rows) < MIN_USABLE_FRAMES:
        raise RuntimeError(f"P3B_MASK_INPUT_INSUFFICIENT:selected={len(frame_rows)}:minimum={MIN_USABLE_FRAMES}")

    out = Path(args.out).resolve()
    ensure_empty_or_create(out)
    raw_dir = out / "frames_raw"
    masks_dir = out / "masks"
    masked_dir = out / "frames_masked"
    raw_dir.mkdir()
    masks_dir.mkdir()
    masked_dir.mkdir()

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

    source_hashes_before: dict[str, str] = {}
    rows: list[MaskRow] = []
    raw_sheet: list[tuple[Path, str]] = []
    mask_sheet: list[tuple[Path, str]] = []
    masked_sheet: list[tuple[Path, str]] = []
    accepted = 0

    for seq, source in enumerate(frame_rows):
        source_file = Path(str(source["file"])).resolve()
        if not source_file.is_file():
            raise RuntimeError(f"P3B_MASK_SOURCE_FRAME_MISSING:{source_file}")
        source_sha = sha256_file(source_file)
        source_hashes_before[str(source_file)] = source_sha
        image_rgb = np.asarray(Image.open(source_file).convert("RGB"))
        image_rgb = resize_long_edge(image_rgb, args.long_edge)
        raw_path = raw_dir / f"frame_{seq:03d}.png"
        Image.fromarray(image_rgb).save(raw_path)
        row = MaskRow(
            source_index=int(source["source_index"]),
            timestamp_sec=float(source["timestamp_sec"]),
            sharpness=float(source["sharpness"]),
            source_file=str(source_file),
            source_sha256=source_sha,
        )
        try:
            proposals = generator.generate(image_rgb)
        except Exception as exc:
            row.reject_reason = f"SAM2_GENERATE_FAILED:{type(exc).__name__}"
            rows.append(row)
            raw_sheet.append((raw_path, f"{seq:02d} REJECT sam2"))
            continue

        mask, score, metrics, reject = select_mask(image_rgb, proposals)
        row.mask_score = None if not math.isfinite(score) else float(score)
        if metrics:
            row.mask_area_ratio = metrics["area_ratio"]
            row.predicted_iou = metrics["predicted_iou"]
            row.stability_score = metrics["stability_score"]
            row.warm_ratio = metrics["warm_ratio"]
            row.border_ratio = metrics["border_ratio"]
            row.center_distance = metrics["center_distance"]
        if mask is None:
            row.reject_reason = reject or "MASK_SELECTION_FAILED"
            rows.append(row)
            raw_sheet.append((raw_path, f"{seq:02d} REJECT {row.reject_reason}"))
            continue

        mask_path = masks_dir / f"frame_{seq:03d}.png"
        Image.fromarray(mask.astype(np.uint8) * 255).save(mask_path)
        background = np.full_like(image_rgb, args.background, dtype=np.uint8)
        masked = np.where(mask[..., None], image_rgb, background)
        masked_path = masked_dir / f"frame_{accepted:03d}.png"
        Image.fromarray(masked).save(masked_path)

        row.mask_file = str(mask_path)
        row.masked_file = str(masked_path)
        row.accepted = True
        accepted += 1
        rows.append(row)
        raw_sheet.append((raw_path, f"{seq:02d} OK sharp={row.sharpness:.0f}"))
        mask_sheet.append((mask_path, f"{seq:02d} area={row.mask_area_ratio:.3f} score={score:.2f}"))
        masked_sheet.append((masked_path, f"{seq:02d} warm={row.warm_ratio:.2f} border={row.border_ratio:.3f}"))

    for source_file, before in source_hashes_before.items():
        if sha256_file(Path(source_file)) != before:
            raise RuntimeError(f"P3B_SOURCE_FRAME_MUTATED:{source_file}")

    contact_sheet(raw_sheet, out / "selected_frames_contact_sheet.jpg")
    contact_sheet(mask_sheet, out / "mask_contact_sheet.jpg")
    contact_sheet(masked_sheet, out / "masked_contact_sheet.jpg")

    coverage = [row.mask_area_ratio for row in rows if row.accepted and row.mask_area_ratio is not None]
    result = {
        "schema_version": "1.0",
        "pilot_id": PILOT_ID,
        "phase": "P3-B",
        "authority": "EVALUATION_ONLY",
        "production_registration": False,
        "pdp_blocking": False,
        "item_id": ITEM_ID,
        "workflow_code": "M3D01",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "frame_qc": {
            "manifest": str(manifest_path),
            "manifest_sha256": sha256_file(manifest_path),
            "selected_count": len(frame_rows),
            "source_video": manifest.get("source", {}),
        },
        "masking": {
            "method": "SAM2_AUTOMATIC_MASK_GENERATOR_FAIL_CLOSED",
            "sam2_commit": SAM2_COMMIT,
            "model_id": args.sam_model,
            "manual_per_frame_clicks": False,
            "long_edge": args.long_edge,
            "background_rgb": [args.background] * 3,
            "accepted_count": accepted,
            "rejected_count": len(rows) - accepted,
            "minimum_required": MIN_USABLE_FRAMES,
            "mask_area_ratio_median": float(np.median(coverage)) if coverage else None,
            "rows": [asdict(row) for row in rows],
            "mask_contact_sheet": str(out / "mask_contact_sheet.jpg"),
            "masked_contact_sheet": str(out / "masked_contact_sheet.jpg"),
        },
        "source_frames_mutated": False,
        "gate_state": {
            "VIDEO_SOURCE": "PASS",
            "FRAME_QC": "PASS",
            "WOOD_ONLY_MASK": "AUTO_CANDIDATE_READY_HUMAN_GATE_REQUIRED" if accepted >= MIN_USABLE_FRAMES else "FAIL_TOO_FEW_USABLE_MASKS",
            "RECONSTRUCTION": "BLOCKED_UNTIL_MASK_HUMAN_GATE_PASS",
            "EXACT_PIECE_3D_IDENTITY": "BLOCKED_UNTIL_RECONSTRUCTION",
        },
        "archive_eligible": False,
    }
    result_path = out / "evaluation_manifest.json"
    result_path.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")

    if accepted < MIN_USABLE_FRAMES:
        raise RuntimeError(f"P3B_MASK_INSUFFICIENT:accepted={accepted}:minimum={MIN_USABLE_FRAMES}")

    print("P3B_VIDEO_SOURCE=PASS")
    print("P3B_FRAME_QC=PASS")
    print("P3B_WOOD_ONLY_MASK_AUTO_CANDIDATE=PASS")
    print(f"usable_masks={accepted}")
    print(f"rejected_masks={len(rows) - accepted}")
    print("source_frames_mutated=false")
    print("production_registration=false")
    print("next_gate=WOOD_ONLY_MASK_HUMAN_VISUAL_GATE")
    print(f"manifest={result_path}")
    print(f"mask_contact_sheet={out / 'mask_contact_sheet.jpg'}")
    print(f"masked_contact_sheet={out / 'masked_contact_sheet.jpg'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
