from __future__ import annotations

import argparse
import html
import json
from datetime import datetime
from pathlib import Path
import shutil

from PIL import Image, ImageChops, ImageOps

import p5_qa01_kontext_d0_eval as d0
import p5_qa01_kontext_d2_eval as d2
import p5_qa01_kontext_d3_eval as d3
import p5_qa01_kontext_d4_eval as d4

PRIOR_D4_HEAD = "4d84a5f63b82322cb9c1b247fd19cb7f7cd126a4"
EXPECTED_SOURCE_SHA256 = "f31c77589ab71874655744f8f5dc92f2ece77fbf5b7b52f22e53476836a62399"
EXPECTED_D4_FINAL_SHA256 = "904acda038d220a35046776dc217ef0e84b3eac7fc3726872dfcb9ec465fb9d3"
EXPECTED_CONTACT_EDITABLE_PIXELS = 138108

ENV_SEED = 52073151
ENV_STEPS = 32
ENV_GUIDANCE = 2.8
ENV_DENOISE = 1.0
CONTACT_SEED = 52073152
CONTACT_STEPS = 18
CONTACT_GUIDANCE = 1.9
CONTACT_DENOISE = 0.56
ENV_KEEP_OUT_PX = 9
MULTI_REFERENCE_METHOD = "index_timestep_zero"
MIN_REFERENCE_PIXELS = 700_000

ENV_PROMPT = (
    "Use reference image 1 only as the exact sellable driftwood identity and reference image 2 only as a photographic-realism exemplar for a real mature freshwater aquarium. "
    "Do not copy the second image's driftwood, hardscape geometry, exact stone layout, fish positions, or plant placement. Build a new aquarium specifically around the exact driftwood from reference image 1. "
    "The product is a heavy stump with rightward branch flow and central negative space: keep the mass left-center, preserve open swim-through space through the central cavity and branch windows, and keep the long lower-right branch projecting into open water. "
    "The result must read as an actual installed aquarium photographed through front glass, not a catalog visualization, studio background, CGI diorama, or generic AI aquascape. "
    "Match the second reference only for real-camera evidence, material realism, water optics, biological density, scale, and natural imperfection: layered foreground/midground/background planting with varied leaf size and depth-of-field, subtle front-glass reflections, mild water-column attenuation, tiny suspended particulate only if natural, restrained surface-light falloff, and coherent underwater white balance. "
    "Create uneven fine natural substrate with visible grain, micro-topography, slight lived-in variation and partly obscured transitions. Use one asymmetrical load-bearing stone system with irregular weathered dark-gray or basalt-like stones of varied scale, faceted surfaces, partial burial, overlap and believable weight transfer under/behind the lower wood mass. Never arrange isolated smooth decorative pebbles. "
    "Use restrained Bucephalandra, Anubias nana petite, small Java fern and limited moss only in physically plausible sheltered pockets; use finer stems and softer planting deeper in the rear. A small restrained shoal of tiny fish may appear in open water only for scale, never as the subject. "
    "Keep the exact driftwood dominant and product-readable. Avoid smooth teal gradients, flat beige floors, sterile sand, perfect symmetry, pedestal staging, extra driftwood, fantasy CGI, oversaturation, dramatic god rays, fake bokeh, text, logos and watermarks."
)

CONTACT_PROMPT = (
    "Refine only the local physical contact between the already established real-looking aquarium and the same exact driftwood. "
    "Do not redesign the aquarium and do not alter any major wood silhouette, branch, crown, cavity, hole, orientation or proportion. "
    "At the local lower contact and anchor zones only, let fine substrate naturally lap against the lowest wood edges, make support stones look load-bearing and partly buried, add narrow coherent contact shadows, tiny plausible epiphyte attachment pockets and subtle wet seam integration. "
    "Preserve all photographic realism, water depth, glass cues, planting hierarchy, stone system and lighting created in the environment pass. "
    "Avoid new large plants, extra stones, extra wood, blanket moss, isolated pebbles, dramatic lighting, CGI effects, text, logos and watermarks."
)


def ensure_under(child: Path, parent: Path) -> None:
    child_r = child.resolve()
    parent_r = parent.resolve()
    try:
        child_r.relative_to(parent_r)
    except ValueError as exc:
        raise RuntimeError(f"D5_PRIOR_EVIDENCE_OUTSIDE_CONTROL_ROOT:{child_r}") from exc


