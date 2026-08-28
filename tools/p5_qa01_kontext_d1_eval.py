from __future__ import annotations

import argparse
import html
import json
from pathlib import Path
import shutil
from datetime import datetime

from PIL import Image, ImageDraw

import p5_qa01_kontext_d0_eval as d0

SEED = 52073111
STEPS = 24
GUIDANCE = 2.2
DENOISE = 0.62

PROMPT = (
    "Use the exact photographed driftwood from the reference as the unchanged hardscape skeleton of one highly photorealistic freshwater planted aquarium. "
    "This must remain the same physical wood piece: preserve the exact outer silhouette, the two upper crowns, the thin central upright prong, every major rightward branch fork, the longest low-right branch, the large central-left cavity, smaller branch windows, proportions, orientation and recognizable surface grain. "
    "Do not invent, delete, merge, shorten, thicken, bend, duplicate or relocate any wood branch, crown, cavity or hole. Keep at least eighty percent of visible wood surface exposed. "
    "Build the aquarium around this particular shape: anchor the central-left dominant mass with an irregular clustered group of natural dark river stones partly buried in realistic fine sand; keep the long low-right branch visually free and use the branch openings as intentional negative-space swim-throughs. "
    "Use restrained small Anubias, Bucephalandra, Java fern and limited moss only at plausible attachment pockets; never cover broad wood surfaces with a moss blanket. Add low foreground planting and deeper background stems that follow the branch flow rather than forming a generic wall. "
    "The image must read as a real aquarium photographed through front glass, with believable water depth, subtle glass reflections, realistic sand grain, physically coherent submerged wet-wood response, soft water attenuation, restrained caustics and one shared neutral aquarium light. "
    "Avoid a smooth studio gradient, isolated decorative pebbles, object-on-pedestal staging, fantasy CGI, excessive teal, dramatic rays, fake bokeh, floating wood, impossible glass, extra driftwood, text, logos and watermarks."
)


def lerp(a: int, b: int, t: float) -> int:
    return int(round(a + (b - a) * t))


def make_scaffold(sc01_path: Path, target: Path) -> dict:
    with Image.open(sc01_path) as raw:
        subject = raw.convert("RGBA")
    alpha = subject.getchannel("A")
    bbox = alpha.getbbox()
    if bbox is None:
        raise RuntimeError("SC01_ALPHA_EMPTY")
    histogram = alpha.histogram()
    nonzero = subject.width * subject.height - histogram[0]

    width, height = subject.size
    horizon = int(round(height * 0.74))
    base = Image.new("RGB", subject.size)
    draw = ImageDraw.Draw(base)
    top_a = (23, 43, 50)
    top_b = (47, 82, 82)
    sand_a = (165, 157, 137)
    sand_b = (204, 190, 158)
    for y in range(height):
        if y < horizon:
            t = y / max(1, horizon - 1)
            color = tuple(lerp(top_a[i], top_b[i], t) for i in range(3))
        else:
            t = (y - horizon) / max(1, height - horizon - 1)
            color = tuple(lerp(sand_a[i], sand_b[i], t) for i in range(3))
        draw.line((0, y, width, y), fill=color)

    scaffold = base.convert("RGBA")
    scaffold.alpha_composite(subject)
    scaffold.convert("RGB").save(target, format="PNG", optimize=False)
    return {
        "width": width,
        "height": height,
        "visible_aspect_ratio": width / float(height),
        "alpha_bbox": list(bbox),
        "occupied_area_ratio": nonzero / float(width * height),
        "scaffold_horizon_ratio": 0.74,
        "scaffold_preserves_exact_sc01_pixels": True,
    }


def copy_input(source: Path, profile: dict, filename: str) -> tuple[list[str], str]:
    roots = [d0.COMFY_ROOT / "ComfyUI" / "input", Path(profile.get("comfyui_input_root", ""))]
    copied: list[str] = []
    expected = d0.sha256_file(source)
    for root in roots:
        if not str(root):
            continue
        root.mkdir(parents=True, exist_ok=True)
        target = root / filename
        if not target.exists():
            shutil.copy2(source, target)
        if d0.sha256_file(target) != expected:
            raise RuntimeError(f"EVAL_INPUT_COPY_SHA_MISMATCH:{target}")
        copied.append(str(target))
    info = d0.node_info("LoadImage")
    if info is None:
        raise RuntimeError("LOADIMAGE_NODE_UNAVAILABLE_AFTER_INPUT_COPY")
    return copied, d0.choose_visible_input(filename, info)


