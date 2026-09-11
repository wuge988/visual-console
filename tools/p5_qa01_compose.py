from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image

CANVAS = (1024, 1024)
MODES = {
    "natural": {"max_width_ratio": 0.78, "max_height_ratio": 0.68},
    "hero": {"max_width_ratio": 0.86, "max_height_ratio": 0.76},
}
BOTTOM_RATIO = 0.90
ALPHA_THRESHOLD = 1


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def alpha_bbox(subject: Image.Image) -> tuple[int, int, int, int]:
    alpha = subject.getchannel("A")
    if ALPHA_THRESHOLD > 0:
        alpha = alpha.point(lambda value: 255 if value >= ALPHA_THRESHOLD else 0)
    bbox = alpha.getbbox()
    if bbox is None:
        raise RuntimeError("SC01_ALPHA_EMPTY")
    return bbox


def compose(source_path: Path, background_path: Path, output_path: Path, mode: str) -> dict:
    if mode not in MODES:
        raise RuntimeError(f"UNKNOWN_MODE:{mode}")

    with Image.open(source_path) as raw_subject:
        subject = raw_subject.convert("RGBA")
    with Image.open(background_path) as raw_background:
        background = raw_background.convert("RGBA")

    if background.size != CANVAS:
        raise RuntimeError(f"BACKGROUND_DIMENSION_MISMATCH:{background.size[0]}x{background.size[1]}")

    bbox = alpha_bbox(subject)
    subject_crop = subject.crop(bbox)
    crop_width, crop_height = subject_crop.size
    if crop_width <= 0 or crop_height <= 0:
        raise RuntimeError("SC01_ALPHA_BBOX_INVALID")

    config = MODES[mode]
    max_width = CANVAS[0] * config["max_width_ratio"]
    max_height = CANVAS[1] * config["max_height_ratio"]
    scale = min(max_width / crop_width, max_height / crop_height)
    if scale <= 0:
        raise RuntimeError("INVALID_SCALE")

    target_width = max(1, int(round(crop_width * scale)))
    target_height = max(1, int(round(crop_height * scale)))

    # One uniform transform only. RGB and alpha are resized together; no relight,
    # color grade, shadow, rotation, perspective or non-uniform warp is applied.
    resized = subject_crop.resize((target_width, target_height), Image.Resampling.LANCZOS)

    x = int(round((CANVAS[0] - target_width) / 2.0))
    bottom_y = int(round(CANVAS[1] * BOTTOM_RATIO))
    y = bottom_y - target_height
    if x < 0 or y < 0 or x + target_width > CANVAS[0] or y + target_height > CANVAS[1]:
        raise RuntimeError("PLACEMENT_OUTSIDE_CANVAS")

    result = background.copy()
    result.alpha_composite(resized, dest=(x, y))
    output_path.parent.mkdir(parents=True, exist_ok=True)
    result.convert("RGB").save(output_path, format="PNG", optimize=False)

    return {
        "mode": mode,
        "canvas": {"width": CANVAS[0], "height": CANVAS[1]},
        "source": {
            "path": str(source_path),
            "width": subject.width,
            "height": subject.height,
            "alpha_bbox": list(bbox),
            "sha256": sha256_file(source_path),
        },
        "background": {
            "path": str(background_path),
            "sha256": sha256_file(background_path),
        },
        "transform": {
            "uniform_scale": scale,
            "target_width": target_width,
            "target_height": target_height,
            "x": x,
            "y": y,
            "bottom_ratio": BOTTOM_RATIO,
            "max_width_ratio": config["max_width_ratio"],
            "max_height_ratio": config["max_height_ratio"],
            "rotation_degrees": 0,
            "perspective_warp": False,
            "non_uniform_scale": False,
            "relight": False,
            "synthetic_shadow": False,
            "vignette": False,
        },
        "output": {
            "path": str(output_path),
            "sha256": sha256_file(output_path),
            "size_bytes": output_path.stat().st_size,
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Deterministic P5 QA01 style-only compositor")
    parser.add_argument("--source", required=True)
    parser.add_argument("--background", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--mode", choices=sorted(MODES), required=True)
    parser.add_argument("--report", required=True)
    args = parser.parse_args()

    source = Path(args.source).resolve()
    background = Path(args.background).resolve()
    output = Path(args.output).resolve()
    report = Path(args.report).resolve()

    if not source.is_file():
        raise RuntimeError("SC01_SOURCE_NOT_FOUND")
    if not background.is_file():
        raise RuntimeError("BACKGROUND_NOT_FOUND")

    data = compose(source, background, output, args.mode)
    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(data, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
