from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageChops

import p5_qa01_kontext_d2_eval as d2
import p5_qa01_kontext_d4_eval as d4
import p5_qa01_kontext_d54_eval as d54


# The safety budget is frozen. Do not relax this to make a local Gate pass.
FROZEN_MAX_UNION_EDITABLE_SUBJECT_RATIO = 0.32
FROZEN_MIN_UNCHANGED_SUBJECT_RATIO = 0.68
# Deterministic subject-side boundary depths, widest first. Outside-subject anchor
# room is preserved; only how deeply a stage may enter the sellable piece is reduced.
SUBJECT_INNER_BAND_DEPTHS = (64, 56, 48, 42, 36, 30, 24, 18, 14, 10)
MIN_STAGE_SUBJECT_PIXELS = 128
MIN_STAGE_OUTSIDE_PIXELS = 128
# These bridges add only outside-subject generation room around an already selected
# semantic contact zone. They do not increase subject-side editable budget.
STAGE_OUTSIDE_BRIDGE_PX = {
    "hardscape": 24,
    "epiphyte": 40,
    "coherence": 20,
}


def _stage_boundary_counts(mask: Image.Image, subject: Image.Image) -> tuple[int, int]:
    inside = ImageChops.multiply(mask, subject)
    outside = ImageChops.multiply(mask, ImageChops.invert(subject))
    return d4.count_nonzero(inside), d4.count_nonzero(outside)


def _ensure_outside_bridge(mask: Image.Image, subject: Image.Image, bridge_px: int) -> Image.Image:
    """Extend an existing semantic contact zone only into outside-subject space.

    D5.4 needs visible foreground objects/leaves to cross the Exact Piece silhouette.
    Some normalized attachment windows can sit entirely inside a thick portion of the
    wood, so merely preserving pre-existing outside pixels is insufficient. This
    deterministic bridge grows from the already-authorized subject-side footprint and
    contributes zero additional subject pixels.
    """
    inside = ImageChops.multiply(mask, subject)
    if inside.getbbox() is None:
        return mask
    outside_subject = ImageChops.invert(subject)
    bridge = ImageChops.multiply(d4.dilate(inside, bridge_px), outside_subject)
    return ImageChops.lighter(mask, bridge)


def _restrict_subject_depth(mask: Image.Image, subject: Image.Image, depth: int) -> Image.Image:
    outside = ImageChops.multiply(mask, ImageChops.invert(subject))
    inside = ImageChops.multiply(mask, subject)
    if depth <= 0:
        allowed_inside = Image.new("L", subject.size, 0)
    else:
        allowed_inside = ImageChops.subtract(subject, d2.erode(subject, depth))
    bounded_inside = ImageChops.multiply(inside, allowed_inside)
    return ImageChops.lighter(outside, bounded_inside)


def _broad_semantic_anchors(source: Image.Image, subject: Image.Image, bbox: tuple[int, int, int, int]) -> tuple[Image.Image, Image.Image, Image.Image, Image.Image]:
    # Critical landmark lock is clipped to the exact SC01 subject immediately.
    lock_upper = d54.normalized_rect(source.size, bbox, 0.00, 0.00, 1.00, 0.47)
    lock_cavity = d54.normalized_ellipse(source.size, bbox, 0.39, 0.49, 0.18, 0.16)
    lock_right = d54.normalized_rect(source.size, bbox, 0.61, 0.36, 1.00, 0.97)
    critical_geo = ImageChops.lighter(lock_upper, ImageChops.lighter(lock_cavity, lock_right))
    critical = ImageChops.multiply(critical_geo, subject)

    hardscape_window = d54.normalized_rect(source.size, bbox, -0.03, 0.59, 0.67, 1.03)
    hardscape = ImageChops.multiply(hardscape_window, d4.dilate(subject, 52))
    hardscape = ImageChops.subtract(hardscape, critical)
    hardscape = _ensure_outside_bridge(hardscape, subject, STAGE_OUTSIDE_BRIDGE_PX["hardscape"])

    # Attachment pockets deliberately identify wood-side rhizome locations. A separate
    # outside-only bridge supplies water-space for leaves to cross the silhouette without
    # spending more Exact Piece identity budget.
    pocket_a = d54.normalized_ellipse(source.size, bbox, 0.19, 0.59, 0.13, 0.12)
    pocket_b = d54.normalized_ellipse(source.size, bbox, 0.43, 0.63, 0.13, 0.11)
    epiphyte = ImageChops.lighter(pocket_a, pocket_b)
    epiphyte = ImageChops.multiply(epiphyte, d4.dilate(subject, 34))
    epiphyte = ImageChops.subtract(epiphyte, critical)
    epiphyte = _ensure_outside_bridge(epiphyte, subject, STAGE_OUTSIDE_BRIDGE_PX["epiphyte"])

    contact_outer = d4.dilate(subject, 18)
    contact_inner = d2.erode(subject, 12)
    contact_band = ImageChops.subtract(contact_outer, contact_inner)
    contact_window = d54.normalized_rect(source.size, bbox, -0.02, 0.64, 0.69, 1.01)
    coherence = ImageChops.multiply(contact_band, contact_window)
    coherence = ImageChops.subtract(coherence, critical)
    coherence = _ensure_outside_bridge(coherence, subject, STAGE_OUTSIDE_BRIDGE_PX["coherence"])

    return hardscape, epiphyte, coherence, critical


