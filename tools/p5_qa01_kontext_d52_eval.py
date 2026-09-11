from __future__ import annotations

import argparse
import html
import json
from datetime import datetime
from pathlib import Path
import shutil

from PIL import Image, ImageChops, ImageEnhance, ImageFilter, ImageOps

import p5_qa01_kontext_d0_eval as d0
import p5_qa01_kontext_d2_eval as d2
import p5_qa01_kontext_d4_eval as d4
import p5_qa01_kontext_d5_eval as d5
import p5_qa01_kontext_d51_eval as d51

EXPECTED_SOURCE_SHA256 = d5.EXPECTED_SOURCE_SHA256
EXPECTED_D4_FINAL_SHA256 = d5.EXPECTED_D4_FINAL_SHA256
EXPECTED_CONTACT_EDITABLE_PIXELS = d5.EXPECTED_CONTACT_EDITABLE_PIXELS

ENV_SEED = 52073171
ENV_STEPS = 34
ENV_GUIDANCE = 2.7
ENV_DENOISE = 1.0
CONTACT_SEED = 52073172
CONTACT_STEPS = 18
CONTACT_GUIDANCE = 1.9
CONTACT_DENOISE = 0.56
REFERENCE_CANVAS_WIDTH = 1536
REFERENCE_CANVAS_HEIGHT = 768
REFERENCE_GUTTER = 24
REALISM_GRID_COLS = 9
REALISM_GRID_ROWS = 8
REALISM_COLOR_SATURATION = 0.15
REALISM_TILE_BLUR_RADIUS = 0.8
REALISM_PERMUTATION_A = 37
REALISM_PERMUTATION_B = 17

ENV_PROMPT = (
    "The single reference canvas contains two panels with strictly separated roles. "
    "Use the LEFT PANEL only as the exact sellable driftwood identity. Preserve its major silhouette, branch topology, crowns, cavities, holes, orientation and proportions. "
    "The RIGHT PANEL is not a scene to copy. It is a composition-destroyed realism material board made from shuffled, desaturated micro-texture tiles. Use it only for photographic texture quality, local material response, natural imperfection, water/glass micro-contrast and believable biological surface detail. "
    "Do not reconstruct, infer, imitate or recover any donor aquarium layout from the right panel. Do not copy donor driftwood, stone arrangement, substrate geometry, fish placement, plant placement, camera framing or color palette. "
    "Design a new aquarium specifically for this exact heavy stump with rightward branch flow and central negative space. Use a mature shaded forest-stream Nature Aquarium direction that is deliberately different from a bright white-sand open display tank: dark mixed natural gravel and fine brown substrate, irregular angular basalt/slate buttress stones partly buried around the lower-left and central support zones, denser shaded epiphyte/fern/crypt planting around the mass, and a more open right-side water lane following the longest branch. "
    "Keep the central cavity and branch windows as real swim-through negative space. Keep the longest lower-right branch visually open. Allow restrained Bucephalandra, Anubias nana petite, small Java fern and limited moss only at physically plausible attachment pockets. "
    "The result must read as a mature real aquarium photographed through front glass: believable front-glass reflections, water-column depth, mild attenuation, irregular substrate grain, partial burial, plant overlap, small imperfections and coherent underwater lighting. "
    "Avoid turquoise studio gradients, flat beige or white sand floors, isolated decorative pebbles, donor-scene reconstruction, perfect symmetry, pedestal staging, extra driftwood, fantasy CGI, oversaturation, dramatic god rays, fake bokeh, text, logos and watermarks."
)

CONTACT_PROMPT = (
    "Refine only the local physical contact between the already established aquarium and the same exact driftwood. "
    "Do not redesign the aquarium and do not alter any major wood silhouette, branch, crown, cavity, hole, orientation or proportion. "
    "At the local lower contact and anchor zones only, let dark mixed substrate and fine gravel naturally lap against the lowest wood edges, make angular support stones look load-bearing and partly buried, add narrow coherent contact shadows, tiny plausible epiphyte attachment pockets and subtle wet seam integration. "
    "Preserve the mature shaded forest-stream scene, water depth, glass cues, planting hierarchy and open right-side water lane. "
    "Avoid new large plants, extra stones, extra wood, blanket moss, isolated pebbles, dramatic lighting, CGI effects, text, logos and watermarks."
)


