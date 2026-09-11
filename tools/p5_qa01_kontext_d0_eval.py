from __future__ import annotations

import argparse
import hashlib
import html
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime

from PIL import Image

EXPECTED_BRANCH = "feat/p5-qa01-scene-freeze"
COMFY_ROOT = Path(r"D:\AI\APPS\ComfyUI_windows_portable")
MODEL_ROOT = Path(r"D:\AI\MODELS\ComfyUI")
COMFY_BASE = "http://127.0.0.1:8188"
SEED = 52073101
STEPS = 20
GUIDANCE = 2.5

MODELS = {
    "kontext": {
        "path": MODEL_ROOT / "diffusion_models" / "flux1-dev-kontext_fp8_scaled.safetensors",
        "name": "flux1-dev-kontext_fp8_scaled.safetensors",
        "size": 11904640136,
        "sha256": "630ba795ec64283b4230ea23cf79406c2c68b7c578229ed139f30043eadb30a2",
    },
    "vae": {
        "path": MODEL_ROOT / "vae" / "ae.safetensors",
        "name": "ae.safetensors",
        "size": 335304388,
        "sha256": "afc8e28272cd15db3919bacdb6918ce9c1ed22e96cb12c4d5ed0fba823529e38",
    },
    "clip_l": {
        "path": MODEL_ROOT / "text_encoders" / "clip_l.safetensors",
        "name": "clip_l.safetensors",
        "size": 246144152,
        "sha256": "660c6f5b1abae9dc498ac2d21e1347d2abdb0cf6c0c0c8576cd796491d9a6cdd",
    },
    "t5_fp8": {
        "path": MODEL_ROOT / "text_encoders" / "t5xxl_fp8_e4m3fn_scaled.safetensors",
        "name": "t5xxl_fp8_e4m3fn_scaled.safetensors",
        "size": 5157348688,
        "sha256": "a498f0485dc9536735258018417c3fd7758dc3bccc0a645feaa472b34955557a",
    },
}

PROMPT = (
    "Edit the exact driftwood in the reference image into one highly photorealistic freshwater planted aquarium photograph. "
    "Preserve the driftwood's exact major silhouette, branch topology, central cavities and holes, the upward left horn, the long upper-right branching, the heavy lower-right root mass, overall orientation, proportions, and recognizable wood texture. "
    "Do not add, delete, stretch, duplicate, or reshape any major wood branch or hole. "
    "Design the aquascape specifically around this exact piece rather than using a generic tank template: support the lower contact areas naturally with fine pale sand and a restrained group of rounded dark river stones; use the central negative spaces as open swim-through channels; attach only small realistic patches of aquatic moss and compact epiphytes to sheltered upper and inner branch areas without covering identity landmarks; keep low restrained aquatic plants near the base and outer edges. "
    "Make the entire driftwood read as physically submerged in the same aquarium with coherent wet wood response, realistic water attenuation, subtle soft caustics, shared neutral aquarium lighting, and believable contact shadows. "
    "Keep a roughly straight-on product-readable camera and natural perspective. Use restrained natural greens, neutral brown wood, believable clear glass and water, realistic scale, and premium editorial aquascaping photography. "
    "Avoid fantasy CGI, oversaturation, dramatic light rays, fake bokeh, floating wood, impossible glass, extra driftwood, duplicated roots, warped geometry, text, logos, and watermarks."
)


