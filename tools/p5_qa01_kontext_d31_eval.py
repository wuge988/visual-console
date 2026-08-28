from __future__ import annotations

import argparse
import html
import json
from datetime import datetime
from pathlib import Path
import shutil

from PIL import Image, ImageChops

import p5_qa01_kontext_d0_eval as d0
import p5_qa01_kontext_d2_eval as d2
import p5_qa01_kontext_d3_eval as d3

PRIOR_D3_HEAD = "11b2164a4bb017e45d3361d360bd986b611710dd"
EXPECTED_SOURCE_SHA256 = "f31c77589ab71874655744f8f5dc92f2ece77fbf5b7b52f22e53476836a62399"
EXPECTED_STAGE1_SHA256 = "6bd58f363026e9a73edcd67b3403c7448f0fd484c1ec491c571bd86270410136"
EXPECTED_BROKEN_D3_SHA256 = "d938ecb2e99fc7a25a9b809c06694661f457b0652edf87f30c0c430927d920f1"
EXPECTED_STAGE2_EDITABLE_PIXELS = 138108

STAGE2_PROMPT = d3.STAGE2_PROMPT
STAGE2_SEED = d3.STAGE2_SEED
STAGE2_STEPS = d3.STAGE2_STEPS
STAGE2_GUIDANCE = d3.STAGE2_GUIDANCE
STAGE2_DENOISE = d3.STAGE2_DENOISE


def ensure_under(child: Path, parent: Path) -> None:
    child_r = child.resolve()
    parent_r = parent.resolve()
    try:
        child_r.relative_to(parent_r)
    except ValueError as exc:
        raise RuntimeError(f"D31_PRIOR_EVIDENCE_OUTSIDE_CONTROL_ROOT:{child_r}") from exc


def count_nonzero(mask: Image.Image) -> int:
    return sum(1 for value in mask.getdata() if value > 0)


def validate_prior_evidence(prior: Path, profile: dict, sku: str) -> dict:
    evidence_root = Path(profile["control_root"]) / "evidence"
    ensure_under(prior, evidence_root)
    if not prior.name.startswith("P5_QA01_V2_KONTEXT_D3_"):
        raise RuntimeError(f"D31_PRIOR_EVIDENCE_NAME_INVALID:{prior.name}")

    required = [
        "source_sc01.png",
        "eval_input_white.png",
        "candidate_stage1.png",
        "candidate_stage2_raw.png",
        "candidate.png",
        "stage2_editable_mask.png",
        "protected_core.png",
        "scene_recipe.json",
    ]
    missing = [name for name in required if not (prior / name).is_file()]
    if missing:
        raise RuntimeError("D31_PRIOR_EVIDENCE_MISSING:" + ",".join(missing))

    recipe = d0.read_json(prior / "scene_recipe.json")
    if recipe.get("schema_version") != "0.4-eval-d3":
        raise RuntimeError("D31_PRIOR_RECIPE_SCHEMA_MISMATCH")
    if recipe.get("sku") != sku:
        raise RuntimeError("D31_PRIOR_RECIPE_SKU_MISMATCH")
    if recipe.get("source_sc01_sha256") != EXPECTED_SOURCE_SHA256:
        raise RuntimeError("D31_PRIOR_RECIPE_SOURCE_SHA_MISMATCH")

    final_metrics = recipe.get("final_metrics") or {}
    if final_metrics.get("stage1_candidate_sha256") != EXPECTED_STAGE1_SHA256:
        raise RuntimeError("D31_PRIOR_RECIPE_STAGE1_SHA_MISMATCH")
    if final_metrics.get("final_candidate_sha256") != EXPECTED_BROKEN_D3_SHA256:
        raise RuntimeError("D31_PRIOR_RECIPE_BROKEN_FINAL_SHA_MISMATCH")

    if d0.sha256_file(prior / "source_sc01.png") != EXPECTED_SOURCE_SHA256:
        raise RuntimeError("D31_PRIOR_SOURCE_BYTES_MISMATCH")
    if d0.sha256_file(prior / "candidate_stage1.png") != EXPECTED_STAGE1_SHA256:
        raise RuntimeError("D31_PRIOR_STAGE1_BYTES_MISMATCH")
    if d0.sha256_file(prior / "candidate.png") != EXPECTED_BROKEN_D3_SHA256:
        raise RuntimeError("D31_PRIOR_BROKEN_FINAL_BYTES_MISMATCH")

    with Image.open(prior / "candidate_stage1.png") as stage1_raw, Image.open(prior / "stage2_editable_mask.png") as mask_raw:
        stage1 = stage1_raw.convert("RGB")
        editable = mask_raw.convert("L")
    if stage1.size != editable.size:
        raise RuntimeError("D31_PRIOR_MASK_DIMENSION_MISMATCH")
    editable_pixels = count_nonzero(editable)
    if editable_pixels != EXPECTED_STAGE2_EDITABLE_PIXELS:
        raise RuntimeError(
            f"D31_PRIOR_EDITABLE_PIXEL_COUNT_MISMATCH:expected={EXPECTED_STAGE2_EDITABLE_PIXELS}:actual={editable_pixels}"
        )

    return recipe


