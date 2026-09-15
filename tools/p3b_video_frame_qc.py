#!/usr/bin/env python3
"""P3-B low-touch video frame QC harness.

Evaluation-only. Reads one existing/short turntable video, deterministically samples
sharp frames, writes only to an evaluation directory, and records a manifest.
It performs no masking/reconstruction/Archive mutation. Those gates remain blocked
until target-Windows runtime checks pass.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw

PILOT_ID = "P3B-M3D01-DC-ZY-SZ-31001"
DEFAULT_ITEM_ID = "DC-ZY-SZ-31001"
MIN_USABLE_FRAMES = 16


@dataclass
class FrameRow:
    source_index: int
    timestamp_sec: float
    sharpness: float
    file: str


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def laplacian_sharpness(frame_bgr: np.ndarray) -> float:
    gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


def sample_candidates(video: Path, sample_fps: float):
    cap = cv2.VideoCapture(str(video))
    if not cap.isOpened():
        raise RuntimeError(f"P3B_VIDEO_OPEN_FAILED:{video}")
    fps = float(cap.get(cv2.CAP_PROP_FPS) or 0.0)
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
    if fps <= 0 or total <= 0 or width <= 0 or height <= 0:
        cap.release()
        raise RuntimeError("P3B_VIDEO_METADATA_INVALID")
    interval = max(1, int(round(fps / max(0.1, sample_fps))))
    candidates = []
    for idx in range(0, total, interval):
        cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
        ok, frame = cap.read()
        if ok and frame is not None:
            candidates.append((idx, idx / fps, laplacian_sharpness(frame), frame))
    cap.release()
    return candidates, {
        "fps": fps,
        "frame_count": total,
        "width": width,
        "height": height,
        "duration_sec": total / fps,
        "sample_fps": sample_fps,
        "candidate_interval_frames": interval,
        "candidate_count": len(candidates),
    }


def select_temporal_sharpest(candidates, window: int, max_frames: int):
    if not candidates:
        return []
    kept = []
    for start in range(0, len(candidates), max(1, window)):
        kept.append(max(candidates[start:start + max(1, window)], key=lambda row: row[2]))
    if len(kept) > max_frames:
        indexes = sorted({int(round(x)) for x in np.linspace(0, len(kept) - 1, max_frames)})
        kept = [kept[i] for i in indexes]
    return sorted(kept, key=lambda row: row[0])


def make_contact_sheet(rows: list[FrameRow], out: Path, cols: int = 5):
    if not rows:
        return
    thumb_w, thumb_h, label_h = 300, 200, 28
    sheet_rows = (len(rows) + cols - 1) // cols
    canvas = Image.new("RGB", (cols * thumb_w, sheet_rows * (thumb_h + label_h)), (28, 28, 28))
    draw = ImageDraw.Draw(canvas)
    for i, row in enumerate(rows):
        image = Image.open(row.file).convert("RGB")
        image.thumbnail((thumb_w - 8, thumb_h - 8), Image.Resampling.LANCZOS)
        x0 = (i % cols) * thumb_w
        y0 = (i // cols) * (thumb_h + label_h)
        canvas.paste(image, (x0 + (thumb_w - image.width)//2, y0 + (thumb_h - image.height)//2))
        draw.text((x0 + 6, y0 + thumb_h + 5), f"#{row.source_index} sharp={row.sharpness:.1f}", fill=(235,235,235))
    canvas.save(out, quality=92)


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--video", required=True)
    p.add_argument("--video-sha256", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--item-id", default=DEFAULT_ITEM_ID)
    p.add_argument("--sample-fps", type=float, default=3.0)
    p.add_argument("--window", type=int, default=3)
    p.add_argument("--max-frames", type=int, default=30)
    return p.parse_args()


def main() -> int:
    args = parse_args()
    if args.item_id != DEFAULT_ITEM_ID:
        raise RuntimeError(f"P3B_PILOT_ITEM_MISMATCH:{args.item_id}")
    video = Path(args.video).resolve()
    if not video.is_file():
        raise RuntimeError(f"P3B_VIDEO_MISSING:{video}")
    out = Path(args.out).resolve()
    if out.exists() and any(out.iterdir()):
        raise RuntimeError(f"P3B_OUTPUT_DIR_NOT_EMPTY:{out}")
    frames_dir = out / "frames"
    frames_dir.mkdir(parents=True, exist_ok=True)

    before = sha256_file(video)
    if before.lower() != args.video_sha256.strip().lower():
        raise RuntimeError(f"P3B_VIDEO_SHA_MISMATCH:actual={before}")

    candidates, metadata = sample_candidates(video, args.sample_fps)
    selected = select_temporal_sharpest(candidates, args.window, args.max_frames)
    if len(selected) < MIN_USABLE_FRAMES:
        raise RuntimeError(f"P3B_FRAME_QC_INSUFFICIENT:selected={len(selected)}:minimum={MIN_USABLE_FRAMES}")

    rows: list[FrameRow] = []
    for ordinal, (idx, timestamp, sharpness, frame) in enumerate(selected, start=1):
        target = frames_dir / f"frame_{ordinal:03d}_src_{idx:06d}.jpg"
        if not cv2.imwrite(str(target), frame, [int(cv2.IMWRITE_JPEG_QUALITY), 96]):
            raise RuntimeError(f"P3B_FRAME_WRITE_FAILED:{target}")
        rows.append(FrameRow(idx, timestamp, sharpness, str(target)))

    contact = out / "frame_qc_contact_sheet.jpg"
    make_contact_sheet(rows, contact)
    after = sha256_file(video)
    if after != before:
        raise RuntimeError("P3B_SOURCE_VIDEO_MUTATED")

    manifest = {
        "schema_version": "1.0",
        "pilot_id": PILOT_ID,
        "phase": "P3-B",
        "authority": "EVALUATION_ONLY",
        "production_registration": False,
        "pdp_blocking": False,
        "item_id": args.item_id,
        "workflow_code": "M3D01",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "source": {"video": str(video), "sha256": before, "source_mutated": False},
        "video_metadata": metadata,
        "frame_qc": {
            "algorithm": "TEMPORAL_WINDOW_SHARPEST_PLUS_EVEN_CAP",
            "selected_count": len(rows),
            "minimum_required": MIN_USABLE_FRAMES,
            "rows": [asdict(row) for row in rows],
            "contact_sheet": str(contact),
        },
        "gate_state": {
            "VIDEO_SOURCE": "PASS",
            "FRAME_QC": "PASS",
            "WOOD_ONLY_MASK": "PENDING_WINDOWS_PHYSICAL_GATE",
            "RECONSTRUCTION": "BLOCKED_UNTIL_MASK_PASS",
            "EXACT_PIECE_3D_IDENTITY": "BLOCKED_UNTIL_RECONSTRUCTION",
        },
        "archive_eligible": False,
    }
    manifest_path = out / "evaluation_manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")

    print("P3B_VIDEO_SOURCE=PASS")
    print("P3B_FRAME_QC=PASS")
    print(f"selected_frames={len(rows)}")
    print("source_mutated=false")
    print("production_registration=false")
    print("next_gate=WOOD_ONLY_MASK_WINDOWS_PHYSICAL_GATE")
    print(f"manifest={manifest_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