def validate_prior_evidence(prior: Path, profile: dict, sku: str) -> dict:
    evidence_root = Path(profile["control_root"]) / "evidence"
    ensure_under(prior, evidence_root)
    if not prior.name.startswith("P5_QA01_V2_KONTEXT_D4_"):
        raise RuntimeError(f"D5_PRIOR_EVIDENCE_NAME_INVALID:{prior.name}")
    required = ["source_sc01.png", "eval_input_white.png", "candidate.png", "contact_editable_mask.png", "protected_core.png", "scene_recipe.json"]
    missing = [name for name in required if not (prior / name).is_file()]
    if missing:
        raise RuntimeError("D5_PRIOR_EVIDENCE_MISSING:" + ",".join(missing))
    recipe = d0.read_json(prior / "scene_recipe.json")
    if recipe.get("schema_version") != "0.5-eval-d4":
        raise RuntimeError("D5_PRIOR_RECIPE_SCHEMA_MISMATCH")
    if recipe.get("sku") != sku:
        raise RuntimeError("D5_PRIOR_RECIPE_SKU_MISMATCH")
    if recipe.get("source_sc01_sha256") != EXPECTED_SOURCE_SHA256:
        raise RuntimeError("D5_PRIOR_RECIPE_SOURCE_SHA_MISMATCH")
    if (recipe.get("final_metrics") or {}).get("final_candidate_sha256") != EXPECTED_D4_FINAL_SHA256:
        raise RuntimeError("D5_PRIOR_RECIPE_FINAL_SHA_MISMATCH")
    if d0.sha256_file(prior / "source_sc01.png") != EXPECTED_SOURCE_SHA256:
        raise RuntimeError("D5_PRIOR_SOURCE_BYTES_MISMATCH")
    if d0.sha256_file(prior / "candidate.png") != EXPECTED_D4_FINAL_SHA256:
        raise RuntimeError("D5_PRIOR_FINAL_BYTES_MISMATCH")
    with Image.open(prior / "contact_editable_mask.png") as mask_raw:
        editable = mask_raw.convert("L")
    editable_pixels = d4.count_nonzero(editable)
    if editable_pixels != EXPECTED_CONTACT_EDITABLE_PIXELS:
        raise RuntimeError(f"D5_PRIOR_CONTACT_MASK_MISMATCH:expected={EXPECTED_CONTACT_EDITABLE_PIXELS}:actual={editable_pixels}")
    return recipe


def normalize_scene_reference(source: Path, evidence: Path) -> dict:
    if not source.is_file():
        raise RuntimeError(f"D5_SCENE_REFERENCE_NOT_FOUND:{source}")
    original_sha = d0.sha256_file(source)
    try:
        with Image.open(source) as raw:
            image = ImageOps.exif_transpose(raw).convert("RGB")
    except Exception as exc:
        raise RuntimeError(f"D5_SCENE_REFERENCE_UNREADABLE:{source}") from exc
    width, height = image.size
    if width * height < MIN_REFERENCE_PIXELS or min(width, height) < 600:
        raise RuntimeError(f"D5_SCENE_REFERENCE_TOO_SMALL:{width}x{height}")
    aspect = width / height
    if aspect < 0.65 or aspect > 2.4:
        raise RuntimeError(f"D5_SCENE_REFERENCE_ASPECT_UNSUPPORTED:{aspect:.4f}")
    normalized = evidence / "scene_reference.png"
    image.save(normalized, format="PNG", optimize=False)
    return {
        "original_path": str(source.resolve()),
        "original_sha256": original_sha,
        "normalized_sha256": d0.sha256_file(normalized),
        "width": width,
        "height": height,
        "aspect_ratio": round(aspect, 6),
        "role": "photographic_realism_and_environment_material_reference_only",
    }


