#!/usr/bin/env python3
"""P3-A Aquarium identity-first deterministic composite baseline.

Evaluation-only harness. It does not generate pixels with an AI model, mutate RAW,
write Archive state, or register QA01. The verified Exact Piece RGBA is composited
onto a fixed Aquarium plate without resizing either input. Source files remain
read-only and are hash-checked before/after execution.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageChops

PILOT_ID = "P3A-QA01-DC-ZY-SZ-31001"
DEFAULT_ITEM_ID = "DC-ZY-SZ-31001"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def require_file(path: Path, code: str) -> None:
    if not path.is_file():
        raise RuntimeError(f"{code}:{path}")


def verify_expected(actual: str, expected: str, code: str) -> None:
    expected = expected.strip().lower()
    if not expected:
        raise RuntimeError(f"{code}_EXPECTED_SHA_REQUIRED")
    if actual.lower() != expected:
        raise RuntimeError(f"{code}_SHA_MISMATCH:expected={expected}:actual={actual}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--piece", required=True, help="verified Exact Piece RGBA PNG")
    parser.add_argument("--aquarium", required=True, help="fixed Aquarium backplate PNG/JPG")
    parser.add_argument("--piece-sha256", required=True)
    parser.add_argument("--aquarium-sha256", required=True)
    parser.add_argument("--out", required=True, help="empty/new evaluation output directory")
    parser.add_argument("--item-id", default=DEFAULT_ITEM_ID)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.item_id != DEFAULT_ITEM_ID:
        raise RuntimeError(f"P3A_PILOT_ITEM_MISMATCH:{args.item_id}")

    piece_path = Path(args.piece).resolve()
    aquarium_path = Path(args.aquarium).resolve()
    out_dir = Path(args.out).resolve()
    require_file(piece_path, "P3A_PIECE_MISSING")
    require_file(aquarium_path, "P3A_AQUARIUM_MISSING")
    if out_dir.exists() and any(out_dir.iterdir()):
        raise RuntimeError(f"P3A_OUTPUT_DIR_NOT_EMPTY:{out_dir}")
    out_dir.mkdir(parents=True, exist_ok=True)

    piece_before = sha256_file(piece_path)
    aquarium_before = sha256_file(aquarium_path)
    verify_expected(piece_before, args.piece_sha256, "P3A_PIECE")
    verify_expected(aquarium_before, args.aquarium_sha256, "P3A_AQUARIUM")

    final_path = out_dir / "aquarium_identity_baseline.png"
    alpha_path = out_dir / "piece_alpha.png"
    manifest_path = out_dir / "evaluation_manifest.json"

    with Image.open(piece_path) as piece_im, Image.open(aquarium_path) as aquarium_im:
        piece_rgba = piece_im.convert("RGBA")
        aquarium_rgb = aquarium_im.convert("RGB")
        aquarium_rgba = aquarium_rgb.convert("RGBA")
        if piece_rgba.size != aquarium_rgba.size:
            raise RuntimeError(
                f"P3A_DIMENSION_MISMATCH:piece={piece_rgba.size}:aquarium={aquarium_rgba.size}"
            )

        alpha = piece_rgba.getchannel("A")
        histogram = alpha.histogram()
        total_pixels = piece_rgba.width * piece_rgba.height
        transparent = histogram[0]
        opaque = histogram[255]
        nonzero = total_pixels - transparent
        if nonzero <= 0:
            raise RuntimeError("P3A_PIECE_ALPHA_EMPTY")
        if transparent <= 0:
            raise RuntimeError("P3A_PIECE_REQUIRES_TRANSPARENT_BACKGROUND")
        if opaque <= 0:
            raise RuntimeError("P3A_PIECE_HAS_NO_FULLY_OPAQUE_IDENTITY_PIXELS")

        final_rgba = Image.alpha_composite(aquarium_rgba, piece_rgba)
        final_rgb = final_rgba.convert("RGB")

        # Exact identity contract: fully opaque source pixels must remain byte-equal.
        opaque_mask = alpha.point(lambda p: 255 if p == 255 else 0)
        piece_rgb = piece_rgba.convert("RGB")
        diff = ImageChops.difference(piece_rgb, final_rgb)
        black = Image.new("RGB", piece_rgb.size, (0, 0, 0))
        opaque_diff = Image.composite(diff, black, opaque_mask)
        if opaque_diff.getbbox() is not None:
            raise RuntimeError("P3A_OPAQUE_IDENTITY_PIXEL_DRIFT")

        final_rgb.save(final_path, format="PNG")
        alpha.save(alpha_path, format="PNG")

    piece_after = sha256_file(piece_path)
    aquarium_after = sha256_file(aquarium_path)
    if piece_after != piece_before:
        raise RuntimeError("P3A_SOURCE_PIECE_MUTATED")
    if aquarium_after != aquarium_before:
        raise RuntimeError("P3A_SOURCE_AQUARIUM_MUTATED")

    manifest = {
        "schema_version": "1.0",
        "pilot_id": PILOT_ID,
        "phase": "P3-A",
        "authority": "EVALUATION_ONLY",
        "production_registration": False,
        "pdp_blocking": False,
        "item_id": args.item_id,
        "workflow_code": "QA01",
        "route": "IDENTITY_FIRST_DETERMINISTIC_COMPOSITE_BASELINE",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "source": {
            "piece": {"path": str(piece_path), "sha256": piece_before},
            "aquarium": {"path": str(aquarium_path), "sha256": aquarium_before},
            "source_mutated": False,
        },
        "identity_checks": {
            "no_resize": True,
            "opaque_piece_pixels_exact": True,
            "piece_alpha_nonzero_pixels": nonzero,
            "piece_alpha_opaque_pixels": opaque,
            "piece_alpha_coverage": nonzero / total_pixels,
        },
        "outputs": {
            "composite": str(final_path),
            "composite_sha256": sha256_file(final_path),
            "alpha_preview": str(alpha_path),
        },
        "gate_state": "HUMAN_VISUAL_GATE_REQUIRED",
        "archive_eligible": False,
    }
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")

    print("P3A_AQUARIUM_IDENTITY_BASELINE=PASS")
    print("authority=EVALUATION_ONLY")
    print("production_registration=false")
    print("opaque_piece_pixels_exact=true")
    print("source_mutated=false")
    print("next_gate=HUMAN_VISUAL_GATE")
    print(f"manifest={manifest_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
