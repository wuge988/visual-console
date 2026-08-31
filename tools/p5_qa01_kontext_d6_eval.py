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
import p5_qa01_kontext_d54_eval as d54

EXPECTED_SOURCE_SHA256 = "f31c77589ab71874655744f8f5dc92f2ece77fbf5b7b52f22e53476836a62399"
EXPECTED_D53_FINAL_SHA256 = "79c78c8ba14f168c96b112ba50ccee27dedea168b13ebb36156e51838dd99117"
EXPECTED_REALISM_BOARD_SHA256 = "53be649505d76cce1980b97ae77996af410a5b08844f0316a5e124c3c7c17f3c"

MAX_OCCLUSION_SUBJECT_RATIO = 0.20
MIN_UNCHANGED_SUBJECT_RATIO = 0.80
MIN_STAGE_SUBJECT_CHANGED_PIXELS = 1500
MIN_STAGE_OUTSIDE_CHANGED_PIXELS = 1000
SUBJECT_INNER_DEPTHS = (28, 24, 20, 16, 12, 8)

HARDSCAPE_SEED = 52073201
HARDSCAPE_STEPS = 32
HARDSCAPE_GUIDANCE = 2.8
HARDSCAPE_DENOISE = 1.0

EPIPHYTE_SEED = 52073202
EPIPHYTE_STEPS = 30
EPIPHYTE_GUIDANCE = 2.7
EPIPHYTE_DENOISE = 1.0

HARDSCAPE_PROMPT = (
    "The missing masked lower driftwood pixels are intentionally removed and MUST NOT be reconstructed as wood. "
    "Fill the masked cross-boundary region with an unmistakable foreground aquarium hardscape occluder that physically sits in front of the existing driftwood. "
    "Create dark mixed natural substrate and fine gravel lapping over and partly burying the lowest wood edge, plus one or two irregular angular basalt/slate support faces. "
    "At least one stone face must occupy part of the former wood silhouette so the foreground stone visibly hides a small lower wood region and reads as load-bearing. "
    "Keep scale realistic, partially bury the stone, add narrow contact shadow and scattered grains. "
    "Do not recreate the missing wood inside the mask. Do not add another driftwood piece, a pedestal, round decorative pebbles, fantasy lighting, text, logos or watermarks."
)

EPIPHYTE_PROMPT = (
    "The missing masked wood pixels are intentional attachment windows and MUST NOT be reconstructed as bare wood. "
    "Fill them with sparse physically attached foreground epiphytes that visibly overlap the existing driftwood silhouette. "
    "Use two or three restrained pockets of Bucephalandra, Anubias nana petite or small Java fern. "
    "Rhizomes/rootlets must meet the wood edge and multiple small leaves must occupy part of the former wood silhouette while extending into foreground water. "
    "The result must read as plants attached on top of the wood, not plants behind it. "
    "Do not blanket the driftwood with moss, hide major cavities, create large plants, add stones or extra wood, or reconstruct bare wood inside the masked attachment windows."
)


def count_nonzero(mask: Image.Image) -> int:
    return d4.count_nonzero(mask)


def boundary_band(subject: Image.Image, depth: int) -> Image.Image:
    if depth <= 0:
        return Image.new("L", subject.size, 0)
    return ImageChops.subtract(subject, d2.erode(subject, depth))


def stage_counts(mask: Image.Image, subject: Image.Image) -> tuple[int, int]:
    inside = ImageChops.multiply(mask, subject)
    outside = ImageChops.multiply(mask, ImageChops.invert(subject))
    return count_nonzero(inside), count_nonzero(outside)


def build_critical_lock(size: tuple[int, int], bbox: tuple[int, int, int, int], subject: Image.Image) -> Image.Image:
    upper = d54.normalized_rect(size, bbox, 0.00, 0.00, 1.00, 0.46)
    cavity = d54.normalized_ellipse(size, bbox, 0.39, 0.49, 0.18, 0.16)
    right = d54.normalized_rect(size, bbox, 0.61, 0.36, 1.00, 0.97)
    geometry = ImageChops.lighter(upper, ImageChops.lighter(cavity, right))
    critical = ImageChops.multiply(geometry, subject)
    if critical.getbbox() is None:
        raise RuntimeError("D6_CRITICAL_LOCK_EMPTY")
    return critical