def _attempt_summary(row: dict) -> str:
    failed = row["failing_stages"]
    failed_text = ",".join(
        f"{name}(in={counts['subject_pixels']},out={counts['outside_pixels']})"
        for name, counts in failed.items()
    ) or "none"
    return (
        f"depth={row['subject_inner_band_depth']}:"
        f"ratio={row['union_editable_subject_ratio']}:"
        f"failed={failed_text}"
    )


def build_anchor_masks_budgeted(source_sc01: Path, evidence: Path) -> dict:
    if d54.MAX_UNION_EDITABLE_SUBJECT_RATIO != FROZEN_MAX_UNION_EDITABLE_SUBJECT_RATIO:
        raise RuntimeError("D54_BUDGET_CONSTANT_DRIFT")
    if d54.MIN_UNCHANGED_SUBJECT_RATIO != FROZEN_MIN_UNCHANGED_SUBJECT_RATIO:
        raise RuntimeError("D54_UNCHANGED_CONSTANT_DRIFT")

    with Image.open(source_sc01) as raw:
        source = raw.convert("RGBA")
    subject = d2.binary_subject_mask(source.getchannel("A"))
    bbox = subject.getbbox()
    if bbox is None:
        raise RuntimeError("D54_SUBJECT_ALPHA_EMPTY")
    subject_pixels = d4.count_nonzero(subject)
    if subject_pixels <= 0:
        raise RuntimeError("D54_SUBJECT_MASK_EMPTY")

    broad_hardscape, broad_epiphyte, broad_coherence, critical = _broad_semantic_anchors(source, subject, bbox)
    broad_union = ImageChops.lighter(broad_hardscape, ImageChops.lighter(broad_epiphyte, broad_coherence))
    broad_ratio = d4.count_nonzero(ImageChops.multiply(broad_union, subject)) / float(subject_pixels)

    attempts: list[dict] = []
    selected = None
    for depth in SUBJECT_INNER_BAND_DEPTHS:
        hardscape = _restrict_subject_depth(broad_hardscape, subject, depth)
        epiphyte = _restrict_subject_depth(broad_epiphyte, subject, depth)
        coherence = _restrict_subject_depth(broad_coherence, subject, min(depth, 18))
        union = ImageChops.lighter(hardscape, ImageChops.lighter(epiphyte, coherence))
        union_subject_pixels = d4.count_nonzero(ImageChops.multiply(union, subject))
        ratio = union_subject_pixels / float(subject_pixels)
        stage_counts = {
            "hardscape": _stage_boundary_counts(hardscape, subject),
            "epiphyte": _stage_boundary_counts(epiphyte, subject),
            "coherence": _stage_boundary_counts(coherence, subject),
        }
        stage_counts_json = {
            key: {"subject_pixels": value[0], "outside_pixels": value[1]}
            for key, value in stage_counts.items()
        }
        failing_stages = {
            key: stage_counts_json[key]
            for key, (inside, outside) in stage_counts.items()
            if inside < MIN_STAGE_SUBJECT_PIXELS or outside < MIN_STAGE_OUTSIDE_PIXELS
        }
        crosses = not failing_stages
        attempts.append({
            "subject_inner_band_depth": depth,
            "union_editable_subject_ratio": round(ratio, 6),
            "stage_boundary_counts": stage_counts_json,
            "failing_stages": failing_stages,
            "all_stages_cross_subject_boundary": crosses,
        })
        if ratio <= FROZEN_MAX_UNION_EDITABLE_SUBJECT_RATIO and crosses:
            selected = (depth, hardscape, epiphyte, coherence, union, union_subject_pixels, ratio, stage_counts)
            break

    if selected is None:
        raise RuntimeError(
            "D54_ADAPTIVE_BUDGET_NO_VALID_PROFILE:" +
            ";".join(_attempt_summary(row) for row in attempts)
        )

    depth, hardscape, epiphyte, coherence, union, union_subject_pixels, ratio, stage_counts = selected
    unchanged_ratio = 1.0 - ratio
    if unchanged_ratio < FROZEN_MIN_UNCHANGED_SUBJECT_RATIO:
        raise RuntimeError("D54_ADAPTIVE_UNCHANGED_SUBJECT_RATIO_TOO_SMALL")
    if ImageChops.multiply(union, critical).getbbox() is not None:
        raise RuntimeError("D54_CRITICAL_LANDMARK_ANCHOR_OVERLAP")
    if ImageChops.multiply(critical, ImageChops.invert(subject)).getbbox() is not None:
        raise RuntimeError("D54_SAFE_CRITICAL_LOCK_OUTSIDE_SUBJECT")
    if critical.getbbox() is None:
        raise RuntimeError("D54_SAFE_CRITICAL_LOCK_EMPTY")

    hardscape.save(evidence / "hardscape_anchor_mask.png", format="PNG", optimize=False)
    epiphyte.save(evidence / "epiphyte_anchor_mask.png", format="PNG", optimize=False)
    coherence.save(evidence / "coherence_anchor_mask.png", format="PNG", optimize=False)
    union.save(evidence / "anchor_union_mask.png", format="PNG", optimize=False)
    critical.save(evidence / "critical_landmark_lock_mask.png", format="PNG", optimize=False)

    return {
        "subject_pixels": subject_pixels,
        "hardscape_anchor_pixels": d4.count_nonzero(hardscape),
        "epiphyte_anchor_pixels": d4.count_nonzero(epiphyte),
        "coherence_anchor_pixels": d4.count_nonzero(coherence),
        "union_anchor_pixels": d4.count_nonzero(union),
        "union_editable_subject_pixels": union_subject_pixels,
        "union_editable_subject_ratio": round(ratio, 6),
        "max_union_editable_subject_ratio": FROZEN_MAX_UNION_EDITABLE_SUBJECT_RATIO,
        "unchanged_subject_ratio": round(unchanged_ratio, 6),
        "min_unchanged_subject_ratio": FROZEN_MIN_UNCHANGED_SUBJECT_RATIO,
        "critical_lock_clipped_to_subject": True,
        "critical_lock_subject_pixels": d4.count_nonzero(critical),
        "adaptive_budgeting": True,
        "outside_bridge_is_subject_budget_neutral": True,
        "stage_outside_bridge_px": STAGE_OUTSIDE_BRIDGE_PX,
        "broad_union_editable_subject_ratio": round(broad_ratio, 6),
        "selected_subject_inner_band_depth": depth,
        "budget_attempts": attempts,
        "all_stages_cross_subject_boundary": True,
        "stage_boundary_counts": {
            key: {"subject_pixels": value[0], "outside_pixels": value[1]}
            for key, value in stage_counts.items()
        },
        "critical_landmarks_locked": [
            "top_double_crowns",
            "central_upright_branch",
            "central_left_large_cavity",
            "right_major_fork",
            "longest_lower_right_branch",
        ],
    }


d54.build_anchor_masks = build_anchor_masks_budgeted


if __name__ == "__main__":
    raise SystemExit(d54.main())
