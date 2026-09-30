#!/usr/bin/env python3
"""P3-B replacement source-content identity evidence.

Consumes one explicitly selected replacement video, verifies its SHA256, samples
representative frames, and produces Human Visual Gate evidence. This harness
never authorizes Frame-QC, masking, reconstruction, Archive, or production.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import cv2
from PIL import Image, ImageDraw

PILOT_ID = "P3B-M3D01-DC-ZY-SZ-31001"
ITEM_ID = "DC-ZY-SZ-31001"
EXACT_PIECE_REFERENCE_SHA256 = "f31c77589ab71874655744f8f5dc92f2ece77fbf5b7b52f22e53476836a62399"
SCENE_ARCHETYPE = "Heavy Stump + Rightward Branch Flow + Central Negative Space"
CRITICAL_LANDMARKS = [
    "top_double_crowns",
    "central_upright_branch",
    "central_left_large_cavity",
    "right_major_fork",
    "longest_lower_right_branch",
]


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def video_meta(path: Path) -> dict[str, Any]:
    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        return {"open": False}
    fps = float(cap.get(cv2.CAP_PROP_FPS) or 0.0)
    frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
    duration = frames / fps if fps > 0 else 0.0
    cap.release()
    return {
        "open": bool(fps > 0 and frames > 0 and width > 0 and height > 0),
        "fps": fps,
        "frame_count": frames,
        "width": width,
        "height": height,
        "duration_sec": duration,
    }


def sample_frames(path: Path, samples: int) -> tuple[list[tuple[float, Image.Image]], dict[str, Any]]:
    meta = video_meta(path)
    if not meta.get("open"):
        raise RuntimeError("P3B_REPLACEMENT_VIDEO_METADATA_INVALID")
    cap = cv2.VideoCapture(str(path))
    total = int(meta["frame_count"])
    fractions = [0.06 + i * (0.88 / max(1, samples - 1)) for i in range(samples)]
    out: list[tuple[float, Image.Image]] = []
    for frac in fractions:
        idx = max(0, min(total - 1, int(round((total - 1) * frac))))
        cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
        ok, frame = cap.read()
        if not ok or frame is None:
            raise RuntimeError(f"P3B_REPLACEMENT_FRAME_READ_FAILED:index={idx}")
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        img = Image.fromarray(rgb)
        img.thumbnail((360, 220), Image.Resampling.LANCZOS)
        out.append((frac, img))
    cap.release()
    return out, meta


def render_contact_sheet(samples: list[tuple[float, Image.Image]], meta: dict[str, Any], output: Path) -> None:
    cols = 4
    cell_w, cell_h = 390, 270
    rows = (len(samples) + cols - 1) // cols
    header_h = 118
    canvas = Image.new("RGB", (cols * cell_w, header_h + rows * cell_h), (24, 24, 24))
    draw = ImageDraw.Draw(canvas)
    draw.text((12, 10), f"{PILOT_ID} replacement source identity Human Gate", fill=(240, 240, 240))
    draw.text((12, 35), f"Exact Piece reference: {SCENE_ARCHETYPE}", fill=(220, 220, 220))
    draw.text((12, 60), "Landmarks: double crowns | upright branch | large cavity | right fork | lower-right branch", fill=(205, 205, 205))
    draw.text((12, 85), f"video={meta['width']}x{meta['height']} fps={meta['fps']:.2f} duration={meta['duration_sec']:.2f}s", fill=(205, 205, 205))
    for i, (frac, img) in enumerate(samples):
        row, col = divmod(i, cols)
        x0, y0 = col * cell_w, header_h + row * cell_h
        x = x0 + (cell_w - img.width) // 2
        y = y0 + 12
        canvas.paste(img, (x, y))
        draw.text((x0 + 10, y0 + 238), f"{i:02d}  t={frac:.2f}", fill=(225, 225, 225))
    canvas.save(output, quality=94)


def parse_args():
    ap = argparse.ArgumentParser()
    ap.add_argument("--video", required=True)
    ap.add_argument("--video-sha256", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--samples", type=int, default=8)
    return ap.parse_args()


def main() -> int:
    args = parse_args()
    video = Path(args.video).resolve()
    if not video.is_file():
        raise RuntimeError(f"P3B_REPLACEMENT_VIDEO_NOT_FOUND:{video}")

    expected = args.video_sha256.strip().lower()
    if len(expected) != 64:
        raise RuntimeError("P3B_REPLACEMENT_SHA256_INVALID")

    out = Path(args.out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    if any(out.iterdir()):
        raise RuntimeError(f"P3B_REPLACEMENT_IDENTITY_OUTPUT_NOT_EMPTY:{out}")

    before = sha256_file(video)
    if before.lower() != expected:
        raise RuntimeError(f"P3B_REPLACEMENT_SHA256_MISMATCH:expected={expected}:actual={before}")

    samples, meta = sample_frames(video, max(6, min(args.samples, 12)))
    after = sha256_file(video)
    if before != after:
        raise RuntimeError("P3B_SOURCE_VIDEO_MUTATED")

    sheet = out / "replacement_source_identity_contact_sheet.jpg"
    render_contact_sheet(samples, meta, sheet)

    manifest = {
        "schema_version": "1.0",
        "pilot_id": PILOT_ID,
        "phase": "P3-B",
        "authority": "EVALUATION_ONLY",
        "production_registration": False,
        "pdp_blocking": False,
        "item_id": ITEM_ID,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "video": str(video),
        "video_sha256": before,
        "source_mutated": False,
        "video_meta": meta,
        "sample_count": len(samples),
        "exact_piece_reference": {
            "role": "VERIFIED_SC01",
            "source_sha256": EXACT_PIECE_REFERENCE_SHA256,
            "scene_archetype": SCENE_ARCHETYPE,
            "critical_landmarks": CRITICAL_LANDMARKS,
        },
        "gate_state": {
            "VIDEO_SOURCE_SHA256": "PASS",
            "VIDEO_SOURCE_CONTENT_IDENTITY": "HUMAN_VISUAL_GATE_REQUIRED",
            "FRAME_QC": "BLOCKED_UNTIL_SOURCE_CONTENT_IDENTITY_PASS",
            "WOOD_ONLY_MASK": "BLOCKED_UNTIL_SOURCE_CONTENT_IDENTITY_PASS",
            "RECONSTRUCTION": "BLOCKED",
        },
        "archive_eligible": False,
        "contact_sheet": str(sheet),
    }
    manifest_path = out / "replacement_source_identity_manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")

    print("P3B_REPLACEMENT_VIDEO_SOURCE_SHA256=PASS")
    print(f"video_sha256={before}")
    print(f"duration_sec={meta['duration_sec']:.3f}")
    print(f"resolution={meta['width']}x{meta['height']}")
    print(f"fps={meta['fps']:.3f}")
    print(f"sample_count={len(samples)}")
    print("source_mutated=false")
    print("production_registration=false")
    print("P3B_REPLACEMENT_SOURCE_IDENTITY_EVIDENCE=READY")
    print("next_gate=VIDEO_SOURCE_CONTENT_IDENTITY_HUMAN_GATE")
    print("FRAME_QC=BLOCKED_UNTIL_SOURCE_CONTENT_IDENTITY_PASS")
    print("RECONSTRUCTION=BLOCKED")
    print(f"manifest={manifest_path}")
    print(f"contact_sheet={sheet}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
