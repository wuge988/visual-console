from __future__ import annotations

import argparse
import html
import json
from datetime import datetime
from pathlib import Path
import shutil

from PIL import Image, ImageChops, ImageFilter

import p5_qa01_kontext_d0_eval as d0

SEED = 52073121
STEPS = 28
GUIDANCE = 2.4
DENOISE = 1.0
GROW_MASK_BY = 4
EDGE_ERODE_PX = 1
CONTACT_ERODE_PX = 9
CONTACT_START_RATIO = 0.66
MIN_CORE_COVERAGE = 0.72

PROMPT = (
    "Use the exact photographed driftwood reference as the protected structural centerpiece of one highly photorealistic mature freshwater planted aquarium. "
    "The wood identity is locked: do not invent, remove, duplicate, shorten, thicken, bend or relocate any major branch, crown, cavity, hole or silhouette landmark. "
    "Generate the aquarium around the existing wood instead of redesigning it. Create a believable natural support system beneath the central and lower wood mass using an irregular cluster of dark river stones partly buried in fine natural sand, with some stones and low plants naturally occluding only the lowest contact edges. "
    "Use the large central-left cavity and right-side branch windows as open swim-through negative spaces. Keep the longest low-right branch visually open. "
    "Plant specifically to this branch flow: restrained Bucephalandra, Anubias nana petite and small Java fern near sheltered attachment pockets and the base, limited natural moss only at edge/contact areas, then layered low foreground plants and deeper background stems that create real front-mid-back depth without hiding the wood. "
    "Make this read as a real established aquarium photographed through clean front glass: realistic water depth and attenuation, subtle glass reflections, fine sand grain, physically embedded stones, coherent wet submerged wood response, soft shared neutral aquarium light, restrained caustics, natural shadows, believable plant scale and mild optical softness through water. "
    "Avoid a smooth teal studio gradient, flat beige floor, isolated decorative pebbles, product pedestal staging, fantasy CGI, excessive saturation, dramatic light rays, fake bokeh, floating wood, extra driftwood, impossible glass, text, logos and watermarks."
)


def binary_subject_mask(alpha: Image.Image) -> Image.Image:
    return alpha.point(lambda value: 255 if value >= 16 else 0, mode="L")


def erode(mask: Image.Image, radius: int) -> Image.Image:
    if radius <= 0:
        return mask.copy()
    size = radius * 2 + 1
    return mask.filter(ImageFilter.MinFilter(size=size))