def run_git(repo: Path, *args: str) -> str:
    proc = subprocess.run(["git", *args], cwd=repo, text=True, capture_output=True)
    if proc.returncode != 0:
        raise RuntimeError(f"GIT_FAILED: git {' '.join(args)} :: {(proc.stdout + proc.stderr).strip()}")
    return proc.stdout.strip()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(4 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def assert_inside(root: Path, candidate: Path, code: str) -> None:
    root_resolved = root.resolve()
    candidate_resolved = candidate.resolve()
    try:
        candidate_resolved.relative_to(root_resolved)
    except ValueError as exc:
        raise RuntimeError(f"{code}: root={root_resolved} candidate={candidate_resolved}") from exc


def get_json(path: str, timeout: int = 45) -> dict | None:
    try:
        with urllib.request.urlopen(COMFY_BASE + path, timeout=timeout) as response:
            if response.status != 200:
                return None
            return json.loads(response.read().decode("utf-8-sig"))
    except Exception:
        return None


def post_json(path: str, payload: dict, timeout: int = 120) -> dict:
    body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    request = urllib.request.Request(
        COMFY_BASE + path,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8-sig")
            if response.status != 200:
                raise RuntimeError(f"COMFY_HTTP_{response.status}: {raw}")
            return json.loads(raw)
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"COMFY_PROMPT_HTTP_{exc.code}: {raw}") from exc


def node_info(name: str) -> dict | None:
    response = get_json("/object_info/" + urllib.parse.quote(name), 60)
    if not response:
        return None
    if name in response:
        return response[name]
    if "input" in response:
        return response
    return None


def combo_options(info: dict, group: str, name: str) -> list[str]:
    try:
        definition = info["input"][group][name]
    except (KeyError, TypeError):
        return []
    if not isinstance(definition, list) or not definition:
        return []
    first = definition[0]
    if isinstance(first, list):
        return [str(value) for value in first]
    if isinstance(first, str):
        return [first]
    return []


def exact_model_identity(label: str, spec: dict) -> None:
    path = Path(spec["path"])
    if not path.is_file():
        raise RuntimeError(f"KONTEXT_MODEL_MISSING:{label}:{path}")
    actual_size = path.stat().st_size
    if actual_size != spec["size"]:
        raise RuntimeError(f"KONTEXT_MODEL_SIZE_MISMATCH:{label}:expected={spec['size']}:actual={actual_size}")
    actual_hash = sha256_file(path)
    if actual_hash != spec["sha256"]:
        raise RuntimeError(f"KONTEXT_MODEL_SHA256_MISMATCH:{label}:actual={actual_hash}")


def wait_ready(evidence: Path) -> tuple[dict, bool]:
    stats = get_json("/system_stats", 20)
    if stats is not None:
        return stats, False

    python_exe = COMFY_ROOT / "python_embeded" / "python.exe"
    main_py = COMFY_ROOT / "ComfyUI" / "main.py"
    if not python_exe.is_file() or not main_py.is_file():
        raise RuntimeError("COMFYUI_PORTABLE_RUNTIME_NOT_FOUND")

    stdout_path = evidence / "comfy_stdout.log"
    stderr_path = evidence / "comfy_stderr.log"
    stdout_handle = stdout_path.open("wb")
    stderr_handle = stderr_path.open("wb")
    creationflags = 0
    if os.name == "nt":
        creationflags = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
    subprocess.Popen(
        [
            str(python_exe),
            "-s",
            str(main_py),
            "--windows-standalone-build",
            "--disable-auto-launch",
            "--lowvram",
            "--cpu-vae",
            "--listen",
            "127.0.0.1",
        ],
        cwd=str(COMFY_ROOT),
        stdout=stdout_handle,
        stderr=stderr_handle,
        creationflags=creationflags,
    )

    deadline = time.time() + 480
    while time.time() < deadline:
        stats = get_json("/system_stats", 20)
        if stats is not None:
            return stats, True
        time.sleep(3)
    raise RuntimeError(f"COMFYUI_LOWVRAM_START_TIMEOUT:evidence={evidence}")


def latest_verified(manifest: dict, workflow_code: str, destination_key: str) -> dict:
    rows = [
        row
        for row in manifest.get("archive_history", [])
        if str(row.get("gate")) == "15"
        and row.get("workflow_code") == workflow_code
        and row.get("destination_key") == destination_key
        and row.get("result") == "VERIFIED_ARCHIVE"
    ]
    if not rows:
        raise RuntimeError(f"VERIFIED_ARCHIVE_NOT_FOUND:{workflow_code}:{destination_key}")
    rows.sort(key=lambda row: str(row.get("archived_at", "")), reverse=True)
    return rows[0]


def validate_archive_entry(profile: dict, entry: dict, label: str) -> Path:
    path = Path(str(entry.get("destination_path", ""))).resolve()
    assert_inside(Path(profile["asset_root"]), path, f"{label}_OUTSIDE_ASSET_ROOT")
    if not path.is_file():
        raise RuntimeError(f"{label}_MISSING:{path}")
    expected_size = int(entry.get("size_bytes", -1))
    if path.stat().st_size != expected_size:
        raise RuntimeError(f"{label}_SIZE_MISMATCH")
    expected_hash = str(entry.get("sha256", "")).lower()
    actual_hash = sha256_file(path)
    if actual_hash != expected_hash:
        raise RuntimeError(f"{label}_SHA256_MISMATCH")
    return path


def make_white_reference(sc01_path: Path, target: Path) -> dict:
    with Image.open(sc01_path) as raw:
        subject = raw.convert("RGBA")
    alpha = subject.getchannel("A")
    bbox = alpha.getbbox()
    if bbox is None:
        raise RuntimeError("SC01_ALPHA_EMPTY")
    nonzero = sum(1 for value in alpha.getdata() if value > 0)
    occupied_ratio = nonzero / float(subject.width * subject.height)
    white = Image.new("RGBA", subject.size, (255, 255, 255, 255))
    white.alpha_composite(subject)
    white.convert("RGB").save(target, format="PNG", optimize=False)
    return {
        "width": subject.width,
        "height": subject.height,
        "visible_aspect_ratio": subject.width / float(subject.height),
        "alpha_bbox": list(bbox),
        "occupied_area_ratio": occupied_ratio,
    }


def choose_visible_input(filename: str, load_info: dict) -> str:
    options = combo_options(load_info, "required", "image")
    for option in options:
        if Path(option).name.lower() == filename.lower():
            return option
    raise RuntimeError(f"KONTEXT_EVAL_INPUT_NOT_VISIBLE:filename={filename}:option_count={len(options)}")


def build_workflow(visible_input: str, infos: dict) -> dict:
    dual_inputs = {
        "clip_name1": MODELS["clip_l"]["name"],
        "clip_name2": MODELS["t5_fp8"]["name"],
        "type": "flux",
    }
    device_options = combo_options(infos["DualCLIPLoader"], "optional", "device")
    if "cpu" in [value.lower() for value in device_options]:
        dual_inputs["device"] = "cpu"

    return {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": MODELS["kontext"]["name"], "weight_dtype": "default"}},
        "2": {"class_type": "DualCLIPLoader", "inputs": dual_inputs},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": MODELS["vae"]["name"]}},
        "4": {"class_type": "LoadImage", "inputs": {"image": visible_input}},
        "5": {"class_type": "FluxKontextImageScale", "inputs": {"image": ["4", 0]}},
        "6": {"class_type": "VAEEncode", "inputs": {"pixels": ["5", 0], "vae": ["3", 0]}},
        "7": {"class_type": "CLIPTextEncode", "inputs": {"text": PROMPT, "clip": ["2", 0]}},
        "8": {"class_type": "ReferenceLatent", "inputs": {"conditioning": ["7", 0], "latent": ["6", 0]}},
        "9": {"class_type": "FluxGuidance", "inputs": {"conditioning": ["8", 0], "guidance": GUIDANCE}},
        "10": {"class_type": "ConditioningZeroOut", "inputs": {"conditioning": ["7", 0]}},
        "11": {
            "class_type": "KSampler",
            "inputs": {
                "seed": SEED,
                "steps": STEPS,
                "cfg": 1.0,
                "sampler_name": "euler",
                "scheduler": "simple",
                "denoise": 1.0,
                "model": ["1", 0],
                "positive": ["9", 0],
                "negative": ["10", 0],
                "latent_image": ["6", 0],
            },
        },
        "12": {"class_type": "VAEDecode", "inputs": {"samples": ["11", 0], "vae": ["3", 0]}},
        "13": {"class_type": "PreviewImage", "inputs": {"images": ["12", 0]}},
    }


def wait_image(prompt_id: str, timeout_seconds: int = 2400) -> dict:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        history = get_json("/history/" + urllib.parse.quote(prompt_id), 60)
        if history:
            row = history.get(prompt_id, history if "outputs" in history else None)
            if row:
                outputs = row.get("outputs") or {}
                images = (outputs.get("13") or {}).get("images") or []
                if images:
                    return images[0]
                status = row.get("status") or {}
                if status.get("completed") is True:
                    raise RuntimeError("KONTEXT_PROMPT_COMPLETED_WITHOUT_PREVIEW:" + json.dumps(status, separators=(",", ":")))
                if status.get("status_str") == "error":
                    raise RuntimeError("KONTEXT_PROMPT_RUNTIME_ERROR:" + json.dumps(status, separators=(",", ":")))
        time.sleep(4)
    raise RuntimeError(f"KONTEXT_PROMPT_TIMEOUT:prompt_id={prompt_id}")


def download_comfy_image(image_info: dict, destination: Path) -> None:
    query = urllib.parse.urlencode(
        {
            "filename": image_info.get("filename", ""),
            "subfolder": image_info.get("subfolder", ""),
            "type": image_info.get("type", "temp"),
        }
    )
    with urllib.request.urlopen(COMFY_BASE + "/view?" + query, timeout=240) as response:
        destination.write_bytes(response.read())
    if not destination.is_file() or destination.stat().st_size < 1024:
        raise RuntimeError("KONTEXT_PREVIEW_DOWNLOAD_INVALID")


def write_review(evidence: Path, recipe: dict, prompt_id: str) -> Path:
    review = evidence / "review.html"
    document = f"""<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>P5 QA01 Kontext D0 Review</title>
<style>body{{font-family:Arial,sans-serif;background:#11161b;color:#eee;margin:24px}}h1{{font-size:24px}}.grid{{display:grid;grid-template-columns:1fr 1fr;gap:18px}}.card{{background:#1b2229;padding:14px;border:1px solid #333;border-radius:10px}}img{{width:100%;height:auto;background:white}}code,pre{{white-space:pre-wrap;color:#d7d7d7}}.warn{{color:#ffcc80}}</style></head>
<body><h1>P5 QA01 v2 — Kontext D0 单张真实感评估</h1>
<p class="warn">EVALUATION ONLY / NON-PRODUCTION / QA01 DISABLED</p>
<div class="grid"><div class="card"><h2>VERIFIED SC01 reference</h2><img src="source_sc01.png"></div><div class="card"><h2>Kontext D0 candidate</h2><img src="candidate.png"></div></div>
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
        if Path(run_git(repo, "rev-parse", "--show-toplevel")).resolve() != repo:
            raise RuntimeError("REPO_ROOT_MISMATCH")
        dirty = run_git(repo, "status", "--porcelain=v1", "--untracked-files=all")
        if dirty.strip():
            raise RuntimeError("WORKTREE_NOT_CLEAN:" + dirty.replace("\n", " | "))
        branch = run_git(repo, "branch", "--show-current")
        if branch != EXPECTED_BRANCH:
            raise RuntimeError(f"WRONG_BRANCH:expected={EXPECTED_BRANCH}:actual={branch}")
        head = run_git(repo, "rev-parse", "HEAD")
        if args.expected_head and head != args.expected_head.strip():
            raise RuntimeError(f"HEAD_MISMATCH:expected={args.expected_head.strip()}:actual={head}")

        profile = read_json(repo / "config" / "sites" / f"{args.site_id}.json")
        if "QA01" in profile.get("enabled_workflows", []):
            raise RuntimeError("QA01_MUST_REMAIN_DISABLED_DURING_KONTEXT_D0_EVAL")
        registry = read_json(repo / "config" / "workflows" / "registry.json")
        qa01 = next((row for row in registry.get("workflows", []) if row.get("code") == "QA01"), None)
        if not qa01 or qa01.get("executable") is not False or qa01.get("workflow_status") != "NOT_REGISTERED":
            raise RuntimeError("QA01_REGISTRY_MUST_REMAIN_FAIL_CLOSED")

        evidence = Path(profile["control_root"]) / "evidence" / ("P5_QA01_V2_KONTEXT_D0_" + datetime.now().strftime("%Y%m%d-%H%M%S"))
        evidence.mkdir(parents=True, exist_ok=False)

        manifest = read_json(Path(profile["manifest_root"]) / f"{args.sku}.json")
        if manifest.get("sku") not in (None, "", args.sku):
            raise RuntimeError("MANIFEST_SKU_MISMATCH")
        sc01_entry = latest_verified(manifest, "SC01", "cutout")
        sc01_path = validate_archive_entry(profile, sc01_entry, "VERIFIED_SC01")
        source_copy = evidence / "source_sc01.png"
        shutil.copy2(sc01_path, source_copy)
        if sha256_file(source_copy) != str(sc01_entry["sha256"]).lower():
            raise RuntimeError("SC01_EVIDENCE_COPY_SHA256_MISMATCH")

        shape = make_white_reference(source_copy, evidence / "eval_input_white.png")
        recipe = {
            "schema_version": "0.1-eval",
            "site_id": args.site_id,
            "sku": args.sku,
            "realm": "QA01_AQUARIUM",
            "source_sc01_sha256": sha256_file(source_copy),
            "shape_metrics": shape,
            "observed_structure": {
                "dominant_mass": "heavy lower-right root mass with substantial central body",
                "branch_flow": "long upper-right branching with a distinct upward left horn",
                "negative_space": "large central cavities and swim-through openings",
                "support_strategy": "low contact zones supported by sand plus restrained rounded river stones",
            },
            "composition_grammar": "shape-driven branch-led Nature Aquarium with open central negative space",
            "planting": "selective moss/compact epiphytes on sheltered branches; low planting at base/outer edges",
            "camera": "roughly straight-on, product-readable, preserve original orientation and proportions",
            "identity_core": "major branch topology, holes, silhouette landmarks, proportions, recognizable texture",
            "integration_band": "limited edge/contact blending, wetness, substrate contact, moss/epiphyte attachment, shared light",
            "no_prefab_background": True,
        }
        (evidence / "scene_recipe.json").write_text(json.dumps(recipe, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        (evidence / "prompt.txt").write_text(PROMPT + "\n", encoding="utf-8")

        for label, spec in MODELS.items():
            exact_model_identity(label, spec)

        stats, started_by_gate = wait_ready(evidence)
        required_nodes = [
            "UNETLoader", "DualCLIPLoader", "VAELoader", "LoadImage", "FluxKontextImageScale",
            "VAEEncode", "CLIPTextEncode", "ReferenceLatent", "FluxGuidance",
            "ConditioningZeroOut", "KSampler", "VAEDecode", "PreviewImage",
        ]
        infos: dict[str, dict] = {}
        missing: list[str] = []
        for name in required_nodes:
            info = node_info(name)
            if info is None:
                missing.append(name)
            else:
                infos[name] = info
        if missing:
            raise RuntimeError("KONTEXT_REQUIRED_NODES_MISSING:" + ",".join(missing))

        if MODELS["kontext"]["name"] not in combo_options(infos["UNETLoader"], "required", "unet_name"):
            raise RuntimeError("KONTEXT_MODEL_NOT_VISIBLE_TO_UNETLOADER")
        clip1_options = combo_options(infos["DualCLIPLoader"], "required", "clip_name1")
        clip2_options = combo_options(infos["DualCLIPLoader"], "required", "clip_name2")
        if MODELS["clip_l"]["name"] not in clip1_options and MODELS["clip_l"]["name"] not in clip2_options:
            raise RuntimeError("CLIP_L_NOT_VISIBLE_TO_DUALCLIPLOADER")
        if MODELS["t5_fp8"]["name"] not in clip1_options and MODELS["t5_fp8"]["name"] not in clip2_options:
            raise RuntimeError("T5_FP8_NOT_VISIBLE_TO_DUALCLIPLOADER")
        if MODELS["vae"]["name"] not in combo_options(infos["VAELoader"], "required", "vae_name"):
            raise RuntimeError("AE_VAE_NOT_VISIBLE_TO_VAELOADER")

        eval_filename = f"p5_qa01_kontext_d0_{args.sku}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
        input_candidates = [COMFY_ROOT / "ComfyUI" / "input", Path(profile.get("comfyui_input_root", ""))]
        copied_inputs: list[str] = []
        for root in input_candidates:
            if not str(root):
                continue
            root.mkdir(parents=True, exist_ok=True)
            target = root / eval_filename
            if not target.exists():
                shutil.copy2(evidence / "eval_input_white.png", target)
            if sha256_file(target) != sha256_file(evidence / "eval_input_white.png"):
                raise RuntimeError(f"EVAL_INPUT_COPY_SHA_MISMATCH:{target}")
            copied_inputs.append(str(target))

        infos["LoadImage"] = node_info("LoadImage") or infos["LoadImage"]
        visible_input = choose_visible_input(eval_filename, infos["LoadImage"])
        workflow = build_workflow(visible_input, infos)
        (evidence / "workflow_api.json").write_text(json.dumps(workflow, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

        client_id = "p5-qa01-kontext-d0-" + datetime.now().strftime("%Y%m%d%H%M%S")
        response = post_json("/prompt", {"prompt": workflow, "client_id": client_id}, 180)
        prompt_id = str(response.get("prompt_id", ""))
        if not prompt_id:
            raise RuntimeError("KONTEXT_PROMPT_ID_MISSING")
        (evidence / "prompt_id.txt").write_text(prompt_id + "\n", encoding="utf-8")

        image_info = wait_image(prompt_id)
        candidate = evidence / "candidate.png"
        download_comfy_image(image_info, candidate)
        review = write_review(evidence, recipe, prompt_id)

        report = {
            "schema_version": "0.1-eval",
            "at": datetime.now().astimezone().isoformat(),
            "git_head": head,
            "site_id": args.site_id,
            "sku": args.sku,
            "evaluation_only": True,
            "production_authorized": False,
            "qa01_enabled": False,
            "model_set_identity_pass": True,
            "comfy_started_by_gate": started_by_gate,
            "seed": SEED,
            "steps": STEPS,
            "guidance": GUIDANCE,
            "prompt_id": prompt_id,
            "source_sc01_sha256": sha256_file(source_copy),
            "candidate_sha256": sha256_file(candidate),
            "copied_input_paths": copied_inputs,
            "review_file": str(review),
            "evidence_dir": str(evidence),
            "devices": stats.get("devices", []),
        }
        (evidence / "result.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        summary = [
            "P5_QA01_V2_KONTEXT_D0_EVAL_GATE=PASS",
            f"git_head={head}",
            f"sku={args.sku}",
            "evaluation_only=True",
            "production_authorized=False",
            "qa01_enabled=False",
            "model_set_identity_pass=True",
            f"comfy_started_by_gate={started_by_gate}",
            f"seed={SEED}",
            f"steps={STEPS}",
            f"guidance={GUIDANCE}",
            f"prompt_id={prompt_id}",
            f"source_sc01_sha256={report['source_sc01_sha256']}",
            f"candidate_sha256={report['candidate_sha256']}",
            f"review_file={review}",
            f"evidence_dir={evidence}",
        ]
        (evidence / "summary.txt").write_text("\n".join(summary) + "\n", encoding="utf-8")
        print("\n".join(summary), flush=True)
        if os.name == "nt":
            try:
                os.startfile(review)  # type: ignore[attr-defined]
            except Exception:
                pass
        return 0
    except Exception as exc:
        print("P5_QA01_V2_KONTEXT_D0_EVAL_GATE=FAIL", flush=True)
        print(f"error={exc}", flush=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
