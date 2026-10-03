#!/usr/bin/env python3
"""P3-B VGGT Commercial deep probe, read-only except one additive JSON receipt.

Identifies actual module code, frozen cached commercial weight format and nearby
local reconstruction entrypoints BEFORE selecting any GPU compute command.
Never downloads, installs, instantiates a VGGT model, imports a demo, runs
reconstruction, or edits sources/masks/checkpoint/project files.
"""
from __future__ import annotations

import argparse
import collections
import hashlib
import importlib
import importlib.metadata
import importlib.util
import json
import os
import platform
import struct
import sys
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path

ITEM_ID = "DC-ZY-SZ-31001"
RECEIPT_SHA = "5fe8c92c7476e70e1f7e6bd3139efa251383ebd986449743b330a37b1ad46b27"
FIRST_PROBE_SHA = "d651f44adef0679f273e84ae70e06138ac36a372687d9d856223889e4a31e7f9"
MODEL_FILENAME = "model.safetensors"
MODEL_FOLDER = "models--facebook--VGGT-1B-Commercial"
MODEL_BYTES = 5026367224
MAX_SAFETENSORS_HEADER = 64 * 1024 * 1024
SKIP_NAMES = {
    ".git", ".venv", "venv", "venv-py310", "venv-py312", "__pycache__",
    "node_modules", ".next", "dist", "build", "site-packages",
    "huggingface", "huggingface-cache", "checkpoints", "models", "snapshots",
}
ENTRY_NAMES = {
    "demo_colmap.py", "demo_viser.py", "demo_gradio.py", "reconstruct.py",
    "inference.py", "run_reconstruction.py", "run.py", "train.py",
    "simple_trainer.py", "pyproject.toml", "requirements.txt",
}
PROJECT_ROOT = Path(r"E:\AI_PROJECTS\DRIFT_CURIO_VISUAL\p3b\DC-ZY-SZ-31001")
EXPECTED_STAGE_NAME = "20261003-001219-approved-recon-eval-input"


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def require(condition: bool, code: str) -> None:
    if not condition:
        raise RuntimeError(code)


def check_staged_inputs(stage: Path) -> tuple[dict, dict]:
    stage = stage.resolve()
    require(stage.name == EXPECTED_STAGE_NAME and stage.parent == PROJECT_ROOT.resolve(),
            "UNEXPECTED_STAGE_DIRECTORY")
    receipt_path = stage / "approved_trial_input_manifest.json"
    prior_path = stage / "engine_probe.json"
    require(receipt_path.is_file() and prior_path.is_file(), "PREVIOUS_EVIDENCE_MISSING")
    require(sha256(receipt_path) == RECEIPT_SHA, "RECEIPT_HASH_DRIFT")
    require(sha256(prior_path) == FIRST_PROBE_SHA, "FIRST_PROBE_HASH_DRIFT")
    receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
    prior = json.loads(prior_path.read_text(encoding="utf-8"))
    require(receipt.get("item_id") == ITEM_ID and prior.get("item_id") == ITEM_ID,
            "SKU_IDENTITY_DRIFT")
    require(receipt.get("human_gate", {}).get("state") ==
            "PASS_FOR_ISOLATED_3D_EVALUATION_ONLY", "HUMAN_GATE_SCOPE_DRIFT")
    require(receipt.get("reconstruction_executed") is False and
            prior.get("reconstruction_executed") is False, "RECON_EVIDENCE_STATE_DRIFT")
    require(prior.get("input_manifest_sha256") == RECEIPT_SHA, "PROBE_LINK_MISMATCH")
    records = receipt.get("trial_inputs", [])
    require(len(records) == 30 and prior.get("validated_staged_pairs") == 30,
            "STAGE_COUNT_DRIFT")
    for i, record in enumerate(records):
        require(record.get("frame_index") == i and
                record.get("width") == 960 and record.get("height") == 540,
                "FRAME_ORDER_OR_GEOMETRY:" + str(i))
        name = "frame_%03d.png" % i
        image_path = stage / "images" / name
        mask_path = stage / "masks" / name
        require(image_path.is_file() and mask_path.is_file(),
                "STAGE_FILE_MISSING:" + str(i))
        require(sha256(image_path) == record.get("source_sha256") and
                sha256(mask_path) == record.get("mask_sha256"),
                "STAGED_BYTES_DRIFT:" + str(i))
    return receipt, prior


