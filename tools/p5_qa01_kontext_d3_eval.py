from __future__ import annotations

import argparse
import html
import json
import random
from datetime import datetime
from pathlib import Path
import shutil

from PIL import Image, ImageChops, ImageDraw, ImageFilter

import p5_qa01_kontext_d0_eval as d0
import p5_qa01_kontext_d2_eval as d2

STAGE1_SEED = 52073131
STAGE1_STEPS = 30
STAGE1_GUIDANCE = 2.6
STAGE1_DENOISE = 1.0
STAGE2_SEED = 52073132
STAGE2_STEPS = 18
STAGE2_GUIDANCE = 2.0
STAGE2_DENOISE = 0.72
GROW_MASK_BY = 4
UPPER_CORE_ERODE_PX = 2
LOWER_CORE_ERODE_PX = 11
CONTACT_START_RATIO = 0.64
MIN_CORE_COVERAGE = 0.78
ANCHOR_DILATE_PX = 18

STAGE1_PROMPT = (
    "Build one highly photorealistic mature freshwater planted aquarium around the exact photographed driftwood reference. "
    "The wood is the fixed physical hardscape and must keep its exact major silhouette, two upper crowns, thin central upright prong, central-left cavity, rightward branch forks, longest low-right branch, orientation, proportions and recognizable surface grain. "
    "This specific piece is a heavy stump with rightward branch flow and central negative space: place the visual mass left-center and let the branch flow open naturally to the right. "
    "Create a real aquarium environment rather than a product-studio background: use a dark neutral planted rear depth with visible but restrained layered stems and fern-like forms, not a smooth blue or teal gradient. "
    "Shape fine natural sand into subtle terrain and build one coherent asymmetric support cluster of irregular dark river or basalt stones beneath the central and lower wood mass; stones must be partly buried and grouped structurally, never isolated decorative pebbles. "
    "Keep the main central cavity and branch windows open as swim-through negative space and keep the longest low-right branch visually open. "
    "Plant to the branch flow with restrained Bucephalandra, Anubias nana petite, small Java fern and limited moss only at plausible sheltered pockets, plus believable foreground, midground and background layers without hiding the wood. "
    "Make the image read as a real established aquarium photographed through clean front glass with water-column depth, subtle glass reflections, realistic sand grain, coherent submerged wet-wood response, physically embedded stones, natural contact shadows, restrained neutral aquarium lighting and mild optical softness through water. "
    "Avoid smooth teal studio gradients, flat beige floors, isolated round pebbles, pedestal staging, fantasy CGI, oversaturation, dramatic light rays, fake bokeh, floating wood, extra driftwood, impossible glass, text, logos and watermarks."
)

STAGE2_PROMPT = (
    "Refine only the local physical integration of the exact driftwood inside the already established aquarium scene. "
    "Do not redesign the aquarium composition and do not alter any major wood branch, crown, cavity, hole, silhouette landmark or overall orientation. "
    "At the lower contact and selected anchor zones, make the support stones feel partly buried and load-bearing, let fine sand naturally meet and slightly overlap the lowest wood edges, add restrained tiny plant attachment pockets where physically plausible, and create coherent local wetness and contact shadows. "
    "Preserve the existing foreground-midground-background planting, water depth and front-glass cues from Stage 1. "
    "Do not add isolated decorative pebbles, blanket moss, new large plants, extra wood, dramatic lighting, fantasy CGI, fake bokeh, text, logos or watermarks."
)


def dilate(mask: Image.Image, radius: int) -> Image.Image:
    if radius <= 0:
        return mask.copy()
    return mask.filter(ImageFilter.MaxFilter(size=radius * 2 + 1))


def count_nonzero(mask: Image.Image) -> int:
    return sum(1 for value in mask.getdata() if value > 0)


