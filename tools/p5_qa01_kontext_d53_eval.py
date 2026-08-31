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
EXPECTED_D52_FINAL_SHA256 = "2814de612fdbc45faa9e7e3fd2fbdab82aa1007e8df9996f768fefbe07b849f4"
EXPECTED_REALISM_BOARD_SHA256 = "53be649505d76cce1980b97ae77996af410a5b08844f0316a5e124c3c7c17f3c"
EXPECTED_REFERENCE_CANVAS_SHA256 = "60d86a36eed1581a00c75890c330dbbbf46243b2a802fa1d2955335d51d88c05"

EMBED_SEED = 52073181
EMBED_STEPS = 22
EMBED_GUIDANCE = 2.15
EMBED_DENOISE = 0.72
BOUNDARY_OUTER_PX = 20
BOUNDARY_INNER_PX = 18
MAX_EDITABLE_SUBJECT_RATIO = 0.24
MIN_IDENTITY_LOCK_SUBJECT_RATIO = 0.70

EMBED_PROMPT = (
    "Refine only the physical embedding zones of the already established aquarium and the same exact sellable driftwood. "
    "This is not a scene redesign. Preserve the existing tank, camera, water, background planting, lighting and all major driftwood topology. "
    "The editable mask deliberately crosses the wood/environment boundary only at bounded ecological attachment and load-bearing zones. "
    "Use real foreground occlusion where physically necessary: dark mixed substrate must lap over and partly bury the lowest wood edges; two or three irregular angular basalt or slate support faces may overlap small portions of the lower wood so the mass visibly carries weight; narrow contact shadows must sit under actual load points. "
    "Add only sparse established epiphyte attachment in sheltered lower pockets: a few Bucephalandra, Anubias nana petite or small Java fern rhizomes may attach directly to the wood, with several leaves crossing the wood silhouette so they clearly belong to the same aquarium rather than sitting behind it. "
    "Allow tiny rootlets, fine gravel, detritus-scale natural imperfection and restrained moss only inside the masked attachment zones. "
    "Do not cover or alter the top double crowns, central upright branch, central-left large cavity, right major fork, longest lower-right branch, major holes, outer proportions or orientation. "
    "Do not add another piece of driftwood. Do not create blanket moss, decorative pebble rows, pedestal staging, CGI lighting, text, logos or watermarks. "
    "The final read must be one mature installed aquarium in which substrate, load-bearing stone, plants, contact shadow and wet wood share the same physical space."
)


def ensure_under(child: Path, parent: Path) -> None:
    child_r = child.resolve()
    parent_r = parent.resolve()
    try:
        child_r.relative_to(parent_r)
    except ValueError as exc:
        raise RuntimeError(f"D53_PRIOR_EVIDENCE_OUTSIDE_CONTROL_ROOT:{child_r}") from exc