def make_stage2_input(stage1_final: Path, editable_mask_path: Path, target: Path) -> None:
    with Image.open(stage1_final) as raw, Image.open(editable_mask_path) as mask_raw:
        rgb = raw.convert("RGB")
        editable = mask_raw.convert("L")
    if rgb.size != editable.size:
        raise RuntimeError("D31_STAGE2_MASK_DIMENSION_MISMATCH")
    rgba = rgb.convert("RGBA")
    # LoadImage must expose the local editable mask while preserving the real Stage 1 RGB pixels.
    rgba.putalpha(ImageChops.invert(editable))
    rgba.save(target, format="PNG", optimize=False)


def build_stage2_latent_mask_workflow(reference_input: str, stage2_input: str, infos: dict) -> dict:
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
        "4": {"class_type": "LoadImage", "inputs": {"image": reference_input}},
        "5": {"class_type": "FluxKontextImageScale", "inputs": {"image": ["4", 0]}},
        "6": {"class_type": "VAEEncode", "inputs": {"pixels": ["5", 0], "vae": ["3", 0]}},
        "7": {"class_type": "CLIPTextEncode", "inputs": {"text": STAGE2_PROMPT, "clip": ["2", 0]}},
        "8": {"class_type": "ReferenceLatent", "inputs": {"conditioning": ["7", 0], "latent": ["6", 0]}},
        "9": {"class_type": "FluxGuidance", "inputs": {"conditioning": ["8", 0], "guidance": STAGE2_GUIDANCE}},
        "10": {"class_type": "ConditioningZeroOut", "inputs": {"conditioning": ["7", 0]}},
        "14": {"class_type": "LoadImage", "inputs": {"image": stage2_input}},
        "15": {"class_type": "VAEEncode", "inputs": {"pixels": ["14", 0], "vae": ["3", 0]}},
        "16": {"class_type": "SetLatentNoiseMask", "inputs": {"samples": ["15", 0], "mask": ["14", 1]}},
        "11": {
            "class_type": "KSampler",
            "inputs": {
                "seed": STAGE2_SEED,
                "steps": STAGE2_STEPS,
                "cfg": 1.0,
                "sampler_name": "euler",
                "scheduler": "simple",
                "denoise": STAGE2_DENOISE,
                "model": ["1", 0],
                "positive": ["9", 0],
                "negative": ["10", 0],
                "latent_image": ["16", 0],
            },
        },
        "12": {"class_type": "VAEDecode", "inputs": {"samples": ["11", 0], "vae": ["3", 0]}},
        "13": {"class_type": "PreviewImage", "inputs": {"images": ["12", 0]}},
    }


def reassert_core(source_path: Path, raw_candidate_path: Path, core_path: Path, target: Path) -> dict:
    return d3.reassert_core(source_path, raw_candidate_path, core_path, target, "D31_STAGE2")