def safetensors_header(path: Path) -> dict:
    require(path.name == MODEL_FILENAME, "MODEL_FILENAME_MISMATCH")
    actual_bytes = path.stat().st_size
    require(actual_bytes == MODEL_BYTES, "MODEL_CHECKPOINT_SIZE_DRIFT")
    with path.open("rb") as stream:
        preamble = stream.read(8)
        require(len(preamble) == 8, "SAFETENSORS_PREAMBLE_MISSING")
        header_len = struct.unpack("<Q", preamble)[0]
        require(0 < header_len <= MAX_SAFETENSORS_HEADER,
                "SAFETENSORS_HEADER_BOUNDS")
        raw = stream.read(header_len)
        require(len(raw) == header_len, "SAFETENSORS_HEADER_TRUNCATED")
    header = json.loads(raw)
    counters = collections.Counter()
    examples = []
    biggest_end = 0
    num_tensors = 0
    for name, spec in header.items():
        if name == "__metadata__":
            continue
        dtype = spec.get("dtype")
        dims = spec.get("shape")
        offsets = spec.get("data_offsets")
        require(isinstance(dtype, str) and isinstance(dims, list) and
                isinstance(offsets, list) and len(offsets) == 2 and
                all(isinstance(x, int) and x >= 0 for x in offsets) and
                offsets[1] >= offsets[0], "SAFETENSORS_METADATA_INVALID")
        counters[dtype] += 1
        biggest_end = max(biggest_end, offsets[1])
        num_tensors += 1
        if len(examples) < 12:
            examples.append({"tensor_name": name[:120], "shape": dims,
                             "dtype": dtype})
    require(num_tensors > 0 and 8 + header_len + biggest_end == actual_bytes,
            "SAFETENSORS_PAYLOAD_BOUNDS")
    return {
        "path": str(path), "size_bytes": actual_bytes,
        "header_bytes": header_len, "num_tensors": num_tensors,
        "tensor_dtypes": dict(counters),
        "sample_tensor_metadata": examples,
        "payload_bounds_pass": True,
        "full_weight_sha256": "NOT_COMPUTED_NO_5GB_EXTRA_SCAN",
        "weights_loaded_to_cpu": False, "weights_loaded_to_cuda": False,
    }


def module_inventory() -> dict:
    summary = {"distribution": "vggt", "distribution_version": None,
               "distribution_root": None, "install_provenance": None,
               "module_specs": {}, "model_class_import": "NOT_ATTEMPTED"}
    try:
        dist = importlib.metadata.distribution("vggt")
        summary["distribution_version"] = dist.version
        summary["distribution_root"] = str(dist.locate_file(""))
        direct = dist.read_text("direct_url.json")
        if direct:
            info = json.loads(direct)
            origin = urllib.parse.urlparse(info.get("url", ""))
            summary["install_provenance"] = {
                "source_type": origin.scheme or "UNKNOWN",
                "local_editable": bool(info.get("dir_info", {}).get("editable")),
                "local_directory": (urllib.parse.unquote(origin.path)
                                    if origin.scheme == "file" else None),
                "remote_host": (origin.hostname if origin.scheme not in ("file", "")
                                else None),
            }
        else:
            summary["install_provenance"] = {"source_type": "PACKAGE_METADATA_ONLY"}
    except importlib.metadata.PackageNotFoundError:
        summary["distribution_version"] = "NOT_INSTALLED"
    for mod in ("vggt", "vggt.models", "vggt.models.vggt",
                "vggt.utils.load_fn", "gsplat", "pycolmap"):
        try:
            spec = importlib.util.find_spec(mod)
            summary["module_specs"][mod] = {
                "found": spec is not None,
                "origin": str(spec.origin) if spec and spec.origin else None,
                "search_paths": list(map(str, spec.submodule_search_locations))
                if spec and spec.submodule_search_locations else [],
            }
        except Exception as exc:
            summary["module_specs"][mod] = {
                "found": False, "error_type": type(exc).__name__,
                "error_summary": str(exc).splitlines()[0][:180],
            }
    if summary["module_specs"].get("vggt.models.vggt", {}).get("found"):
        try:
            model_mod = importlib.import_module("vggt.models.vggt")
            summary["model_class_import"] = (
                "PASS_CLASS_AVAILABLE" if hasattr(model_mod, "VGGT")
                else "FAIL_VGGT_CLASS_MISSING"
            )
        except Exception as exc:
            summary["model_class_import"] = "FAIL_IMPORT_DEPENDENCY"
            summary["model_import_error"] = (
                type(exc).__name__ + ": " + str(exc).splitlines()[0][:180]
            )
    else:
        summary["model_class_import"] = "FAIL_SOURCE_NOT_FOUND"
    return summary