def build_workflow(reference_input: str, scaffold_input: str, infos: dict) -> dict:
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
        "7": {"class_type": "CLIPTextEncode", "inputs": {"text": PROMPT, "clip": ["2", 0]}},
        "8": {"class_type": "ReferenceLatent", "inputs": {"conditioning": ["7", 0], "latent": ["6", 0]}},
        "9": {"class_type": "FluxGuidance", "inputs": {"conditioning": ["8", 0], "guidance": GUIDANCE}},
        "10": {"class_type": "ConditioningZeroOut", "inputs": {"conditioning": ["7", 0]}},
        "14": {"class_type": "LoadImage", "inputs": {"image": scaffold_input}},
        "15": {"class_type": "FluxKontextImageScale", "inputs": {"image": ["14", 0]}},
        "16": {"class_type": "VAEEncode", "inputs": {"pixels": ["15", 0], "vae": ["3", 0]}},
        "11": {
            "class_type": "KSampler",
            "inputs": {
                "seed": SEED,
                "steps": STEPS,
                "cfg": 1.0,
                "sampler_name": "euler",
                "scheduler": "simple",
                "denoise": DENOISE,
                "model": ["1", 0],
                "positive": ["9", 0],
                "negative": ["10", 0],
                "latent_image": ["16", 0],
            },
        },
        "12": {"class_type": "VAEDecode", "inputs": {"samples": ["11", 0], "vae": ["3", 0]}},
        "13": {"class_type": "PreviewImage", "inputs": {"images": ["12", 0]}},
    }