def build_environment_input(prior_final: Path, source_sc01: Path, evidence: Path) -> dict:
    with Image.open(prior_final) as base_raw, Image.open(source_sc01) as source_raw:
        base = base_raw.convert("RGB")
        source = source_raw.convert("RGBA")
    if base.size != source.size:
        raise RuntimeError("D5_PRIOR_SOURCE_DIMENSION_MISMATCH")
    subject = d2.binary_subject_mask(source.getchannel("A"))
    keepout = d4.dilate(subject, ENV_KEEP_OUT_PX)
    editable = ImageChops.invert(keepout)
    editable.save(evidence / "environment_editable_mask.png", format="PNG", optimize=False)
    keepout.save(evidence / "environment_keepout_mask.png", format="PNG", optimize=False)
    rgba = base.convert("RGBA")
    rgba.putalpha(ImageChops.invert(editable))
    rgba.save(evidence / "environment_input_latentmask.png", format="PNG", optimize=False)
    return {"environment_editable_pixels": d4.count_nonzero(editable), "environment_keepout_px": ENV_KEEP_OUT_PX, "subject_pixels": d4.count_nonzero(subject)}


def build_multi_reference_environment_workflow(product_reference: str, scene_reference: str, image_input: str, infos: dict) -> dict:
    dual_inputs = {"clip_name1": d0.MODELS["clip_l"]["name"], "clip_name2": d0.MODELS["t5_fp8"]["name"], "type": "flux"}
    device_options = d0.combo_options(infos["DualCLIPLoader"], "optional", "device")
    if "cpu" in [value.lower() for value in device_options]:
        dual_inputs["device"] = "cpu"
    return {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": d0.MODELS["kontext"]["name"], "weight_dtype": "default"}},
        "2": {"class_type": "DualCLIPLoader", "inputs": dual_inputs},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": d0.MODELS["vae"]["name"]}},
        "4": {"class_type": "LoadImage", "inputs": {"image": product_reference}},
        "5": {"class_type": "FluxKontextImageScale", "inputs": {"image": ["4", 0]}},
        "6": {"class_type": "VAEEncode", "inputs": {"pixels": ["5", 0], "vae": ["3", 0]}},
        "17": {"class_type": "LoadImage", "inputs": {"image": scene_reference}},
        "18": {"class_type": "FluxKontextImageScale", "inputs": {"image": ["17", 0]}},
        "19": {"class_type": "VAEEncode", "inputs": {"pixels": ["18", 0], "vae": ["3", 0]}},
        "7": {"class_type": "CLIPTextEncode", "inputs": {"text": ENV_PROMPT, "clip": ["2", 0]}},
        "8": {"class_type": "ReferenceLatent", "inputs": {"conditioning": ["7", 0], "latent": ["6", 0]}},
        "20": {"class_type": "ReferenceLatent", "inputs": {"conditioning": ["8", 0], "latent": ["19", 0]}},
        "21": {"class_type": "FluxKontextMultiReferenceLatentMethod", "inputs": {"conditioning": ["20", 0], "reference_latents_method": MULTI_REFERENCE_METHOD}},
        "9": {"class_type": "FluxGuidance", "inputs": {"conditioning": ["21", 0], "guidance": ENV_GUIDANCE}},
        "10": {"class_type": "ConditioningZeroOut", "inputs": {"conditioning": ["7", 0]}},
        "14": {"class_type": "LoadImage", "inputs": {"image": image_input}},
        "15": {"class_type": "VAEEncode", "inputs": {"pixels": ["14", 0], "vae": ["3", 0]}},
        "16": {"class_type": "SetLatentNoiseMask", "inputs": {"samples": ["15", 0], "mask": ["14", 1]}},
        "11": {"class_type": "KSampler", "inputs": {"seed": ENV_SEED, "steps": ENV_STEPS, "cfg": 1.0, "sampler_name": "euler", "scheduler": "simple", "denoise": ENV_DENOISE, "model": ["1", 0], "positive": ["9", 0], "negative": ["10", 0], "latent_image": ["16", 0]}},
        "12": {"class_type": "VAEDecode", "inputs": {"samples": ["11", 0], "vae": ["3", 0]}},
        "13": {"class_type": "PreviewImage", "inputs": {"images": ["12", 0]}},
    }