def validate_prior_evidence(prior: Path, profile: dict, sku: str) -> dict:
    evidence_root = Path(profile["control_root"]) / "evidence"
    ensure_under(prior, evidence_root)
    if not prior.name.startswith("P5_QA01_V2_KONTEXT_D52_"):
        raise RuntimeError(f"D53_PRIOR_EVIDENCE_NAME_INVALID:{prior.name}")
    required = [
        "source_sc01.png",
        "eval_input_white.png",
        "candidate.png",
        "wet_core.png",
        "protected_core.png",
        "realism_material_board.png",
        "reference_canvas.png",
        "scene_reference.png",
        "candidate_environment_anti_replication_raw.png",
        "scene_recipe.json",
    ]
    missing = [name for name in required if not (prior / name).is_file()]
    if missing:
        raise RuntimeError("D53_PRIOR_EVIDENCE_MISSING:" + ",".join(missing))
    recipe = d0.read_json(prior / "scene_recipe.json")
    if recipe.get("schema_version") != "0.612-eval-d52":
        raise RuntimeError("D53_PRIOR_RECIPE_SCHEMA_MISMATCH")
    if recipe.get("sku") != sku:
        raise RuntimeError("D53_PRIOR_RECIPE_SKU_MISMATCH")
    if recipe.get("source_sc01_sha256") != EXPECTED_SOURCE_SHA256:
        raise RuntimeError("D53_PRIOR_SOURCE_SHA_MISMATCH")
    if (recipe.get("final_metrics") or {}).get("final_candidate_sha256") != EXPECTED_D52_FINAL_SHA256:
        raise RuntimeError("D53_PRIOR_FINAL_SHA_MISMATCH")
    anti = recipe.get("anti_replication") or {}
    if anti.get("donor_scene_direct_pixels_passed_to_comfy") is not False:
        raise RuntimeError("D53_PRIOR_DIRECT_DONOR_CONDITIONING_INVALID")
    if anti.get("donor_macro_layout_destroyed_before_conditioning") is not True:
        raise RuntimeError("D53_PRIOR_MACRO_LAYOUT_GUARD_INVALID")
    if d0.sha256_file(prior / "source_sc01.png") != EXPECTED_SOURCE_SHA256:
        raise RuntimeError("D53_PRIOR_SOURCE_BYTES_MISMATCH")
    if d0.sha256_file(prior / "candidate.png") != EXPECTED_D52_FINAL_SHA256:
        raise RuntimeError("D53_PRIOR_FINAL_BYTES_MISMATCH")
    if d0.sha256_file(prior / "realism_material_board.png") != EXPECTED_REALISM_BOARD_SHA256:
        raise RuntimeError("D53_PRIOR_REALISM_BOARD_BYTES_MISMATCH")
    if d0.sha256_file(prior / "reference_canvas.png") != EXPECTED_REFERENCE_CANVAS_SHA256:
        raise RuntimeError("D53_PRIOR_REFERENCE_CANVAS_BYTES_MISMATCH")
    return recipe


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


