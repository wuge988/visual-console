from __future__ import annotations

import argparse
import html
import json
from datetime import datetime
from pathlib import Path
import shutil

from PIL import Image, ImageChops, ImageDraw

import p5_qa01_kontext_d0_eval as d0
import p5_qa01_kontext_d2_eval as d2
import p5_qa01_kontext_d4_eval as d4
import p5_qa01_kontext_d51_eval as d51

EXPECTED_SOURCE_SHA256 = "f31c77589ab71874655744f8f5dc92f2ece77fbf5b7b52f22e53476836a62399"
EXPECTED_D53_FINAL_SHA256 = "79c78c8ba14f168c96b112ba50ccee27dedea168b13ebb36156e51838dd99117"
EXPECTED_REALISM_BOARD_SHA256 = "53be649505d76cce1980b97ae77996af410a5b08844f0316a5e124c3c7c17f3c"
EXPECTED_REFERENCE_CANVAS_SHA256 = "60d86a36eed1581a00c75890c330dbbbf46243b2a802fa1d2955335d51d88c05"

MAX_UNION_EDITABLE_SUBJECT_RATIO = 0.32
MIN_UNCHANGED_SUBJECT_RATIO = 0.68
MIN_STAGE_CHANGED_PIXELS = 1000

HARDSCAPE_SEED = 52073191
HARDSCAPE_STEPS = 30
HARDSCAPE_GUIDANCE = 2.6
HARDSCAPE_DENOISE = 0.92

EPIPHYTE_SEED = 52073192
EPIPHYTE_STEPS = 26
EPIPHYTE_GUIDANCE = 2.4
EPIPHYTE_DENOISE = 0.84

COHERENCE_SEED = 52073193
COHERENCE_STEPS = 18
COHERENCE_GUIDANCE = 1.8
COHERENCE_DENOISE = 0.58

HARDSCAPE_PROMPT = (
    "Create one unmistakable foreground load-bearing hardscape event only inside the provided anchor mask. "
    "Keep the established aquarium, camera, water, background and exact driftwood topology unchanged outside the mask. "
    "This pass must visibly seat the heavy lower wood into the aquarium rather than merely recolor it. "
    "Build a small irregular mound of dark mixed natural substrate and fine gravel that laps over and partly buries the lowest wood edge. "
    "Place two or three angular basalt or slate support faces with varied scale and partial burial; at least one stone face must sit physically in front of a small lower wood region so the wood visibly transfers weight into the hardscape. "
    "Use narrow natural contact shadow directly beneath true load points, scattered grains and imperfect transitions. "
    "Do not create smooth round decorative pebbles, a pedestal, another driftwood piece, a stone wall, fantasy lighting, text, logos or watermarks. "
    "Do not solve this stage with color or texture change alone: foreground occlusion and partial burial must be visually obvious."
)

EPIPHYTE_PROMPT = (
    "Create only sparse physically attached epiphyte growth inside the provided attachment anchor mask. "
    "Preserve the existing aquarium and exact driftwood topology outside the mask. "
    "Attach two to four small established pockets of Bucephalandra, Anubias nana petite or small Java fern directly to sheltered lower wood surfaces and branch junctions. "
    "Rhizomes and roots must sit on the wood, and several small leaves must clearly cross the wood silhouette into foreground water so the plant and wood occupy the same physical depth. "
    "Keep attachment restrained and believable; allow tiny rootlets and very limited moss at the attachment seam only. "
    "Do not blanket the wood with moss, hide major holes, create large plants, add extra stones or wood, or merely tint the wood green. "
    "A visible attached-plant silhouette overlap is mandatory for this stage."
)

COHERENCE_PROMPT = (
    "Refine only local physical coherence inside the provided contact anchor mask after the hardscape and epiphyte stages. "
    "Preserve all visible foreground burial, stone overlap and attached-plant silhouette events already established. "
    "Add narrow load-bearing contact shadows, subtle wet seam integration, fine gravel settling against the wood, tiny detritus-scale imperfection and coherent underwater light response. "
    "Do not remove or push the support stone, substrate or attached leaves behind the wood. Do not redesign the tank, driftwood topology, planting hierarchy or camera. "
    "Avoid generic darkening, halo seams, CGI glow, extra wood, text, logos and watermarks."
)


