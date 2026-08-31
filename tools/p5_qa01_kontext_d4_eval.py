from __future__ import annotations

import argparse
import html
import json
from datetime import datetime
from pathlib import Path
import shutil

from PIL import Image, ImageChops, ImageFilter, ImageStat

import p5_qa01_kontext_d0_eval as d0
import p5_qa01_kontext_d2_eval as d2
import p5_qa01_kontext_d3_eval as d3

PRIOR_D31_HEAD = "8ad38c80f5a24c2911984266a9e6b5007a03a728"
EXPECTED_SOURCE_SHA256 = "f31c77589ab71874655744f8f5dc92f2ece77fbf5b7b52f22e53476836a62399"
EXPECTED_D31_FINAL_SHA256 = "1955e5ac8d7ba7c3623509f3da13636a55bc0718549115b0c90089cab99109f4"
EXPECTED_EDITABLE_PIXELS = 138108

ENV_SEED = 52073141
ENV_STEPS = 30
ENV_GUIDANCE = 2.6
ENV_DENOISE = 0.90
CONTACT_SEED = 52073142
CONTACT_STEPS = 18
CONTACT_GUIDANCE = 1.9
CONTACT_DENOISE = 0.58
ENV_KEEP_OUT_PX = 7
WET_BRIGHTNESS_BASE = 0.76
WET_BRIGHTNESS_HIGHLIGHT = 0.08
WET_SATURATION = 1.08
WET_AMBIENT_BASE = 0.05
WET_AMBIENT_SHADOW = 0.08

ENV_PROMPT = (
    "Rebuild only the aquarium environment around the exact photographed driftwood while the wood itself remains a fixed protected object. "
    "The scene must look like a mature real freshwater planted aquarium photographed through clean front glass, not an AI product backdrop. "
    "This exact piece is a heavy stump with rightward branch flow and central negative space: keep visual mass left-center, preserve open water through the central cavity and branch windows, and let the long lower-right branch project into open water. "
    "Replace generic studio-like surroundings with layered real aquarium depth: irregular dark olive and neutral-green background plants with different leaf sizes and focus planes; subtle front-glass reflection; mild water-column haze and attenuation; realistic fine natural sand with uneven micro-terrain, grain variation and slight lived-in imperfection. "
    "Use one coherent asymmetric load-bearing stone cluster under and behind the lower wood mass. Stones should be irregular weathered dark-gray river or basalt forms with varied scale, faceted surfaces, partial burial and overlapping contact, never evenly spaced smooth decorative round pebbles. "
    "Plant restrained Bucephalandra, Anubias nana petite and small Java fern around the base and sheltered negative-space edges, with a few finer stems in the rear; keep the wood dominant and readable. "
    "Lighting should be restrained neutral aquarium lighting with believable underwater falloff, soft occlusion and natural photographic contrast. "
    "Avoid smooth teal gradients, flat beige floors, isolated round pebbles, pedestal staging, perfect sterile sand, fantasy CGI, oversaturation, dramatic rays, fake bokeh, floating hardscape, extra driftwood, text, logos and watermarks."
)

CONTACT_PROMPT = (
    "Refine only local physical integration between the already established aquarium and the same exact driftwood. "
    "Do not redesign the composition and do not change any major wood silhouette, branch, crown, cavity, hole, orientation or proportion. "
    "At the editable lower contact and anchor zones only, make sand naturally lap against the lowest wood edges, make support stones visibly load-bearing and partly buried, add restrained contact shadows and tiny plausible epiphyte attachment pockets, and remove any pasted-on seam. "
    "Preserve the established background planting, water depth, glass cues, stone cluster, sand terrain and overall lighting. "
    "Keep the wet darkened wood appearance coherent with the water. Avoid new large plants, extra stones, extra wood, blanket moss, isolated pebbles, dramatic lighting, CGI effects, text, logos and watermarks."
)


def ensure_under(child: Path, parent: Path) -> None:
    child_r = child.resolve()
    parent_r = parent.resolve()
    try:
        child_r.relative_to(parent_r)
    except ValueError as exc:
        raise RuntimeError(f"D4_PRIOR_EVIDENCE_OUTSIDE_CONTROL_ROOT:{child_r}") from exc


def flat_values(image: Image.Image):
    getter = getattr(image, "get_flattened_data", None)
    return getter() if callable(getter) else image.getdata()


