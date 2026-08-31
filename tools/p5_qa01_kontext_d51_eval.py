from __future__ import annotations

import argparse
import html
import json
import time
import urllib.parse
from datetime import datetime
from pathlib import Path
import shutil

from PIL import Image, ImageOps

import p5_qa01_kontext_d0_eval as d0
import p5_qa01_kontext_d2_eval as d2
import p5_qa01_kontext_d4_eval as d4
import p5_qa01_kontext_d5_eval as d5

EXPECTED_SOURCE_SHA256 = d5.EXPECTED_SOURCE_SHA256
EXPECTED_D4_FINAL_SHA256 = d5.EXPECTED_D4_FINAL_SHA256
EXPECTED_CONTACT_EDITABLE_PIXELS = d5.EXPECTED_CONTACT_EDITABLE_PIXELS

ENV_SEED = 52073161
ENV_STEPS = 32
ENV_GUIDANCE = 2.8
ENV_DENOISE = 1.0
CONTACT_SEED = 52073162
CONTACT_STEPS = 18
CONTACT_GUIDANCE = 1.9
CONTACT_DENOISE = 0.56
REFERENCE_CANVAS_WIDTH = 1536
REFERENCE_CANVAS_HEIGHT = 768
REFERENCE_GUTTER = 24

ENV_PROMPT = (
    "The single reference canvas contains two side-by-side panels with different roles. "
    "Use the LEFT PANEL only as the exact sellable driftwood identity. Preserve its major silhouette, branch topology, crowns, cavities, holes, orientation and proportions. "
    "Use the RIGHT PANEL only as a photographic-realism exemplar for a mature real freshwater aquarium: learn real-camera evidence, water optics, glass cues, material realism, biological density, substrate imperfection, planting depth and natural integration. "
    "Do not copy the right panel's driftwood, hardscape layout, exact stone positions, fish positions or plant placement. Build a new aquarium specifically around the exact driftwood identity from the left panel. "
    "This product is a heavy stump with rightward branch flow and central negative space. Keep the mass left-center, preserve open swim-through space through the central cavity and branch windows, and keep the long lower-right branch projecting into open water. "
    "The result must read as a real installed aquarium photographed through front glass, not a catalog visualization, studio background, CGI diorama or generic AI aquascape. "
    "Create uneven fine natural substrate with visible grain and micro-topography; use one asymmetrical load-bearing system of irregular weathered dark-gray stones with varied scale, faceted surfaces, partial burial, overlap and believable weight transfer. Never arrange isolated smooth decorative pebbles. "
    "Use restrained Bucephalandra, Anubias nana petite, small Java fern and limited moss only in plausible sheltered pockets, with finer stems and softer planting deeper in the rear. A tiny restrained shoal may appear only for scale. "
    "Keep the exact driftwood dominant and product-readable. Avoid smooth teal gradients, flat beige floors, sterile sand, perfect symmetry, pedestal staging, extra driftwood, fantasy CGI, oversaturation, dramatic god rays, fake bokeh, text, logos and watermarks."
)

CONTACT_PROMPT = d5.CONTACT_PROMPT


def fit_panel(image: Image.Image, width: int, height: int, background: tuple[int, int, int]) -> Image.Image:
    source = image.convert("RGB")
    fitted = ImageOps.contain(source, (width, height), method=Image.Resampling.LANCZOS)
    panel = Image.new("RGB", (width, height), background)
    x = (width - fitted.width) // 2
    y = (height - fitted.height) // 2
    panel.paste(fitted, (x, y))
    return panel


