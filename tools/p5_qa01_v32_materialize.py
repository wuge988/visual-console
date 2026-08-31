from __future__ import annotations

import argparse
import html
import json
from datetime import datetime
from pathlib import Path
import shutil

from PIL import Image, ImageChops, ImageFilter

import p5_qa01_kontext_d0_eval as d0
import p5_qa01_kontext_d2_eval as d2
import p5_qa01_kontext_d4_eval as d4
import p5_qa01_kontext_d51_eval as d51

EXPECTED_SOURCE_SHA256 = "f31c77589ab71874655744f8f5dc92f2ece77fbf5b7b52f22e53476836a62399"
EXPECTED_BACKPLATE_SHA256 = "79c78c8ba14f168c96b112ba50ccee27dedea168b13ebb36156e51838dd99117"
EXPECTED_V31_FOREGROUND_SHA256 = "726220184280d7a1ee1b3c9097063ef34e4ead950c68b7b7b09783bd25998308"
EXPECTED_V31_FINAL_SHA256 = "66a3ef87e1ba80cebe6782a0f0735cc8c763db385870d0db68c690430c17c1ff"
EXPECTED_REALISM_BOARD_SHA256 = "53be649505d76cce1980b97ae77996af410a5b08844f0316a5e124c3c7c17f3c"

MATERIALIZE_SEED = 52073201
MATERIALIZE_STEPS = 24
MATERIALIZE_GUIDANCE = 2.4
MATERIALIZE_DENOISE = 0.78
ALPHA_THRESHOLD = 4
MASK_DILATE_PX = 5
MAX_MATERIALIZATION_FRAME_RATIO = 0.16
MIN_MATERIALIZATION_PIXELS = 1000

MATERIALIZE_PROMPT = (
    "Materialize only the already-existing foreground proxy objects in this exact aquarium frame. "
    "The renderer has already fixed their screen-space occupancy and their position in front of the exact sellable driftwood; do not redesign the scene and do not decide new occlusion. "
    "Replace the simple gray/dark hardscape proxy with photographic wet irregular dark basalt or slate support stone, with natural broken faces, restrained mineral variation, submerged surface response, fine grit and believable partial burial into dark mixed aquarium substrate. "
    "Replace the simple green proxy leaf clusters with small established submerged epiphytes such as Bucephalandra, Anubias nana petite or compact Java fern: realistic leaf thickness, veins, slight waviness, rhizomes/rootlets and muted underwater greens. "
    "Preserve the existing proxy silhouette, placement, scale and foreground depth as closely as possible. Match the existing aquarium's dark forest-stream lighting, water haze, contrast, color temperature and photographic grain. "
    "Do not regenerate, repaint or reshape the driftwood. Do not change the aquarium background, fish, glass, water, camera, crop or composition. Do not add new rocks, plants, wood, moss blankets, text, logos or watermarks outside the authorized foreground shapes. "
    "The result should look like real photographed foreground hardscape and living epiphytes already installed in the same tank, not CGI and not a studio product overlay."
)


def ensure_under(child: Path, parent: Path, code: str) -> None:
    child_r = child.resolve()
    parent_r = parent.resolve()
    try:
        child_r.relative_to(parent_r)
    except ValueError as exc:
        raise RuntimeError(f"{code}:{child_r}") from exc


def count_nonzero(mask: Image.Image) -> int:
    histogram = mask.convert("L").histogram()
    return int(sum(histogram[1:]))


def validate_inputs(v31: Path, d53: Path, profile: dict) -> None:
    evidence_root = Path(profile["control_root"]) / "evidence"
    ensure_under(v31, evidence_root, "V32_V31_EVIDENCE_OUTSIDE_CONTROL_ROOT")
    ensure_under(d53, evidence_root, "V32_D53_EVIDENCE_OUTSIDE_CONTROL_ROOT")
    if not v31.name.startswith("P5_QA01_V31_GEOMETRY_"):
        raise RuntimeError(f"V32_V31_EVIDENCE_NAME_INVALID:{v31.name}")
    if not d53.name.startswith("P5_QA01_V2_KONTEXT_D53_"):
        raise RuntimeError(f"V32_D53_EVIDENCE_NAME_INVALID:{d53.name}")

    required_v31 = [
        "source_sc01.png",
        "prior_d53_backplate.png",
        "foreground_geometry_plate.png",
        "foreground_alpha.png",
        "geometry_occlusion_proof.png",
    ]
    missing = [name for name in required_v31 if not (v31 / name).is_file()]
    if missing:
        raise RuntimeError("V32_V31_REQUIRED_FILE_MISSING:" + ",".join(missing))
    if not (d53 / "realism_material_board.png").is_file():
        raise RuntimeError("V32_REALISM_MATERIAL_BOARD_MISSING")

    checks = [
        (v31 / "source_sc01.png", EXPECTED_SOURCE_SHA256, "V32_SOURCE_SC01_SHA_MISMATCH"),
        (v31 / "prior_d53_backplate.png", EXPECTED_BACKPLATE_SHA256, "V32_BACKPLATE_SHA_MISMATCH"),
        (v31 / "foreground_geometry_plate.png", EXPECTED_V31_FOREGROUND_SHA256, "V32_V31_FOREGROUND_SHA_MISMATCH"),
        (v31 / "geometry_occlusion_proof.png", EXPECTED_V31_FINAL_SHA256, "V32_V31_FINAL_SHA_MISMATCH"),
        (d53 / "realism_material_board.png", EXPECTED_REALISM_BOARD_SHA256, "V32_REALISM_BOARD_SHA_MISMATCH"),
    ]
    for path, expected, code in checks:
        actual = d0.sha256_file(path)
        if actual != expected:
            raise RuntimeError(f"{code}:expected={expected}:actual={actual}")