def ensure_under(child: Path, parent: Path) -> None:
    child_r = child.resolve()
    parent_r = parent.resolve()
    try:
        child_r.relative_to(parent_r)
    except ValueError as exc:
        raise RuntimeError(f"D54_PRIOR_EVIDENCE_OUTSIDE_CONTROL_ROOT:{child_r}") from exc


def normalized_rect(size: tuple[int, int], bbox: tuple[int, int, int, int], left: float, top: float, right: float, bottom: float) -> Image.Image:
    x0, y0, x1, y1 = bbox
    w = x1 - x0
    h = y1 - y0
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    draw.rectangle(
        (
            int(round(x0 + w * left)),
            int(round(y0 + h * top)),
            int(round(x0 + w * right)),
            int(round(y0 + h * bottom)),
        ),
        fill=255,
    )
    return mask


def normalized_ellipse(size: tuple[int, int], bbox: tuple[int, int, int, int], cx: float, cy: float, rx: float, ry: float) -> Image.Image:
    x0, y0, x1, y1 = bbox
    w = x1 - x0
    h = y1 - y0
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse(
        (
            int(round(x0 + w * (cx - rx))),
            int(round(y0 + h * (cy - ry))),
            int(round(x0 + w * (cx + rx))),
            int(round(y0 + h * (cy + ry))),
        ),
        fill=255,
    )
    return mask


def validate_prior_evidence(prior: Path, profile: dict, sku: str) -> dict:
    evidence_root = Path(profile["control_root"]) / "evidence"
    ensure_under(prior, evidence_root)
    if not prior.name.startswith("P5_QA01_V2_KONTEXT_D53_"):
        raise RuntimeError(f"D54_PRIOR_EVIDENCE_NAME_INVALID:{prior.name}")
    required = [
        "source_sc01.png",
        "eval_input_white.png",
        "candidate.png",
        "wet_core.png",
        "realism_material_board.png",
        "reference_canvas.png",
        "scene_reference.png",
        "prior_d52_environment.png",
        "scene_recipe.json",
    ]
    missing = [name for name in required if not (prior / name).is_file()]
    if missing:
        raise RuntimeError("D54_PRIOR_EVIDENCE_MISSING:" + ",".join(missing))
    recipe = d0.read_json(prior / "scene_recipe.json")
    if recipe.get("schema_version") != "0.613-eval-d53":
        raise RuntimeError("D54_PRIOR_RECIPE_SCHEMA_MISMATCH")
    if recipe.get("sku") != sku:
        raise RuntimeError("D54_PRIOR_RECIPE_SKU_MISMATCH")
    if recipe.get("source_sc01_sha256") != EXPECTED_SOURCE_SHA256:
        raise RuntimeError("D54_PRIOR_SOURCE_SHA_MISMATCH")
    if (recipe.get("final_metrics") or {}).get("final_sha256") != EXPECTED_D53_FINAL_SHA256:
        raise RuntimeError("D54_PRIOR_FINAL_SHA_MISMATCH")
    anti = recipe.get("anti_replication") or {}
    if anti.get("donor_scene_direct_pixels_passed_to_comfy") is not False:
        raise RuntimeError("D54_PRIOR_DIRECT_DONOR_CONDITIONING_INVALID")
    if anti.get("donor_macro_layout_destroyed_before_conditioning") is not True:
        raise RuntimeError("D54_PRIOR_MACRO_LAYOUT_GUARD_INVALID")
    if d0.sha256_file(prior / "source_sc01.png") != EXPECTED_SOURCE_SHA256:
        raise RuntimeError("D54_PRIOR_SOURCE_BYTES_MISMATCH")
    if d0.sha256_file(prior / "candidate.png") != EXPECTED_D53_FINAL_SHA256:
        raise RuntimeError("D54_PRIOR_FINAL_BYTES_MISMATCH")
    if d0.sha256_file(prior / "realism_material_board.png") != EXPECTED_REALISM_BOARD_SHA256:
        raise RuntimeError("D54_PRIOR_REALISM_BOARD_BYTES_MISMATCH")
    if d0.sha256_file(prior / "reference_canvas.png") != EXPECTED_REFERENCE_CANVAS_SHA256:
        raise RuntimeError("D54_PRIOR_REFERENCE_CANVAS_BYTES_MISMATCH")
    return recipe