def scan_candidate_sources(roots: list[Path]) -> dict:
    matches = []
    scanned_dirs = 0
    truncated = False
    visited = set()
    for root in roots:
        if not root.is_dir():
            continue
        queue = [(root.resolve(), 0)]
        while queue and scanned_dirs < 260:
            directory, depth = queue.pop(0)
            if str(directory).lower() in visited:
                continue
            visited.add(str(directory).lower())
            scanned_dirs += 1
            try:
                entries = sorted(directory.iterdir(), key=lambda p: p.name.lower())
            except OSError:
                continue
            for item in entries[:150]:
                name = item.name.lower()
                if item.is_file() and name in ENTRY_NAMES:
                    matches.append(str(item))
                elif item.is_dir() and not item.is_symlink() and depth < 3 and (
                    name not in SKIP_NAMES and not name.startswith(".")
                ):
                    queue.append((item, depth + 1))
                if len(matches) >= 65:
                    truncated = True
                    return {"roots": [str(x) for x in roots], "scanned_directories":
                            scanned_dirs, "candidate_files": matches[:65],
                            "truncated": truncated}
        if queue:
            truncated = True
    return {"roots": [str(x) for x in roots],
            "scanned_directories": scanned_dirs,
            "candidate_files": matches, "truncated": truncated}


def read_small_local_config(folder: Path) -> dict:
    configs = {}
    for name in ("config.json", "README.md", "LICENSE", "license.txt"):
        path = folder / name
        if path.is_file() and path.stat().st_size < 1_000_000:
            row = {"present": True, "sha256": sha256(path),
                   "size_bytes": path.stat().st_size}
            if name == "config.json":
                try:
                    obj = json.loads(path.read_text(encoding="utf-8"))
                    row["content"] = obj
                except (ValueError, UnicodeError):
                    row["content"] = "INVALID_OR_NON_UTF8"
            configs[name] = row
        else:
            configs[name] = {"present": False}
    return configs


def gpu_inventory() -> dict:
    report = {"torch_available": False, "cuda_available": False,
              "model_instantiated": False, "weights_loaded": False}
    try:
        import torch
        report["torch_available"] = True
        report["torch_version"] = torch.__version__
        report["cuda_available"] = bool(torch.cuda.is_available())
        if report["cuda_available"]:
            free, total = torch.cuda.mem_get_info()
            report.update({
                "device": torch.cuda.get_device_name(0),
                "capability": list(torch.cuda.get_device_capability(0)),
                "free_vram_gib": round(free / 2**30, 3),
                "total_vram_gib": round(total / 2**30, 3),
                "torch_current_allocated_gib": round(
                    torch.cuda.memory_allocated(0) / 2**30, 3),
            })
    except Exception as exc:
        report["error"] = type(exc).__name__ + ": " + str(exc).splitlines()[0][:180]
    try:
        import psutil
        mem = psutil.virtual_memory()
        report["system_ram_total_gib"] = round(mem.total / 2**30, 3)
        report["system_ram_available_gib"] = round(mem.available / 2**30, 3)
    except ImportError:
        report["system_ram"] = "UNAVAILABLE_PSUTIL"
    return report