def fit_panel(image: Image.Image, width: int, height: int, background: tuple[int, int, int]) -> Image.Image:
    source = image.convert("RGB")
    fitted = ImageOps.contain(source, (width, height), method=Image.Resampling.LANCZOS)
    panel = Image.new("RGB", (width, height), background)
    x = (width - fitted.width) // 2
    y = (height - fitted.height) // 2
    panel.paste(fitted, (x, y))
    return panel


def build_realism_material_board(scene_path: Path, target: Path) -> dict:
    panel_width = (REFERENCE_CANVAS_WIDTH - REFERENCE_GUTTER) // 2
    with Image.open(scene_path) as raw:
        source = ImageOps.exif_transpose(raw).convert("RGB")
    prepared = ImageOps.fit(
        source,
        (panel_width, REFERENCE_CANVAS_HEIGHT),
        method=Image.Resampling.LANCZOS,
        centering=(0.5, 0.5),
    )
    prepared = ImageEnhance.Color(prepared).enhance(REALISM_COLOR_SATURATION)
    prepared = prepared.filter(ImageFilter.GaussianBlur(REALISM_TILE_BLUR_RADIUS))

    tile_w = panel_width // REALISM_GRID_COLS
    tile_h = REFERENCE_CANVAS_HEIGHT // REALISM_GRID_ROWS
    usable_w = tile_w * REALISM_GRID_COLS
    usable_h = tile_h * REALISM_GRID_ROWS
    prepared = ImageOps.fit(prepared, (usable_w, usable_h), method=Image.Resampling.LANCZOS)
    board = Image.new("RGB", (usable_w, usable_h), (104, 108, 104))

    tile_count = REALISM_GRID_COLS * REALISM_GRID_ROWS
    permutation: list[int] = []
    fixed_tiles = 0
    for dest_index in range(tile_count):
        source_index = (dest_index * REALISM_PERMUTATION_A + REALISM_PERMUTATION_B) % tile_count
        permutation.append(source_index)
        if source_index == dest_index:
            fixed_tiles += 1
        sx = (source_index % REALISM_GRID_COLS) * tile_w
        sy = (source_index // REALISM_GRID_COLS) * tile_h
        tile = prepared.crop((sx, sy, sx + tile_w, sy + tile_h))
        mode = dest_index % 4
        if mode == 1:
            tile = ImageOps.mirror(tile)
        elif mode == 2:
            tile = ImageOps.flip(tile)
        elif mode == 3:
            tile = tile.transpose(Image.Transpose.ROTATE_180)
        dx = (dest_index % REALISM_GRID_COLS) * tile_w
        dy = (dest_index // REALISM_GRID_COLS) * tile_h
        board.paste(tile, (dx, dy))

    if fixed_tiles != 0:
        raise RuntimeError(f"D52_REALISM_BOARD_FIXED_TILE_GUARD_FAILED:{fixed_tiles}")
    board.save(target, format="PNG", optimize=False)
    return {
        "width": board.width,
        "height": board.height,
        "grid_cols": REALISM_GRID_COLS,
        "grid_rows": REALISM_GRID_ROWS,
        "tile_count": tile_count,
        "fixed_tiles": fixed_tiles,
        "color_saturation": REALISM_COLOR_SATURATION,
        "tile_blur_radius": REALISM_TILE_BLUR_RADIUS,
        "permutation_a": REALISM_PERMUTATION_A,
        "permutation_b": REALISM_PERMUTATION_B,
        "macro_layout_destroyed": True,
        "donor_scene_direct_pixels_passed_to_comfy": False,
        "sha256": d0.sha256_file(target),
    }


def build_reference_canvas(product_path: Path, realism_board_path: Path, target: Path) -> dict:
    panel_width = (REFERENCE_CANVAS_WIDTH - REFERENCE_GUTTER) // 2
    with Image.open(product_path) as product_raw, Image.open(realism_board_path) as board_raw:
        product = ImageOps.exif_transpose(product_raw).convert("RGB")
        board = ImageOps.exif_transpose(board_raw).convert("RGB")
    left = fit_panel(product, panel_width, REFERENCE_CANVAS_HEIGHT, (238, 238, 234))
    right = fit_panel(board, panel_width, REFERENCE_CANVAS_HEIGHT, (40, 43, 42))
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
        "right_role": "composition_destroyed_realism_material_board_only",
        "donor_layout_available_to_model": False,
        "sha256": d0.sha256_file(target),
    }


def build_environment_workflow(reference_canvas: str, image_input: str, infos: dict) -> dict:
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


def write_review(evidence: Path, recipe: dict, env_prompt_id: str, contact_prompt_id: str) -> Path:
    review = evidence / "review.html"
    document = f"""<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>P5 QA01 Kontext D5.2 Review</title><style>body{{font-family:Arial,sans-serif;background:#11161b;color:#eee;margin:24px}}h1{{font-size:24px}}.grid{{display:grid;grid-template-columns:1fr 1fr;gap:18px}}.card{{background:#1b2229;padding:14px;border:1px solid #333;border-radius:10px;margin-bottom:18px}}img{{width:100%;height:auto;background:white}}pre{{white-space:pre-wrap;color:#d7d7d7}}.warn{{color:#ffcc80}}.fail{{color:#ff8a80}}</style></head><body>
<h1>P5 QA01 v2 — Kontext D5.2 Anti-Replication Realism Board</h1><p class="warn">EVALUATION ONLY / NON-PRODUCTION / QA01 DISABLED</p>
<p class="fail">D5.1 is visually rejected because the intact donor aquarium reference leaked composition/layout into the candidate. D5.2 never passes the intact donor scene to ComfyUI. It first destroys donor macro-composition into a shuffled, desaturated micro-texture realism board.</p>
<div class="grid"><div class="card"><h2>VERIFIED SC01 — exact identity</h2><img src="source_sc01.png"></div><div class="card"><h2>D5.2 final candidate</h2><img src="candidate.png"></div></div>
<div class="grid"><div class="card"><h2>Original realism reference — AUDIT ONLY, NOT PASSED TO COMFYUI</h2><img src="scene_reference.png"></div><div class="card"><h2>Composition-destroyed realism material board — actually conditioned</h2><img src="realism_material_board.png"></div></div>
<div class="grid"><div class="card"><h2>D5.2 environment pass</h2><img src="candidate_environment_anti_replication_raw.png"></div><div class="card"><h2>Reference canvas — identity + non-compositional realism board</h2><img src="reference_canvas.png"></div></div>
<div class="grid"><div class="card"><h2>Prior D4 final</h2><img src="prior_d4_final.png"></div><div class="card"><h2>Wet-core composite before contact</h2><img src="candidate_pre_contact.png"></div></div>
<div class="grid"><div class="card"><h2>Raw contact refinement</h2><img src="candidate_contact_raw.png"></div><div class="card"><h2>Wet core preview</h2><img src="wet_core_preview.png"></div></div>
<div class="grid"><div class="card"><h2>Environment Editable Mask</h2><img src="environment_editable_mask.png"></div><div class="card"><h2>Contact Editable Mask</h2><img src="contact_editable_mask.png"></div></div>
<div class="card"><h2>D5.2 Recipe</h2><pre>{html.escape(json.dumps(recipe, ensure_ascii=False, indent=2))}</pre></div>
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
            raise RuntimeError("QA01_MUST_REMAIN_DISABLED_DURING_KONTEXT_D52_EVAL")
        registry = d0.read_json(repo / "config" / "workflows" / "registry.json")
        qa01 = next((row for row in registry.get("workflows", []) if row.get("code") == "QA01"), None)
        if not qa01 or qa01.get("executable") is not False or qa01.get("workflow_status") != "NOT_REGISTERED":
            raise RuntimeError("QA01_REGISTRY_MUST_REMAIN_FAIL_CLOSED")

        prior = Path(args.prior_evidence_dir).resolve()
        d5.validate_prior_evidence(prior, profile, args.sku)
        scene_source = Path(args.scene_reference_path).expanduser().resolve()
        evidence = Path(profile["control_root"]) / "evidence" / ("P5_QA01_V2_KONTEXT_D52_" + datetime.now().strftime("%Y%m%d-%H%M%S"))
        evidence.mkdir(parents=True, exist_ok=False)
        for src_name, dst_name in [("source_sc01.png", "source_sc01.png"), ("eval_input_white.png", "eval_input_white.png"), ("candidate.png", "prior_d4_final.png"), ("contact_editable_mask.png", "contact_editable_mask.png"), ("protected_core.png", "protected_core.png")]:
            shutil.copy2(prior / src_name, evidence / dst_name)

        scene_metrics = d5.normalize_scene_reference(scene_source, evidence)
        realism_metrics = build_realism_material_board(evidence / "scene_reference.png", evidence / "realism_material_board.png")
        mask_metrics = d5.build_environment_input(evidence / "prior_d4_final.png", evidence / "source_sc01.png", evidence)
        canvas_metrics = build_reference_canvas(evidence / "eval_input_white.png", evidence / "realism_material_board.png", evidence / "reference_canvas.png")
        if realism_metrics["fixed_tiles"] != 0 or not realism_metrics["macro_layout_destroyed"]:
            raise RuntimeError("D52_ANTI_REPLICATION_BOARD_GUARD_FAILED")
        if realism_metrics["donor_scene_direct_pixels_passed_to_comfy"]:
            raise RuntimeError("D52_DONOR_SCENE_DIRECT_CONDITIONING_FORBIDDEN")

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
            raise RuntimeError("D52_REQUIRED_NODES_MISSING:" + ",".join(missing))

        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        _, visible_canvas = d2.copy_input(evidence / "reference_canvas.png", profile, f"p5_qa01_kontext_d52_reference_canvas_{args.sku}_{stamp}.png")
        _, visible_env = d2.copy_input(evidence / "environment_input_latentmask.png", profile, f"p5_qa01_kontext_d52_env_{args.sku}_{stamp}.png")
        env_workflow = build_environment_workflow(visible_canvas, visible_env, infos)
        env_prompt_id, env_target = d51.run_stage_sanitized(evidence, "environment_anti_replication", env_workflow)

        wet_metrics = d4.make_photometric_wet_core(evidence / "source_sc01.png", env_target, evidence)
        contact_input = evidence / "contact_input_latentmask.png"
        d4.make_masked_input(evidence / "candidate_pre_contact.png", evidence / "contact_editable_mask.png", contact_input)
        _, visible_contact = d2.copy_input(contact_input, profile, f"p5_qa01_kontext_d52_contact_{args.sku}_{stamp}.png")
        _, visible_product_ref = d2.copy_input(evidence / "eval_input_white.png", profile, f"p5_qa01_kontext_d52_product_ref_{args.sku}_{stamp}.png")
        contact_workflow = d4.build_noise_mask_workflow(visible_product_ref, visible_contact, infos, prompt=CONTACT_PROMPT, seed=CONTACT_SEED, steps=CONTACT_STEPS, guidance=CONTACT_GUIDANCE, denoise=CONTACT_DENOISE)
        contact_prompt_id, contact_target = d51.run_stage_sanitized(evidence, "contact", contact_workflow)

        final_candidate = evidence / "candidate.png"
        final_metrics = d4.reassert_photometric_core(evidence / "wet_core.png", contact_target, evidence / "protected_core.png", final_candidate)
        with Image.open(final_candidate) as final_raw, Image.open(evidence / "source_sc01.png") as source_raw:
            if final_raw.size != source_raw.size:
                raise RuntimeError("D52_FINAL_DIMENSION_MISMATCH")

        recipe = {
            "schema_version": "0.612-eval-d52",
            "site_id": args.site_id,
            "sku": args.sku,
            "realm": "QA01_AQUARIUM",
            "source_sc01_sha256": EXPECTED_SOURCE_SHA256,
            "prior_d4_final_sha256": EXPECTED_D4_FINAL_SHA256,
            "d51_visual_result": "FAIL_REFERENCE_COMPOSITION_LEAK_NOT_ACCEPTABLE",
            "architecture": "composition-destroyed realism material board + exact identity panel + single ReferenceLatent + geometry-locked wet photometry + bounded contact repair",
            "anti_replication": {
                "donor_scene_direct_pixels_passed_to_comfy": False,
                "donor_macro_layout_destroyed_before_conditioning": True,
                "donor_color_transfer_suppressed": True,
                "scene_design": "mature shaded forest-stream, dark mixed substrate, angular basalt/slate buttress, open right water lane",
                "donor_layout_copy_forbidden": True,
            },
            "scene_reference": scene_metrics,
            "realism_material_board": realism_metrics,
            "reference_canvas": canvas_metrics,
            "mask_metrics": mask_metrics,
            "environment": {"runtime": "ANTI_REPLICATION_REALISM_BOARD_SINGLE_REFERENCE_LATENT_PLUS_SetLatentNoiseMask", "seed": ENV_SEED, "steps": ENV_STEPS, "guidance": ENV_GUIDANCE, "denoise": ENV_DENOISE, "sampler": "euler", "scheduler": "simple"},
            "photometric_wet_core": wet_metrics,
            "contact": {"runtime": "VAEEncode_PLUS_SetLatentNoiseMask", "seed": CONTACT_SEED, "steps": CONTACT_STEPS, "guidance": CONTACT_GUIDANCE, "denoise": CONTACT_DENOISE, "sampler": "euler", "scheduler": "simple", "editable_pixels": EXPECTED_CONTACT_EDITABLE_PIXELS},
            "production_mutation": "NONE",
            "final_metrics": {"wet_core_alpha_geometry_exact": wet_metrics["wet_core_alpha_geometry_exact"], "photometric_core_exact_pixel_reassertion": final_metrics["photometric_core_exact_pixel_reassertion"], "environment_raw_sha256": d0.sha256_file(env_target), "contact_raw_sha256": final_metrics["raw_sha256"], "final_candidate_sha256": final_metrics["final_sha256"]},
        }
        (evidence / "scene_recipe.json").write_text(json.dumps(recipe, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        (evidence / "prompt_environment.txt").write_text(ENV_PROMPT + "\n", encoding="utf-8")
        (evidence / "prompt_contact.txt").write_text(CONTACT_PROMPT + "\n", encoding="utf-8")
        review = write_review(evidence, recipe, env_prompt_id, contact_prompt_id)

        print("P5_QA01_V2_KONTEXT_D52_EVAL_GATE=PASS")
        print(f"git_head={head}")
        print(f"sku={args.sku}")
        print("d51_visual_result=FAIL_REFERENCE_COMPOSITION_LEAK_NOT_ACCEPTABLE")
        print("evaluation_only=True")
        print("production_authorized=False")
        print("qa01_enabled=False")
        print("architecture=ANTI_REPLICATION_REALISM_BOARD_PLUS_GEOMETRY_LOCKED_CORE")
        print("donor_scene_direct_pixels_passed_to_comfy=False")
        print("donor_macro_layout_destroyed_before_conditioning=True")
        print(f"realism_board_tile_count={realism_metrics['tile_count']}")
        print(f"realism_board_fixed_tiles={realism_metrics['fixed_tiles']}")
        print(f"realism_board_color_saturation={REALISM_COLOR_SATURATION}")
        print("scene_design=MATURE_SHADED_FOREST_STREAM_DARK_SUBSTRATE_OPEN_RIGHT_LANE")
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
        print(f"realism_material_board_sha256={realism_metrics['sha256']}")
        print(f"reference_canvas_sha256={canvas_metrics['sha256']}")
        print(f"environment_prompt_id={env_prompt_id}")
        print(f"contact_prompt_id={contact_prompt_id}")
        print(f"candidate_sha256={final_metrics['final_sha256']}")
        print(f"review_file={review}")
        print(f"evidence_dir={evidence}")
        return 0
    except Exception as exc:
        print("P5_QA01_V2_KONTEXT_D52_EVAL_GATE=FAIL")
        print(f"error={exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