def build_anchor_masks(source_sc01: Path, evidence: Path) -> dict:
    with Image.open(source_sc01) as raw:
        source = raw.convert("RGBA")
    subject = d2.binary_subject_mask(source.getchannel("A"))
    bbox = subject.getbbox()
    if bbox is None:
        raise RuntimeError("D54_SUBJECT_ALPHA_EMPTY")

    # Landmark lock: generation may never touch these immediately recognizable SKU structures.
    lock_upper = normalized_rect(source.size, bbox, 0.00, 0.00, 1.00, 0.47)
    lock_cavity = normalized_ellipse(source.size, bbox, 0.39, 0.49, 0.18, 0.16)
    lock_right = normalized_rect(source.size, bbox, 0.61, 0.36, 1.00, 0.97)
    critical = ImageChops.lighter(lock_upper, ImageChops.lighter(lock_cavity, lock_right))

    # A broad but bounded lower-left support window gives the model enough room to create
    # an actual foreground stone/substrate event instead of merely touching the seam.
    hardscape_window = normalized_rect(source.size, bbox, -0.03, 0.59, 0.67, 1.03)
    hardscape = ImageChops.multiply(hardscape_window, d4.dilate(subject, 52))
    hardscape = ImageChops.subtract(hardscape, critical)

    # Attachment windows are separated semantically from the hardscape stage.
    pocket_a = normalized_ellipse(source.size, bbox, 0.19, 0.59, 0.13, 0.12)
    pocket_b = normalized_ellipse(source.size, bbox, 0.43, 0.63, 0.13, 0.11)
    epiphyte = ImageChops.lighter(pocket_a, pocket_b)
    epiphyte = ImageChops.multiply(epiphyte, d4.dilate(subject, 34))
    epiphyte = ImageChops.subtract(epiphyte, critical)

    # Final coherence is a thin contact band, not a scene-editing pass.
    contact_outer = d4.dilate(subject, 18)
    contact_inner = d2.erode(subject, 12)
    contact_band = ImageChops.subtract(contact_outer, contact_inner)
    contact_window = normalized_rect(source.size, bbox, -0.02, 0.64, 0.69, 1.01)
    coherence = ImageChops.multiply(contact_band, contact_window)
    coherence = ImageChops.subtract(coherence, critical)

    union = ImageChops.lighter(hardscape, ImageChops.lighter(epiphyte, coherence))
    union_subject = ImageChops.multiply(union, subject)
    subject_pixels = d4.count_nonzero(subject)
    union_subject_pixels = d4.count_nonzero(union_subject)
    if subject_pixels <= 0:
        raise RuntimeError("D54_SUBJECT_MASK_EMPTY")
    ratio = union_subject_pixels / float(subject_pixels)
    if ratio > MAX_UNION_EDITABLE_SUBJECT_RATIO:
        raise RuntimeError(
            f"D54_UNION_EDITABLE_SUBJECT_BUDGET_EXCEEDED:max={MAX_UNION_EDITABLE_SUBJECT_RATIO:.4f}:actual={ratio:.6f}"
        )
    unchanged_ratio = 1.0 - ratio
    if unchanged_ratio < MIN_UNCHANGED_SUBJECT_RATIO:
        raise RuntimeError(
            f"D54_UNCHANGED_SUBJECT_RATIO_TOO_SMALL:min={MIN_UNCHANGED_SUBJECT_RATIO:.4f}:actual={unchanged_ratio:.6f}"
        )
    if ImageChops.multiply(union, critical).getbbox() is not None:
        raise RuntimeError("D54_CRITICAL_LANDMARK_ANCHOR_OVERLAP")

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
        "max_union_editable_subject_ratio": MAX_UNION_EDITABLE_SUBJECT_RATIO,
        "unchanged_subject_ratio": round(unchanged_ratio, 6),
        "min_unchanged_subject_ratio": MIN_UNCHANGED_SUBJECT_RATIO,
        "critical_landmarks_locked": [
            "top_double_crowns",
            "central_upright_branch",
            "central_left_large_cavity",
            "right_major_fork",
            "longest_lower_right_branch",
        ],
    }