def run(stage: Path, output: Path) -> int:
    require(not output.exists(), "OUTPUT_ALREADY_EXISTS")
    receipt, prior = check_staged_inputs(stage)
    candidate = prior["discovery"]["possible_checkpoint_files"]
    require(len(candidate) == 1, "UNEXPECTED_MODEL_CANDIDATE_COUNT")
    recorded = candidate[0]
    checkpoint = Path(recorded["path"])
    require(MODEL_FOLDER in checkpoint.parts and
            checkpoint.parent.parent.name == "snapshots" and
            checkpoint.parent.parent.parent.name == MODEL_FOLDER,
            "CHECKPOINT_NOT_PINNED_COMMERCIAL_SNAPSHOT")
    require(checkpoint.is_file() and recorded["size_bytes"] == MODEL_BYTES,
            "COMMERCIAL_CHECKPOINT_MISSING_OR_SIZE_DRIFT")
    module = module_inventory()
    weights = safetensors_header(checkpoint)
    sources = scan_candidate_sources([
        Path(r"D:\AI\TOOLS\DC_Video2Twin"),
        Path(r"D:\AI\TOOLS"),
        Path(r"E:\AI_PROJECTS"),
    ])
    result = {
        "schema_version": "1.0", "created_utc": datetime.now(timezone.utc).isoformat(),
        "pilot_id": receipt["pilot_id"], "item_id": ITEM_ID,
        "authority": "EVALUATION_ONLY",
        "human_gate": "PASS_FOR_ISOLATED_3D_EVALUATION_ONLY",
        "upstream_reference": {
            "vggt_git_sha_at_design": "a288dd0f14786c93483e45524328726ab7b1b4ce",
            "official_demo_colmap_masks": "TODO_NOT_NATIVE",
            "official_demo_default_checkpoint": "NON_COMMERCIAL_MUST_NOT_USE",
            "commercial_checkpoint_license": "META_VGGT_AUP_USER_COMPLIANCE_NOT_INFERRED",
        },
        "receipt_sha256": RECEIPT_SHA, "prior_probe_sha256": FIRST_PROBE_SHA,
        "staged_pair_sha256_verified": 30, "module": module,
        "commercial_weights": weights,
        "cached_model_auxiliary_files": read_small_local_config(checkpoint.parent),
        "local_sources": sources,
        "hardware": gpu_inventory(),
        "engine_entrypoint": "NOT_SELECTED",
        "model_forward_executed": False, "reconstruction_executed": False,
        "production_registration": False, "archive": "BLOCKED",
        "pdp": "UNCHANGED", "source_mutations": False,
        "next": "Inspect vggt code import and pinned commercial weights; choose a <=4-view masked-image smoke under 8GB, only when validated",
    }
    # All input validation and inventory must finish before this additive write.
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2)+"\n",
                      encoding="utf-8")
    print("P3B_VGGT_COMMERCIAL_DEEP_PROBE=COMPLETE", flush=True)
    print("INPUT_HASHED_PAIRS=30", flush=True)
    print("VGGT_IMPORT=" + module["model_class_import"], flush=True)
    print("WEIGHT_FORMAT=SAFETENSORS", flush=True)
    print("WEIGHT_DTYPES=" + json.dumps(weights["tensor_dtypes"]), flush=True)
    print("FREE_VRAM_GIB=" + str(result["hardware"].get("free_vram_gib", "UNKNOWN")),
          flush=True)
    print("SOURCE_CANDIDATE_COUNT=" +
          str(len(sources["candidate_files"])), flush=True)
    print("DEEP_PROBE_JSON=" + str(output), flush=True)
    print("GPU_INFERENCE=NOT_EXECUTED", flush=True)
    print("RECONSTRUCTION=NOT_EXECUTED", flush=True)
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--stage", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        return run(args.stage, args.output)
    except Exception as exc:
        print("P3B_VGGT_COMMERCIAL_DEEP_PROBE=FAIL", flush=True)
        print("error_type=" + type(exc).__name__, flush=True)
        print("error_summary=" + str(exc).splitlines()[0][:240], flush=True)
        print("GPU_INFERENCE=NOT_EXECUTED", flush=True)
        print("RECONSTRUCTION=NOT_EXECUTED", flush=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