def count_nonzero(mask: Image.Image) -> int:
    return sum(1 for value in flat_values(mask) if value > 0)


def dilate(mask: Image.Image, radius: int) -> Image.Image:
    if radius <= 0:
        return mask.copy()
    return mask.filter(ImageFilter.MaxFilter(size=radius * 2 + 1))


def validate_prior_evidence(prior: Path, profile: dict, sku: str) -> dict:
    evidence_root = Path(profile["control_root"]) / "evidence"
    ensure_under(prior, evidence_root)
    if not prior.name.startswith("P5_QA01_V2_KONTEXT_D31_"):
        raise RuntimeError(f"D4_PRIOR_EVIDENCE_NAME_INVALID:{prior.name}")
    required = ["source_sc01.png", "eval_input_white.png", "candidate.png", "candidate_stage1.png", "stage2_editable_mask.png", "protected_core.png", "scene_recipe.json"]
    missing = [name for name in required if not (prior / name).is_file()]
    if missing:
        raise RuntimeError("D4_PRIOR_EVIDENCE_MISSING:" + ",".join(missing))
    recipe = d0.read_json(prior / "scene_recipe.json")
    if recipe.get("schema_version") != "0.4.1-eval-d31":
        raise RuntimeError("D4_PRIOR_RECIPE_SCHEMA_MISMATCH")
    if recipe.get("sku") != sku:
        raise RuntimeError("D4_PRIOR_RECIPE_SKU_MISMATCH")
    if recipe.get("source_sc01_sha256") != EXPECTED_SOURCE_SHA256:
        raise RuntimeError("D4_PRIOR_RECIPE_SOURCE_SHA_MISMATCH")
    if (recipe.get("final_metrics") or {}).get("final_candidate_sha256") != EXPECTED_D31_FINAL_SHA256:
        raise RuntimeError("D4_PRIOR_RECIPE_FINAL_SHA_MISMATCH")
    if d0.sha256_file(prior / "source_sc01.png") != EXPECTED_SOURCE_SHA256:
        raise RuntimeError("D4_PRIOR_SOURCE_BYTES_MISMATCH")
    if d0.sha256_file(prior / "candidate.png") != EXPECTED_D31_FINAL_SHA256:
        raise RuntimeError("D4_PRIOR_FINAL_BYTES_MISMATCH")
    with Image.open(prior / "candidate.png") as final_raw, Image.open(prior / "stage2_editable_mask.png") as mask_raw:
        final = final_raw.convert("RGB")
        editable = mask_raw.convert("L")
    if final.size != editable.size:
        raise RuntimeError("D4_PRIOR_EDITABLE_MASK_DIMENSION_MISMATCH")
    editable_pixels = count_nonzero(editable)
    if editable_pixels != EXPECTED_EDITABLE_PIXELS:
        raise RuntimeError(f"D4_PRIOR_EDITABLE_PIXEL_COUNT_MISMATCH:expected={EXPECTED_EDITABLE_PIXELS}:actual={editable_pixels}")
    return recipe


def build_environment_input(prior_final: Path, source_sc01: Path, evidence: Path) -> dict:
    with Image.open(prior_final) as base_raw, Image.open(source_sc01) as source_raw:
        base = base_raw.convert("RGB")
        source = source_raw.convert("RGBA")
    if base.size != source.size:
        raise RuntimeError("D4_PRIOR_SOURCE_DIMENSION_MISMATCH")
    subject = d2.binary_subject_mask(source.getchannel("A"))
    keepout = dilate(subject, ENV_KEEP_OUT_PX)
    editable = ImageChops.invert(keepout)
    editable.save(evidence / "environment_editable_mask.png", format="PNG", optimize=False)
    keepout.save(evidence / "environment_keepout_mask.png", format="PNG", optimize=False)
    rgba = base.convert("RGBA")
    rgba.putalpha(ImageChops.invert(editable))
    rgba.save(evidence / "environment_input_latentmask.png", format="PNG", optimize=False)
    return {"environment_editable_pixels": count_nonzero(editable), "environment_keepout_px": ENV_KEEP_OUT_PX, "subject_pixels": count_nonzero(subject)}