def make_latent_mask_input(base_path: Path, editable_mask_path: Path, target: Path) -> None:
    with Image.open(base_path) as base_raw, Image.open(editable_mask_path) as mask_raw:
        base = base_raw.convert("RGB")
        editable = mask_raw.convert("L")
    if base.size != editable.size:
        raise RuntimeError("D54_STAGE_INPUT_DIMENSION_MISMATCH")
    rgba = base.convert("RGBA")
    rgba.putalpha(ImageChops.invert(editable))
    rgba.save(target, format="PNG", optimize=False)


def localize_stage(base_path: Path, raw_path: Path, mask_path: Path, target: Path, delta_target: Path) -> dict:
    with Image.open(base_path) as base_raw, Image.open(raw_path) as raw_raw, Image.open(mask_path) as mask_raw:
        base = base_raw.convert("RGB")
        raw = raw_raw.convert("RGB")
        mask = mask_raw.convert("L")
    if not (base.size == raw.size == mask.size):
        raise RuntimeError("D54_STAGE_FINAL_DIMENSION_MISMATCH")
    localized = Image.composite(raw, base, mask)
    localized.save(target, format="PNG", optimize=False)

    outside = ImageChops.invert(mask)
    outside_diff = ImageChops.difference(localized, base)
    probe = Image.new("RGB", localized.size, (0, 0, 0))
    probe.paste(outside_diff, (0, 0), outside)
    if probe.getbbox() is not None:
        raise RuntimeError("D54_STAGE_CHANGED_OUTSIDE_ANCHOR")

    delta = ImageChops.difference(localized, base).convert("L").point(lambda value: 255 if value > 0 else 0)
    delta.save(delta_target, format="PNG", optimize=False)
    changed = d4.count_nonzero(delta)
    if changed < MIN_STAGE_CHANGED_PIXELS:
        raise RuntimeError(f"D54_STAGE_CHANGE_TOO_SMALL:min={MIN_STAGE_CHANGED_PIXELS}:actual={changed}")
    return {
        "changed_pixels": changed,
        "raw_sha256": d0.sha256_file(raw_path),
        "localized_sha256": d0.sha256_file(target),
    }


def finalize_candidate(prior_path: Path, stage_path: Path, union_mask_path: Path, wet_core_path: Path, critical_path: Path, target: Path, evidence: Path) -> dict:
    with Image.open(prior_path) as prior_raw, Image.open(stage_path) as stage_raw, Image.open(union_mask_path) as union_raw, Image.open(wet_core_path) as wet_raw, Image.open(critical_path) as critical_raw:
        prior = prior_raw.convert("RGB")
        stage = stage_raw.convert("RGB")
        union = union_raw.convert("L")
        wet = wet_raw.convert("RGB")
        critical = critical_raw.convert("L")
    if not (prior.size == stage.size == union.size == wet.size == critical.size):
        raise RuntimeError("D54_FINAL_DIMENSION_MISMATCH")

    localized = Image.composite(stage, prior, union)
    final = Image.composite(wet, localized, critical)
    final.save(target, format="PNG", optimize=False)

    outside = ImageChops.invert(union)
    outside_diff = ImageChops.difference(final, prior)
    outside_probe = Image.new("RGB", final.size, (0, 0, 0))
    outside_probe.paste(outside_diff, (0, 0), outside)
    # The critical lock may intentionally restore wet-core pixels; it is outside union by construction,
    # so compare those pixels against wet rather than prior before enforcing outside exactness.
    outside_without_critical = ImageChops.subtract(outside, critical)
    outside_probe2 = Image.new("RGB", final.size, (0, 0, 0))
    outside_probe2.paste(outside_diff, (0, 0), outside_without_critical)
    if outside_probe2.getbbox() is not None:
        raise RuntimeError("D54_OUTSIDE_ANCHOR_UNION_CHANGED")

    critical_diff = ImageChops.difference(final, wet)
    critical_probe = Image.new("RGB", final.size, (0, 0, 0))
    critical_probe.paste(critical_diff, (0, 0), critical)
    if critical_probe.getbbox() is not None:
        raise RuntimeError("D54_CRITICAL_LANDMARK_REASSERTION_MISMATCH")

    actual = ImageChops.difference(final, prior).convert("L").point(lambda value: 255 if value > 0 else 0)
    actual.save(evidence / "actual_delta_mask.png", format="PNG", optimize=False)
    return {
        "outside_anchor_union_exact_except_critical_reassertion": True,
        "critical_landmark_exact_pixel_reassertion": True,
        "actual_changed_pixels": d4.count_nonzero(actual),
        "final_sha256": d0.sha256_file(target),
    }