def build_occlusion_masks(source_sc01: Path, evidence: Path) -> dict:
    with Image.open(source_sc01) as raw:
        source = raw.convert("RGBA")
    subject = d2.binary_subject_mask(source.getchannel("A"))
    bbox = subject.getbbox()
    if bbox is None:
        raise RuntimeError("D6_SUBJECT_ALPHA_EMPTY")
    subject_pixels = count_nonzero(subject)
    critical = build_critical_lock(source.size, bbox, subject)

    hard_window = d54.normalized_rect(source.size, bbox, -0.04, 0.68, 0.62, 1.04)
    hard_outer = ImageChops.multiply(hard_window, d4.dilate(subject, 54))

    pocket_a = d54.normalized_ellipse(source.size, bbox, 0.17, 0.60, 0.12, 0.12)
    pocket_b = d54.normalized_ellipse(source.size, bbox, 0.47, 0.64, 0.11, 0.10)
    epi_window = ImageChops.lighter(pocket_a, pocket_b)
    epi_outer = ImageChops.multiply(epi_window, d4.dilate(subject, 44))

    attempts = []
    selected = None
    for depth in SUBJECT_INNER_DEPTHS:
        band = boundary_band(subject, depth)
        hard_inside = ImageChops.multiply(hard_outer, band)
        hard_outside = ImageChops.multiply(hard_outer, ImageChops.invert(subject))
        hardscape = ImageChops.lighter(hard_inside, hard_outside)
        hardscape = ImageChops.subtract(hardscape, critical)

        epi_inside = ImageChops.multiply(epi_outer, boundary_band(subject, max(8, depth - 4)))
        epi_outside = ImageChops.multiply(epi_outer, ImageChops.invert(subject))
        epiphyte = ImageChops.lighter(epi_inside, epi_outside)
        epiphyte = ImageChops.subtract(epiphyte, critical)

        union = ImageChops.lighter(hardscape, epiphyte)
        union_subject = ImageChops.multiply(union, subject)
        ratio = count_nonzero(union_subject) / float(subject_pixels)
        hc = stage_counts(hardscape, subject)
        ec = stage_counts(epiphyte, subject)
        crosses = hc[0] >= 512 and hc[1] >= 512 and ec[0] >= 512 and ec[1] >= 512
        attempts.append({
            "subject_inner_depth": depth,
            "occlusion_subject_ratio": round(ratio, 6),
            "hardscape_subject_pixels": hc[0],
            "hardscape_outside_pixels": hc[1],
            "epiphyte_subject_pixels": ec[0],
            "epiphyte_outside_pixels": ec[1],
            "cross_boundary": crosses,
        })
        if ratio <= MAX_OCCLUSION_SUBJECT_RATIO and crosses:
            selected = (depth, hardscape, epiphyte, union, ratio, hc, ec)
            break

    if selected is None:
        raise RuntimeError("D6_OCCLUSION_MASK_PROFILE_NOT_FOUND:" + json.dumps(attempts, separators=(",", ":")))

    depth, hardscape, epiphyte, union, ratio, hc, ec = selected
    unchanged = 1.0 - ratio
    if unchanged < MIN_UNCHANGED_SUBJECT_RATIO:
        raise RuntimeError("D6_UNCHANGED_SUBJECT_RATIO_TOO_SMALL")
    if ImageChops.multiply(union, critical).getbbox() is not None:
        raise RuntimeError("D6_CRITICAL_LOCK_OCCLUSION_OVERLAP")

    hardscape.save(evidence / "hardscape_occlusion_mask.png", format="PNG", optimize=False)
    epiphyte.save(evidence / "epiphyte_occlusion_mask.png", format="PNG", optimize=False)
    union.save(evidence / "occlusion_union_mask.png", format="PNG", optimize=False)
    critical.save(evidence / "critical_landmark_lock_mask.png", format="PNG", optimize=False)

    return {
        "subject_pixels": subject_pixels,
        "selected_subject_inner_depth": depth,
        "occlusion_subject_ratio": round(ratio, 6),
        "max_occlusion_subject_ratio": MAX_OCCLUSION_SUBJECT_RATIO,
        "unchanged_subject_ratio": round(unchanged, 6),
        "min_unchanged_subject_ratio": MIN_UNCHANGED_SUBJECT_RATIO,
        "hardscape_boundary_counts": {"subject": hc[0], "outside": hc[1]},
        "epiphyte_boundary_counts": {"subject": ec[0], "outside": ec[1]},
        "critical_landmark_subject_pixels": count_nonzero(critical),
        "attempts": attempts,
    }