def write_review(evidence: Path, prior: Path, recipe: dict, prompt_id: str) -> Path:
    review = evidence / "review.html"
    document = f"""<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>P5 QA01 Kontext D3.1 Review</title>
<style>body{{font-family:Arial,sans-serif;background:#11161b;color:#eee;margin:24px}}h1{{font-size:24px}}.grid{{display:grid;grid-template-columns:1fr 1fr;gap:18px}}.card{{background:#1b2229;padding:14px;border:1px solid #333;border-radius:10px;margin-bottom:18px}}img{{width:100%;height:auto;background:white}}pre{{white-space:pre-wrap;color:#d7d7d7}}.warn{{color:#ffcc80}}.good{{color:#a8d5a2}}</style></head>
<body><h1>P5 QA01 v2 — Kontext D3.1 Stage-2 Latent-Mask Repair</h1>
<p class="warn">EVALUATION ONLY / NON-PRODUCTION / QA01 DISABLED</p>
<p>D3 human review found Stage 1 materially improved, while Stage 2 leaked gray inpaint placeholder areas. D3.1 reuses the exact accepted Stage 1 bytes and changes only Stage 2 from VAEEncodeForInpaint to VAEEncode + SetLatentNoiseMask.</p>
<div class="grid"><div class="card"><h2>VERIFIED SC01 reference</h2><img src="source_sc01.png"></div><div class="card"><h2>D3.1 final candidate</h2><img src="candidate.png"></div></div>
<div class="grid"><div class="card"><h2>Reused exact D3 Stage 1</h2><img src="candidate_stage1.png"></div><div class="card"><h2>D3.1 raw Stage 2 latent-mask refinement</h2><img src="candidate_stage2_raw.png"></div></div>
<div class="grid"><div class="card"><h2>Prior broken D3 final</h2><img src="prior_d3_broken_final.png"></div><div class="card"><h2>Stage 2 editable mask</h2><img src="stage2_editable_mask.png"></div></div>
<div class="card"><h2>D3.1 Recipe</h2><pre>{html.escape(json.dumps(recipe, ensure_ascii=False, indent=2))}</pre></div>
<div class="card"><h2>Stage 2 Prompt</h2><pre>{html.escape(STAGE2_PROMPT)}</pre><p>prompt_id={html.escape(prompt_id)}</p><p>prior_evidence={html.escape(str(prior))}</p></div>
</body></html>"""
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
            raise RuntimeError("QA01_MUST_REMAIN_DISABLED_DURING_KONTEXT_D31_EVAL")
        registry = d0.read_json(repo / "config" / "workflows" / "registry.json")
        qa01 = next((row for row in registry.get("workflows", []) if row.get("code") == "QA01"), None)
        if not qa01 or qa01.get("executable") is not False or qa01.get("workflow_status") != "NOT_REGISTERED":
            raise RuntimeError("QA01_REGISTRY_MUST_REMAIN_FAIL_CLOSED")

        prior = Path(args.prior_evidence_dir).resolve()
        validate_prior_evidence(prior, profile, args.sku)

        evidence = Path(profile["control_root"]) / "evidence" / ("P5_QA01_V2_KONTEXT_D31_" + datetime.now().strftime("%Y%m%d-%H%M%S"))
        evidence.mkdir(parents=True, exist_ok=False)

        copy_names = [
            ("source_sc01.png", "source_sc01.png"),
            ("eval_input_white.png", "eval_input_white.png"),
            ("candidate_stage1.png", "candidate_stage1.png"),
            ("stage2_editable_mask.png", "stage2_editable_mask.png"),
            ("protected_core.png", "protected_core.png"),
            ("candidate.png", "prior_d3_broken_final.png"),
        ]
        for src_name, dst_name in copy_names:
            shutil.copy2(prior / src_name, evidence / dst_name)

        stage2_input = evidence / "stage2_input_latentmask.png"
        make_stage2_input(evidence / "candidate_stage1.png", evidence / "stage2_editable_mask.png", stage2_input)

        for label, spec in d0.MODELS.items():
            d0.exact_model_identity(label, spec)
        _, started_by_gate = d0.wait_ready(evidence)

        required_nodes = [
            "UNETLoader", "DualCLIPLoader", "VAELoader", "LoadImage", "FluxKontextImageScale",
            "VAEEncode", "SetLatentNoiseMask", "CLIPTextEncode", "ReferenceLatent", "FluxGuidance",
            "ConditioningZeroOut", "KSampler", "VAEDecode", "PreviewImage",
        ]
        infos: dict[str, dict] = {}
        missing: list[str] = []
        for name in required_nodes:
            info = d0.node_info(name)
            if info is None:
                missing.append(name)
            else:
                infos[name] = info
        if missing:
            raise RuntimeError("D31_REQUIRED_NODES_MISSING:" + ",".join(missing))

        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        _, visible_reference = d2.copy_input(evidence / "eval_input_white.png", profile, f"p5_qa01_kontext_d31_ref_{args.sku}_{stamp}.png")
        _, visible_stage2 = d2.copy_input(stage2_input, profile, f"p5_qa01_kontext_d31_stage2_{args.sku}_{stamp}.png")
        workflow = build_stage2_latent_mask_workflow(visible_reference, visible_stage2, infos)
        (evidence / "workflow_stage2_latentmask.json").write_text(json.dumps(workflow, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

        client_id = "p5-qa01-kontext-d31-stage2-" + datetime.now().strftime("%Y%m%d%H%M%S")
        response = d0.post_json("/prompt", {"prompt": workflow, "client_id": client_id}, 180)
        prompt_id = str(response.get("prompt_id", ""))
        if not prompt_id:
            raise RuntimeError("D31_STAGE2_PROMPT_ID_MISSING")
        (evidence / "prompt_id_stage2.txt").write_text(prompt_id + "\n", encoding="utf-8")

        image_info = d0.wait_image(prompt_id, 3000)
        stage2_raw = evidence / "candidate_stage2_raw.png"
        d0.download_comfy_image(image_info, stage2_raw)

        final_candidate = evidence / "candidate.png"
        metrics = reassert_core(evidence / "source_sc01.png", stage2_raw, evidence / "protected_core.png", final_candidate)

        recipe = {
            "schema_version": "0.4.1-eval-d31",
            "site_id": args.site_id,
            "sku": args.sku,
            "realm": "QA01_AQUARIUM",
            "prior_d3_head": PRIOR_D3_HEAD,
            "prior_d3_evidence": str(prior),
            "prior_d3_visual_result": "FAIL_STAGE2_GRAY_PLACEHOLDER_LEAK",
            "source_sc01_sha256": EXPECTED_SOURCE_SHA256,
            "reused_stage1_sha256": EXPECTED_STAGE1_SHA256,
            "prior_broken_d3_final_sha256": EXPECTED_BROKEN_D3_SHA256,
            "architecture": "reuse exact D3 Stage 1; Stage 2 VAEEncode plus SetLatentNoiseMask; deterministic protected-core reassertion",
            "stage2": {
                "runtime": "VAEEncode_PLUS_SetLatentNoiseMask",
                "seed": STAGE2_SEED,
                "steps": STAGE2_STEPS,
                "guidance": STAGE2_GUIDANCE,
                "denoise": STAGE2_DENOISE,
                "sampler": "euler",
                "scheduler": "simple",
                "editable_pixels": EXPECTED_STAGE2_EDITABLE_PIXELS,
                "purpose": "preserve actual Stage 1 latent under the editable mask while allowing bounded local refinement",
            },
            "production_mutation": "NONE",
            "final_metrics": {
                "protected_core_exact_pixel_reassertion": metrics["protected_core_exact_pixel_reassertion"],
                "stage2_raw_sha256": metrics["raw_sha256"],
                "final_candidate_sha256": metrics["final_sha256"],
            },
        }
        (evidence / "scene_recipe.json").write_text(json.dumps(recipe, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        (evidence / "prompt_stage2.txt").write_text(STAGE2_PROMPT + "\n", encoding="utf-8")
        review = write_review(evidence, prior, recipe, prompt_id)

        print("P5_QA01_V2_KONTEXT_D31_EVAL_GATE=PASS")
        print(f"git_head={head}")
        print(f"sku={args.sku}")
        print("d3_visual_result=FAIL_STAGE2_GRAY_PLACEHOLDER_LEAK")
        print("stage1_reused=True")
        print("evaluation_only=True")
        print("production_authorized=False")
        print("qa01_enabled=False")
        print("stage2_runtime=VAEEncode_PLUS_SetLatentNoiseMask")
        print("stage2_gray_placeholder_source_removed=True")
        print("protected_core_exact_pixel_reassertion=True")
        print(f"comfy_started_by_gate={started_by_gate}")
        print(f"stage2_seed={STAGE2_SEED}")
        print(f"stage2_steps={STAGE2_STEPS}")
        print(f"stage2_guidance={STAGE2_GUIDANCE}")
        print(f"stage2_denoise={STAGE2_DENOISE}")
        print(f"stage2_prompt_id={prompt_id}")
        print(f"source_sc01_sha256={EXPECTED_SOURCE_SHA256}")
        print(f"reused_stage1_sha256={EXPECTED_STAGE1_SHA256}")
        print(f"candidate_sha256={metrics['final_sha256']}")
        print(f"review_file={review}")
        print(f"evidence_dir={evidence}")
        return 0
    except Exception as exc:
        print("P5_QA01_V2_KONTEXT_D31_EVAL_GATE=FAIL")
        print(f"error={exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