def build_noise_mask_workflow(reference_input: str, image_input: str, infos: dict, *, prompt: str, seed: int, steps: int, guidance: float, denoise: float) -> dict:
    dual_inputs = {"clip_name1": d0.MODELS["clip_l"]["name"], "clip_name2": d0.MODELS["t5_fp8"]["name"], "type": "flux"}
    device_options = d0.combo_options(infos["DualCLIPLoader"], "optional", "device")
    if "cpu" in [value.lower() for value in device_options]:
        dual_inputs["device"] = "cpu"
    return {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": d0.MODELS["kontext"]["name"], "weight_dtype": "default"}},
        "2": {"class_type": "DualCLIPLoader", "inputs": dual_inputs},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": d0.MODELS["vae"]["name"]}},
        "4": {"class_type": "LoadImage", "inputs": {"image": reference_input}},
        "5": {"class_type": "FluxKontextImageScale", "inputs": {"image": ["4", 0]}},
        "6": {"class_type": "VAEEncode", "inputs": {"pixels": ["5", 0], "vae": ["3", 0]}},
        "7": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt, "clip": ["2", 0]}},
        "8": {"class_type": "ReferenceLatent", "inputs": {"conditioning": ["7", 0], "latent": ["6", 0]}},
        "9": {"class_type": "FluxGuidance", "inputs": {"conditioning": ["8", 0], "guidance": guidance}},
        "10": {"class_type": "ConditioningZeroOut", "inputs": {"conditioning": ["7", 0]}},
        "14": {"class_type": "LoadImage", "inputs": {"image": image_input}},
        "15": {"class_type": "VAEEncode", "inputs": {"pixels": ["14", 0], "vae": ["3", 0]}},
        "16": {"class_type": "SetLatentNoiseMask", "inputs": {"samples": ["15", 0], "mask": ["14", 1]}},
        "11": {"class_type": "KSampler", "inputs": {"seed": seed, "steps": steps, "cfg": 1.0, "sampler_name": "euler", "scheduler": "simple", "denoise": denoise, "model": ["1", 0], "positive": ["9", 0], "negative": ["10", 0], "latent_image": ["16", 0]}},
        "12": {"class_type": "VAEDecode", "inputs": {"samples": ["11", 0], "vae": ["3", 0]}},
        "13": {"class_type": "PreviewImage", "inputs": {"images": ["12", 0]}},
    }


def ambient_ring_color(environment: Image.Image, subject_mask: Image.Image) -> tuple[float, float, float]:
    ring = ImageChops.subtract(dilate(subject_mask, 28), dilate(subject_mask, 8))
    mean = ImageStat.Stat(environment, mask=ring).mean[:3]
    if not mean or sum(mean) <= 0:
        return (45.0, 58.0, 53.0)
    return (float(mean[0]), float(mean[1]), float(mean[2]))


