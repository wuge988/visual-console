#!/usr/bin/env python3
"""P3-B bounded video-source identity triage.

Discovers existing video candidates under explicit roots, samples representative frames,
and produces read-only Human Visual Gate evidence. It never selects a production source,
never mutates source videos, and never authorizes reconstruction.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import cv2
from PIL import Image, ImageDraw

PILOT_ID = "P3B-M3D01-DC-ZY-SZ-31001"
ITEM_ID = "DC-ZY-SZ-31001"
VIDEO_EXTS = {".mp4", ".mov", ".m4v", ".mkv", ".avi", ".webm"}
LIKELY_TERMS = (
    "dc-zy-sz-31001", "31001", "turntable", "video2twin", "reality", "scan",
    "3d", "splat", "旋转", "转盘", "扫描",
)


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def discover(roots: list[Path], max_videos: int) -> list[Path]:
    found: dict[str, Path] = {}
    for root in roots:
        if not root.is_dir():
            continue
        for path in root.rglob("*"):
            try:
                if path.is_file() and path.suffix.lower() in VIDEO_EXTS:
                    found[str(path.resolve()).lower()] = path.resolve()
            except OSError:
                continue

    def rank(path: Path) -> tuple[int, float, str]:
        text = str(path).lower()
        likely = sum(1 for term in LIKELY_TERMS if term in text)
        try:
            mtime = path.stat().st_mtime
        except OSError:
            mtime = 0.0
        return (-likely, -mtime, text)

    return sorted(found.values(), key=rank)[:max_videos]


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
        "open": bool(fps > 0 and frames > 0),
        "fps": fps,
        "frame_count": frames,
        "width": width,
        "height": height,
        "duration_sec": duration,
    }


def sample_frames(path: Path, samples: int, thumb_size: tuple[int, int]) -> tuple[list[Image.Image], dict[str, Any]]:
    meta = video_meta(path)
    if not meta.get("open"):
        return [], meta
    cap = cv2.VideoCapture(str(path))
    total = int(meta["frame_count"])
    fractions = [0.10, 0.35, 0.60, 0.85]
    if samples != 4:
        fractions = [float(x) for x in __import__("numpy").linspace(0.08, 0.92, samples)]
    images: list[Image.Image] = []
    for frac in fractions:
        idx = max(0, min(total - 1, int(round((total - 1) * frac))))
        cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
        ok, frame = cap.read()
        if not ok or frame is None:
            continue
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        img = Image.fromarray(rgb)
        img.thumbnail(thumb_size, Image.Resampling.LANCZOS)
        images.append(img)
    cap.release()
    return images, meta


def render_contact_sheet(rows: list[dict[str, Any]], output: Path, samples: int) -> None:
    thumb_w, thumb_h = 300, 180
    left_w, label_h = 420, 58
    row_h = thumb_h + label_h
    width = left_w + samples * thumb_w
    height = max(1, len(rows)) * row_h
    canvas = Image.new("RGB", (width, height), (24, 24, 24))
    draw = ImageDraw.Draw(canvas)

    for r, row in enumerate(rows):
        y0 = r * row_h
        status = row["status"]
        label = (
            f"{row['index']:02d} {status}  sha={row['sha256'][:12]}\n"
            f"{row['path']}"
        )
        draw.multiline_text((8, y0 + 8), label[:230], fill=(235, 235, 235), spacing=4)
        for c, img in enumerate(row.get("images", [])):
            x0 = left_w + c * thumb_w
            x = x0 + (thumb_w - img.width) // 2
            y = y0 + (thumb_h - img.height) // 2
            canvas.paste(img, (x, y))
        meta = row.get("meta", {})
        footer = f"duration={meta.get('duration_sec', 0):.2f}s  {meta.get('width', 0)}x{meta.get('height', 0)}  fps={meta.get('fps', 0):.2f}"
        draw.text((left_w + 6, y0 + thumb_h + 8), footer, fill=(205, 205, 205))
    canvas.save(output, quality=92)


def parse_args():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", action="append", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--rejected-sha", action="append", default=[])
    ap.add_argument("--max-videos", type=int, default=40)
    ap.add_argument("--samples-per-video", type=int, default=4)
    return ap.parse_args()


def main() -> int:
    args = parse_args()
    out = Path(args.out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    if any(out.iterdir()):
        raise RuntimeError(f"P3B_SOURCE_TRIAGE_OUTPUT_NOT_EMPTY:{out}")

    roots = [Path(x).resolve() for x in args.root]
    rejected = {x.lower() for x in args.rejected_sha}
    candidates = discover(roots, max(1, args.max_videos))
    if not candidates:
        raise RuntimeError("P3B_SOURCE_TRIAGE_NO_VIDEO_CANDIDATES")

    rows: list[dict[str, Any]] = []
    for idx, path in enumerate(candidates):
        before = sha256_file(path)
        images, meta = sample_frames(path, max(1, args.samples_per_video), (292, 172))
        after = sha256_file(path)
        if before != after:
            raise RuntimeError(f"P3B_SOURCE_VIDEO_MUTATED:{path}")
        status = "KNOWN_HUMAN_REJECTED" if before.lower() in rejected else "REVIEW_CANDIDATE"
        if not meta.get("open"):
            status = "UNREADABLE_VIDEO"
        rows.append({
            "index": idx,
            "path": str(path),
            "sha256": before,
            "status": status,
            "meta": meta,
            "images": images,
        })

    sheet = out / "video_source_identity_contact_sheet.jpg"
    render_contact_sheet(rows, sheet, max(1, args.samples_per_video))

    manifest_rows = [{k: v for k, v in row.items() if k != "images"} for row in rows]
    manifest = {
        "schema_version": "1.0",
        "pilot_id": PILOT_ID,
        "phase": "P3-B",
        "authority": "EVALUATION_ONLY",
        "production_registration": False,
        "pdp_blocking": False,
        "item_id": ITEM_ID,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "roots": [str(x) for x in roots],
        "candidate_count": len(rows),
        "known_human_rejected_sha256": sorted(rejected),
        "gate_state": {
            "VIDEO_SOURCE_CONTENT_IDENTITY": "HUMAN_VISUAL_GATE_REQUIRED",
            "FRAME_QC": "BLOCKED_UNTIL_SOURCE_CONTENT_IDENTITY_PASS",
            "WOOD_ONLY_MASK": "BLOCKED_UNTIL_SOURCE_CONTENT_IDENTITY_PASS",
            "RECONSTRUCTION": "BLOCKED",
        },
        "reshoot_required": False,
        "archive_eligible": False,
        "candidates": manifest_rows,
        "contact_sheet": str(sheet),
    }
    manifest_path = out / "video_source_identity_triage.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")

    print("P3B_VIDEO_SOURCE_IDENTITY_TRIAGE=READY")
    print(f"candidate_count={len(rows)}")
    print("source_mutated=false")
    print("production_registration=false")
    print("reshoot_required=false")
    print("next_gate=VIDEO_SOURCE_CONTENT_IDENTITY_HUMAN_GATE")
    print(f"manifest={manifest_path}")
    print(f"contact_sheet={sheet}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