def write_review(evidence: Path, recipe: dict, prompt_id: str) -> Path:
    review = evidence / "review.html"
    document = f"""<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>P5 QA01 Kontext D1 Review</title>
<style>body{{font-family:Arial,sans-serif;background:#11161b;color:#eee;margin:24px}}h1{{font-size:24px}}.grid{{display:grid;grid-template-columns:1fr 1fr;gap:18px}}.card{{background:#1b2229;padding:14px;border:1px solid #333;border-radius:10px}}img{{width:100%;height:auto;background:white}}code,pre{{white-space:pre-wrap;color:#d7d7d7}}.warn{{color:#ffcc80}}.note{{color:#9cc7ff}}</style></head>
<body><h1>P5 QA01 v2 — Kontext D1 身份优先真实感评估</h1>
<p class="warn">EVALUATION ONLY / NON-PRODUCTION / QA01 DISABLED</p>
<div class="grid"><div class="card"><h2>VERIFIED SC01 reference</h2><img src="source_sc01.png"></div><div class="card"><h2>Kontext D1 candidate</h2><img src="candidate.png"></div></div>
<div class="card"><h2>D1 deterministic starter — 仅作为低 denoise 起始 latent，不是候选成品</h2><p class="note">The starter exists only to reduce geometry destruction while giving the sampler an aquarium-like field to edit.</p><img src="eval_input_scaffold.png"></div>
<div class="card"><h2>SceneRecipe</h2><pre>{html.escape(json.dumps(recipe, ensure_ascii=False, indent=2))}</pre></div>
<div class="card"><h2>Prompt</h2><pre>{html.escape(PROMPT)}</pre><p>prompt_id={html.escape(prompt_id)}</p></div>
</body></html>"""
    review.write_text(document, encoding="utf-8")
    return review


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", required=True)
    parser.add_argument("--site-id", default="drift-curio")
    parser.add_argument("--sku", default="DC-ZY-SZ-31001")
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
            raise RuntimeError("QA01_MUST_REMAIN_DISABLED_DURING_KONTEXT_D1_EVAL")
        registry = d0.read_json(repo / "config" / "workflows" / "registry.json")
        qa01 = next((row for row in registry.get("workflows", []) if row.get("code") == "QA01"), None)
        if not qa01 or qa01.get("executable") is not False or qa01.get("workflow_status") != "NOT_REGISTERED":
            raise RuntimeError("QA01_REGISTRY_MUST_REMAIN_FAIL_CLOSED")

        evidence = Path(profile["control_root"]) / "evidence" / ("P5_QA01_V2_KONTEXT_D1_" + datetime.now().strftime("%Y%m%d-%H%M%S"))
        evidence.mkdir(parents=True, exist_ok=False)
        manifest = d0.read_json(Path(profile["manifest_root"]) / f"{args.sku}.json")
        if manifest.get("sku") not in (None, "", args.sku):
            raise RuntimeError("MANIFEST_SKU_MISMATCH")
        sc01_entry = d0.latest_verified(manifest, "SC01", "cutout")
        sc01_path = d0.validate_archive_entry(profile, sc01_entry, "VERIFIED_SC01")
        source_copy = evidence / "source_sc01.png"
        shutil.copy2(sc01_path, source_copy)
        source_sha = d0.sha256_file(source_copy)
        if source_sha != str(sc01_entry["sha256"]).lower():
            raise RuntimeError("SC01_EVIDENCE_COPY_SHA256_MISMATCH")

        reference = evidence / "eval_input_white.png"
        d0.make_white_reference(source_copy, reference)
        scaffold = evidence / "eval_input_scaffold.png"
        shape = make_scaffold(source_copy, scaffold)
        recipe = {
            "schema_version": "0.2-eval-d1",
            "site_id": args.site_id,
            "sku": args.sku,
            "realm": "QA01_AQUARIUM",
            "source_sc01_sha256": source_sha,
            "shape_metrics": shape,
            "observed_structure": {
                "dominant_mass": "central-left sculptural root body with a lower central bulb and dark underside",
                "branch_flow": "two upper crowns, one thin central upright prong, multiple rightward forks, longest low-right branch",
                "negative_space": "large central-left cavity plus smaller open windows between the right-side forks",
                "support_strategy": "cluster support under the central/lower mass while keeping the longest low-right branch visually free",
            },
            "composition_grammar": "asymmetric riverbank hardscape: planted mass left-center, branch flow opening right, protected negative-space channels",
            "planting": "restrained Anubias/Bucephalandra/Java fern with limited moss only at plausible attachment pockets; no blanket moss",
            "hardscape": "irregular clustered dark river stones partly buried at real support points; fine natural sand; no isolated decorative pebble staging",
            "camera": "front-glass aquarium photograph, product-readable, same orientation and proportions as SC01",
            "identity_core": "exact silhouette, crowns, prong, major branch forks, holes, proportions and recognizable texture",
            "integration_band": "water response, contact shadow, small attachment pockets and shared light only; geometry remains protected",
            "generation_strategy": {
                "reference": "exact SC01 white-backed Kontext reference latent",
                "starter": "deterministic aquarium scaffold containing exact SC01 pixels",
                "sampler_denoise": DENOISE,
                "no_prefab_final_background": True,
            },
        }
        (evidence / "scene_recipe.json").write_text(json.dumps(recipe, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        (evidence / "prompt.txt").write_text(PROMPT + "\n", encoding="utf-8")

        for label, spec in d0.MODELS.items():
            d0.exact_model_identity(label, spec)
        stats, started_by_gate = d0.wait_ready(evidence)
        required_nodes = [
            "UNETLoader", "DualCLIPLoader", "VAELoader", "LoadImage", "FluxKontextImageScale",
            "VAEEncode", "CLIPTextEncode", "ReferenceLatent", "FluxGuidance",
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
            raise RuntimeError("KONTEXT_REQUIRED_NODES_MISSING:" + ",".join(missing))

        if d0.MODELS["kontext"]["name"] not in d0.combo_options(infos["UNETLoader"], "required", "unet_name"):
            raise RuntimeError("KONTEXT_MODEL_NOT_VISIBLE_TO_UNETLOADER")
        clip1 = d0.combo_options(infos["DualCLIPLoader"], "required", "clip_name1")
        clip2 = d0.combo_options(infos["DualCLIPLoader"], "required", "clip_name2")
        if d0.MODELS["clip_l"]["name"] not in clip1 and d0.MODELS["clip_l"]["name"] not in clip2:
            raise RuntimeError("CLIP_L_NOT_VISIBLE_TO_DUALCLIPLOADER")
        if d0.MODELS["t5_fp8"]["name"] not in clip1 and d0.MODELS["t5_fp8"]["name"] not in clip2:
            raise RuntimeError("T5_FP8_NOT_VISIBLE_TO_DUALCLIPLOADER")
        if d0.MODELS["vae"]["name"] not in d0.combo_options(infos["VAELoader"], "required", "vae_name"):
            raise RuntimeError("AE_VAE_NOT_VISIBLE_TO_VAELOADER")

        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        ref_name = f"p5_qa01_kontext_d1_ref_{args.sku}_{stamp}.png"
        scaffold_name = f"p5_qa01_kontext_d1_scaffold_{args.sku}_{stamp}.png"
        copied_ref, visible_ref = copy_input(reference, profile, ref_name)
        copied_scaffold, visible_scaffold = copy_input(scaffold, profile, scaffold_name)
        workflow = build_workflow(visible_ref, visible_scaffold, infos)
        (evidence / "workflow_api.json").write_text(json.dumps(workflow, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

        client_id = "p5-qa01-kontext-d1-" + datetime.now().strftime("%Y%m%d%H%M%S")
        response = d0.post_json("/prompt", {"prompt": workflow, "client_id": client_id}, 180)
        prompt_id = str(response.get("prompt_id", ""))
        if not prompt_id:
            raise RuntimeError("KONTEXT_PROMPT_ID_MISSING")
        (evidence / "prompt_id.txt").write_text(prompt_id + "\n", encoding="utf-8")
        image_info = d0.wait_image(prompt_id)
        candidate = evidence / "candidate.png"
        d0.download_comfy_image(image_info, candidate)
        review = write_review(evidence, recipe, prompt_id)

        report = {
            "schema_version": "0.2-eval-d1",
            "at": datetime.now().astimezone().isoformat(),
            "git_head": head,
            "site_id": args.site_id,
            "sku": args.sku,
            "evaluation_only": True,
            "production_authorized": False,
            "qa01_enabled": False,
            "d0_visual_result": "FAIL",
            "model_set_identity_pass": True,
            "comfy_started_by_gate": started_by_gate,
            "seed": SEED,
            "steps": STEPS,
            "guidance": GUIDANCE,
            "denoise": DENOISE,
            "prompt_id": prompt_id,
            "source_sc01_sha256": source_sha,
            "candidate_sha256": d0.sha256_file(candidate),
            "copied_input_paths": copied_ref + copied_scaffold,
            "review_file": str(review),
            "evidence_dir": str(evidence),
            "devices": stats.get("devices", []),
        }
        (evidence / "result.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        summary = [
            "P5_QA01_V2_KONTEXT_D1_EVAL_GATE=PASS",
            f"git_head={head}",
            f"sku={args.sku}",
            "d0_visual_result=FAIL",
            "evaluation_only=True",
            "production_authorized=False",
            "qa01_enabled=False",
            "model_set_identity_pass=True",
            f"comfy_started_by_gate={started_by_gate}",
            f"seed={SEED}",
            f"steps={STEPS}",
            f"guidance={GUIDANCE}",
            f"denoise={DENOISE}",
            f"prompt_id={prompt_id}",
            f"source_sc01_sha256={source_sha}",
            f"candidate_sha256={report['candidate_sha256']}",
            f"review_file={review}",
            f"evidence_dir={evidence}",
        ]
        (evidence / "summary.txt").write_text("\n".join(summary) + "\n", encoding="utf-8")
        print("\n".join(summary), flush=True)
        if d0.os.name == "nt":
            try:
                d0.os.startfile(review)  # type: ignore[attr-defined]
            except Exception:
                pass
        return 0
    except Exception as exc:
        print("P5_QA01_V2_KONTEXT_D1_EVAL_GATE=FAIL", flush=True)
        print(f"error={exc}", flush=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