def make_photometric_wet_core(source_sc01: Path, environment_raw: Path, evidence: Path) -> dict:
    with Image.open(source_sc01) as source_raw, Image.open(environment_raw) as env_raw:
        source = source_raw.convert("RGBA")
        environment = env_raw.convert("RGB")
    if source.size != environment.size:
        raise RuntimeError("D4_WET_CORE_DIMENSION_MISMATCH")
    alpha = source.getchannel("A")
    subject = d2.binary_subject_mask(alpha)
    ambient = ambient_ring_color(environment, subject)
    src = source.load()
    wet = Image.new("RGBA", source.size, (0, 0, 0, 0))
    dst = wet.load()
    for y in range(source.height):
        for x in range(source.width):
            r, g, b, a = src[x, y]
            if a <= 0:
                continue
            luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255.0
            shadow = 1.0 - luma
            brightness = WET_BRIGHTNESS_BASE + WET_BRIGHTNESS_HIGHLIGHT * luma
            mix = WET_AMBIENT_BASE + WET_AMBIENT_SHADOW * shadow
            rr = r * brightness * (1.0 - mix) + ambient[0] * mix
            gg = g * brightness * (1.0 - mix) + ambient[1] * mix
            bb = b * brightness * (1.0 - mix) + ambient[2] * mix
            gray = 0.2126 * rr + 0.7152 * gg + 0.0722 * bb
            rr = gray + (rr - gray) * WET_SATURATION
            gg = gray + (gg - gray) * WET_SATURATION
            bb = gray + (bb - gray) * WET_SATURATION
            spec = max(0.0, luma - 0.62) * 12.0
            dst[x, y] = (int(max(0, min(255, round(rr + spec)))), int(max(0, min(255, round(gg + spec)))), int(max(0, min(255, round(bb + spec)))), a)
    if ImageChops.difference(alpha, wet.getchannel("A")).getbbox() is not None:
        raise RuntimeError("D4_WET_CORE_ALPHA_GEOMETRY_DRIFT")
    wet_path = evidence / "wet_core.png"
    wet.save(wet_path, format="PNG", optimize=False)
    preview = Image.new("RGB", source.size, (26, 31, 34)).convert("RGBA")
    preview.alpha_composite(wet)
    preview.convert("RGB").save(evidence / "wet_core_preview.png", format="PNG", optimize=False)
    env_rgba = environment.convert("RGBA")
    env_rgba.alpha_composite(wet)
    pre_contact = evidence / "candidate_pre_contact.png"
    env_rgba.convert("RGB").save(pre_contact, format="PNG", optimize=False)
    return {
        "wet_core_alpha_geometry_exact": True,
        "ambient_rgb": [round(v, 3) for v in ambient],
        "wet_brightness_base": WET_BRIGHTNESS_BASE,
        "wet_brightness_highlight": WET_BRIGHTNESS_HIGHLIGHT,
        "wet_saturation": WET_SATURATION,
        "wet_ambient_base": WET_AMBIENT_BASE,
        "wet_ambient_shadow": WET_AMBIENT_SHADOW,
        "wet_core_sha256": d0.sha256_file(wet_path),
        "pre_contact_sha256": d0.sha256_file(pre_contact),
    }


def make_masked_input(rgb_path: Path, editable_mask_path: Path, target: Path) -> None:
    with Image.open(rgb_path) as rgb_raw, Image.open(editable_mask_path) as mask_raw:
        rgb = rgb_raw.convert("RGB")
        editable = mask_raw.convert("L")
    if rgb.size != editable.size:
        raise RuntimeError("D4_MASKED_INPUT_DIMENSION_MISMATCH")
    rgba = rgb.convert("RGBA")
    rgba.putalpha(ImageChops.invert(editable))
    rgba.save(target, format="PNG", optimize=False)


def reassert_photometric_core(wet_core_path: Path, raw_candidate_path: Path, core_path: Path, target: Path) -> dict:
    with Image.open(wet_core_path) as wet_raw, Image.open(raw_candidate_path) as cand_raw, Image.open(core_path) as core_raw:
        wet = wet_raw.convert("RGBA")
        candidate = cand_raw.convert("RGB")
        core = core_raw.convert("L")
    if candidate.size != wet.size or core.size != wet.size:
        raise RuntimeError("D4_FINAL_DIMENSION_MISMATCH")
    wet_rgb = wet.convert("RGB")
    final = Image.composite(wet_rgb, candidate, core)
    final.save(target, format="PNG", optimize=False)
    diff = ImageChops.difference(final, wet_rgb)
    protected_diff = Image.new("RGB", final.size, (0, 0, 0))
    protected_diff.paste(diff, (0, 0), core)
    if protected_diff.getbbox() is not None:
        raise RuntimeError("D4_PHOTOMETRIC_CORE_REASSERTION_MISMATCH")
    return {"photometric_core_exact_pixel_reassertion": True, "raw_sha256": d0.sha256_file(raw_candidate_path), "final_sha256": d0.sha256_file(target)}


