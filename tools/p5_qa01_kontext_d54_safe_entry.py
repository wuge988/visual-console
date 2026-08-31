from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageChops

import p5_qa01_kontext_d2_eval as d2
import p5_qa01_kontext_d4_eval as d4
import p5_qa01_kontext_d54_eval as d54


_base_build_anchor_masks = d54.build_anchor_masks


def build_anchor_masks_subject_clipped(source_sc01: Path, evidence: Path) -> dict:
    metrics = _base_build_anchor_masks(source_sc01, evidence)
    with Image.open(source_sc01) as source_raw, Image.open(evidence / "critical_landmark_lock_mask.png") as critical_raw:
        source = source_raw.convert("RGBA")
        critical = critical_raw.convert("L")
    subject = d2.binary_subject_mask(source.getchannel("A"))
    clipped = ImageChops.multiply(critical, subject)
    outside = ImageChops.multiply(clipped, ImageChops.invert(subject))
    if outside.getbbox() is not None:
        raise RuntimeError("D54_SAFE_CRITICAL_LOCK_OUTSIDE_SUBJECT")
    if clipped.getbbox() is None:
        raise RuntimeError("D54_SAFE_CRITICAL_LOCK_EMPTY")
    clipped.save(evidence / "critical_landmark_lock_mask.png", format="PNG", optimize=False)
    metrics["critical_lock_clipped_to_subject"] = True
    metrics["critical_lock_subject_pixels"] = d4.count_nonzero(clipped)
    return metrics


d54.build_anchor_masks = build_anchor_masks_subject_clipped


if __name__ == "__main__":
    raise SystemExit(d54.main())