def make_d3_masks_and_stage1_input(sc01_path: Path, evidence: Path) -> dict:
    with Image.open(sc01_path) as raw:
        subject = raw.convert("RGBA")
    alpha = subject.getchannel("A")
    bbox = alpha.getbbox()
    if bbox is None:
        raise RuntimeError("SC01_ALPHA_EMPTY")

    subject_mask = d2.binary_subject_mask(alpha)
    upper_core = d2.erode(subject_mask, UPPER_CORE_ERODE_PX)
    lower_core = d2.erode(subject_mask, LOWER_CORE_ERODE_PX)
    contact_y = int(round(bbox[1] + (bbox[3] - bbox[1]) * CONTACT_START_RATIO))

    core = Image.new("L", subject.size, 0)
    core.paste(upper_core.crop((0, 0, subject.width, contact_y)), (0, 0))
    core.paste(lower_core.crop((0, contact_y, subject.width, subject.height)), (0, contact_y))

    subject_pixels = count_nonzero(subject_mask)
    core_pixels = count_nonzero(core)
    if subject_pixels <= 0:
        raise RuntimeError("SC01_SUBJECT_MASK_EMPTY")
    core_coverage = core_pixels / float(subject_pixels)
    if core_coverage < MIN_CORE_COVERAGE:
        raise RuntimeError(f"D3_IDENTITY_CORE_TOO_SMALL:coverage={core_coverage:.6f}")

    upper_fine_band = ImageChops.subtract(subject_mask, d2.erode(subject_mask, UPPER_CORE_ERODE_PX))
    lower_contact_band = Image.new("L", subject.size, 0)
    lower_contact_band.paste(
        ImageChops.subtract(subject_mask, lower_core).crop((0, contact_y, subject.width, subject.height)),
        (0, contact_y),
    )

    local_anchor_zones = Image.new("L", subject.size, 0)
    draw = ImageDraw.Draw(local_anchor_zones)
    left, top, right, bottom = bbox
    bw = right - left
    bh = bottom - top

    anchors = [
        (0.28, 0.79, 0.13, 0.11),
        (0.48, 0.84, 0.15, 0.12),
        (0.67, 0.81, 0.14, 0.11),
        (0.39, 0.48, 0.08, 0.07),
        (0.55, 0.55, 0.08, 0.07),
    ]
    for rx, ry, rw, rh in anchors:
        cx = left + int(round(bw * rx))
        cy = top + int(round(bh * ry))
        half_w = max(10, int(round(bw * rw / 2.0)))
        half_h = max(8, int(round(bh * rh / 2.0)))
        draw.ellipse((cx - half_w, cy - half_h, cx + half_w, cy + half_h), fill=255)

    contact_context = dilate(lower_contact_band, ANCHOR_DILATE_PX)
    stage2_editable_mask = ImageChops.lighter(local_anchor_zones, contact_context)
    stage1_generation_mask = ImageChops.invert(core)
    integration_band = ImageChops.subtract(subject_mask, core)

    core.save(evidence / "protected_core.png", format="PNG", optimize=False)
    upper_fine_band.save(evidence / "upper_fine_band.png", format="PNG", optimize=False)
    lower_contact_band.save(evidence / "lower_contact_band.png", format="PNG", optimize=False)
    local_anchor_zones.save(evidence / "local_anchor_zones.png", format="PNG", optimize=False)
    integration_band.save(evidence / "integration_band.png", format="PNG", optimize=False)
    stage1_generation_mask.save(evidence / "stage1_generation_mask.png", format="PNG", optimize=False)
    stage2_editable_mask.save(evidence / "stage2_editable_mask.png", format="PNG", optimize=False)

    scaffold_rgb = make_environment_scaffold(subject.size, bbox)
    scaffold_rgba = scaffold_rgb.convert("RGBA")
    exact_core = Image.new("RGBA", subject.size, (0, 0, 0, 0))
    exact_core.paste(subject, (0, 0), core)
    scaffold_rgba.alpha_composite(exact_core)
    # ComfyUI LoadImage exposes mask = 1 - alpha. Preserve the exact core and
    # make every non-core pixel editable while retaining scaffold RGB as latent guidance.
    scaffold_rgba.putalpha(core)
    stage1_input = evidence / "stage1_input_masked.png"
    scaffold_rgba.save(stage1_input, format="PNG", optimize=False)
    scaffold_rgb.save(evidence / "stage1_scaffold_preview.png", format="PNG", optimize=False)

    return {
        "width": subject.width,
        "height": subject.height,
        "alpha_bbox": list(bbox),
        "subject_pixels": subject_pixels,
        "protected_core_pixels": core_pixels,
        "protected_core_coverage": core_coverage,
        "editable_subject_band_ratio": 1.0 - core_coverage,
        "upper_core_erode_px": UPPER_CORE_ERODE_PX,
        "lower_core_erode_px": LOWER_CORE_ERODE_PX,
        "contact_start_ratio": CONTACT_START_RATIO,
        "anchor_dilate_px": ANCHOR_DILATE_PX,
        "stage2_editable_pixels": count_nonzero(stage2_editable_mask),
        "loadimage_mask_semantics": "mask = 1 - input alpha",
    }