def build_silhouette_material_reference(source_sc01: Path, material_board: Path, target: Path) -> None:
    with Image.open(source_sc01) as source_raw, Image.open(material_board) as board_raw:
        source = source_raw.convert("RGBA")
        board = board_raw.convert("RGB")
    subject = d2.binary_subject_mask(source.getchannel("A"))
    w, h = source.size
    guide = Image.new("RGB", (w, h), (230, 229, 223))
    guide.paste((86, 88, 84), (0, 0, w, h), subject)
    edge = ImageChops.subtract(d4.dilate(subject, 5), d2.erode(subject, 5))
    guide.paste((28, 29, 28), (0, 0, w, h), edge)
    resized_board = board.resize((w, h), Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", (w * 2, h), (230, 229, 223))
    canvas.paste(guide, (0, 0))
    canvas.paste(resized_board, (w, 0))
    canvas.save(target, format="PNG", optimize=False)


def stage_delta_metrics(base_path: Path, result_path: Path, mask_path: Path, source_sc01: Path, delta_target: Path) -> dict:
    with Image.open(base_path) as base_raw, Image.open(result_path) as result_raw, Image.open(mask_path) as mask_raw, Image.open(source_sc01) as source_raw:
        base = base_raw.convert("RGB")
        result = result_raw.convert("RGB")
        mask = mask_raw.convert("L")
        source = source_raw.convert("RGBA")
    subject = d2.binary_subject_mask(source.getchannel("A"))
    diff = ImageChops.difference(result, base).convert("L").point(lambda v: 255 if v > 0 else 0)
    diff.save(delta_target, format="PNG", optimize=False)
    in_subject = ImageChops.multiply(diff, ImageChops.multiply(mask, subject))
    outside_subject = ImageChops.multiply(diff, ImageChops.multiply(mask, ImageChops.invert(subject)))
    subject_changed = count_nonzero(in_subject)
    outside_changed = count_nonzero(outside_subject)
    if subject_changed < MIN_STAGE_SUBJECT_CHANGED_PIXELS:
        raise RuntimeError(f"D6_STAGE_SUBJECT_REPLACEMENT_TOO_SMALL:min={MIN_STAGE_SUBJECT_CHANGED_PIXELS}:actual={subject_changed}")
    if outside_changed < MIN_STAGE_OUTSIDE_CHANGED_PIXELS:
        raise RuntimeError(f"D6_STAGE_OUTSIDE_EVENT_TOO_SMALL:min={MIN_STAGE_OUTSIDE_CHANGED_PIXELS}:actual={outside_changed}")
    return {
        "subject_changed_pixels": subject_changed,
        "outside_changed_pixels": outside_changed,
        "total_changed_pixels": count_nonzero(diff),
    }


def finalize(prior_path: Path, stage_path: Path, union_path: Path, critical_path: Path, target: Path, evidence: Path) -> dict:
    with Image.open(prior_path) as prior_raw, Image.open(stage_path) as stage_raw, Image.open(union_path) as union_raw, Image.open(critical_path) as critical_raw:
        prior = prior_raw.convert("RGB")
        stage = stage_raw.convert("RGB")
        union = union_raw.convert("L")
        critical = critical_raw.convert("L")
    if not (prior.size == stage.size == union.size == critical.size):
        raise RuntimeError("D6_FINAL_DIMENSION_MISMATCH")

    final = Image.composite(stage, prior, union)
    final.save(target, format="PNG", optimize=False)

    outside = ImageChops.invert(union)
    diff = ImageChops.difference(final, prior)
    outside_probe = Image.new("RGB", final.size, (0, 0, 0))
    outside_probe.paste(diff, (0, 0), outside)
    if outside_probe.getbbox() is not None:
        raise RuntimeError("D6_OUTSIDE_OCCLUSION_UNION_CHANGED")

    critical_probe = Image.new("RGB", final.size, (0, 0, 0))
    critical_probe.paste(diff, (0, 0), critical)
    if critical_probe.getbbox() is not None:
        raise RuntimeError("D6_CRITICAL_LANDMARK_CHANGED")

    actual = diff.convert("L").point(lambda v: 255 if v > 0 else 0)
    actual.save(evidence / "actual_delta_mask.png", format="PNG", optimize=False)
    return {
        "outside_occlusion_union_exact": True,
        "critical_landmarks_exact_vs_d53": True,
        "actual_changed_pixels": count_nonzero(actual),
        "final_sha256": d0.sha256_file(target),
    }


def write_review(evidence: Path, recipe: dict, prompt_ids: dict[str, str]) -> Path:
    review = evidence / "review.html"
    document = f"""<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>P5 QA01 Kontext D6 Review</title><style>body{{font-family:Arial,sans-serif;background:#11161b;color:#eee;margin:24px}}.grid{{display:grid;grid-template-columns:1fr 1fr;gap:18px}}.card{{background:#1b2229;padding:14px;border:1px solid #333;border-radius:10px;margin-bottom:18px}}img{{width:100%;height:auto;background:white}}pre{{white-space:pre-wrap;color:#d7d7d7}}.warn{{color:#ffcc80}}.fail{{color:#ff8a80}}.ok{{color:#9fe0b3}}</style></head><body>
<h1>P5 QA01 v2 — Kontext D6 Forced Foreground Occlusion Plate</h1><p class="warn">EVALUATION ONLY / NON-PRODUCTION / QA01 DISABLED</p>
<p class="fail">D5.4 is formally closed: large pixel deltas did not create convincing physical depth.</p>
<p class="ok">D6 removes RGB wood from model reference conditioning and forces foreground ecology to replace explicitly authorized wood pixels.</p>
<div class="grid"><div class="card"><h2>VERIFIED SC01</h2><img src="source_sc01.png"></div><div class="card"><h2>D6 final candidate</h2><img src="candidate.png"></div></div>
<div class="grid"><div class="card"><h2>D5.3 prior</h2><img src="prior_d53_final.png"></div><div class="card"><h2>D6 silhouette + material reference (NO SELLABLE-PIECE RGB)</h2><img src="d6_reference_canvas.png"></div></div>
<div class="grid"><div class="card"><h2>Stage A — forced hardscape occlusion</h2><img src="stage_a_hardscape.png"></div><div class="card"><h2>Stage A mask</h2><img src="hardscape_occlusion_mask.png"></div></div>
<div class="grid"><div class="card"><h2>Stage B — forced epiphyte occlusion</h2><img src="stage_b_epiphyte.png"></div><div class="card"><h2>Stage B mask</h2><img src="epiphyte_occlusion_mask.png"></div></div>
<div class="grid"><div class="card"><h2>Stage A delta</h2><img src="stage_a_delta_mask.png"></div><div class="card"><h2>Stage B delta</h2><img src="stage_b_delta_mask.png"></div></div>
<div class="grid"><div class="card"><h2>Occlusion union</h2><img src="occlusion_union_mask.png"></div><div class="card"><h2>Critical landmark lock</h2><img src="critical_landmark_lock_mask.png"></div></div>
<div class="grid"><div class="card"><h2>Actual final delta vs D5.3</h2><img src="actual_delta_mask.png"></div><div class="card"><h2>Anti-replication material board</h2><img src="realism_material_board.png"></div></div>
<div class="card"><h2>D6 Recipe</h2><pre>{html.escape(json.dumps(recipe, ensure_ascii=False, indent=2))}</pre></div>
<div class="card"><h2>Stage A Prompt</h2><pre>{html.escape(HARDSCAPE_PROMPT)}</pre><p>prompt_id={html.escape(prompt_ids['hardscape'])}</p></div>
<div class="card"><h2>Stage B Prompt</h2><pre>{html.escape(EPIPHYTE_PROMPT)}</pre><p>prompt_id={html.escape(prompt_ids['epiphyte'])}</p></div>
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
            raise RuntimeError("QA01_MUST_REMAIN_DISABLED_DURING_KONTEXT_D6_EVAL")
        registry = d0.read_json(repo / "config" / "workflows" / "registry.json")
        qa01 = next((row for row in registry.get("workflows", []) if row.get("code") == "QA01"), None)
        if not qa01 or qa01.get("executable") is not False or qa01.get("workflow_status") != "NOT_REGISTERED":
            raise RuntimeError("QA01_REGISTRY_MUST_REMAIN_FAIL_CLOSED")

        prior = Path(args.prior_evidence_dir).resolve()
        d54.validate_prior_evidence(prior, profile, args.sku)
        if d0.sha256_file(prior / "candidate.png") != EXPECTED_D53_FINAL_SHA256:
            raise RuntimeError("D6_PRIOR_D53_BYTES_MISMATCH")
        if d0.sha256_file(prior / "realism_material_board.png") != EXPECTED_REALISM_BOARD_SHA256:
            raise RuntimeError("D6_REALISM_BOARD_BYTES_MISMATCH")

        evidence = Path(profile["control_root"]) / "evidence" / ("P5_QA01_V2_KONTEXT_D6_" + datetime.now().strftime("%Y%m%d-%H%M%S"))
        evidence.mkdir(parents=True, exist_ok=False)
        for src_name, dst_name in [
            ("source_sc01.png", "source_sc01.png"),
            ("candidate.png", "prior_d53_final.png"),
            ("wet_core.png", "wet_core.png"),
            ("realism_material_board.png", "realism_material_board.png"),
            ("scene_reference.png", "scene_reference.png"),
            ("prior_d52_environment.png", "prior_d52_environment.png"),
        ]:
            shutil.copy2(prior / src_name, evidence / dst_name)

        mask_metrics = build_occlusion_masks(evidence / "source_sc01.png", evidence)
        build_silhouette_material_reference(evidence / "source_sc01.png", evidence / "realism_material_board.png", evidence / "d6_reference_canvas.png")

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
            raise RuntimeError("D6_REQUIRED_NODES_MISSING:" + ",".join(missing))

        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        _, visible_reference = d2.copy_input(evidence / "d6_reference_canvas.png", profile, f"p5_qa01_kontext_d6_reference_{args.sku}_{stamp}.png")

        prompt_ids: dict[str, str] = {}
        stage_metrics: dict[str, dict] = {}
        stage_specs = [
            ("hardscape", evidence / "prior_d53_final.png", evidence / "hardscape_occlusion_mask.png", evidence / "stage_a_hardscape.png", HARDSCAPE_PROMPT, HARDSCAPE_SEED, HARDSCAPE_STEPS, HARDSCAPE_GUIDANCE, HARDSCAPE_DENOISE),
            ("epiphyte", evidence / "stage_a_hardscape.png", evidence / "epiphyte_occlusion_mask.png", evidence / "stage_b_epiphyte.png", EPIPHYTE_PROMPT, EPIPHYTE_SEED, EPIPHYTE_STEPS, EPIPHYTE_GUIDANCE, EPIPHYTE_DENOISE),
        ]

        for index, (label, base_path, mask_path, localized_path, prompt, seed, steps, guidance, denoise) in enumerate(stage_specs, start=1):
            latent_input = evidence / f"stage_{index}_{label}_masked_input.png"
            d54.make_latent_mask_input(base_path, mask_path, latent_input)
            _, visible_input = d2.copy_input(latent_input, profile, f"p5_qa01_kontext_d6_{label}_{args.sku}_{stamp}.png")
            workflow = d4.build_noise_mask_workflow(visible_reference, visible_input, infos, prompt=prompt, seed=seed, steps=steps, guidance=guidance, denoise=denoise)
            prompt_id, raw_target = d51.run_stage_sanitized(evidence, f"d6_{label}", workflow)
            prompt_ids[label] = prompt_id
            raw_copy = evidence / f"stage_{index}_{label}_raw.png"
            shutil.copy2(raw_target, raw_copy)
            d54.localize_stage(base_path, raw_target, mask_path, localized_path, evidence / f"stage_{index}_{label}_localized_delta.png")
            stage_metrics[label] = stage_delta_metrics(
                base_path,
                localized_path,
                mask_path,
                evidence / "source_sc01.png",
                evidence / ("stage_a_delta_mask.png" if label == "hardscape" else "stage_b_delta_mask.png"),
            )
            stage_metrics[label].update({
                "seed": seed,
                "steps": steps,
                "guidance": guidance,
                "denoise": denoise,
                "raw_sha256": d0.sha256_file(raw_copy),
                "localized_sha256": d0.sha256_file(localized_path),
            })

        final_metrics = finalize(
            evidence / "prior_d53_final.png",
            evidence / "stage_b_epiphyte.png",
            evidence / "occlusion_union_mask.png",
            evidence / "critical_landmark_lock_mask.png",
            evidence / "candidate.png",
            evidence,
        )

        recipe = {
            "schema_version": "0.620-eval-d6",
            "site_id": args.site_id,
            "sku": args.sku,
            "realm": "QA01_AQUARIUM",
            "source_sc01_sha256": EXPECTED_SOURCE_SHA256,
            "prior_d53_final_sha256": EXPECTED_D53_FINAL_SHA256,
            "d54_visual_result": "FAIL_LOCAL_MASKED_INPAINT_ARCHITECTURE_INSUFFICIENT",
            "architecture": "FORCED_FOREGROUND_OCCLUSION_PLATE_WITH_SILHOUETTE_ONLY_IDENTITY_GUIDE",
            "conditioning_contract": {
                "exact_sellable_piece_rgb_in_reference_canvas": False,
                "silhouette_edge_identity_guide_only": True,
                "realism_material_board_conditioned": True,
                "donor_scene_direct_pixels_passed_to_comfy": False,
                "masked_wood_reconstruction_forbidden": True,
            },
            "integration_contract": {
                "whole_subject_repaint_forbidden": True,
                "foreground_hardscape_must_replace_authorized_wood_pixels": True,
                "foreground_epiphyte_must_replace_authorized_wood_pixels": True,
                "third_generative_coherence_pass_forbidden": True,
                "outside_occlusion_union_must_remain_exact": True,
                "critical_landmarks_must_remain_exact": True,
            },
            "mask_metrics": mask_metrics,
            "stages": stage_metrics,
            "comfy_started_by_gate": started_by_gate,
            "production_mutation": "NONE",
            "qa01_enabled": False,
            "final_metrics": final_metrics,
        }
        (evidence / "scene_recipe.json").write_text(json.dumps(recipe, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        review = write_review(evidence, recipe, prompt_ids)

        print("P5_QA01_V2_KONTEXT_D6_EVAL_GATE=PASS")
        print(f"git_head={head}")
        print(f"sku={args.sku}")
        print("d54_visual_result=FAIL_LOCAL_MASKED_INPAINT_ARCHITECTURE_INSUFFICIENT")
        print("evaluation_only=True")
        print("production_authorized=False")
        print("qa01_enabled=False")
        print("architecture=FORCED_FOREGROUND_OCCLUSION_PLATE_WITH_SILHOUETTE_ONLY_IDENTITY_GUIDE")
        print("exact_sellable_piece_rgb_in_reference_canvas=False")
        print("masked_wood_reconstruction_forbidden=True")
        print(f"occlusion_subject_ratio={mask_metrics['occlusion_subject_ratio']}")
        print(f"unchanged_subject_ratio={mask_metrics['unchanged_subject_ratio']}")
        print(f"hardscape_subject_changed_pixels={stage_metrics['hardscape']['subject_changed_pixels']}")
        print(f"epiphyte_subject_changed_pixels={stage_metrics['epiphyte']['subject_changed_pixels']}")
        print(f"candidate_sha256={final_metrics['final_sha256']}")
        print(f"review_file={review}")
        print(f"evidence_dir={evidence}")
        return 0
    except Exception as exc:
        print("P5_QA01_V2_KONTEXT_D6_EVAL_GATE=FAIL")
        print(f"error={exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