def write_review(evidence: Path, recipe: dict, env_prompt_id: str, contact_prompt_id: str) -> Path:
    review = evidence / "review.html"
    document = f"""<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>P5 QA01 Kontext D4 Review</title><style>body{{font-family:Arial,sans-serif;background:#11161b;color:#eee;margin:24px}}h1{{font-size:24px}}.grid{{display:grid;grid-template-columns:1fr 1fr;gap:18px}}.card{{background:#1b2229;padding:14px;border:1px solid #333;border-radius:10px;margin-bottom:18px}}img{{width:100%;height:auto;background:white}}pre{{white-space:pre-wrap;color:#d7d7d7}}.warn{{color:#ffcc80}}</style></head><body>
<h1>P5 QA01 v2 — Kontext D4 Geometry-Locked Photometric Integration</h1><p class="warn">EVALUATION ONLY / NON-PRODUCTION / QA01 DISABLED</p>
<p>D3.1 removed the gray latent-mask artifact but still looked like a dry exact-pixel product cutout inside a synthetic aquarium. D4 separates environment realism, deterministic underwater photometry and bounded contact repair while keeping exact source geometry.</p>
<div class="grid"><div class="card"><h2>VERIFIED SC01 reference</h2><img src="source_sc01.png"></div><div class="card"><h2>D4 final candidate</h2><img src="candidate.png"></div></div>
<div class="grid"><div class="card"><h2>Prior D3.1 final</h2><img src="prior_d31_final.png"></div><div class="card"><h2>D4 environment realism pass</h2><img src="candidate_environment_raw.png"></div></div>
<div class="grid"><div class="card"><h2>D4 photometric wet-core composite before contact</h2><img src="candidate_pre_contact.png"></div><div class="card"><h2>D4 raw contact refinement</h2><img src="candidate_contact_raw.png"></div></div>
<div class="grid"><div class="card"><h2>Wet core preview — same SC01 geometry</h2><img src="wet_core_preview.png"></div><div class="card"><h2>Protected Core</h2><img src="protected_core.png"></div></div>
<div class="grid"><div class="card"><h2>Environment Editable Mask</h2><img src="environment_editable_mask.png"></div><div class="card"><h2>Contact Editable Mask</h2><img src="contact_editable_mask.png"></div></div>
<div class="card"><h2>D4 Recipe</h2><pre>{html.escape(json.dumps(recipe, ensure_ascii=False, indent=2))}</pre></div>
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
            raise RuntimeError("QA01_MUST_REMAIN_DISABLED_DURING_KONTEXT_D4_EVAL")
        registry = d0.read_json(repo / "config" / "workflows" / "registry.json")
        qa01 = next((row for row in registry.get("workflows", []) if row.get("code") == "QA01"), None)
        if not qa01 or qa01.get("executable") is not False or qa01.get("workflow_status") != "NOT_REGISTERED":
            raise RuntimeError("QA01_REGISTRY_MUST_REMAIN_FAIL_CLOSED")

        prior = Path(args.prior_evidence_dir).resolve()
        validate_prior_evidence(prior, profile, args.sku)
        evidence = Path(profile["control_root"]) / "evidence" / ("P5_QA01_V2_KONTEXT_D4_" + datetime.now().strftime("%Y%m%d-%H%M%S"))
        evidence.mkdir(parents=True, exist_ok=False)
        for src_name, dst_name in [("source_sc01.png", "source_sc01.png"), ("eval_input_white.png", "eval_input_white.png"), ("candidate.png", "prior_d31_final.png"), ("stage2_editable_mask.png", "contact_editable_mask.png"), ("protected_core.png", "protected_core.png")]:
            shutil.copy2(prior / src_name, evidence / dst_name)
        mask_metrics = build_environment_input(evidence / "prior_d31_final.png", evidence / "source_sc01.png", evidence)
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
            raise RuntimeError("D4_REQUIRED_NODES_MISSING:" + ",".join(missing))

        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        _, visible_reference = d2.copy_input(evidence / "eval_input_white.png", profile, f"p5_qa01_kontext_d4_ref_{args.sku}_{stamp}.png")
        _, visible_env = d2.copy_input(evidence / "environment_input_latentmask.png", profile, f"p5_qa01_kontext_d4_env_{args.sku}_{stamp}.png")
        env_workflow = build_noise_mask_workflow(visible_reference, visible_env, infos, prompt=ENV_PROMPT, seed=ENV_SEED, steps=ENV_STEPS, guidance=ENV_GUIDANCE, denoise=ENV_DENOISE)
        env_prompt_id, env_target = d3.run_stage(evidence, "environment", env_workflow)

        wet_metrics = make_photometric_wet_core(evidence / "source_sc01.png", env_target, evidence)
        contact_input = evidence / "contact_input_latentmask.png"
        make_masked_input(evidence / "candidate_pre_contact.png", evidence / "contact_editable_mask.png", contact_input)
        _, visible_contact = d2.copy_input(contact_input, profile, f"p5_qa01_kontext_d4_contact_{args.sku}_{stamp}.png")
        contact_workflow = build_noise_mask_workflow(visible_reference, visible_contact, infos, prompt=CONTACT_PROMPT, seed=CONTACT_SEED, steps=CONTACT_STEPS, guidance=CONTACT_GUIDANCE, denoise=CONTACT_DENOISE)
        contact_prompt_id, contact_target = d3.run_stage(evidence, "contact", contact_workflow)

        final_candidate = evidence / "candidate.png"
        final_metrics = reassert_photometric_core(evidence / "wet_core.png", contact_target, evidence / "protected_core.png", final_candidate)
        if Image.open(final_candidate).size != Image.open(evidence / "source_sc01.png").size:
            raise RuntimeError("D4_FINAL_DIMENSION_MISMATCH")

        recipe = {
            "schema_version": "0.5-eval-d4", "site_id": args.site_id, "sku": args.sku, "realm": "QA01_AQUARIUM",
            "prior_d31_head": PRIOR_D31_HEAD, "prior_d31_evidence": str(prior), "prior_d31_visual_result": "ARTIFACT_REPAIR_PASS_BUT_SCENE_REALISM_BELOW_BAR",
            "source_sc01_sha256": EXPECTED_SOURCE_SHA256, "prior_d31_final_sha256": EXPECTED_D31_FINAL_SHA256,
            "architecture": "environment-only realism pass + deterministic geometry-locked wet photometry + bounded contact latent-mask refinement + photometric-core reassertion",
            "scene_archetype": "Heavy Stump + Rightward Branch Flow + Central Negative Space", "mask_metrics": mask_metrics,
            "environment": {"runtime": "VAEEncode_PLUS_SetLatentNoiseMask", "seed": ENV_SEED, "steps": ENV_STEPS, "guidance": ENV_GUIDANCE, "denoise": ENV_DENOISE, "sampler": "euler", "scheduler": "simple", "purpose": "rewrite only aquarium environment outside an expanded exact-piece keepout"},
            "photometric_wet_core": wet_metrics,
            "contact": {"runtime": "VAEEncode_PLUS_SetLatentNoiseMask", "seed": CONTACT_SEED, "steps": CONTACT_STEPS, "guidance": CONTACT_GUIDANCE, "denoise": CONTACT_DENOISE, "sampler": "euler", "scheduler": "simple", "editable_pixels": EXPECTED_EDITABLE_PIXELS, "purpose": "repair only local contact and seam regions after geometry-locked wet-core compositing"},
            "production_mutation": "NONE",
            "final_metrics": {"wet_core_alpha_geometry_exact": wet_metrics["wet_core_alpha_geometry_exact"], "photometric_core_exact_pixel_reassertion": final_metrics["photometric_core_exact_pixel_reassertion"], "environment_raw_sha256": d0.sha256_file(env_target), "contact_raw_sha256": final_metrics["raw_sha256"], "final_candidate_sha256": final_metrics["final_sha256"]},
        }
        (evidence / "scene_recipe.json").write_text(json.dumps(recipe, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        (evidence / "prompt_environment.txt").write_text(ENV_PROMPT + "\n", encoding="utf-8")
        (evidence / "prompt_contact.txt").write_text(CONTACT_PROMPT + "\n", encoding="utf-8")
        review = write_review(evidence, recipe, env_prompt_id, contact_prompt_id)

        print("P5_QA01_V2_KONTEXT_D4_EVAL_GATE=PASS")
        print(f"git_head={head}")
        print(f"sku={args.sku}")
        print("d31_artifact_repair=True")
        print("d31_scene_realism_result=FAIL")
        print("evaluation_only=True")
        print("production_authorized=False")
        print("qa01_enabled=False")
        print("architecture=ENVIRONMENT_PLUS_GEOMETRY_LOCKED_PHOTOMETRIC_CORE_PLUS_CONTACT_MASK")
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
        print(f"prior_d31_final_sha256={EXPECTED_D31_FINAL_SHA256}")
        print(f"environment_raw_sha256={d0.sha256_file(env_target)}")
        print(f"candidate_sha256={final_metrics['final_sha256']}")
        print(f"review_file={review}")
        print(f"evidence_dir={evidence}")
        return 0
    except Exception as exc:
        print("P5_QA01_V2_KONTEXT_D4_EVAL_GATE=FAIL")
        print(f"error={exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())