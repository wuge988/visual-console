#!/usr/bin/env python3
"""Prepare a low-touch turntable-video evidence set for the P5 v4 Video2Twin pilot.

Frame-selection structure is adapted from Hasasasaki/photo-to-mesh
(src/frames_from_video.py, MIT, commit
6a1697e839113e12802b52d5cc6951044a4abe47): temporally sample candidates,
keep the sharpest frame in each small window, then evenly cap the final set.

This DRIFT CURIO implementation adds deterministic SAM 2.1 automatic-mask
selection, neutral-gray object-only frames, QA metrics and evidence contact sheets.
It never modifies the source video.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import sys
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any, Iterable

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

DONOR_REPO = "Hasasasaki/photo-to-mesh"
DONOR_COMMIT = "6a1697e839113e12802b52d5cc6951044a4abe47"
SAM2_REPO = "facebookresearch/sam2"
SAM2_COMMIT = "2b90b9f5ceec907a1c18123530e92e794ad901a4"
DEFAULT_SAM_MODEL = "facebook/sam2.1-hiera-base-plus"
NEUTRAL_GRAY = 127
MIN_USABLE_FRAMES = 16


@dataclass
class SelectedFrame:
    source_index: int
    timestamp_sec: float
    sharpness: float
    raw_file: str
    mask_file: str | None = None
    masked_file: str | None = None
    mask_area_ratio: float | None = None
    mask_score: float | None = None
    predicted_iou: float | None = None
    stability_score: float | None = None
    warm_ratio: float | None = None
    border_ratio: float | None = None
    center_distance: float | None = None
    accepted: bool = False
    reject_reason: str | None = None


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def laplacian_sharpness(frame_bgr: np.ndarray) -> float:
    gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


def ensure_empty_or_create(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)
    if any(path.iterdir()):
        raise RuntimeError(f"OUTPUT_DIR_NOT_EMPTY:{path}")


def _sample_candidates(video: Path, sample_fps: float) -> tuple[list[tuple[int, float, float, np.ndarray]], dict[str, Any]]:
    cap = cv2.VideoCapture(str(video))
    if not cap.isOpened():
        raise RuntimeError(f"VIDEO_OPEN_FAILED:{video}")

    fps = float(cap.get(cv2.CAP_PROP_FPS) or 0.0)
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
    if fps <= 0 or total <= 0:
        cap.release()
        raise RuntimeError(f"VIDEO_METADATA_INVALID:fps={fps}:frames={total}")

    interval = max(1, int(round(fps / max(0.1, sample_fps))))
    candidates: list[tuple[int, float, float, np.ndarray]] = []
    idx = 0
    while idx < total:
        cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
        ok, frame = cap.read()
        if ok and frame is not None:
            candidates.append((idx, idx / fps, laplacian_sharpness(frame), frame))
        idx += interval
    cap.release()

    meta = {
        "fps": fps,
        "frame_count": total,
        "width": width,
        "height": height,
        "duration_sec": total / fps,
        "sample_fps": sample_fps,
        "candidate_interval_frames": interval,
        "candidate_count": len(candidates),
    }
    return candidates, meta


def _temporal_sharpest(candidates: list[tuple[int, float, float, np.ndarray]], window: int, max_frames: int) -> list[tuple[int, float, float, np.ndarray]]:
    if not candidates:
        return []
    window = max(1, window)
    kept: list[tuple[int, float, float, np.ndarray]] = []
    for start in range(0, len(candidates), window):
        chunk = candidates[start : start + window]
        kept.append(max(chunk, key=lambda row: row[2]))

    if len(kept) > max_frames:
        positions = np.linspace(0, len(kept) - 1, max_frames)
        chosen = sorted({int(round(x)) for x in positions})
        kept = [kept[i] for i in chosen]
    return sorted(kept, key=lambda row: row[0])


def _resize_long_edge(frame_bgr: np.ndarray, long_edge: int) -> np.ndarray:
    h, w = frame_bgr.shape[:2]
    current = max(h, w)
    if current <= long_edge:
        return frame_bgr
    scale = long_edge / current
    return cv2.resize(frame_bgr, (max(1, int(round(w * scale))), max(1, int(round(h * scale)))), interpolation=cv2.INTER_AREA)


def _mask_border_ratio(mask: np.ndarray) -> float:
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


def _warm_ratio(image_rgb: np.ndarray, mask: np.ndarray) -> float:
    pix = image_rgb[mask.astype(bool)]
    if len(pix) == 0:
        return 0.0
    rgb = pix.astype(np.int16)
    r, g, b = rgb[:, 0], rgb[:, 1], rgb[:, 2]
    # Broad wood prior: warm/brown pixels usually have red >= green >= blue,
    # while still allowing highlights and dark grooves.
    warm = (r >= g - 8) & (g >= b - 14) & ((r - b) >= 12) & (r >= 45)
    return float(warm.mean())


def _center_distance(mask: np.ndarray) -> float:
    ys, xs = np.nonzero(mask)
    if len(xs) == 0:
        return 1.0
    h, w = mask.shape
    cx = float(xs.mean()) / max(1.0, w - 1)
    cy = float(ys.mean()) / max(1.0, h - 1)
    return float(math.hypot(cx - 0.5, cy - 0.5) / math.sqrt(0.5**2 + 0.5**2))


def _candidate_score(image_rgb: np.ndarray, row: dict[str, Any]) -> tuple[float, dict[str, float]]:
    mask = np.asarray(row["segmentation"], dtype=bool)
    h, w = mask.shape
    area = float(mask.sum() / max(1, h * w))
    border = _mask_border_ratio(mask)
    warm = _warm_ratio(image_rgb, mask)
    center = _center_distance(mask)
    pred = float(row.get("predicted_iou", 0.0) or 0.0)
    stability = float(row.get("stability_score", 0.0) or 0.0)

    # Turntable driftwood normally occupies a meaningful but non-dominating region.
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


def _select_mask(image_rgb: np.ndarray, proposals: list[dict[str, Any]]) -> tuple[np.ndarray | None, float, dict[str, float] | None, str | None]:
    if not proposals:
        return None, float("-inf"), None, "NO_MASK_PROPOSALS"

    ranked: list[tuple[float, dict[str, float], np.ndarray]] = []
    for row in proposals:
        mask = np.asarray(row.get("segmentation"), dtype=bool)
        if mask.ndim != 2 or mask.shape[:2] != image_rgb.shape[:2]:
            continue
        score, metrics = _candidate_score(image_rgb, row)
        ranked.append((score, metrics, mask))

    if not ranked:
        return None, float("-inf"), None, "NO_VALID_MASK_SHAPE"
    ranked.sort(key=lambda x: x[0], reverse=True)
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


def _contact_sheet(items: Iterable[tuple[Path, str]], output: Path, cols: int = 5, thumb_w: int = 300, thumb_h: int = 210) -> None:
    rows_data = list(items)
    if not rows_data:
        return
    cols = max(1, cols)
    rows = math.ceil(len(rows_data) / cols)
    label_h = 28
    canvas = Image.new("RGB", (cols * thumb_w, rows * (thumb_h + label_h)), (28, 28, 28))
    draw = ImageDraw.Draw(canvas)
    for i, (path, label) in enumerate(rows_data):
        img = Image.open(path).convert("RGB")
        img.thumbnail((thumb_w - 8, thumb_h - 8), Image.Resampling.LANCZOS)
        x0 = (i % cols) * thumb_w
        y0 = (i // cols) * (thumb_h + label_h)
        x = x0 + (thumb_w - img.width) // 2
        y = y0 + (thumb_h - img.height) // 2
        canvas.paste(img, (x, y))
        draw.text((x0 + 6, y0 + thumb_h + 5), label[:44], fill=(235, 235, 235))
    canvas.save(output, quality=92)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--video", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--max-frames", type=int, default=30)
    ap.add_argument("--sample-fps", type=float, default=6.0)
    ap.add_argument("--window", type=int, default=3)
    ap.add_argument("--long-edge", type=int, default=960)
    ap.add_argument("--sam-model", default=DEFAULT_SAM_MODEL)
    ap.add_argument("--background", type=int, default=NEUTRAL_GRAY)
    args = ap.parse_args()

    video = Path(args.video).resolve()
    out = Path(args.out).resolve()
    if not video.is_file():
        raise SystemExit(f"VIDEO_NOT_FOUND:{video}")
    if not (0 <= args.background <= 255):
        raise SystemExit("BACKGROUND_MUST_BE_0_255")
    ensure_empty_or_create(out)

    raw_dir = out / "frames_raw"
    masks_dir = out / "masks"
    masked_dir = out / "frames_masked"
    raw_dir.mkdir()
    masks_dir.mkdir()
    masked_dir.mkdir()

    candidates, video_meta = _sample_candidates(video, args.sample_fps)
    selected = _temporal_sharpest(candidates, args.window, args.max_frames)
    if len(selected) < MIN_USABLE_FRAMES:
        raise SystemExit(f"V4_TOO_FEW_SELECTED_FRAMES:count={len(selected)}:min={MIN_USABLE_FRAMES}")

    records: list[SelectedFrame] = []
    for seq, (source_idx, ts, sharp, frame) in enumerate(selected):
        frame = _resize_long_edge(frame, args.long_edge)
        path = raw_dir / f"frame_{seq:04d}.png"
        cv2.imwrite(str(path), frame)
        records.append(SelectedFrame(source_idx, ts, sharp, str(path.relative_to(out))))

    # Import SAM only after deterministic frame selection has succeeded.
    try:
        import torch
        from sam2.automatic_mask_generator import SAM2AutomaticMaskGenerator
    except Exception as exc:
        raise SystemExit(f"V4_SAM2_IMPORT_FAILED:{type(exc).__name__}:{exc}") from exc

    if not torch.cuda.is_available():
        raise SystemExit("V4_SAM2_CUDA_REQUIRED")

    try:
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
    except Exception as exc:
        raise SystemExit(f"V4_SAM2_LOAD_FAILED:{type(exc).__name__}:{exc}") from exc

    accepted = 0
    raw_sheet: list[tuple[Path, str]] = []
    mask_sheet: list[tuple[Path, str]] = []
    masked_sheet: list[tuple[Path, str]] = []

    for seq, rec in enumerate(records):
        raw_path = out / rec.raw_file
        image_rgb = np.asarray(Image.open(raw_path).convert("RGB"))
        try:
            proposals = generator.generate(image_rgb)
        except Exception as exc:
            rec.reject_reason = f"SAM2_GENERATE_FAILED:{type(exc).__name__}"
            raw_sheet.append((raw_path, f"{seq:02d} REJECT sam2"))
            continue

        mask, score, metrics, reject = _select_mask(image_rgb, proposals)
        rec.mask_score = None if not math.isfinite(score) else float(score)
        if metrics:
            rec.mask_area_ratio = metrics["area_ratio"]
            rec.predicted_iou = metrics["predicted_iou"]
            rec.stability_score = metrics["stability_score"]
            rec.warm_ratio = metrics["warm_ratio"]
            rec.border_ratio = metrics["border_ratio"]
            rec.center_distance = metrics["center_distance"]
        if mask is None:
            rec.reject_reason = reject or "MASK_SELECTION_FAILED"
            raw_sheet.append((raw_path, f"{seq:02d} REJECT {rec.reject_reason}"))
            continue

        mask_u8 = mask.astype(np.uint8) * 255
        mask_path = masks_dir / f"frame_{seq:04d}.png"
        Image.fromarray(mask_u8).save(mask_path)

        bg = np.full_like(image_rgb, args.background, dtype=np.uint8)
        masked = np.where(mask[..., None], image_rgb, bg)
        masked_path = masked_dir / f"frame_{accepted:04d}.png"
        Image.fromarray(masked).save(masked_path)

        rec.mask_file = str(mask_path.relative_to(out))
        rec.masked_file = str(masked_path.relative_to(out))
        rec.accepted = True
        accepted += 1

        # White mask on black, converted to RGB for contact-sheet readability.
        raw_sheet.append((raw_path, f"{seq:02d} OK sharp={rec.sharpness:.0f}"))
        mask_sheet.append((mask_path, f"{seq:02d} area={rec.mask_area_ratio:.3f} score={score:.2f}"))
        masked_sheet.append((masked_path, f"{seq:02d} warm={rec.warm_ratio:.2f} border={rec.border_ratio:.3f}"))

    if accepted < MIN_USABLE_FRAMES:
        manifest = {
            "status": "FAIL_TOO_FEW_USABLE_MASKED_FRAMES",
            "source_video": str(video),
            "source_video_sha256": sha256_file(video),
            "video": video_meta,
            "selected_count": len(records),
            "accepted_count": accepted,
            "minimum_accepted": MIN_USABLE_FRAMES,
            "frames": [asdict(r) for r in records],
        }
        (out / "prep_manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        _contact_sheet(raw_sheet, out / "selected_frames_contact_sheet.jpg")
        _contact_sheet(mask_sheet, out / "mask_contact_sheet.jpg")
        _contact_sheet(masked_sheet, out / "masked_contact_sheet.jpg")
        raise SystemExit(f"V4_TOO_FEW_USABLE_MASKED_FRAMES:accepted={accepted}:min={MIN_USABLE_FRAMES}")

    _contact_sheet(raw_sheet, out / "selected_frames_contact_sheet.jpg")
    _contact_sheet(mask_sheet, out / "mask_contact_sheet.jpg")
    _contact_sheet(masked_sheet, out / "masked_contact_sheet.jpg")

    coverage = [r.mask_area_ratio for r in records if r.accepted and r.mask_area_ratio is not None]
    manifest = {
        "schema_version": "1.0",
        "status": "PASS",
        "architecture": "LOW_TOUCH_VIDEO_TO_OBJECT_ONLY_FRAMES",
        "source_video": str(video),
        "source_video_sha256": sha256_file(video),
        "source_video_read_only": True,
        "video": video_meta,
        "selection": {
            "method": "TEMPORAL_WINDOW_SHARPEST_THEN_EVEN_CAP",
            "donor_repo": DONOR_REPO,
            "donor_commit": DONOR_COMMIT,
            "max_frames": args.max_frames,
            "window": args.window,
            "long_edge": args.long_edge,
        },
        "masking": {
            "method": "SAM2_AUTOMATIC_MASK_GENERATOR_DETERMINISTIC_SELECTION",
            "sam2_repo": SAM2_REPO,
            "sam2_commit": SAM2_COMMIT,
            "model_id": args.sam_model,
            "background_rgb": [args.background] * 3,
            "manual_per_frame_clicks": False,
        },
        "selected_count": len(records),
        "accepted_count": accepted,
        "rejected_count": len(records) - accepted,
        "mask_area_ratio_median": float(np.median(coverage)) if coverage else None,
        "frames": [asdict(r) for r in records],
    }
    (out / "prep_manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    print("P5_QA01_V4_VIDEO2TWIN_PREP=PASS")
    print(f"source_video_sha256={manifest['source_video_sha256']}")
    print(f"selected_frames={len(records)}")
    print(f"usable_masked_frames={accepted}")
    print(f"rejected_frames={len(records) - accepted}")
    print(f"mask_area_ratio_median={manifest['mask_area_ratio_median']}")
    print(f"masked_frames_dir={masked_dir}")
    print(f"manifest={out / 'prep_manifest.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