def write_review(evidence: Path, recipe: dict, prompt_ids: dict[str, str]) -> Path:
    review = evidence / "review.html"
    document = f"""<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>P5 QA01 Kontext D5.4 Review</title><style>body{{font-family:Arial,sans-serif;background:#11161b;color:#eee;margin:24px}}h1{{font-size:24px}}.grid{{display:grid;grid-template-columns:1fr 1fr;gap:18px}}.card{{background:#1b2229;padding:14px;border:1px solid #333;border-radius:10px;margin-bottom:18px}}img{{width:100%;height:auto;background:white}}pre{{white-space:pre-wrap;color:#d7d7d7}}.warn{{color:#ffcc80}}.fail{{color:#ff8a80}}.ok{{color:#9fe0b3}}</style></head><body>
<h1>P5 QA01 v2 — Kontext D5.4 Semantic Foreground Ecological Anchors</h1><p class="warn">EVALUATION ONLY / NON-PRODUCTION / QA01 DISABLED</p>
<p class="fail">D5.3 changed many pixels but failed human review because one combined pass did not force visible substrate burial, load-bearing stone overlap and attached epiphyte silhouette events.</p>
<p class="ok">D5.4 separates those semantic events into dedicated deterministic anchor masks and sequential generation stages while retaining the D5.2 anti-replication material board and critical SKU landmark locks.</p>
<div class="grid"><div class="card"><h2>VERIFIED SC01 — exact identity</h2><img src="source_sc01.png"></div><div class="card"><h2>D5.4 final candidate</h2><img src="candidate.png"></div></div>
<div class="grid"><div class="card"><h2>D5.3 prior — semantic integration FAIL</h2><img src="prior_d53_final.png"></div><div class="card"><h2>Stage A — foreground hardscape localized</h2><img src="stage_a_hardscape.png"></div></div>
<div class="grid"><div class="card"><h2>Stage B — epiphyte attachment localized</h2><img src="stage_b_epiphyte.png"></div><div class="card"><h2>Stage C — contact coherence localized</h2><img src="stage_c_coherence.png"></div></div>
<div class="grid"><div class="card"><h2>Hardscape Anchor Mask</h2><img src="hardscape_anchor_mask.png"></div><div class="card"><h2>Hardscape Delta Mask</h2><img src="stage_a_delta_mask.png"></div></div>
<div class="grid"><div class="card"><h2>Epiphyte Anchor Mask</h2><img src="epiphyte_anchor_mask.png"></div><div class="card"><h2>Epiphyte Delta Mask</h2><img src="stage_b_delta_mask.png"></div></div>
<div class="grid"><div class="card"><h2>Coherence Anchor Mask</h2><img src="coherence_anchor_mask.png"></div><div class="card"><h2>Coherence Delta Mask</h2><img src="stage_c_delta_mask.png"></div></div>
<div class="grid"><div class="card"><h2>Anchor Union — only this region may differ from D5.3</h2><img src="anchor_union_mask.png"></div><div class="card"><h2>Critical Landmark Lock</h2><img src="critical_landmark_lock_mask.png"></div></div>
<div class="grid"><div class="card"><h2>Actual Final Delta vs D5.3</h2><img src="actual_delta_mask.png"></div><div class="card"><h2>D5.2 environment retained</h2><img src="prior_d52_environment.png"></div></div>
<div class="grid"><div class="card"><h2>Original donor — AUDIT ONLY, never conditioned</h2><img src="scene_reference.png"></div><div class="card"><h2>Anti-replication material board — conditioned</h2><img src="realism_material_board.png"></div></div>
<div class="grid"><div class="card"><h2>Reference Canvas — exact identity + destroyed material board</h2><img src="reference_canvas.png"></div><div class="card"><h2>Prior D5.3 actual delta</h2><img src="prior_d53_delta_mask.png"></div></div>
<div class="card"><h2>D5.4 Recipe</h2><pre>{html.escape(json.dumps(recipe, ensure_ascii=False, indent=2))}</pre></div>
<div class="card"><h2>Stage A Prompt</h2><pre>{html.escape(HARDSCAPE_PROMPT)}</pre><p>prompt_id={html.escape(prompt_ids['hardscape'])}</p></div>
<div class="card"><h2>Stage B Prompt</h2><pre>{html.escape(EPIPHYTE_PROMPT)}</pre><p>prompt_id={html.escape(prompt_ids['epiphyte'])}</p></div>
<div class="card"><h2>Stage C Prompt</h2><pre>{html.escape(COHERENCE_PROMPT)}</pre><p>prompt_id={html.escape(prompt_ids['coherence'])}</p></div></body></html>"""
    review.write_text(document, encoding="utf-8")
    return review


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", required=True)
    parser.add_argument("--site-id", default="drift-curio")
    parser.add_argument("--sku", default="DC-ZY-SZ-31001")
    parser.add_argument("--prior-evidence-dir", required=True)
    parser.add_argument("--expected-head", default="")
    args = parser.parse_args()
    repo = Path(args.repo_root).resolve()

    try:
        if Path(d0.run_git(repo, "rev-parse", "--show-toplevel")).resolve() != repo:
            raise RuntimeError("REPO_ROOT_MISMATCH")
        dirty = d0.run_git(repo, "status", "--porcelain=v1", "--untracked-files=all")
        if dirty.strip():
            raise RuntimeError("WORKTREE_NOT_CLEAN:" + dirty.replace("\n", " | "))
        branch = d0.run_git(repo, "branch", "--show-current")
        if branch != d0.EXPECTED_BRANCH:
            raise RuntimeError(f"WRONG_BRANCH:expected={d0.EXPECTED_BRANCH}:actual={branch}")
        head = d0.run_git(repo, "rev-parse", "HEAD")
        if args.expected_head and head != args.expected_head.strip():
            raise RuntimeError(f"HEAD_MISMATCH:expected={args.expected_head.strip()}:actual={head}")

        profile = d0.read_json(repo / "config" / "sites" / f"{args.site_id}.json")
        if "QA01" in profile.get("enabled_workflows", []):
            raise RuntimeError("QA01_MUST_REMAIN_DISABLED_DURING_KONTEXT_D54_EVAL")
        registry = d0.read_json(repo / "config" / "workflows" / "registry.json")
        qa01 = next((row for row in registry.get("workflows", []) if row.get("code") == "QA01"), None)
        if not qa01 or qa01.get("executable") is not False or qa01.get("workflow_status") != "NOT_REGISTERED":
            raise RuntimeError("QA01_REGISTRY_MUST_REMAIN_FAIL_CLOSED")

        prior = Path(args.prior_evidence_dir).resolve()
        validate_prior_evidence(prior, profile, args.sku)
        evidence = Path(profile["control_root"]) / "evidence" / ("P5_QA01_V2_KONTEXT_D54_" + datetime.now().strftime("%Y%m%d-%H%M%S"))
        evidence.mkdir(parents=True, exist_ok=False)
        copies = [
            ("source_sc01.png", "source_sc01.png"),
            ("eval_input_white.png", "eval_input_white.png"),
            ("candidate.png", "prior_d53_final.png"),
            ("wet_core.png", "wet_core.png"),
            ("realism_material_board.png", "realism_material_board.png"),
            ("reference_canvas.png", "reference_canvas.png"),
            ("scene_reference.png", "scene_reference.png"),
            ("prior_d52_environment.png", "prior_d52_environment.png"),
            ("actual_delta_mask.png", "prior_d53_delta_mask.png"),
        ]
        for src_name, dst_name in copies:
            shutil.copy2(prior / src_name, evidence / dst_name)

        mask_metrics = build_anchor_masks(evidence / "source_sc01.png", evidence)

        for label, spec in d0.MODELS.items():
            d0.exact_model_identity(label, spec)
        _, started_by_gate = d0.wait_ready(evidence)
        required_nodes = ["UNETLoader", "DualCLIPLoader", "VAELoader", "LoadImage", "FluxKontextImageScale", "VAEEncode", "SetLatentNoiseMask", "CLIPTextEncode", "ReferenceLatent", "FluxGuidance", "ConditioningZeroOut", "KSampler", "VAEDecode", "PreviewImage"]
        infos: dict[str, dict] = {}
        missing: list[str] = []
        for name in required_nodes:
            info = d0.node_info(name)
            if info is None:
                missing.append(name)
            else:
                infos[name] = info
        if missing:
            raise RuntimeError("D54_REQUIRED_NODES_MISSING:" + ",".join(missing))

        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        _, visible_reference = d2.copy_input(evidence / "reference_canvas.png", profile, f"p5_qa01_kontext_d54_reference_canvas_{args.sku}_{stamp}.png")

        prompt_ids: dict[str, str] = {}
        stage_metrics: dict[str, dict] = {}

        stage_specs = [
            ("hardscape", evidence / "prior_d53_final.png", evidence / "hardscape_anchor_mask.png", evidence / "stage_a_hardscape.png", evidence / "stage_a_delta_mask.png", HARDSCAPE_PROMPT, HARDSCAPE_SEED, HARDSCAPE_STEPS, HARDSCAPE_GUIDANCE, HARDSCAPE_DENOISE),
            ("epiphyte", evidence / "stage_a_hardscape.png", evidence / "epiphyte_anchor_mask.png", evidence / "stage_b_epiphyte.png", evidence / "stage_b_delta_mask.png", EPIPHYTE_PROMPT, EPIPHYTE_SEED, EPIPHYTE_STEPS, EPIPHYTE_GUIDANCE, EPIPHYTE_DENOISE),
            ("coherence", evidence / "stage_b_epiphyte.png", evidence / "coherence_anchor_mask.png", evidence / "stage_c_coherence.png", evidence / "stage_c_delta_mask.png", COHERENCE_PROMPT, COHERENCE_SEED, COHERENCE_STEPS, COHERENCE_GUIDANCE, COHERENCE_DENOISE),
        ]

        for index, (label, base_path, mask_path, localized_path, delta_path, prompt, seed, steps, guidance, denoise) in enumerate(stage_specs, start=1):
            input_path = evidence / f"stage_{index}_{label}_input_latentmask.png"
            make_latent_mask_input(base_path, mask_path, input_path)
            _, visible_input = d2.copy_input(input_path, profile, f"p5_qa01_kontext_d54_{label}_{args.sku}_{stamp}.png")
            workflow = d4.build_noise_mask_workflow(visible_reference, visible_input, infos, prompt=prompt, seed=seed, steps=steps, guidance=guidance, denoise=denoise)
            prompt_id, raw_target = d51.run_stage_sanitized(evidence, label, workflow)
            prompt_ids[label] = prompt_id
            stage_metrics[label] = localize_stage(base_path, raw_target, mask_path, localized_path, delta_path)

        final_metrics = finalize_candidate(
            evidence / "prior_d53_final.png",
            evidence / "stage_c_coherence.png",
            evidence / "anchor_union_mask.png",
            evidence / "wet_core.png",
            evidence / "critical_landmark_lock_mask.png",
            evidence / "candidate.png",
            evidence,
        )

        recipe = {
            "schema_version": "0.614-eval-d54",
            "site_id": args.site_id,
            "sku": args.sku,
            "realm": "QA01_AQUARIUM",
            "source_sc01_sha256": EXPECTED_SOURCE_SHA256,
            "prior_d53_final_sha256": EXPECTED_D53_FINAL_SHA256,
            "d53_visual_result": "FAIL_SEMANTIC_OCCLUSION_INSUFFICIENT",
            "architecture": "D5.2 anti-replication board + D5.4 staged semantic foreground ecological anchors + critical-landmark lock",
            "anti_replication": {
                "donor_scene_direct_pixels_passed_to_comfy": False,
                "donor_macro_layout_destroyed_before_conditioning": True,
                "realism_board_reused_from_verified_d52_evidence": True,
                "donor_layout_copy_forbidden": True,
            },
            "integration_contract": {
                "mode": "staged_semantic_foreground_anchors",
                "hardscape_foreground_occlusion_required": True,
                "substrate_partial_burial_required": True,
                "epiphyte_silhouette_overlap_required": True,
                "contact_shadow_coherence_required": True,
                "parameter_only_d53_retry_forbidden": True,
                "whole_subject_repaint_forbidden": True,
                "changes_outside_anchor_union_forbidden": True,
                "critical_landmarks_locked": mask_metrics["critical_landmarks_locked"],
            },
            "mask_metrics": mask_metrics,
            "stages": {
                "hardscape": {"seed": HARDSCAPE_SEED, "steps": HARDSCAPE_STEPS, "guidance": HARDSCAPE_GUIDANCE, "denoise": HARDSCAPE_DENOISE, **stage_metrics["hardscape"]},
                "epiphyte": {"seed": EPIPHYTE_SEED, "steps": EPIPHYTE_STEPS, "guidance": EPIPHYTE_GUIDANCE, "denoise": EPIPHYTE_DENOISE, **stage_metrics["epiphyte"]},
                "coherence": {"seed": COHERENCE_SEED, "steps": COHERENCE_STEPS, "guidance": COHERENCE_GUIDANCE, "denoise": COHERENCE_DENOISE, **stage_metrics["coherence"]},
            },
            "production_mutation": "NONE",
            "final_metrics": final_metrics,
        }
        (evidence / "scene_recipe.json").write_text(json.dumps(recipe, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        (evidence / "prompt_hardscape.txt").write_text(HARDSCAPE_PROMPT + "\n", encoding="utf-8")
        (evidence / "prompt_epiphyte.txt").write_text(EPIPHYTE_PROMPT + "\n", encoding="utf-8")
        (evidence / "prompt_coherence.txt").write_text(COHERENCE_PROMPT + "\n", encoding="utf-8")
        review = write_review(evidence, recipe, prompt_ids)

        print("P5_QA01_V2_KONTEXT_D54_EVAL_GATE=PASS")
        print(f"git_head={head}")
        print(f"sku={args.sku}")
        print("d53_visual_result=FAIL_SEMANTIC_OCCLUSION_INSUFFICIENT")
        print("evaluation_only=True")
        print("production_authorized=False")
        print("qa01_enabled=False")
        print("architecture=STAGED_SEMANTIC_FOREGROUND_ECOLOGICAL_ANCHORS")
        print("donor_scene_direct_pixels_passed_to_comfy=False")
        print("donor_macro_layout_destroyed_before_conditioning=True")
        print("whole_subject_repaint_forbidden=True")
        print("changes_outside_anchor_union_forbidden=True")
        print(f"union_editable_subject_ratio={mask_metrics['union_editable_subject_ratio']}")
        print(f"unchanged_subject_ratio={mask_metrics['unchanged_subject_ratio']}")
        print(f"comfy_started_by_gate={started_by_gate}")
        print(f"hardscape_changed_pixels={stage_metrics['hardscape']['changed_pixels']}")
        print(f"epiphyte_changed_pixels={stage_metrics['epiphyte']['changed_pixels']}")
        print(f"coherence_changed_pixels={stage_metrics['coherence']['changed_pixels']}")
        print(f"candidate_sha256={final_metrics['final_sha256']}")
        print(f"review_file={review}")
        print(f"evidence_dir={evidence}")
        return 0
    except Exception as exc:
        print("P5_QA01_V2_KONTEXT_D54_EVAL_GATE=FAIL")
        print(f"error={exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
