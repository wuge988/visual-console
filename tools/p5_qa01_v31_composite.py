from __future__ import annotations

import argparse
import hashlib
from pathlib import Path

from PIL import Image, ImageChops


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--base", required=True)
    p.add_argument("--foreground", required=True)
    p.add_argument("--output", required=True)
    p.add_argument("--alpha-preview", required=True)
    return p.parse_args()


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    args = parse_args()
    base_path = Path(args.base).resolve()
    fg_path = Path(args.foreground).resolve()
    out_path = Path(args.output).resolve()
    alpha_path = Path(args.alpha_preview).resolve()

    if not base_path.is_file():
        raise RuntimeError(f"V31_BASE_MISSING:{base_path}")
    if not fg_path.is_file():
        raise RuntimeError(f"V31_FOREGROUND_PLATE_MISSING:{fg_path}")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    alpha_path.parent.mkdir(parents=True, exist_ok=True)

    with Image.open(base_path) as base_im, Image.open(fg_path) as fg_im:
        base_rgb = base_im.convert("RGB")
        base_rgba = base_rgb.convert("RGBA")
        fg_rgba = fg_im.convert("RGBA")

        if base_rgba.size != fg_rgba.size:
            raise RuntimeError(
                f"V31_DIMENSION_MISMATCH:base={base_rgba.size}:foreground={fg_rgba.size}"
            )

        alpha = fg_rgba.getchannel("A")
        alpha_bbox = alpha.getbbox()
        if alpha_bbox is None:
            raise RuntimeError("V31_FOREGROUND_ALPHA_EMPTY")

        histogram = alpha.histogram()
        total_pixels = base_rgba.size[0] * base_rgba.size[1]
        transparent_pixels = histogram[0]
        nonzero_pixels = total_pixels - transparent_pixels
        if nonzero_pixels <= 0:
            raise RuntimeError("V31_FOREGROUND_ALPHA_EMPTY")
        if transparent_pixels <= 0:
            raise RuntimeError("V31_FOREGROUND_PLATE_NOT_TRANSPARENT")

        final_rgba = Image.alpha_composite(base_rgba, fg_rgba)
        final_rgb = final_rgba.convert("RGB")

        # Registration contract: wherever the Blender foreground is fully transparent,
        # the final pixel must be exactly the original audited D5.3 backplate pixel.
        outside_mask = alpha.point(lambda p: 255 if p == 0 else 0)
        diff = ImageChops.difference(base_rgb, final_rgb)
        black = Image.new("RGB", base_rgb.size, (0, 0, 0))
        outside_diff = Image.composite(diff, black, outside_mask)
        outside_exact = outside_diff.getbbox() is None
        if not outside_exact:
            raise RuntimeError("V31_OUTSIDE_FOREGROUND_PIXEL_DRIFT")

        final_rgb.save(out_path, format="PNG")
        alpha.save(alpha_path, format="PNG")

    coverage = nonzero_pixels / total_pixels
    print("P5_QA01_V31_COMPOSITE=PASS")
    print("architecture=FOREGROUND_RGBA_PLATE_PLUS_DETERMINISTIC_PIXEL_COMPOSITE")
    print("photographic_backplate_resampled_by_blender=False")
    print("outside_foreground_pixel_exact=True")
    print(f"width={base_rgba.size[0]}")
    print(f"height={base_rgba.size[1]}")
    print(f"foreground_alpha_nonzero_pixels={nonzero_pixels}")
    print(f"foreground_alpha_coverage={coverage:.6f}")
    print(f"base_sha256={sha256(base_path)}")
    print(f"foreground_sha256={sha256(fg_path)}")
    print(f"final_sha256={sha256(out_path)}")
    print(f"final_file={out_path}")
    print(f"alpha_preview={alpha_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