def build_materialization_mask(foreground_path: Path, target: Path) -> dict:
    with Image.open(foreground_path) as raw:
        rgba = raw.convert("RGBA")
    alpha = rgba.getchannel("A")
    binary = alpha.point(lambda value: 255 if value >= ALPHA_THRESHOLD else 0)
    if binary.getbbox() is None:
        raise RuntimeError("V32_FOREGROUND_ALPHA_EMPTY")
    if MASK_DILATE_PX > 0:
        # MaxFilter kernel must be odd: radius N -> size 2N+1.
        binary = binary.filter(ImageFilter.MaxFilter(MASK_DILATE_PX * 2 + 1))
    mask_pixels = count_nonzero(binary)
    frame_pixels = binary.size[0] * binary.size[1]
    ratio = mask_pixels / float(frame_pixels)
    if mask_pixels < MIN_MATERIALIZATION_PIXELS:
        raise RuntimeError(
            f"V32_MATERIALIZATION_MASK_TOO_SMALL:min={MIN_MATERIALIZATION_PIXELS}:actual={mask_pixels}"
        )
    if ratio > MAX_MATERIALIZATION_FRAME_RATIO:
        raise RuntimeError(
            f"V32_MATERIALIZATION_MASK_TOO_LARGE:max={MAX_MATERIALIZATION_FRAME_RATIO:.4f}:actual={ratio:.6f}"
        )
    binary.save(target, format="PNG", optimize=False)
    return {
        "alpha_threshold": ALPHA_THRESHOLD,
        "dilate_px": MASK_DILATE_PX,
        "mask_pixels": mask_pixels,
        "frame_pixels": frame_pixels,
        "frame_ratio": round(ratio, 6),
        "max_frame_ratio": MAX_MATERIALIZATION_FRAME_RATIO,
    }


def make_latent_mask_input(base_path: Path, mask_path: Path, target: Path) -> None:
    with Image.open(base_path) as base_raw, Image.open(mask_path) as mask_raw:
        base = base_raw.convert("RGB")
        mask = mask_raw.convert("L")
    if base.size != mask.size:
        raise RuntimeError("V32_LATENT_INPUT_DIMENSION_MISMATCH")
    rgba = base.convert("RGBA")
    rgba.putalpha(ImageChops.invert(mask))
    rgba.save(target, format="PNG", optimize=False)


def finalize_materialization(base_path: Path, raw_path: Path, mask_path: Path, target: Path, evidence: Path) -> dict:
    with Image.open(base_path) as base_raw, Image.open(raw_path) as raw_raw, Image.open(mask_path) as mask_raw:
        base = base_raw.convert("RGB")
        raw = raw_raw.convert("RGB")
        mask = mask_raw.convert("L")
    if not (base.size == raw.size == mask.size):
        raise RuntimeError("V32_FINAL_DIMENSION_MISMATCH")

    final = Image.composite(raw, base, mask)
    final.save(target, format="PNG", optimize=False)

    diff = ImageChops.difference(final, base)
    outside = ImageChops.invert(mask)
    outside_probe = Image.new("RGB", final.size, (0, 0, 0))
    outside_probe.paste(diff, (0, 0), outside)
    if outside_probe.getbbox() is not None:
        raise RuntimeError("V32_OUTSIDE_MATERIALIZATION_PIXEL_DRIFT")

    changed = diff.convert("L").point(lambda value: 255 if value > 0 else 0)
    changed.save(evidence / "materialization_actual_delta.png", format="PNG", optimize=False)
    changed_pixels = count_nonzero(changed)
    if changed_pixels < MIN_MATERIALIZATION_PIXELS:
        raise RuntimeError(
            f"V32_MATERIALIZATION_NO_EFFECT:min_changed={MIN_MATERIALIZATION_PIXELS}:actual={changed_pixels}"
        )

    return {
        "outside_materialization_pixel_exact": True,
        "changed_pixels": changed_pixels,
        "raw_sha256": d0.sha256_file(raw_path),
        "final_sha256": d0.sha256_file(target),
    }