def build_reference_canvas(product_path: Path, scene_path: Path, target: Path) -> dict:
    with Image.open(product_path) as product_raw, Image.open(scene_path) as scene_raw:
        product = ImageOps.exif_transpose(product_raw).convert("RGB")
        scene = ImageOps.exif_transpose(scene_raw).convert("RGB")

    panel_width = (REFERENCE_CANVAS_WIDTH - REFERENCE_GUTTER) // 2
    left = fit_panel(product, panel_width, REFERENCE_CANVAS_HEIGHT, (238, 238, 234))
    right = fit_panel(scene, panel_width, REFERENCE_CANVAS_HEIGHT, (28, 31, 31))
    canvas = Image.new("RGB", (REFERENCE_CANVAS_WIDTH, REFERENCE_CANVAS_HEIGHT), (115, 115, 110))
    canvas.paste(left, (0, 0))
    canvas.paste(right, (panel_width + REFERENCE_GUTTER, 0))
    canvas.save(target, format="PNG", optimize=False)
    return {
        "width": REFERENCE_CANVAS_WIDTH,
        "height": REFERENCE_CANVAS_HEIGHT,
        "panel_width": panel_width,
        "gutter": REFERENCE_GUTTER,
        "left_role": "exact_sellable_driftwood_identity",
        "right_role": "photographic_realism_exemplar_only_no_layout_copy",
        "sha256": d0.sha256_file(target),
    }


def build_stitched_reference_environment_workflow(reference_canvas: str, image_input: str, infos: dict) -> dict:
    dual_inputs = {
        "clip_name1": d0.MODELS["clip_l"]["name"],
        "clip_name2": d0.MODELS["t5_fp8"]["name"],
        "type": "flux",
    }
    device_options = d0.combo_options(infos["DualCLIPLoader"], "optional", "device")
    if "cpu" in [value.lower() for value in device_options]:
        dual_inputs["device"] = "cpu"

    return {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": d0.MODELS["kontext"]["name"], "weight_dtype": "default"}},
        "2": {"class_type": "DualCLIPLoader", "inputs": dual_inputs},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": d0.MODELS["vae"]["name"]}},
        "4": {"class_type": "LoadImage", "inputs": {"image": reference_canvas}},
        "5": {"class_type": "FluxKontextImageScale", "inputs": {"image": ["4", 0]}},
        "6": {"class_type": "VAEEncode", "inputs": {"pixels": ["5", 0], "vae": ["3", 0]}},
        "7": {"class_type": "CLIPTextEncode", "inputs": {"text": ENV_PROMPT, "clip": ["2", 0]}},
        "8": {"class_type": "ReferenceLatent", "inputs": {"conditioning": ["7", 0], "latent": ["6", 0]}},
        "9": {"class_type": "FluxGuidance", "inputs": {"conditioning": ["8", 0], "guidance": ENV_GUIDANCE}},
        "10": {"class_type": "ConditioningZeroOut", "inputs": {"conditioning": ["7", 0]}},
        "14": {"class_type": "LoadImage", "inputs": {"image": image_input}},
        "15": {"class_type": "VAEEncode", "inputs": {"pixels": ["14", 0], "vae": ["3", 0]}},
        "16": {"class_type": "SetLatentNoiseMask", "inputs": {"samples": ["15", 0], "mask": ["14", 1]}},
        "11": {"class_type": "KSampler", "inputs": {"seed": ENV_SEED, "steps": ENV_STEPS, "cfg": 1.0, "sampler_name": "euler", "scheduler": "simple", "denoise": ENV_DENOISE, "model": ["1", 0], "positive": ["9", 0], "negative": ["10", 0], "latent_image": ["16", 0]}},
        "12": {"class_type": "VAEDecode", "inputs": {"samples": ["11", 0], "vae": ["3", 0]}},
        "13": {"class_type": "PreviewImage", "inputs": {"images": ["12", 0]}},
    }


def compact_execution_error(status: dict) -> dict:
    summary: dict[str, object] = {"status_str": status.get("status_str"), "completed": status.get("completed")}
    for item in status.get("messages") or []:
        if not isinstance(item, (list, tuple)) or len(item) < 2 or item[0] != "execution_error" or not isinstance(item[1], dict):
            continue
        payload = item[1]
        for key in ("prompt_id", "node_id", "node_type", "exception_type", "exception_message"):
            value = payload.get(key)
            if value not in (None, ""):
                summary[key] = str(value)[:1200]
        break
    return summary