def build_embedding_masks(source_sc01: Path, prior_core_path: Path, evidence: Path) -> dict:
    with Image.open(source_sc01) as src_raw, Image.open(prior_core_path) as core_raw:
        source = src_raw.convert("RGBA")
        prior_core = core_raw.convert("L")
    subject = d2.binary_subject_mask(source.getchannel("A"))
    bbox = subject.getbbox()
    if bbox is None:
        raise RuntimeError("D53_SUBJECT_ALPHA_EMPTY")

    outer = d4.dilate(subject, BOUNDARY_OUTER_PX)
    inner = d2.erode(subject, BOUNDARY_INNER_PX)
    boundary = ImageChops.subtract(outer, inner)

    # Load-bearing/base interface: deliberately crosses the wood/environment
    # boundary so substrate and support stone can sit in front of lower edges.
    base_zone = normalized_rect(source.size, bbox, 0.00, 0.58, 0.69, 0.98)
    base_interface = ImageChops.multiply(boundary, base_zone)

    # Sparse lower attachment pockets permit limited epiphyte silhouette overlap.
    pocket_a = normalized_ellipse(source.size, bbox, 0.21, 0.66, 0.13, 0.12)
    pocket_b = normalized_ellipse(source.size, bbox, 0.43, 0.72, 0.12, 0.10)
    attachment = ImageChops.lighter(pocket_a, pocket_b)
    attachment = ImageChops.multiply(attachment, d4.dilate(subject, 8))

    editable = ImageChops.lighter(base_interface, attachment)

    # Critical SKU landmarks are unavailable to the embedding pass.
    protect_upper = normalized_rect(source.size, bbox, 0.00, 0.00, 1.00, 0.50)
    protect_cavity = normalized_ellipse(source.size, bbox, 0.39, 0.49, 0.18, 0.17)
    protect_right = normalized_rect(source.size, bbox, 0.57, 0.34, 1.00, 1.00)
    critical = ImageChops.lighter(protect_upper, ImageChops.lighter(protect_cavity, protect_right))
    editable = ImageChops.subtract(editable, critical)

    editable_subject = ImageChops.multiply(editable, subject)
    editable_outside = ImageChops.multiply(editable, ImageChops.invert(subject))
    subject_pixels = d4.count_nonzero(subject)
    editable_subject_pixels = d4.count_nonzero(editable_subject)
    editable_outside_pixels = d4.count_nonzero(editable_outside)
    if subject_pixels <= 0:
        raise RuntimeError("D53_SUBJECT_MASK_EMPTY")
    if editable_subject_pixels <= 0 or editable_outside_pixels <= 0:
        raise RuntimeError("D53_EDIT_MASK_MUST_CROSS_SUBJECT_BOUNDARY")
    editable_subject_ratio = editable_subject_pixels / float(subject_pixels)
    if editable_subject_ratio > MAX_EDITABLE_SUBJECT_RATIO:
        raise RuntimeError(
            f"D53_EDITABLE_SUBJECT_BUDGET_EXCEEDED:max={MAX_EDITABLE_SUBJECT_RATIO:.4f}:actual={editable_subject_ratio:.6f}"
        )

    identity_lock = ImageChops.subtract(prior_core, editable)
    identity_lock_subject = ImageChops.multiply(identity_lock, subject)
    identity_lock_pixels = d4.count_nonzero(identity_lock_subject)
    identity_lock_ratio = identity_lock_pixels / float(subject_pixels)
    if identity_lock_ratio < MIN_IDENTITY_LOCK_SUBJECT_RATIO:
        raise RuntimeError(
            f"D53_IDENTITY_LOCK_TOO_SMALL:min={MIN_IDENTITY_LOCK_SUBJECT_RATIO:.4f}:actual={identity_lock_ratio:.6f}"
        )
    if ImageChops.multiply(identity_lock, editable).getbbox() is not None:
        raise RuntimeError("D53_LOCK_EDITABLE_OVERLAP")

    editable.save(evidence / "embedding_editable_mask.png", format="PNG", optimize=False)
    editable_subject.save(evidence / "embedding_editable_subject_mask.png", format="PNG", optimize=False)
    critical.save(evidence / "critical_landmark_lock_mask.png", format="PNG", optimize=False)
    identity_lock.save(evidence / "identity_lock_mask.png", format="PNG", optimize=False)

    return {
        "subject_pixels": subject_pixels,
        "editable_total_pixels": d4.count_nonzero(editable),
        "editable_subject_pixels": editable_subject_pixels,
        "editable_outside_pixels": editable_outside_pixels,
        "editable_subject_ratio": round(editable_subject_ratio, 6),
        "max_editable_subject_ratio": MAX_EDITABLE_SUBJECT_RATIO,
        "identity_lock_subject_pixels": identity_lock_pixels,
        "identity_lock_subject_ratio": round(identity_lock_ratio, 6),
        "min_identity_lock_subject_ratio": MIN_IDENTITY_LOCK_SUBJECT_RATIO,
        "boundary_outer_px": BOUNDARY_OUTER_PX,
        "boundary_inner_px": BOUNDARY_INNER_PX,
        "mask_crosses_subject_boundary": True,
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
        raise RuntimeError("D53_EMBED_INPUT_DIMENSION_MISMATCH")
    rgba = base.convert("RGBA")
    rgba.putalpha(ImageChops.invert(editable))
    rgba.save(target, format="PNG", optimize=False)


def finalize_localized_embedding(base_path: Path, raw_candidate_path: Path, editable_mask_path: Path, wet_core_path: Path, identity_lock_path: Path, target: Path, evidence: Path) -> dict:
    with Image.open(base_path) as base_raw, Image.open(raw_candidate_path) as raw_raw, Image.open(editable_mask_path) as editable_raw, Image.open(wet_core_path) as wet_raw, Image.open(identity_lock_path) as lock_raw:
        base = base_raw.convert("RGB")
        raw = raw_raw.convert("RGB")
        editable = editable_raw.convert("L")
        wet = wet_raw.convert("RGB")
        lock = lock_raw.convert("L")
    if not (base.size == raw.size == editable.size == wet.size == lock.size):
        raise RuntimeError("D53_FINAL_DIMENSION_MISMATCH")

    localized = Image.composite(raw, base, editable)
    final = Image.composite(wet, localized, lock)
    final.save(target, format="PNG", optimize=False)

    outside = ImageChops.invert(editable)
    outside_diff = ImageChops.difference(final, base)
    outside_probe = Image.new("RGB", final.size, (0, 0, 0))
    outside_probe.paste(outside_diff, (0, 0), outside)
    if outside_probe.getbbox() is not None:
        raise RuntimeError("D53_OUTSIDE_EMBEDDING_CHANGED")

    lock_diff = ImageChops.difference(final, wet)
    lock_probe = Image.new("RGB", final.size, (0, 0, 0))
    lock_probe.paste(lock_diff, (0, 0), lock)
    if lock_probe.getbbox() is not None:
        raise RuntimeError("D53_IDENTITY_LOCK_REASSERTION_MISMATCH")

    actual = ImageChops.difference(final, base).convert("L").point(lambda value: 255 if value > 0 else 0)
    actual.save(evidence / "actual_delta_mask.png", format="PNG", optimize=False)
    return {
        "outside_embedding_exact": True,
        "identity_lock_exact_pixel_reassertion": True,
        "actual_changed_pixels": d4.count_nonzero(actual),
        "raw_sha256": d0.sha256_file(raw_candidate_path),
        "final_sha256": d0.sha256_file(target),
    }


def write_review(evidence: Path, recipe: dict, prompt_id: str) -> Path:
    review = evidence / "review.html"
    document = f"""<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>P5 QA01 Kontext D5.3 Review</title><style>body{{font-family:Arial,sans-serif;background:#11161b;color:#eee;margin:24px}}h1{{font-size:24px}}.grid{{display:grid;grid-template-columns:1fr 1fr;gap:18px}}.card{{background:#1b2229;padding:14px;border:1px solid #333;border-radius:10px;margin-bottom:18px}}img{{width:100%;height:auto;background:white}}pre{{white-space:pre-wrap;color:#d7d7d7}}.warn{{color:#ffcc80}}.fail{{color:#ff8a80}}.ok{{color:#9fe0b3}}</style></head><body>
<h1>P5 QA01 v2 — Kontext D5.3 Controlled Occlusion Integration</h1><p class="warn">EVALUATION ONLY / NON-PRODUCTION / QA01 DISABLED</p>
<p class="fail">D5.2 runtime and anti-replication guards passed, but human visual review failed: the exact wood remained visually pasted on top of the aquarium because environment generation was excluded from the wood and final exact-pixel reassertion suppressed meaningful ecological overlap.</p>
<p class="ok">D5.3 keeps the D5.2 anti-replication material board but changes the integration architecture: only bounded base/attachment zones may cross the subject boundary; critical SKU landmarks remain locked; changes outside the embedding mask are deterministically forbidden.</p>
<div class="grid"><div class="card"><h2>VERIFIED SC01 — exact identity</h2><img src="source_sc01.png"></div><div class="card"><h2>D5.3 final candidate</h2><img src="candidate.png"></div></div>
<div class="grid"><div class="card"><h2>D5.2 prior — visual FAIL: pasted-on integration</h2><img src="prior_d52_final.png"></div><div class="card"><h2>D5.3 raw controlled-occlusion pass</h2><img src="candidate_embedding_raw.png"></div></div>
<div class="grid"><div class="card"><h2>Embedding Editable Mask — only these zones may change</h2><img src="embedding_editable_mask.png"></div><div class="card"><h2>Identity Lock Mask — exact wet-core pixels retained</h2><img src="identity_lock_mask.png"></div></div>
<div class="grid"><div class="card"><h2>Critical Landmark Lock</h2><img src="critical_landmark_lock_mask.png"></div><div class="card"><h2>Actual Delta Mask</h2><img src="actual_delta_mask.png"></div></div>
<div class="grid"><div class="card"><h2>Original donor — AUDIT ONLY, never conditioned</h2><img src="scene_reference.png"></div><div class="card"><h2>D5.2 anti-replication material board — conditioning source</h2><img src="realism_material_board.png"></div></div>
<div class="grid"><div class="card"><h2>Reference Canvas — exact identity + destroyed material board</h2><img src="reference_canvas.png"></div><div class="card"><h2>D5.2 environment pass retained</h2><img src="prior_d52_environment.png"></div></div>
<div class="card"><h2>D5.3 Recipe</h2><pre>{html.escape(json.dumps(recipe, ensure_ascii=False, indent=2))}</pre></div>
<div class="card"><h2>Controlled Occlusion Prompt</h2><pre>{html.escape(EMBED_PROMPT)}</pre><p>prompt_id={html.escape(prompt_id)}</p></div></body></html>"""
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
            raise RuntimeError("QA01_MUST_REMAIN_DISABLED_DURING_KONTEXT_D53_EVAL")
        registry = d0.read_json(repo / "config" / "workflows" / "registry.json")
        qa01 = next((row for row in registry.get("workflows", []) if row.get("code") == "QA01"), None)
        if not qa01 or qa01.get("executable") is not False or qa01.get("workflow_status") != "NOT_REGISTERED":
            raise RuntimeError("QA01_REGISTRY_MUST_REMAIN_FAIL_CLOSED")

        prior = Path(args.prior_evidence_dir).resolve()
        validate_prior_evidence(prior, profile, args.sku)
        evidence = Path(profile["control_root"]) / "evidence" / ("P5_QA01_V2_KONTEXT_D53_" + datetime.now().strftime("%Y%m%d-%H%M%S"))
        evidence.mkdir(parents=True, exist_ok=False)
        copies = [
            ("source_sc01.png", "source_sc01.png"),
            ("eval_input_white.png", "eval_input_white.png"),
            ("candidate.png", "prior_d52_final.png"),
            ("wet_core.png", "wet_core.png"),
            ("protected_core.png", "prior_protected_core.png"),
            ("realism_material_board.png", "realism_material_board.png"),
            ("reference_canvas.png", "reference_canvas.png"),
            ("scene_reference.png", "scene_reference.png"),
            ("candidate_environment_anti_replication_raw.png", "prior_d52_environment.png"),
        ]
        for src_name, dst_name in copies:
            shutil.copy2(prior / src_name, evidence / dst_name)

        mask_metrics = build_embedding_masks(evidence / "source_sc01.png", evidence / "prior_protected_core.png", evidence)
        make_latent_mask_input(evidence / "prior_d52_final.png", evidence / "embedding_editable_mask.png", evidence / "embedding_input_latentmask.png")

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
            raise RuntimeError("D53_REQUIRED_NODES_MISSING:" + ",".join(missing))

        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        _, visible_reference = d2.copy_input(evidence / "reference_canvas.png", profile, f"p5_qa01_kontext_d53_reference_canvas_{args.sku}_{stamp}.png")
        _, visible_embed = d2.copy_input(evidence / "embedding_input_latentmask.png", profile, f"p5_qa01_kontext_d53_embedding_{args.sku}_{stamp}.png")
        workflow = d4.build_noise_mask_workflow(visible_reference, visible_embed, infos, prompt=EMBED_PROMPT, seed=EMBED_SEED, steps=EMBED_STEPS, guidance=EMBED_GUIDANCE, denoise=EMBED_DENOISE)
        prompt_id, raw_target = d51.run_stage_sanitized(evidence, "embedding", workflow)

        final_metrics = finalize_localized_embedding(
            evidence / "prior_d52_final.png",
            raw_target,
            evidence / "embedding_editable_mask.png",
            evidence / "wet_core.png",
            evidence / "identity_lock_mask.png",
            evidence / "candidate.png",
            evidence,
        )

        recipe = {
            "schema_version": "0.613-eval-d53",
            "site_id": args.site_id,
            "sku": args.sku,
            "realm": "QA01_AQUARIUM",
            "source_sc01_sha256": EXPECTED_SOURCE_SHA256,
            "prior_d52_final_sha256": EXPECTED_D52_FINAL_SHA256,
            "d52_visual_result": "FAIL_PHYSICAL_INTEGRATION_PASTED_ON",
            "architecture": "D5.2 anti-replication realism board + bounded cross-boundary controlled occlusion integration + critical-landmark identity lock",
            "anti_replication": {
                "donor_scene_direct_pixels_passed_to_comfy": False,
                "donor_macro_layout_destroyed_before_conditioning": True,
                "realism_board_reused_from_verified_d52_evidence": True,
                "donor_layout_copy_forbidden": True,
            },
            "integration_contract": {
                "mode": "controlled_occlusion_integration",
                "substrate_partial_burial_required": True,
                "load_bearing_stone_overlap_required": True,
                "sparse_epiphyte_silhouette_overlap_allowed": True,
                "whole_subject_repaint_forbidden": True,
                "critical_landmarks_locked": mask_metrics["critical_landmarks_locked"],
                "changes_outside_embedding_mask_forbidden": True,
            },
            "mask_metrics": mask_metrics,
            "embedding": {
                "runtime": "ReferenceLatent(material_board_canvas)+VAEEncode+SetLatentNoiseMask",
                "seed": EMBED_SEED,
                "steps": EMBED_STEPS,
                "guidance": EMBED_GUIDANCE,
                "denoise": EMBED_DENOISE,
                "sampler": "euler",
                "scheduler": "simple",
            },
            "production_mutation": "NONE",
            "final_metrics": final_metrics,
        }
        (evidence / "scene_recipe.json").write_text(json.dumps(recipe, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        (evidence / "prompt_embedding.txt").write_text(EMBED_PROMPT + "\n", encoding="utf-8")
        review = write_review(evidence, recipe, prompt_id)

        print("P5_QA01_V2_KONTEXT_D53_EVAL_GATE=PASS")
        print(f"git_head={head}")
        print(f"sku={args.sku}")
        print("d52_visual_result=FAIL_PHYSICAL_INTEGRATION_PASTED_ON")
        print("evaluation_only=True")
        print("production_authorized=False")
        print("qa01_enabled=False")
        print("architecture=CONTROLLED_OCCLUSION_INTEGRATION_WITH_CRITICAL_LANDMARK_LOCK")
        print("donor_scene_direct_pixels_passed_to_comfy=False")
        print("donor_macro_layout_destroyed_before_conditioning=True")
        print("whole_subject_repaint_forbidden=True")
        print("changes_outside_embedding_mask_forbidden=True")
        print(f"mask_crosses_subject_boundary={mask_metrics['mask_crosses_subject_boundary']}")
        print(f"editable_subject_ratio={mask_metrics['editable_subject_ratio']}")
        print(f"identity_lock_subject_ratio={mask_metrics['identity_lock_subject_ratio']}")
        print(f"comfy_started_by_gate={started_by_gate}")
        print(f"embedding_seed={EMBED_SEED}")
        print(f"embedding_steps={EMBED_STEPS}")
        print(f"embedding_guidance={EMBED_GUIDANCE}")
        print(f"embedding_denoise={EMBED_DENOISE}")
        print(f"outside_embedding_exact={final_metrics['outside_embedding_exact']}")
        print(f"identity_lock_exact_pixel_reassertion={final_metrics['identity_lock_exact_pixel_reassertion']}")
        print(f"candidate_sha256={final_metrics['final_sha256']}")
        print(f"review_file={review}")
        print(f"evidence_dir={evidence}")
        return 0
    except Exception as exc:
        print("P5_QA01_V2_KONTEXT_D53_EVAL_GATE=FAIL")
        print(f"error={exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