def make_environment_scaffold(size: tuple[int, int], bbox: tuple[int, int, int, int]) -> Image.Image:
    width, height = size
    image = Image.new("RGB", size, (35, 43, 39))
    pixels = image.load()
    horizon = int(round(height * 0.73))

    for y in range(height):
        if y < horizon:
            t = y / max(1, horizon - 1)
            top = (48, 60, 54)
            bottom = (29, 39, 34)
            color = tuple(int(round(top[i] * (1 - t) + bottom[i] * t)) for i in range(3))
        else:
            t = (y - horizon) / max(1, height - horizon - 1)
            top = (145, 133, 108)
            bottom = (113, 101, 82)
            color = tuple(int(round(top[i] * (1 - t) + bottom[i] * t)) for i in range(3))
        for x in range(width):
            pixels[x, y] = color

    draw = ImageDraw.Draw(image, "RGB")
    rng = random.Random(52073130)
    left, top, right, bottom = bbox
    bw = right - left
    bh = bottom - top

    # Background plant masses, deliberately asymmetric and dark/neutral rather than teal.
    for side in ("left", "rear"):
        count = 22 if side == "left" else 16
        for _ in range(count):
            if side == "left":
                x = rng.randint(max(0, left - int(bw * 0.18)), min(width - 1, left + int(bw * 0.28)))
            else:
                x = rng.randint(max(0, left + int(bw * 0.48)), min(width - 1, right))
            base_y = rng.randint(int(height * 0.58), int(height * 0.77))
            stem_h = rng.randint(int(height * 0.10), int(height * 0.31))
            tone = rng.choice([(47, 74, 47), (54, 82, 51), (40, 68, 43), (62, 86, 55)])
            draw.line((x, base_y, x + rng.randint(-18, 18), max(4, base_y - stem_h)), fill=tone, width=rng.randint(3, 7))
            for n in range(3):
                yy = base_y - int(stem_h * (n + 1) / 4)
                xx = x + rng.randint(-18, 18)
                r = rng.randint(5, 12)
                draw.ellipse((xx - r, yy - r // 2, xx + r, yy + r // 2), fill=tone)

    # One coherent support-stone cluster under the central/lower mass.
    stone_specs = [
        (0.35, 0.82, 0.17, 0.10, (61, 62, 57)),
        (0.47, 0.86, 0.19, 0.11, (53, 55, 52)),
        (0.59, 0.83, 0.16, 0.10, (67, 66, 59)),
        (0.42, 0.78, 0.11, 0.08, (73, 71, 63)),
    ]
    for rx, ry, rw, rh, tone in stone_specs:
        cx = left + int(round(bw * rx))
        cy = top + int(round(bh * ry))
        half_w = int(round(bw * rw / 2.0))
        half_h = int(round(bh * rh / 2.0))
        draw.ellipse((cx - half_w, cy - half_h, cx + half_w, cy + half_h), fill=tone)

    # Fine deterministic substrate grain: enough structure to guide the latent without becoming a final texture.
    for _ in range(max(1200, width * height // 420)):
        x = rng.randrange(width)
        y = rng.randrange(horizon, height)
        base = rng.randint(95, 165)
        tone = (base, max(70, base - rng.randint(8, 24)), max(55, base - rng.randint(20, 42)))
        draw.point((x, y), fill=tone)

    return image


def make_stage2_input(stage1_final: Path, editable_mask_path: Path, target: Path) -> None:
    with Image.open(stage1_final) as raw, Image.open(editable_mask_path) as mask_raw:
        rgb = raw.convert("RGB")
        editable = mask_raw.convert("L")
    if rgb.size != editable.size:
        raise RuntimeError("D3_STAGE2_MASK_DIMENSION_MISMATCH")
    rgba = rgb.convert("RGBA")
    rgba.putalpha(ImageChops.invert(editable))
    rgba.save(target, format="PNG", optimize=False)


def build_workflow(reference_input: str, masked_input: str, infos: dict, *, prompt: str, seed: int, steps: int, guidance: float, denoise: float) -> dict:
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
        "7": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt, "clip": ["2", 0]}},
        "8": {"class_type": "ReferenceLatent", "inputs": {"conditioning": ["7", 0], "latent": ["6", 0]}},
        "9": {"class_type": "FluxGuidance", "inputs": {"conditioning": ["8", 0], "guidance": guidance}},
        "10": {"class_type": "ConditioningZeroOut", "inputs": {"conditioning": ["7", 0]}},
        "14": {"class_type": "LoadImage", "inputs": {"image": masked_input}},
        "16": {
            "class_type": "VAEEncodeForInpaint",
            "inputs": {"pixels": ["14", 0], "vae": ["3", 0], "mask": ["14", 1], "grow_mask_by": GROW_MASK_BY},
        },
        "11": {
            "class_type": "KSampler",
            "inputs": {
                "seed": seed,
                "steps": steps,
                "cfg": 1.0,
                "sampler_name": "euler",
                "scheduler": "simple",
                "denoise": denoise,
                "model": ["1", 0],
                "positive": ["9", 0],
                "negative": ["10", 0],
                "latent_image": ["16", 0],
            },
        },
        "12": {"class_type": "VAEDecode", "inputs": {"samples": ["11", 0], "vae": ["3", 0]}},
        "13": {"class_type": "PreviewImage", "inputs": {"images": ["12", 0]}},
    }


def reassert_core(source_path: Path, raw_candidate_path: Path, core_path: Path, target: Path, stage: str) -> dict:
    with Image.open(source_path) as src_raw, Image.open(raw_candidate_path) as cand_raw, Image.open(core_path) as core_raw:
        source = src_raw.convert("RGBA")
        candidate = cand_raw.convert("RGB")
        core = core_raw.convert("L")
    if candidate.size != source.size:
        raise RuntimeError(f"D3_{stage}_CANDIDATE_DIMENSION_MISMATCH:source={source.size}:candidate={candidate.size}")
    if core.size != source.size:
        raise RuntimeError(f"D3_{stage}_CORE_DIMENSION_MISMATCH")

    source_rgb = source.convert("RGB")
    final = Image.composite(source_rgb, candidate, core)
    final.save(target, format="PNG", optimize=False)

    difference = ImageChops.difference(final, source_rgb)
    protected_diff = Image.new("RGB", final.size, (0, 0, 0))
    protected_diff.paste(difference, (0, 0), core)
    if protected_diff.getbbox() is not None:
        raise RuntimeError(f"D3_{stage}_PROTECTED_CORE_REASSERTION_MISMATCH")
    return {
        "protected_core_exact_pixel_reassertion": True,
        "raw_sha256": d0.sha256_file(raw_candidate_path),
        "final_sha256": d0.sha256_file(target),
    }


def run_stage(evidence: Path, stage: str, workflow: dict, timeout_seconds: int = 3000) -> tuple[str, Path]:
    (evidence / f"workflow_{stage}.json").write_text(json.dumps(workflow, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    client_id = f"p5-qa01-kontext-d3-{stage}-" + datetime.now().strftime("%Y%m%d%H%M%S")
    response = d0.post_json("/prompt", {"prompt": workflow, "client_id": client_id}, 180)
    prompt_id = str(response.get("prompt_id", ""))
    if not prompt_id:
        raise RuntimeError(f"D3_{stage.upper()}_PROMPT_ID_MISSING")
    (evidence / f"prompt_id_{stage}.txt").write_text(prompt_id + "\n", encoding="utf-8")
    image_info = d0.wait_image(prompt_id, timeout_seconds)
    raw = evidence / f"candidate_{stage}_raw.png"
    d0.download_comfy_image(image_info, raw)
    return prompt_id, raw


def write_review(evidence: Path, recipe: dict, stage1_prompt_id: str, stage2_prompt_id: str) -> Path:
    review = evidence / "review.html"
    document = f"""<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>P5 QA01 Kontext D3 Review</title>
<style>body{{font-family:Arial,sans-serif;background:#11161b;color:#eee;margin:24px}}h1{{font-size:24px}}.grid{{display:grid;grid-template-columns:1fr 1fr;gap:18px}}.card{{background:#1b2229;padding:14px;border:1px solid #333;border-radius:10px;margin-bottom:18px}}img{{width:100%;height:auto;background:white}}pre{{white-space:pre-wrap;color:#d7d7d7}}.warn{{color:#ffcc80}}.note{{color:#9cc7ff}}</style></head>
<body><h1>P5 QA01 v2 — Kontext D3 Two-Stage Masked 真实感评估</h1>
<p class="warn">EVALUATION ONLY / NON-PRODUCTION / QA01 DISABLED</p>
<div class="grid"><div class="card"><h2>VERIFIED SC01 reference</h2><img src="source_sc01.png"></div><div class="card"><h2>D3 final candidate</h2><img src="candidate.png"></div></div>
<div class="grid"><div class="card"><h2>Stage 1 environment skeleton — core reasserted</h2><img src="candidate_stage1.png"></div><div class="card"><h2>Stage 2 raw local-contact refinement</h2><img src="candidate_stage2_raw.png"></div></div>
<div class="grid"><div class="card"><h2>Stage 1 scaffold preview</h2><img src="stage1_scaffold_preview.png"></div><div class="card"><h2>Protected Core</h2><img src="protected_core.png"></div></div>
<div class="grid"><div class="card"><h2>Upper Fine Band</h2><img src="upper_fine_band.png"></div><div class="card"><h2>Lower Contact Band</h2><img src="lower_contact_band.png"></div></div>
<div class="grid"><div class="card"><h2>Local Anchor Zones</h2><img src="local_anchor_zones.png"></div><div class="card"><h2>Stage 2 Editable Mask</h2><img src="stage2_editable_mask.png"></div></div>
<div class="card"><h2>SceneRecipe</h2><pre>{html.escape(json.dumps(recipe, ensure_ascii=False, indent=2))}</pre></div>
<div class="card"><h2>Stage 1 Prompt</h2><pre>{html.escape(STAGE1_PROMPT)}</pre><p>prompt_id={html.escape(stage1_prompt_id)}</p></div>
<div class="card"><h2>Stage 2 Prompt</h2><pre>{html.escape(STAGE2_PROMPT)}</pre><p>prompt_id={html.escape(stage2_prompt_id)}</p></div>
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
            raise RuntimeError("QA01_MUST_REMAIN_DISABLED_DURING_KONTEXT_D3_EVAL")
        registry = d0.read_json(repo / "config" / "workflows" / "registry.json")
        qa01 = next((row for row in registry.get("workflows", []) if row.get("code") == "QA01"), None)
        if not qa01 or qa01.get("executable") is not False or qa01.get("workflow_status") != "NOT_REGISTERED":
            raise RuntimeError("QA01_REGISTRY_MUST_REMAIN_FAIL_CLOSED")

        evidence = Path(profile["control_root"]) / "evidence" / ("P5_QA01_V2_KONTEXT_D3_" + datetime.now().strftime("%Y%m%d-%H%M%S"))
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
        mask_metrics = make_d3_masks_and_stage1_input(source_copy, evidence)

        recipe = {
            "schema_version": "0.4-eval-d3",
            "site_id": args.site_id,
            "sku": args.sku,
            "realm": "QA01_AQUARIUM",
            "source_sc01_sha256": source_sha,
            "d2_visual_result": "FAIL",
            "architecture": "two-stage masked environment skeleton plus local contact refinement with deterministic protected-core reassertion after each stage",
            "scene_archetype": "Heavy Stump + Rightward Branch Flow + Central Negative Space",
            "mask_metrics": mask_metrics,
            "stage1": {
                "purpose": "generate a non-template mature aquarium environment around the fixed hardscape",
                "seed": STAGE1_SEED,
                "steps": STAGE1_STEPS,
                "guidance": STAGE1_GUIDANCE,
                "denoise": STAGE1_DENOISE,
                "sampler": "euler",
                "scheduler": "simple",
                "scaffold": "deterministic dark-neutral planted depth + subtle sand terrain + one clustered support-stone system; exact SC01 core pixels retained",
            },
            "stage2": {
                "purpose": "refine only bounded lower-contact and local anchor zones",
                "seed": STAGE2_SEED,
                "steps": STAGE2_STEPS,
                "guidance": STAGE2_GUIDANCE,
                "denoise": STAGE2_DENOISE,
                "sampler": "euler",
                "scheduler": "simple",
                "editable_regions": "lower contact band + local anchor zones only",
            },
            "identity_core": "exact VERIFIED SC01 pixels reasserted after Stage 1 and Stage 2",
            "production_mutation": "NONE",
        }
        (evidence / "scene_recipe.json").write_text(json.dumps(recipe, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        (evidence / "prompt_stage1.txt").write_text(STAGE1_PROMPT + "\n", encoding="utf-8")
        (evidence / "prompt_stage2.txt").write_text(STAGE2_PROMPT + "\n", encoding="utf-8")

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
            raise RuntimeError("D3_REQUIRED_NODES_MISSING:" + ",".join(missing))
        if d0.MODELS["kontext"]["name"] not in d0.combo_options(infos["UNETLoader"], "required", "unet_name"):
            raise RuntimeError("KONTEXT_MODEL_NOT_VISIBLE_TO_UNETLOADER")
        if d0.MODELS["vae"]["name"] not in d0.combo_options(infos["VAELoader"], "required", "vae_name"):
            raise RuntimeError("AE_VAE_NOT_VISIBLE_TO_VAELOADER")

        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        _, visible_reference = d2.copy_input(reference, profile, f"p5_qa01_kontext_d3_ref_{args.sku}_{stamp}.png")
        _, visible_stage1 = d2.copy_input(evidence / "stage1_input_masked.png", profile, f"p5_qa01_kontext_d3_stage1_{args.sku}_{stamp}.png")
        stage1_workflow = build_workflow(
            visible_reference,
            visible_stage1,
            infos,
            prompt=STAGE1_PROMPT,
            seed=STAGE1_SEED,
            steps=STAGE1_STEPS,
            guidance=STAGE1_GUIDANCE,
            denoise=STAGE1_DENOISE,
        )
        stage1_prompt_id, stage1_raw = run_stage(evidence, "stage1", stage1_workflow)
        stage1_final = evidence / "candidate_stage1.png"
        stage1_metrics = reassert_core(source_copy, stage1_raw, evidence / "protected_core.png", stage1_final, "STAGE1")

        stage2_input = evidence / "stage2_input_masked.png"
        make_stage2_input(stage1_final, evidence / "stage2_editable_mask.png", stage2_input)
        _, visible_stage2 = d2.copy_input(stage2_input, profile, f"p5_qa01_kontext_d3_stage2_{args.sku}_{stamp}.png")
        stage2_workflow = build_workflow(
            visible_reference,
            visible_stage2,
            infos,
            prompt=STAGE2_PROMPT,
            seed=STAGE2_SEED,
            steps=STAGE2_STEPS,
            guidance=STAGE2_GUIDANCE,
            denoise=STAGE2_DENOISE,
        )
        stage2_prompt_id, stage2_raw = run_stage(evidence, "stage2", stage2_workflow)
        final_candidate = evidence / "candidate.png"
        stage2_metrics = reassert_core(source_copy, stage2_raw, evidence / "protected_core.png", final_candidate, "STAGE2")

        if Image.open(final_candidate).size != Image.open(source_copy).size:
            raise RuntimeError("D3_FINAL_DIMENSION_MISMATCH")

        recipe["final_metrics"] = {
            "protected_core_coverage": mask_metrics["protected_core_coverage"],
            "stage1_protected_core_exact_pixel_reassertion": stage1_metrics["protected_core_exact_pixel_reassertion"],
            "stage2_protected_core_exact_pixel_reassertion": stage2_metrics["protected_core_exact_pixel_reassertion"],
            "stage1_raw_sha256": stage1_metrics["raw_sha256"],
            "stage1_candidate_sha256": stage1_metrics["final_sha256"],
            "stage2_raw_sha256": stage2_metrics["raw_sha256"],
            "final_candidate_sha256": stage2_metrics["final_sha256"],
        }
        (evidence / "scene_recipe.json").write_text(json.dumps(recipe, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        review = write_review(evidence, recipe, stage1_prompt_id, stage2_prompt_id)

        print("P5_QA01_V2_KONTEXT_D3_EVAL_GATE=PASS")
        print(f"git_head={head}")
        print(f"sku={args.sku}")
        print("d2_visual_result=FAIL")
        print("evaluation_only=True")
        print("production_authorized=False")
        print("qa01_enabled=False")
        print("architecture=TWO_STAGE_MASKED_INPAINT")
        print("mask_runtime=VAEEncodeForInpaint")
        print(f"protected_core_coverage={mask_metrics['protected_core_coverage']:.6f}")
        print("stage1_protected_core_exact_pixel_reassertion=True")
        print("stage2_protected_core_exact_pixel_reassertion=True")
        print(f"comfy_started_by_gate={started_by_gate}")
        print(f"stage1_seed={STAGE1_SEED}")
        print(f"stage1_steps={STAGE1_STEPS}")
        print(f"stage1_guidance={STAGE1_GUIDANCE}")
        print(f"stage1_denoise={STAGE1_DENOISE}")
        print(f"stage2_seed={STAGE2_SEED}")
        print(f"stage2_steps={STAGE2_STEPS}")
        print(f"stage2_guidance={STAGE2_GUIDANCE}")
        print(f"stage2_denoise={STAGE2_DENOISE}")
        print(f"stage1_prompt_id={stage1_prompt_id}")
        print(f"stage2_prompt_id={stage2_prompt_id}")
        print(f"source_sc01_sha256={source_sha}")
        print(f"stage1_candidate_sha256={stage1_metrics['final_sha256']}")
        print(f"candidate_sha256={stage2_metrics['final_sha256']}")
        print(f"review_file={review}")
        print(f"evidence_dir={evidence}")
        return 0
    except Exception as exc:
        print("P5_QA01_V2_KONTEXT_D3_EVAL_GATE=FAIL")
        print(f"error={exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
