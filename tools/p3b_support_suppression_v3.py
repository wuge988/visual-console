#!/usr/bin/env python3
"""P3-B support suppression v3: residual peg cleanup.

Consumes support-v2 evidence, keeps the approved coverage recovery, and removes
remaining lower slender neutral support pegs with seeded color+geometry cleanup.
Evaluation-only: no reconstruction, Archive mutation, production registration,
dependency installation, or source mutation.
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
    input_mask_file: str
    output_mask_file: str | None = None
    output_masked_file: str | None = None
    delta_file: str | None = None
    mask_area_before: float | None = None
    mask_area_after: float | None = None
    removed_ratio_vs_before: float | None = None
    residual_support_components_removed: int = 0
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
        raise RuntimeError(f"P3B_SUPPORT_V3_OUTPUT_DIR_NOT_EMPTY:{path}")


def bbox(mask: np.ndarray) -> tuple[int, int, int, int]:
    ys, xs = np.nonzero(mask)
    h, w = mask.shape
    if len(xs) == 0:
        return 0, 0, w, h
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def residual_support_cleanup(image_rgb: np.ndarray, mask: np.ndarray) -> tuple[np.ndarray, np.ndarray, int]:
    mask = mask.astype(bool)
    h, w = mask.shape
    x0, y0, x1, y1 = bbox(mask)
    bh = max(1, y1 - y0)
    bw = max(1, x1 - x0)
    mask_area = max(1, int(mask.sum()))

    hsv = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2HSV)
    sat = hsv[:, :, 1].astype(np.int16)
    val = hsv[:, :, 2].astype(np.int16)

    rgb = image_rgb.astype(np.int16)
    chroma = rgb.max(axis=2) - rgb.min(axis=2)
    mean = rgb.mean(axis=2)

    yy = np.arange(h)[:, None]
    lower_region = yy >= (y0 + int(round(0.50 * bh)))

    # Strong neutral/bright seed: high-confidence white or light-gray support.
    seed = mask & lower_region & (sat <= 58) & (val >= 138) & (chroma <= 58)

    # Broader low-saturation grow domain captures shadowed/antialiased support
    # pixels while remaining bounded to the lower half of the object.
    grow = mask & lower_region & (sat <= 92) & (val >= 72) & (chroma <= 88) & (mean >= 74)

    # Bridge small gaps along the peg axis.
    seed_closed = cv2.morphologyEx(
        seed.astype(np.uint8),
        cv2.MORPH_CLOSE,
        cv2.getStructuringElement(cv2.MORPH_RECT, (3, 9)),
        iterations=1,
    ).astype(bool)

    seed_count, seed_labels, seed_stats, _ = cv2.connectedComponentsWithStats(seed_closed.astype(np.uint8), 8)

    remove = np.zeros_like(mask, dtype=bool)
    removed_components = 0

    max_width = max(14, int(round(0.070 * bw)))
    max_seed_area = max(240, int(round(0.035 * mask_area)))
    bottom_margin = max(4, int(round(0.08 * bh)))

    for idx in range(1, seed_count):
        sx = int(seed_stats[idx, cv2.CC_STAT_LEFT])
        sy = int(seed_stats[idx, cv2.CC_STAT_TOP])
        sw = int(seed_stats[idx, cv2.CC_STAT_WIDTH])
        sh = int(seed_stats[idx, cv2.CC_STAT_HEIGHT])
        area = int(seed_stats[idx, cv2.CC_STAT_AREA])
        bottom = sy + sh

        if area <= 0 or area > max_seed_area:
            continue
        if sw > max_width:
            continue
        if sh < 5:
            continue
        if sh / max(1.0, float(sw)) < 0.70:
            continue
        if bottom < y1 - bottom_margin:
            continue

        seed_component = seed_labels == idx

        # Restrict flood/grow to a narrow vertical corridor around the seed.
        pad_x = max(3, int(round(sw * 1.1)))
        cx0 = max(0, sx - pad_x)
        cx1 = min(w, sx + sw + pad_x)
        corridor = np.zeros_like(mask, dtype=bool)
        corridor[max(y0, sy - max(3, int(round(0.10 * bh)))):y1, cx0:cx1] = True

        domain = grow & corridor
        if not domain.any():
            continue

        # Grow from the seed inside the bounded domain using connected components.
        domain_u8 = domain.astype(np.uint8)
        count, labels, stats, _ = cv2.connectedComponentsWithStats(domain_u8, 8)
        seed_dilated = cv2.dilate(seed_component.astype(np.uint8), np.ones((3, 3), np.uint8), 1).astype(bool)

        selected = np.zeros_like(mask, dtype=bool)
        for comp in range(1, count):
            comp_mask = labels == comp
            if np.logical_and(comp_mask, seed_dilated).any():
                selected |= comp_mask

        if not selected.any():
            continue

        ys, xs = np.nonzero(selected)
        sel_w = int(xs.max() - xs.min() + 1)
        sel_h = int(ys.max() - ys.min() + 1)
        sel_bottom = int(ys.max() + 1)
        sel_area = int(selected.sum())

        if sel_w > max(18, int(round(0.095 * bw))):
            continue
        if sel_h < 5:
            continue
        if sel_h / max(1.0, float(sel_w)) < 0.60:
            continue
        if sel_bottom < y1 - bottom_margin:
            continue
        if sel_area > max(500, int(round(0.060 * mask_area))):
            continue

        # Clear the whole grown neutral peg plus a 1 px antialias halo, but
        # only where pixels remain low-saturation enough to avoid wood erosion.
        halo = cv2.dilate(selected.astype(np.uint8), np.ones((3, 3), np.uint8), 1).astype(bool)
        removable = halo & mask & lower_region & (sat <= 105) & (val >= 58) & (chroma <= 98)
        remove |= removable
        removed_components += 1

    cleaned = mask & ~remove
    return cleaned, remove, removed_components


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
        draw.text((x0 + 6, y0 + thumb_h + 5), label[:60], fill=(235, 235, 235))
    canvas.save(output, quality=92)


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--support-v2-dir", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--item-id", default=ITEM_ID)
    p.add_argument("--background", type=int, default=NEUTRAL_GRAY)
    return p.parse_args()


def main() -> int:
    args = parse_args()
    if args.item_id != ITEM_ID:
        raise RuntimeError(f"P3B_PILOT_ITEM_MISMATCH:{args.item_id}")
    if not (0 <= args.background <= 255):
        raise RuntimeError("P3B_SUPPORT_V3_BACKGROUND_MUST_BE_0_255")

    parent_dir = Path(args.support_v2_dir).resolve()
    manifest_path = parent_dir / "evaluation_manifest.json"
    if not manifest_path.is_file():
        raise RuntimeError(f"P3B_SUPPORT_V3_PARENT_MANIFEST_MISSING:{manifest_path}")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

    if manifest.get("pilot_id") != PILOT_ID or manifest.get("item_id") != ITEM_ID:
        raise RuntimeError("P3B_SUPPORT_V3_PARENT_IDENTITY_MISMATCH")
    if manifest.get("authority") != "EVALUATION_ONLY" or manifest.get("production_registration") is not False:
        raise RuntimeError("P3B_SUPPORT_V3_PARENT_AUTHORITY_INVALID")
    if manifest.get("gate_state", {}).get("FRAME_QC") != "PASS":
        raise RuntimeError("P3B_SUPPORT_V3_PARENT_FRAME_QC_NOT_PASS")

    rows_in = list(manifest.get("support_suppression_v2", {}).get("rows") or [])
    accepted_in = [row for row in rows_in if row.get("accepted")]
    if len(accepted_in) < MIN_USABLE_FRAMES:
        raise RuntimeError(f"P3B_SUPPORT_V3_INPUT_INSUFFICIENT:{len(accepted_in)}")

    out = Path(args.out).resolve()
    ensure_empty_or_create(out)
    masks_out = out / "masks_support_v3"
    masked_out = out / "frames_support_v3"
    delta_out = out / "support_v3_delta"
    masks_out.mkdir()
    masked_out.mkdir()
    delta_out.mkdir()

    rows: list[Row] = []
    mask_sheet: list[tuple[Path, str]] = []
    masked_sheet: list[tuple[Path, str]] = []
    delta_sheet: list[tuple[Path, str]] = []
    source_hashes_before: dict[str, str] = {}
    accepted = 0

    for parent in rows_in:
        if not parent.get("accepted"):
            continue
        seq = int(parent["sequence"])
        source_file = Path(str(parent["source_file"])).resolve()
        input_mask = Path(str(parent["output_mask_file"])).resolve()
        if not source_file.is_file() or not input_mask.is_file():
            raise RuntimeError(f"P3B_SUPPORT_V3_INPUT_MISSING:seq={seq}")

        before_sha = sha256_file(source_file)
        source_hashes_before[str(source_file)] = before_sha
        image_rgb = np.asarray(Image.open(source_file).convert("RGB")).copy()
        mask = np.asarray(Image.open(input_mask).convert("L")) >= 128
        if mask.shape != image_rgb.shape[:2]:
            raise RuntimeError(f"P3B_SUPPORT_V3_DIMENSION_MISMATCH:seq={seq}")

        cleaned, removed, component_count = residual_support_cleanup(image_rgb, mask)
        before_area = float(mask.mean())
        after_area = float(cleaned.mean())
        removed_ratio = float(removed.sum() / max(1, mask.sum()))

        reject = None
        if not (0.02 <= after_area <= 0.48):
            reject = "SUPPORT_V3_MASK_AREA_OUT_OF_RANGE"
        elif removed_ratio > 0.08:
            reject = "SUPPORT_V3_REMOVAL_EXCESSIVE"

        mask_out = masks_out / f"frame_{seq:03d}.png"
        Image.fromarray(cleaned.astype(np.uint8) * 255).save(mask_out)

        background = np.full_like(image_rgb, args.background, dtype=np.uint8)
        masked = np.where(cleaned[..., None], image_rgb, background)
        masked_path = masked_out / f"frame_{seq:03d}.png"
        Image.fromarray(masked).save(masked_path)

        delta = image_rgb.copy()
        delta[removed] = np.array([230, 40, 180], dtype=np.uint8)
        delta_path = delta_out / f"frame_{seq:03d}.png"
        Image.fromarray(delta).save(delta_path)

        row = Row(
            sequence=seq,
            source_file=str(source_file),
            source_sha256=before_sha,
            input_mask_file=str(input_mask),
            output_mask_file=str(mask_out),
            output_masked_file=str(masked_path),
            delta_file=str(delta_path),
            mask_area_before=before_area,
            mask_area_after=after_area,
            removed_ratio_vs_before=removed_ratio,
            residual_support_components_removed=component_count,
            accepted=reject is None,
            reject_reason=reject,
        )
        rows.append(row)
        if row.accepted:
            accepted += 1

        status = "OK" if row.accepted else f"REJECT {reject}"
        mask_sheet.append((mask_out, f"{seq:02d} {status} area={after_area:.3f} rm={removed_ratio:.3f}"))
        masked_sheet.append((masked_path, f"{seq:02d} residual={component_count} rm={removed_ratio:.3f}"))
        delta_sheet.append((delta_path, f"{seq:02d} magenta=removed residual={component_count}"))

    for source_file, before in source_hashes_before.items():
        if sha256_file(Path(source_file)) != before:
            raise RuntimeError(f"P3B_SOURCE_FRAME_MUTATED:{source_file}")

    contact_sheet(mask_sheet, out / "support_v3_mask_contact_sheet.jpg")
    contact_sheet(masked_sheet, out / "support_v3_masked_contact_sheet.jpg")
    contact_sheet(delta_sheet, out / "support_v3_delta_contact_sheet.jpg")

    result = {
        "schema_version": "1.0",
        "pilot_id": PILOT_ID,
        "phase": "P3-B",
        "authority": "EVALUATION_ONLY",
        "production_registration": False,
        "pdp_blocking": False,
        "item_id": ITEM_ID,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "parent_support_v2_manifest": str(manifest_path),
        "parent_support_v2_manifest_sha256": sha256_file(manifest_path),
        "support_suppression_v3": {
            "method": "SEEDED_RESIDUAL_PEG_NEUTRAL_GEOMETRY_CLEANUP",
            "manual_per_frame_clicks": False,
            "accepted_count": accepted,
            "rejected_count": len(rows) - accepted,
            "minimum_required": MIN_USABLE_FRAMES,
            "rows": [asdict(row) for row in rows],
            "mask_contact_sheet": str(out / "support_v3_mask_contact_sheet.jpg"),
            "masked_contact_sheet": str(out / "support_v3_masked_contact_sheet.jpg"),
            "delta_contact_sheet": str(out / "support_v3_delta_contact_sheet.jpg"),
        },
        "source_frames_mutated": False,
        "gate_state": {
            "VIDEO_SOURCE": "PASS",
            "FRAME_QC": "PASS",
            "WOOD_ONLY_MASK": "SUPPORT_V3_CANDIDATE_READY_HUMAN_GATE_REQUIRED" if accepted >= MIN_USABLE_FRAMES else "FAIL_TOO_FEW_SUPPORT_V3_MASKS",
            "RECONSTRUCTION": "BLOCKED_UNTIL_SUPPORT_V3_HUMAN_GATE_PASS",
            "EXACT_PIECE_3D_IDENTITY": "BLOCKED_UNTIL_RECONSTRUCTION",
        },
        "archive_eligible": False,
    }
    result_path = out / "evaluation_manifest.json"
    result_path.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")

    if accepted < MIN_USABLE_FRAMES:
        raise RuntimeError(f"P3B_SUPPORT_V3_INSUFFICIENT:accepted={accepted}:minimum={MIN_USABLE_FRAMES}")

    print("P3B_SUPPORT_SUPPRESSION_V3_AUTO_CANDIDATE=PASS")
    print(f"usable_support_v3_masks={accepted}")
    print(f"rejected_support_v3_masks={len(rows) - accepted}")
    print("source_frames_mutated=false")
    print("production_registration=false")
    print("next_gate=WOOD_ONLY_MASK_SUPPORT_V3_HUMAN_VISUAL_GATE")
    print("RECONSTRUCTION=BLOCKED_UNTIL_SUPPORT_V3_HUMAN_GATE_PASS")
    print(f"manifest={result_path}")
    print(f"mask_contact_sheet={out / 'support_v3_mask_contact_sheet.jpg'}")
    print(f"masked_contact_sheet={out / 'support_v3_masked_contact_sheet.jpg'}")
    print(f"delta_contact_sheet={out / 'support_v3_delta_contact_sheet.jpg'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