def write_review(evidence: Path, recipe: dict, prompt_id: str) -> Path:
    review = evidence / "materialization_review.html"
    document = f"""<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>P5 QA01 v3.2 Foreground Materialization Review</title><style>body{{font-family:Arial,sans-serif;background:#11161b;color:#eee;margin:24px}}h1{{font-size:24px}}.grid{{display:grid;grid-template-columns:1fr 1fr;gap:18px}}.card{{background:#1b2229;padding:14px;border:1px solid #333;border-radius:10px;margin-bottom:18px}}img{{width:100%;height:auto}}.plain img{{background:white}}.checker{{background-color:#202830;background-image:linear-gradient(45deg,#313b45 25%,transparent 25%),linear-gradient(-45deg,#313b45 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#313b45 75%),linear-gradient(-45deg,transparent 75%,#313b45 75%);background-size:24px 24px;background-position:0 0,0 12px,12px -12px,-12px 0}}pre{{white-space:pre-wrap;color:#d7d7d7}}.warn{{color:#ffcc80}}.ok{{color:#9fe0b3}}</style></head><body>
<h1>P5 QA01 v3.2 — Geometry-Locked Foreground Materialization</h1>
<p class="warn">EVALUATION ONLY / NON-PRODUCTION / FLUX KONTEXT DEV / QA01 DISABLED</p>
<p class="ok">Renderer geometry decides foreground occupancy first. Kontext may only materialize the bounded foreground authorization mask. Pixels outside that mask remain exact v3.1 pixels.</p>
<div class="grid"><div class="card plain"><h2>v3.1 accepted proxy composite</h2><img src="geometry_occlusion_proof.png"></div><div class="card plain"><h2>v3.2 materialized final</h2><img src="geometry_occlusion_materialized.png"></div></div>
<div class="grid"><div class="card plain"><h2>Raw Kontext materialization</h2><img src="foreground_materialization_raw.png"></div><div class="card plain"><h2>Geometry-derived authorization mask</h2><img src="foreground_materialization_mask.png"></div></div>
<div class="grid"><div class="card checker"><h2>Accepted transparent foreground geometry</h2><img src="foreground_geometry_plate.png"></div><div class="card plain"><h2>Actual materialization delta</h2><img src="materialization_actual_delta.png"></div></div>
<div class="grid"><div class="card plain"><h2>Anti-replication material board — conditioning only</h2><img src="realism_material_board.png"></div><div class="card plain"><h2>Exact SC01 identity source</h2><img src="source_sc01.png"></div></div>
<div class="card"><h2>Recipe</h2><pre>{html.escape(json.dumps(recipe, ensure_ascii=False, indent=2))}</pre></div>
<div class="card"><h2>Materialization prompt</h2><pre>{html.escape(MATERIALIZE_PROMPT)}</pre><p>prompt_id={html.escape(prompt_id)}</p></div>
</body></html>"""
    review.write_text(document, encoding="utf-8")
    return review


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", required=True)
    parser.add_argument("--site-id", default="drift-curio")
    parser.add_argument("--sku", default="DC-ZY-SZ-31001")
    parser.add_argument("--v31-evidence-dir", required=True)
    parser.add_argument("--d53-evidence-dir", required=True)
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
            raise RuntimeError("QA01_MUST_REMAIN_DISABLED_DURING_V32_EVAL")
        registry = d0.read_json(repo / "config" / "workflows" / "registry.json")
        qa01 = next((row for row in registry.get("workflows", []) if row.get("code") == "QA01"), None)
        if not qa01 or qa01.get("executable") is not False or qa01.get("workflow_status") != "NOT_REGISTERED":
            raise RuntimeError("QA01_REGISTRY_MUST_REMAIN_FAIL_CLOSED")

        evidence = Path(args.v31_evidence_dir).resolve()
        d53 = Path(args.d53_evidence_dir).resolve()
        validate_inputs(evidence, d53, profile)

        material_board = evidence / "realism_material_board.png"
        shutil.copy2(d53 / "realism_material_board.png", material_board)
        mask_path = evidence / "foreground_materialization_mask.png"
        mask_metrics = build_materialization_mask(evidence / "foreground_geometry_plate.png", mask_path)
        latent_path = evidence / "foreground_materialization_input_latentmask.png"
        make_latent_mask_input(evidence / "geometry_occlusion_proof.png", mask_path, latent_path)

        for label, spec in d0.MODELS.items():
            d0.exact_model_identity(label, spec)
        _, started_by_gate = d0.wait_ready(evidence)
        required_nodes = [
            "UNETLoader",
            "DualCLIPLoader",
            "VAELoader",
            "LoadImage",
            "FluxKontextImageScale",
            "VAEEncode",
            "SetLatentNoiseMask",
            "CLIPTextEncode",
            "ReferenceLatent",
            "FluxGuidance",
            "ConditioningZeroOut",
            "KSampler",
            "VAEDecode",
            "PreviewImage",
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
            raise RuntimeError("V32_REQUIRED_NODES_MISSING:" + ",".join(missing))

        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        _, visible_reference = d2.copy_input(
            material_board,
            profile,
            f"p5_qa01_v32_material_board_{args.sku}_{stamp}.png",
        )
        _, visible_target = d2.copy_input(
            latent_path,
            profile,
            f"p5_qa01_v32_foreground_target_{args.sku}_{stamp}.png",
        )
        workflow = d4.build_noise_mask_workflow(
            visible_reference,
            visible_target,
            infos,
            prompt=MATERIALIZE_PROMPT,
            seed=MATERIALIZE_SEED,
            steps=MATERIALIZE_STEPS,
            guidance=MATERIALIZE_GUIDANCE,
            denoise=MATERIALIZE_DENOISE,
        )
        prompt_id, raw_target = d51.run_stage_sanitized(evidence, "v32_materialize", workflow)
        raw_copy = evidence / "foreground_materialization_raw.png"
        if raw_target.resolve() != raw_copy.resolve():
            shutil.copy2(raw_target, raw_copy)

        final_path = evidence / "geometry_occlusion_materialized.png"
        final_metrics = finalize_materialization(
            evidence / "geometry_occlusion_proof.png",
            raw_copy,
            mask_path,
            final_path,
            evidence,
        )

        recipe = {
            "schema_version": "0.700-eval-v32",
            "site_id": args.site_id,
            "sku": args.sku,
            "realm": "QA01_AQUARIUM",
            "v31_human_visual_result": "PASS_REGISTRATION_AND_RENDERER_OCCLUSION",
            "architecture": "GEOMETRY_LOCKED_FOREGROUND_MATERIALIZATION",
            "evaluation_only": True,
            "production_authorized": False,
            "qa01_enabled": False,
            "anti_replication": {
                "intact_donor_conditioned": False,
                "realism_material_board_conditioned": True,
                "donor_macro_layout_destroyed_before_conditioning": True,
            },
            "authorization_contract": {
                "foreground_occupancy_decided_by_renderer_before_diffusion": True,
                "materialization_mask_derived_from_foreground_alpha": True,
                "outside_materialization_mask_must_remain_exact_v31": True,
                "background_redesign_forbidden": True,
                "driftwood_repaint_outside_existing_foreground_occlusion_forbidden": True,
            },
            "mask_metrics": mask_metrics,
            "materialization": {
                "seed": MATERIALIZE_SEED,
                "steps": MATERIALIZE_STEPS,
                "guidance": MATERIALIZE_GUIDANCE,
                "denoise": MATERIALIZE_DENOISE,
                "sampler": "euler",
                "scheduler": "simple",
                "reference": "verified D5.2 anti-replication material board",
            },
            "production_mutation": "NONE",
            "final_metrics": final_metrics,
        }
        (evidence / "v32_recipe.json").write_text(
            json.dumps(recipe, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        (evidence / "v32_prompt.txt").write_text(MATERIALIZE_PROMPT + "\n", encoding="utf-8")
        review = write_review(evidence, recipe, prompt_id)

        print("P5_QA01_V32_MATERIALIZATION_GATE=PASS")
        print(f"git_head={head}")
        print(f"sku={args.sku}")
        print("v31_registration_pass=True")
        print("v31_occlusion_mechanism_pass=True")
        print("evaluation_only=True")
        print("production_authorized=False")
        print("qa01_enabled=False")
        print("architecture=GEOMETRY_LOCKED_FOREGROUND_MATERIALIZATION")
        print("foreground_occupancy_decided_by_renderer_before_diffusion=True")
        print("intact_donor_conditioned=False")
        print("realism_material_board_conditioned=True")
        print("outside_materialization_pixel_exact=True")
        print(f"materialization_mask_ratio={mask_metrics['frame_ratio']}")
        print(f"comfy_started_by_gate={started_by_gate}")
        print(f"materialization_seed={MATERIALIZE_SEED}")
        print(f"materialization_steps={MATERIALIZE_STEPS}")
        print(f"materialization_guidance={MATERIALIZE_GUIDANCE}")
        print(f"materialization_denoise={MATERIALIZE_DENOISE}")
        print(f"changed_pixels={final_metrics['changed_pixels']}")
        print(f"candidate_sha256={final_metrics['final_sha256']}")
        print(f"review_file={review}")
        print(f"evidence_dir={evidence}")
        return 0
    except Exception as exc:
        print("P5_QA01_V32_MATERIALIZATION_GATE=FAIL")
        print(f"error={exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