def wait_image_sanitized(prompt_id: str, timeout_seconds: int = 3000) -> dict:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        history = d0.get_json("/history/" + urllib.parse.quote(prompt_id), 60)
        if history:
            row = history.get(prompt_id, history if "outputs" in history else None)
            if row:
                outputs = row.get("outputs") or {}
                images = (outputs.get("13") or {}).get("images") or []
                if images:
                    return images[0]
                status = row.get("status") or {}
                if status.get("status_str") == "error":
                    raise RuntimeError("D51_COMFY_RUNTIME_ERROR:" + json.dumps(compact_execution_error(status), ensure_ascii=True, separators=(",", ":")))
                if status.get("completed") is True:
                    raise RuntimeError("D51_PROMPT_COMPLETED_WITHOUT_PREVIEW")
        time.sleep(4)
    raise RuntimeError(f"D51_PROMPT_TIMEOUT:prompt_id={prompt_id}")


def run_stage_sanitized(evidence: Path, stage: str, workflow: dict, timeout_seconds: int = 3000) -> tuple[str, Path]:
    (evidence / f"workflow_{stage}.json").write_text(json.dumps(workflow, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    client_id = f"p5-qa01-kontext-d51-{stage}-" + datetime.now().strftime("%Y%m%d%H%M%S")
    response = d0.post_json("/prompt", {"prompt": workflow, "client_id": client_id}, 180)
    prompt_id = str(response.get("prompt_id", ""))
    if not prompt_id:
        raise RuntimeError(f"D51_{stage.upper()}_PROMPT_ID_MISSING")
    (evidence / f"prompt_id_{stage}.txt").write_text(prompt_id + "\n", encoding="utf-8")
    image_info = wait_image_sanitized(prompt_id, timeout_seconds)
    raw = evidence / f"candidate_{stage}_raw.png"
    d0.download_comfy_image(image_info, raw)
    return prompt_id, raw


def write_review(evidence: Path, recipe: dict, env_prompt_id: str, contact_prompt_id: str) -> Path:
    review = evidence / "review.html"
    document = f"""<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>P5 QA01 Kontext D5.1 Review</title><style>body{{font-family:Arial,sans-serif;background:#11161b;color:#eee;margin:24px}}h1{{font-size:24px}}.grid{{display:grid;grid-template-columns:1fr 1fr;gap:18px}}.card{{background:#1b2229;padding:14px;border:1px solid #333;border-radius:10px;margin-bottom:18px}}img{{width:100%;height:auto;background:white}}pre{{white-space:pre-wrap;color:#d7d7d7}}.warn{{color:#ffcc80}}</style></head><body>
<h1>P5 QA01 v2 — Kontext D5.1 Stitched Real-Reference Aquarium</h1><p class="warn">EVALUATION ONLY / NON-PRODUCTION / QA01 DISABLED</p>
<p>D5 chained multi-reference latents reached runtime but failed on this FLUX.1 Kontext environment. D5.1 follows the official FLUX.1 Kontext multi-image pattern: a deterministic side-by-side reference canvas is encoded as one ReferenceLatent. Left panel = exact product identity; right panel = realism exemplar only.</p>
<div class="grid"><div class="card"><h2>VERIFIED SC01 — exact identity</h2><img src="source_sc01.png"></div><div class="card"><h2>D5.1 final candidate</h2><img src="candidate.png"></div></div>
<div class="grid"><div class="card"><h2>User-approved Aquarium realism reference</h2><img src="scene_reference.png"></div><div class="card"><h2>D5.1 environment pass</h2><img src="candidate_environment_stitched_ref_raw.png"></div></div>
<div class="card"><h2>Stitched reference canvas — LEFT identity / RIGHT realism only</h2><img src="reference_canvas.png"></div>
<div class="grid"><div class="card"><h2>Prior D4 final</h2><img src="prior_d4_final.png"></div><div class="card"><h2>Wet-core composite before contact</h2><img src="candidate_pre_contact.png"></div></div>
<div class="grid"><div class="card"><h2>Raw contact refinement</h2><img src="candidate_contact_raw.png"></div><div class="card"><h2>Wet core preview</h2><img src="wet_core_preview.png"></div></div>
<div class="grid"><div class="card"><h2>Environment Editable Mask</h2><img src="environment_editable_mask.png"></div><div class="card"><h2>Contact Editable Mask</h2><img src="contact_editable_mask.png"></div></div>
<div class="card"><h2>D5.1 Recipe</h2><pre>{html.escape(json.dumps(recipe, ensure_ascii=False, indent=2))}</pre></div>
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
            raise RuntimeError("QA01_MUST_REMAIN_DISABLED_DURING_KONTEXT_D51_EVAL")
        registry = d0.read_json(repo / "config" / "workflows" / "registry.json")
        qa01 = next((row for row in registry.get("workflows", []) if row.get("code") == "QA01"), None)
        if not qa01 or qa01.get("executable") is not False or qa01.get("workflow_status") != "NOT_REGISTERED":
            raise RuntimeError("QA01_REGISTRY_MUST_REMAIN_FAIL_CLOSED")

        prior = Path(args.prior_evidence_dir).resolve()
        d5.validate_prior_evidence(prior, profile, args.sku)
        scene_source = Path(args.scene_reference_path).expanduser().resolve()
        evidence = Path(profile["control_root"]) / "evidence" / ("P5_QA01_V2_KONTEXT_D51_" + datetime.now().strftime("%Y%m%d-%H%M%S"))
        evidence.mkdir(parents=True, exist_ok=False)
        for src_name, dst_name in [("source_sc01.png", "source_sc01.png"), ("eval_input_white.png", "eval_input_white.png"), ("candidate.png", "prior_d4_final.png"), ("contact_editable_mask.png", "contact_editable_mask.png"), ("protected_core.png", "protected_core.png")]:
            shutil.copy2(prior / src_name, evidence / dst_name)
        scene_metrics = d5.normalize_scene_reference(scene_source, evidence)
        mask_metrics = d5.build_environment_input(evidence / "prior_d4_final.png", evidence / "source_sc01.png", evidence)
        canvas_metrics = build_reference_canvas(evidence / "eval_input_white.png", evidence / "scene_reference.png", evidence / "reference_canvas.png")

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
            raise RuntimeError("D51_REQUIRED_NODES_MISSING:" + ",".join(missing))

        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        _, visible_canvas = d2.copy_input(evidence / "reference_canvas.png", profile, f"p5_qa01_kontext_d51_reference_canvas_{args.sku}_{stamp}.png")
        _, visible_env = d2.copy_input(evidence / "environment_input_latentmask.png", profile, f"p5_qa01_kontext_d51_env_{args.sku}_{stamp}.png")
        env_workflow = build_stitched_reference_environment_workflow(visible_canvas, visible_env, infos)
        env_prompt_id, env_target = run_stage_sanitized(evidence, "environment_stitched_ref", env_workflow)

        wet_metrics = d4.make_photometric_wet_core(evidence / "source_sc01.png", env_target, evidence)
        contact_input = evidence / "contact_input_latentmask.png"
        d4.make_masked_input(evidence / "candidate_pre_contact.png", evidence / "contact_editable_mask.png", contact_input)
        _, visible_contact = d2.copy_input(contact_input, profile, f"p5_qa01_kontext_d51_contact_{args.sku}_{stamp}.png")
        _, visible_product_ref = d2.copy_input(evidence / "eval_input_white.png", profile, f"p5_qa01_kontext_d51_product_ref_{args.sku}_{stamp}.png")
        contact_workflow = d4.build_noise_mask_workflow(visible_product_ref, visible_contact, infos, prompt=CONTACT_PROMPT, seed=CONTACT_SEED, steps=CONTACT_STEPS, guidance=CONTACT_GUIDANCE, denoise=CONTACT_DENOISE)
        contact_prompt_id, contact_target = run_stage_sanitized(evidence, "contact", contact_workflow)

        final_candidate = evidence / "candidate.png"
        final_metrics = d4.reassert_photometric_core(evidence / "wet_core.png", contact_target, evidence / "protected_core.png", final_candidate)
        with Image.open(final_candidate) as final_raw, Image.open(evidence / "source_sc01.png") as source_raw:
            if final_raw.size != source_raw.size:
                raise RuntimeError("D51_FINAL_DIMENSION_MISMATCH")

        recipe = {
            "schema_version": "0.611-eval-d51",
            "site_id": args.site_id,
            "sku": args.sku,
            "realm": "QA01_AQUARIUM",
            "source_sc01_sha256": EXPECTED_SOURCE_SHA256,
            "prior_d4_final_sha256": EXPECTED_D4_FINAL_SHA256,
            "architecture": "official-compatible FLUX.1 stitched reference canvas + single ReferenceLatent + geometry-locked wet photometry + bounded contact repair",
            "d5_failure_boundary": "chained multi-reference latent method reached runtime but failed on target FLUX.1 Kontext environment; D5.1 removes that experimental path",
            "diagnostics": "sanitized runtime error summary; tensor/current_inputs payloads are never emitted to terminal",
            "scene_reference": scene_metrics,
            "reference_canvas": canvas_metrics,
            "mask_metrics": mask_metrics,
            "environment": {"runtime": "STITCHED_REFERENCE_CANVAS_SINGLE_REFERENCE_LATENT_PLUS_SetLatentNoiseMask", "seed": ENV_SEED, "steps": ENV_STEPS, "guidance": ENV_GUIDANCE, "denoise": ENV_DENOISE, "sampler": "euler", "scheduler": "simple"},
            "photometric_wet_core": wet_metrics,
            "contact": {"runtime": "VAEEncode_PLUS_SetLatentNoiseMask", "seed": CONTACT_SEED, "steps": CONTACT_STEPS, "guidance": CONTACT_GUIDANCE, "denoise": CONTACT_DENOISE, "sampler": "euler", "scheduler": "simple", "editable_pixels": EXPECTED_CONTACT_EDITABLE_PIXELS},
            "production_mutation": "NONE",
            "final_metrics": {"wet_core_alpha_geometry_exact": wet_metrics["wet_core_alpha_geometry_exact"], "photometric_core_exact_pixel_reassertion": final_metrics["photometric_core_exact_pixel_reassertion"], "environment_raw_sha256": d0.sha256_file(env_target), "contact_raw_sha256": final_metrics["raw_sha256"], "final_candidate_sha256": final_metrics["final_sha256"]},
        }
        (evidence / "scene_recipe.json").write_text(json.dumps(recipe, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        (evidence / "prompt_environment.txt").write_text(ENV_PROMPT + "\n", encoding="utf-8")
        (evidence / "prompt_contact.txt").write_text(CONTACT_PROMPT + "\n", encoding="utf-8")
        review = write_review(evidence, recipe, env_prompt_id, contact_prompt_id)

        print("P5_QA01_V2_KONTEXT_D51_EVAL_GATE=PASS")
        print(f"git_head={head}")
        print(f"sku={args.sku}")
        print("d5_runtime_result=FAIL_MULTI_REFERENCE_LATENT_RUNTIME")
        print("evaluation_only=True")
        print("production_authorized=False")
        print("qa01_enabled=False")
        print("architecture=OFFICIAL_COMPAT_STITCHED_CANVAS_SINGLE_REFERENCE_LATENT")
        print("runtime_diagnostics=SANITIZED_NO_TENSOR_DUMP")
        print("reference_canvas_left_role=EXACT_SELLABLE_PIECE_IDENTITY")
        print("reference_canvas_right_role=PHOTOGRAPHIC_REALISM_ONLY_NO_LAYOUT_COPY")
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
        print(f"scene_reference_original_sha256={scene_metrics['original_sha256']}")
        print(f"reference_canvas_sha256={canvas_metrics['sha256']}")
        print(f"environment_prompt_id={env_prompt_id}")
        print(f"contact_prompt_id={contact_prompt_id}")
        print(f"candidate_sha256={final_metrics['final_sha256']}")
        print(f"review_file={review}")
        print(f"evidence_dir={evidence}")
        return 0
    except Exception as exc:
        print("P5_QA01_V2_KONTEXT_D51_EVAL_GATE=FAIL")
        print(f"error={exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
