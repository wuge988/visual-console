#!/usr/bin/env python3
"""Read-only, network-free inventory of the existing P3-B reconstruction runtime.

Does not download models, run reconstructions, register models or alter projects.
Outputs the facts needed to bind an engine-specific isolated adapter later.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import importlib.util
import json
import platform
import sys
from datetime import datetime, timezone
from pathlib import Path


def digest(p: Path) -> str:
    h = hashlib.sha256()
    with p.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def installed(name: str) -> dict:
    try:
        version = importlib.metadata.version(name)
    except importlib.metadata.PackageNotFoundError:
        version = None
    try:
        spec = importlib.util.find_spec(name)
        location = str(spec.origin) if spec is not None and spec.origin else None
    except (ModuleNotFoundError, ValueError):
        location = None
    return {"version": version, "module_origin": location}


def relevant_directories(root: Path, words: tuple[str, ...], max_items: int = 30) -> list:
    if not root.is_dir():
        return []
    results = []
    try:
        entries = sorted(root.iterdir(), key=lambda e: e.name.lower())
    except OSError:
        return []
    for child in entries:
        if len(results) >= max_items:
            break
        if child.is_dir() and any(term in child.name.lower() for term in words):
            results.append(str(child))
    return results


def probe(stage: Path, tools_root: Path, models_root: Path) -> dict:
    stage = stage.resolve()
    receipt_path = stage / "approved_trial_input_manifest.json"
    if not receipt_path.is_file():
        raise ValueError("APPROVED_STAGE_RECEIPT_MISSING")
    receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
    if receipt.get("human_gate", {}).get("state") != "PASS_FOR_ISOLATED_3D_EVALUATION_ONLY":
        raise ValueError("HUMAN_GATE_NOT_EVALUATION_APPROVED")
    records = receipt.get("trial_inputs", [])
    if len(records) != 30 or receipt.get("source_frames") != 30:
        raise ValueError("STAGED_FRAME_COUNT_NOT_30")
    for i, rec in enumerate(records):
        if rec.get("frame_index") != i:
            raise ValueError("FRAME_INDEX_DRIFT")
        name = "frame_%03d.png" % i
        frame = stage / "images" / name
        mask = stage / "masks" / name
        if not frame.is_file() or not mask.is_file():
            raise ValueError("STAGED_PAIR_MISSING:" + str(i))
        if digest(frame) != rec.get("source_sha256") or digest(mask) != rec.get("mask_sha256"):
            raise ValueError("STAGED_PAIR_HASH_DRIFT:" + str(i))
    packages = {name: installed(name) for name in (
        "torch", "torchvision", "gsplat", "opencv-python", "Pillow",
        "transformers", "huggingface_hub", "safetensors", "vggt", "pycolmap",
    )}
    cuda = {"torch_import": False, "available": False, "gpu": None,
            "memory_total_gib": None, "error": None}
    try:
        import torch
        cuda["torch_import"] = True
        cuda["available"] = bool(torch.cuda.is_available())
        if cuda["available"]:
            cuda["gpu"] = torch.cuda.get_device_name(0)
            cuda["memory_total_gib"] = round(
                torch.cuda.get_device_properties(0).total_memory / (1024 ** 3), 2
            )
    except Exception as exc:
        cuda["error"] = type(exc).__name__ + ": " + str(exc).splitlines()[0][:160]
    names = ("video2twin", "recon3d", "vggt", "gsplat", "postshot")
    source_dirs = relevant_directories(tools_root, names)
    candidates = []
    for item in source_dirs[:20]:
        directory = Path(item)
        for name in ("run.py", "infer.py", "inference.py", "demo.py",
                     "reconstruct.py", "train.py", "README.md"):
            if (directory / name).is_file():
                candidates.append(str(directory / name))
    hub = models_root / "HuggingFace" / "hub"
    model_dirs = relevant_directories(hub, ("vggt", "recon3d", "video2twin"))
    checkpoints = []
    # Only inspect likely known model folders; never recurse over the full disk.
    for item in model_dirs[:12]:
        folder = Path(item)
        snapshots = folder / "snapshots"
        if not snapshots.is_dir():
            continue
        for snap in list(snapshots.iterdir())[:4]:
            if not snap.is_dir():
                continue
            for pattern in ("*.safetensors", "*.pt", "*.pth", "*.bin"):
                for file in list(snap.glob(pattern))[:8]:
                    checkpoints.append({
                        "path": str(file),
                        "size_bytes": file.stat().st_size,
                    })
    return {
        "schema_version": "1.0",
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "pilot_id": receipt["pilot_id"],
        "item_id": receipt["item_id"],
        "authority": "EVALUATION_ONLY",
        "human_gate": receipt["human_gate"]["state"],
        "input_manifest_sha256": digest(receipt_path),
        "validated_staged_pairs": 30,
        "runtime": {
            "python_executable": sys.executable,
            "python_version": platform.python_version(),
            "packages": packages,
            "cuda": cuda,
        },
        "discovery": {
            "tools_root": str(tools_root),
            "source_directories": source_dirs,
            "possible_entrypoints": candidates,
            "huggingface_hub": str(hub),
            "possible_model_directories": model_dirs,
            "possible_checkpoint_files": checkpoints,
        },
        "engine_adapter": "NOT_YET_IDENTIFIED_OR_VALIDATED",
        "commercial_model_license": "NOT_VERIFIED_BY_PROBE",
        "reconstruction_executed": False,
        "production_registration": False,
        "archive": "BLOCKED",
        "pdp": "UNCHANGED",
        "next": "Inspect inventory to identify exact existing VGGT Commercial + gsplat runner and safe GPU budget",
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--stage", type=Path, required=True)
    ap.add_argument("--tools-root", type=Path, default=Path(r"D:\AI\TOOLS"))
    ap.add_argument("--models-root", type=Path, default=Path(r"D:\AI\MODELS"))
    args = ap.parse_args()
    output = args.stage / "engine_probe.json"
    try:
        if output.exists():
            raise ValueError("ENGINE_PROBE_ALREADY_EXISTS")
        result = probe(args.stage, args.tools_root, args.models_root)
        output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n",
                          encoding="utf-8")
        print("P3B_RECON_ENGINE_PROBE=COMPLETE", flush=True)
        print("VERIFIED_STAGED_PAIRS=30", flush=True)
        print("TORCH_CUDA=" + ("PASS" if result["runtime"]["cuda"]["available"] else "MISSING"), flush=True)
        for name in ("torch", "gsplat", "vggt", "pycolmap"):
            item = result["runtime"]["packages"][name]
            print("PACKAGE_" + name.upper() + "=" + (item["version"] or "NOT_INSTALLED"), flush=True)
        print("VGGT_SOURCE_CANDIDATES=" +
              str(sum("vggt" in p.lower() for p in result["discovery"]["source_directories"])), flush=True)
        print("MODEL_FOLDER_CANDIDATES=" +
              str(len(result["discovery"]["possible_model_directories"])), flush=True)
        print("ENGINE_PROBE_JSON=" + str(output), flush=True)
        print("RECONSTRUCTION=NOT_EXECUTED", flush=True)
        return 0
    except Exception as exc:
        print("P3B_RECON_ENGINE_PROBE=FAIL", flush=True)
        print("error_type=" + type(exc).__name__, flush=True)
        print("error_summary=" + str(exc).splitlines()[0][:240], flush=True)
        print("RECONSTRUCTION=NOT_EXECUTED", flush=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