def make_masks_and_input(sc01_path: Path, evidence: Path) -> dict:
    with Image.open(sc01_path) as raw:
        subject = raw.convert("RGBA")
    alpha = subject.getchannel("A")
    bbox = alpha.getbbox()
    if bbox is None:
        raise RuntimeError("SC01_ALPHA_EMPTY")

    subject_mask = binary_subject_mask(alpha)
    upper_core = erode(subject_mask, EDGE_ERODE_PX)
    lower_core = erode(subject_mask, CONTACT_ERODE_PX)
    contact_y = int(round(bbox[1] + (bbox[3] - bbox[1]) * CONTACT_START_RATIO))

    core = Image.new("L", subject.size, 0)
    core.paste(upper_core.crop((0, 0, subject.width, contact_y)), (0, 0))
    core.paste(lower_core.crop((0, contact_y, subject.width, subject.height)), (0, contact_y))

    subject_pixels = sum(1 for value in subject_mask.getdata() if value > 0)
    core_pixels = sum(1 for value in core.getdata() if value > 0)
    if subject_pixels <= 0:
        raise RuntimeError("SC01_SUBJECT_MASK_EMPTY")
    core_coverage = core_pixels / float(subject_pixels)
    if core_coverage < MIN_CORE_COVERAGE:
        raise RuntimeError(f"D2_IDENTITY_CORE_TOO_SMALL:coverage={core_coverage:.6f}")

    integration = ImageChops.subtract(subject_mask, core)
    generation_mask = ImageChops.invert(core)

    core.save(evidence / "identity_core.png", format="PNG", optimize=False)
    integration.save(evidence / "integration_band.png", format="PNG", optimize=False)
    generation_mask.save(evidence / "generation_mask.png", format="PNG", optimize=False)

    width, height = subject.size
    base = Image.new("RGBA", subject.size, (42, 52, 50, 0))
    # LoadImage returns mask = 1 - alpha. Therefore alpha=255 on protected core
    # and alpha=0 elsewhere yields exactly the D2 generation mask.
    protected_rgba = Image.new("RGBA", subject.size, (0, 0, 0, 0))
    protected_rgba.paste(subject, (0, 0), core)
    base.alpha_composite(protected_rgba)
    base.putalpha(core)
    masked_input = evidence / "eval_input_masked.png"
    base.save(masked_input, format="PNG", optimize=False)

    return {
        "width": width,
        "height": height,
        "alpha_bbox": list(bbox),
        "subject_pixels": subject_pixels,
        "protected_core_pixels": core_pixels,
        "protected_core_coverage": core_coverage,
        "editable_subject_band_ratio": 1.0 - core_coverage,
        "edge_erode_px": EDGE_ERODE_PX,
        "contact_erode_px": CONTACT_ERODE_PX,
        "contact_start_ratio": CONTACT_START_RATIO,
        "grow_mask_by": GROW_MASK_BY,
        "loadimage_mask_semantics": "mask = 1 - input alpha; alpha is protected-core mask",
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
            raise RuntimeError(f"D2_EVAL_INPUT_COPY_SHA_MISMATCH:{target}")
        copied.append(str(target))
    info = d0.node_info("LoadImage")
    if info is None:
        raise RuntimeError("LOADIMAGE_NODE_UNAVAILABLE_AFTER_D2_INPUT_COPY")
    return copied, d0.choose_visible_input(filename, info)


def build_workflow(reference_input: str, masked_input: str, infos: dict) -> dict:
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
        "14": {"class_type": "LoadImage", "inputs": {"image": masked_input}},
        "16": {
            "class_type": "VAEEncodeForInpaint",
            "inputs": {
                "pixels": ["14", 0],
                "vae": ["3", 0],
                "mask": ["14", 1],
                "grow_mask_by": GROW_MASK_BY,
            },
        },
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


def reassert_core(source_path: Path, raw_candidate_path: Path, core_path: Path, target: Path) -> dict:
    with Image.open(source_path) as src_raw, Image.open(raw_candidate_path) as cand_raw, Image.open(core_path) as core_raw:
        source = src_raw.convert("RGBA")
        candidate = cand_raw.convert("RGB")
        core = core_raw.convert("L")

    if candidate.size != source.size:
        raise RuntimeError(f"D2_CANDIDATE_DIMENSION_MISMATCH:source={source.size}:candidate={candidate.size}")
    if core.size != source.size:
        raise RuntimeError("D2_CORE_DIMENSION_MISMATCH")

    source_rgb = source.convert("RGB")
    final = Image.composite(source_rgb, candidate, core)
    final.save(target, format="PNG", optimize=False)

    difference = ImageChops.difference(final, source_rgb)
    protected_diff = Image.new("RGB", final.size, (0, 0, 0))
    protected_diff.paste(difference, (0, 0), core)
    if protected_diff.getbbox() is not None:
        raise RuntimeError("D2_PROTECTED_CORE_REASSERTION_MISMATCH")

    return {
        "final_width": final.width,
        "final_height": final.height,
        "protected_core_exact_pixel_reassertion": True,
        "raw_candidate_sha256": d0.sha256_file(raw_candidate_path),
        "final_candidate_sha256": d0.sha256_file(target),
    }


def write_review(evidence: Path, recipe: dict, prompt_id: str) -> Path:
    review = evidence / "review.html"
    document = f"""<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>P5 QA01 Kontext D2 Review</title>
<style>body{{font-family:Arial,sans-serif;background:#11161b;color:#eee;margin:24px}}h1{{font-size:24px}}.grid{{display:grid;grid-template-columns:1fr 1fr;gap:18px}}.card{{background:#1b2229;padding:14px;border:1px solid #333;border-radius:10px;margin-bottom:18px}}img{{width:100%;height:auto;background:white}}pre{{white-space:pre-wrap;color:#d7d7d7}}.warn{{color:#ffcc80}}.note{{color:#9cc7ff}}</style></head>
<body><h1>P5 QA01 v2 — Kontext D2 Masked Identity-Core 真实感评估</h1>
<p class="warn">EVALUATION ONLY / NON-PRODUCTION / QA01 DISABLED</p>
<div class="grid"><div class="card"><h2>VERIFIED SC01 reference</h2><img src="source_sc01.png"></div><div class="card"><h2>D2 final candidate — protected core reasserted</h2><img src="candidate.png"></div></div>
<div class="grid"><div class="card"><h2>D2 raw masked generation</h2><img src="candidate_raw.png"></div><div class="card"><h2>Generation mask</h2><img src="generation_mask.png"></div></div>
<div class="grid"><div class="card"><h2>Identity Core</h2><img src="identity_core.png"></div><div class="card"><h2>Integration Band</h2><img src="integration_band.png"></div></div>
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
            raise RuntimeError("QA01_MUST_REMAIN_DISABLED_DURING_KONTEXT_D2_EVAL")
        registry = d0.read_json(repo / "config" / "workflows" / "registry.json")
        qa01 = next((row for row in registry.get("workflows", []) if row.get("code") == "QA01"), None)
        if not qa01 or qa01.get("executable") is not False or qa01.get("workflow_status") != "NOT_REGISTERED":
            raise RuntimeError("QA01_REGISTRY_MUST_REMAIN_FAIL_CLOSED")

        evidence = Path(profile["control_root"]) / "evidence" / ("P5_QA01_V2_KONTEXT_D2_" + datetime.now().strftime("%Y%m%d-%H%M%S"))
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
        mask_metrics = make_masks_and_input(source_copy, evidence)
        recipe = {
            "schema_version": "0.3-eval-d2",
            "site_id": args.site_id,
            "sku": args.sku,
            "realm": "QA01_AQUARIUM",
            "source_sc01_sha256": source_sha,
            "d1_visual_result": "FAIL",
            "architecture": "masked environment generation plus deterministic protected-core reassertion",
            "mask_metrics": mask_metrics,
            "observed_structure": {
                "dominant_mass": "central-left sculptural root body with lower central bulb and dark underside",
                "branch_flow": "two upper crowns, one thin central upright prong, multiple rightward forks, longest low-right branch",
                "negative_space": "large central-left cavity plus smaller open windows between right-side forks",
                "support_strategy": "irregular buried stone cluster under central/lower mass; lower contact band is selectively editable",
            },
            "composition_grammar": "asymmetric mature Nature Aquarium; planted mass left-center with branch flow opening right",
            "identity_core": "deterministically preserved exact SC01 pixels inside protected core",
            "integration_band": "narrow subject-edge band plus wider lower contact band editable for wetness, substrate, stone and plant overlap",
            "generation_region": "all background plus integration band; core excluded by VAE inpaint noise mask",
            "finalization": "exact protected SC01 core copied back after generation; no production mutation",
        }
        (evidence / "scene_recipe.json").write_text(json.dumps(recipe, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        (evidence / "prompt.txt").write_text(PROMPT + "\n", encoding="utf-8")

        for label, spec in d0.MODELS.items():
            d0.exact_model_identity(label, spec)
        _, started_by_gate = d0.wait_ready(evidence)
        required_nodes = [
            "UNETLoader", "DualCLIPLoader", "VAELoader", "LoadImage", "FluxKontextImageScale",
            "VAEEncode", "VAEEncodeForInpaint", "CLIPTextEncode", "ReferenceLatent", "FluxGuidance",
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
            raise RuntimeError("D2_REQUIRED_NODES_MISSING:" + ",".join(missing))

        if d0.MODELS["kontext"]["name"] not in d0.combo_options(infos["UNETLoader"], "required", "unet_name"):
            raise RuntimeError("KONTEXT_MODEL_NOT_VISIBLE_TO_UNETLOADER")
        if d0.MODELS["vae"]["name"] not in d0.combo_options(infos["VAELoader"], "required", "vae_name"):
            raise RuntimeError("AE_VAE_NOT_VISIBLE_TO_VAELOADER")

        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        _, visible_reference = copy_input(reference, profile, f"p5_qa01_kontext_d2_ref_{args.sku}_{stamp}.png")
        _, visible_masked = copy_input(evidence / "eval_input_masked.png", profile, f"p5_qa01_kontext_d2_masked_{args.sku}_{stamp}.png")
        workflow = build_workflow(visible_reference, visible_masked, infos)
        (evidence / "workflow_api.json").write_text(json.dumps(workflow, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

        client_id = "p5-qa01-kontext-d2-" + datetime.now().strftime("%Y%m%d%H%M%S")
        response = d0.post_json("/prompt", {"prompt": workflow, "client_id": client_id}, 180)
        prompt_id = str(response.get("prompt_id", ""))
        if not prompt_id:
            raise RuntimeError("D2_PROMPT_ID_MISSING")
        (evidence / "prompt_id.txt").write_text(prompt_id + "\n", encoding="utf-8")

        image_info = d0.wait_image(prompt_id, 3000)
        raw_candidate = evidence / "candidate_raw.png"
        d0.download_comfy_image(image_info, raw_candidate)
        final_candidate = evidence / "candidate.png"
        final_metrics = reassert_core(source_copy, raw_candidate, evidence / "identity_core.png", final_candidate)
        recipe["final_metrics"] = final_metrics
        (evidence / "scene_recipe.json").write_text(json.dumps(recipe, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        review = write_review(evidence, recipe, prompt_id)

        print("P5_QA01_V2_KONTEXT_D2_EVAL_GATE=PASS")
        print(f"git_head={head}")
        print(f"sku={args.sku}")
        print("d1_visual_result=FAIL")
        print("evaluation_only=True")
        print("production_authorized=False")
        print("qa01_enabled=False")
        print("mask_runtime=VAEEncodeForInpaint")
        print(f"protected_core_coverage={mask_metrics['protected_core_coverage']:.6f}")
        print("protected_core_exact_pixel_reassertion=True")
        print(f"comfy_started_by_gate={started_by_gate}")
        print(f"seed={SEED}")
        print(f"steps={STEPS}")
        print(f"guidance={GUIDANCE}")
        print(f"denoise={DENOISE}")
        print(f"prompt_id={prompt_id}")
        print(f"source_sc01_sha256={source_sha}")
        print(f"raw_candidate_sha256={final_metrics['raw_candidate_sha256']}")
        print(f"candidate_sha256={final_metrics['final_candidate_sha256']}")
        print(f"review_file={review}")
        print(f"evidence_dir={evidence}")
        return 0
    except Exception as exc:
        print("P5_QA01_V2_KONTEXT_D2_EVAL_GATE=FAIL")
        print(f"error={exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