def write_review(evidence: Path, recipe: dict, env_prompt_id: str, contact_prompt_id: str) -> Path:
    review = evidence / "review.html"
    document = f"""<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>P5 QA01 Kontext D5 Review</title><style>body{{font-family:Arial,sans-serif;background:#11161b;color:#eee;margin:24px}}h1{{font-size:24px}}.grid{{display:grid;grid-template-columns:1fr 1fr;gap:18px}}.card{{background:#1b2229;padding:14px;border:1px solid #333;border-radius:10px;margin-bottom:18px}}img{{width:100%;height:auto;background:white}}pre{{white-space:pre-wrap;color:#d7d7d7}}.warn{{color:#ffcc80}}</style></head><body>
<h1>P5 QA01 v2 — Kontext D5 Real-Reference Guided Aquarium</h1><p class="warn">EVALUATION ONLY / NON-PRODUCTION / QA01 DISABLED</p>
<p>D4 preserved Exact Piece identity but still read as a synthetic generated aquarium. D5 adds a user-approved real-use aquarium image only as a second photographic-realism reference while keeping the sellable driftwood as reference 1 and geometry-locked.</p>
<div class="grid"><div class="card"><h2>VERIFIED SC01 — identity reference 1</h2><img src="source_sc01.png"></div><div class="card"><h2>D5 final candidate</h2><img src="candidate.png"></div></div>
<div class="grid"><div class="card"><h2>User-approved scene reference 2 — realism only</h2><img src="scene_reference.png"></div><div class="card"><h2>D5 multi-reference environment pass</h2><img src="candidate_environment_multi_ref.png"></div></div>
<div class="grid"><div class="card"><h2>Prior D4 final</h2><img src="prior_d4_final.png"></div><div class="card"><h2>D5 wet-core composite before contact</h2><img src="candidate_pre_contact.png"></div></div>
<div class="grid"><div class="card"><h2>D5 raw contact refinement</h2><img src="candidate_contact.png"></div><div class="card"><h2>Wet core preview — same SC01 geometry</h2><img src="wet_core_preview.png"></div></div>
<div class="grid"><div class="card"><h2>Environment Editable Mask</h2><img src="environment_editable_mask.png"></div><div class="card"><h2>Contact Editable Mask</h2><img src="contact_editable_mask.png"></div></div>
<div class="card"><h2>D5 Recipe</h2><pre>{html.escape(json.dumps(recipe, ensure_ascii=False, indent=2))}</pre></div>
<div class="card"><h2>Environment Prompt</h2><pre>{html.escape(ENV_PROMPT)}</pre><p>prompt_id={html.escape(env_prompt_id)}</p></div>
<div class="card"><h2>Contact Prompt</h2><pre>{html.escape(CONTACT_PROMPT)}</pre><p>prompt_id={html.escape(contact_prompt_id)}</p></div></body></html>"""
    review.write_text(document, encoding="utf-8")
    return review


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", required=True)
    parser.add_argument("--site-id", default="drift-curio")
    parser.add_argument("--sku", default="DC-ZY-SZ-31001")
    parser.add_argument("--prior-evidence-dir", required=True)
    parser.add_argument("--scene-reference-path", required=True)
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
            raise RuntimeError("QA01_MUST_REMAIN_DISABLED_DURING_KONTEXT_D5_EVAL")
        registry = d0.read_json(repo / "config" / "workflows" / "registry.json")
        qa01 = next((row for row in registry.get("workflows", []) if row.get("code") == "QA01"), None)
        if not qa01 or qa01.get("executable") is not False or qa01.get("workflow_status") != "NOT_REGISTERED":
            raise RuntimeError("QA01_REGISTRY_MUST_REMAIN_FAIL_CLOSED")

        prior = Path(args.prior_evidence_dir).resolve()
        validate_prior_evidence(prior, profile, args.sku)
        scene_source = Path(args.scene_reference_path).expanduser().resolve()
        evidence = Path(profile["control_root"]) / "evidence" / ("P5_QA01_V2_KONTEXT_D5_" + datetime.now().strftime("%Y%m%d-%H%M%S"))
        evidence.mkdir(parents=True, exist_ok=False)
        for src_name, dst_name in [("source_sc01.png", "source_sc01.png"), ("eval_input_white.png", "eval_input_white.png"), ("candidate.png", "prior_d4_final.png"), ("contact_editable_mask.png", "contact_editable_mask.png"), ("protected_core.png", "protected_core.png")]:
            shutil.copy2(prior / src_name, evidence / dst_name)
        scene_metrics = normalize_scene_reference(scene_source, evidence)
        mask_metrics = build_environment_input(evidence / "prior_d4_final.png", evidence / "source_sc01.png", evidence)

        for label, spec in d0.MODELS.items():
            d0.exact_model_identity(label, spec)
        _, started_by_gate = d0.wait_ready(evidence)
        required_nodes = ["UNETLoader", "DualCLIPLoader", "VAELoader", "LoadImage", "FluxKontextImageScale", "VAEEncode", "SetLatentNoiseMask", "CLIPTextEncode", "ReferenceLatent", "FluxKontextMultiReferenceLatentMethod", "FluxGuidance", "ConditioningZeroOut", "KSampler", "VAEDecode", "PreviewImage"]
        infos: dict[str, dict] = {}
        missing: list[str] = []
        for name in required_nodes:
            info = d0.node_info(name)
            if info is None:
                missing.append(name)
            else:
                infos[name] = info
        if missing:
            raise RuntimeError("D5_REQUIRED_NODES_MISSING:" + ",".join(missing))
        methods = d0.combo_options(infos["FluxKontextMultiReferenceLatentMethod"], "required", "reference_latents_method")
        if MULTI_REFERENCE_METHOD not in methods:
            raise RuntimeError("D5_MULTI_REFERENCE_METHOD_UNAVAILABLE:" + ",".join(methods))

        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        _, visible_product_ref = d2.copy_input(evidence / "eval_input_white.png", profile, f"p5_qa01_kontext_d5_product_ref_{args.sku}_{stamp}.png")
        _, visible_scene_ref = d2.copy_input(evidence / "scene_reference.png", profile, f"p5_qa01_kontext_d5_scene_ref_{args.sku}_{stamp}.png")
        _, visible_env = d2.copy_input(evidence / "environment_input_latentmask.png", profile, f"p5_qa01_kontext_d5_env_{args.sku}_{stamp}.png")
        env_workflow = build_multi_reference_environment_workflow(visible_product_ref, visible_scene_ref, visible_env, infos)
        env_prompt_id, env_target = d3.run_stage(evidence, "environment_multi_ref", env_workflow)

        wet_metrics = d4.make_photometric_wet_core(evidence / "source_sc01.png", env_target, evidence)
        contact_input = evidence / "contact_input_latentmask.png"
        d4.make_masked_input(evidence / "candidate_pre_contact.png", evidence / "contact_editable_mask.png", contact_input)
        _, visible_contact = d2.copy_input(contact_input, profile, f"p5_qa01_kontext_d5_contact_{args.sku}_{stamp}.png")
        contact_workflow = d4.build_noise_mask_workflow(visible_product_ref, visible_contact, infos, prompt=CONTACT_PROMPT, seed=CONTACT_SEED, steps=CONTACT_STEPS, guidance=CONTACT_GUIDANCE, denoise=CONTACT_DENOISE)
        contact_prompt_id, contact_target = d3.run_stage(evidence, "contact", contact_workflow)

        final_candidate = evidence / "candidate.png"
        final_metrics = d4.reassert_photometric_core(evidence / "wet_core.png", contact_target, evidence / "protected_core.png", final_candidate)
        with Image.open(final_candidate) as final_raw, Image.open(evidence / "source_sc01.png") as source_raw:
            if final_raw.size != source_raw.size:
                raise RuntimeError("D5_FINAL_DIMENSION_MISMATCH")

        recipe = {
            "schema_version": "0.6-eval-d5", "site_id": args.site_id, "sku": args.sku, "realm": "QA01_AQUARIUM",
            "prior_d4_head": PRIOR_D4_HEAD, "prior_d4_evidence": str(prior), "prior_d4_visual_result": "IDENTITY_PASS_BUT_REAL_USE_SCENE_REALISM_BELOW_REFERENCE_BAR",
            "source_sc01_sha256": EXPECTED_SOURCE_SHA256, "prior_d4_final_sha256": EXPECTED_D4_FINAL_SHA256,
            "architecture": "two-reference Kontext environment generation + geometry-locked wet photometry + bounded contact repair",
            "scene_archetype": "Heavy Stump + Rightward Branch Flow + Central Negative Space",
            "scene_reference": scene_metrics,
            "multi_reference": {"method": MULTI_REFERENCE_METHOD, "reference_1": "exact_sellable_driftwood_identity", "reference_2": "photographic_realism_exemplar_only_no_layout_copy"},
            "mask_metrics": mask_metrics,
            "environment": {"runtime": "MULTI_REFERENCE_KONTEXT_PLUS_SetLatentNoiseMask", "seed": ENV_SEED, "steps": ENV_STEPS, "guidance": ENV_GUIDANCE, "denoise": ENV_DENOISE, "sampler": "euler", "scheduler": "simple", "purpose": "replace generic generated environment with reference-grounded real-use aquarium photography while preserving exact wood keepout"},
            "photometric_wet_core": wet_metrics,
            "contact": {"runtime": "VAEEncode_PLUS_SetLatentNoiseMask", "seed": CONTACT_SEED, "steps": CONTACT_STEPS, "guidance": CONTACT_GUIDANCE, "denoise": CONTACT_DENOISE, "sampler": "euler", "scheduler": "simple", "editable_pixels": EXPECTED_CONTACT_EDITABLE_PIXELS, "purpose": "bounded local physical integration only"},
            "production_mutation": "NONE",
            "final_metrics": {"wet_core_alpha_geometry_exact": wet_metrics["wet_core_alpha_geometry_exact"], "photometric_core_exact_pixel_reassertion": final_metrics["photometric_core_exact_pixel_reassertion"], "environment_raw_sha256": d0.sha256_file(env_target), "contact_raw_sha256": final_metrics["raw_sha256"], "final_candidate_sha256": final_metrics["final_sha256"]},
        }
        (evidence / "scene_recipe.json").write_text(json.dumps(recipe, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        (evidence / "prompt_environment.txt").write_text(ENV_PROMPT + "\n", encoding="utf-8")
        (evidence / "prompt_contact.txt").write_text(CONTACT_PROMPT + "\n", encoding="utf-8")
        review = write_review(evidence, recipe, env_prompt_id, contact_prompt_id)

        print("P5_QA01_V2_KONTEXT_D5_EVAL_GATE=PASS")
        print(f"git_head={head}")
        print(f"sku={args.sku}")
        print("d4_identity_result=PASS")
        print("d4_scene_realism_result=FAIL")
        print("evaluation_only=True")
        print("production_authorized=False")
        print("qa01_enabled=False")
        print("architecture=MULTI_REFERENCE_REALISM_PLUS_GEOMETRY_LOCKED_CORE_PLUS_CONTACT_MASK")
        print(f"multi_reference_method={MULTI_REFERENCE_METHOD}")
        print(f"scene_reference_original_sha256={scene_metrics['original_sha256']}")
        print(f"scene_reference_normalized_sha256={scene_metrics['normalized_sha256']}")
        print("scene_reference_role=PHOTOGRAPHIC_REALISM_ONLY_NO_LAYOUT_COPY")
        print("wet_core_alpha_geometry_exact=True")
        print("photometric_core_exact_pixel_reassertion=True")
        print(f"comfy_started_by_gate={started_by_gate}")
        print(f"environment_seed={ENV_SEED}")
        print(f"environment_steps={ENV_STEPS}")
        print(f"environment_guidance={ENV_GUIDANCE}")
        print(f"environment_denoise={ENV_DENOISE}")
        print(f"contact_seed={CONTACT_SEED}")
        print(f"contact_steps={CONTACT_STEPS}")
        print(f"contact_guidance={CONTACT_GUIDANCE}")
        print(f"contact_denoise={CONTACT_DENOISE}")
        print(f"environment_prompt_id={env_prompt_id}")
        print(f"contact_prompt_id={contact_prompt_id}")
        print(f"source_sc01_sha256={EXPECTED_SOURCE_SHA256}")
        print(f"prior_d4_final_sha256={EXPECTED_D4_FINAL_SHA256}")
        print(f"environment_raw_sha256={d0.sha256_file(env_target)}")
        print(f"candidate_sha256={final_metrics['final_sha256']}")
        print(f"review_file={review}")
        print(f"evidence_dir={evidence}")
        return 0
    except Exception as exc:
        print("P5_QA01_V2_KONTEXT_D5_EVAL_GATE=FAIL")
        print(f"error={exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
