#!/usr/bin/env python3
"""P3-B: offline, CPU meta-only VGGT Commercial checkpoint/source compatibility.

Zero weight tensor loading, zero GPU model allocation, no forward pass.
Pinned to the exact previous staged evidence and local Commercial snapshot.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import struct
import sys
import traceback
from datetime import datetime, timezone
from pathlib import Path

SKU = "DC-ZY-SZ-31001"
ROOT = Path(r"E:\AI_PROJECTS\DRIFT_CURIO_VISUAL\p3b\DC-ZY-SZ-31001")
STAGE_NAME = "20261003-001219-approved-recon-eval-input"
STAGE_RECEIPT_SHA = "5fe8c92c7476e70e1f7e6bd3139efa251383ebd986449743b330a37b1ad46b27"
DEEP_INVENTORY_SHA = "b34384a36807fd8ae8efd87b626772334b7c6e6fb3186e765a3d4a8f1efcf34f"
DEEP_INVENTORY_NAME = "engine_deep_probe_offline_20261003-131150.json"
EXPECTED_SNAPSHOT = "ebb29a532abe92960eeb6903a5530f16990ef4ab"
CHECKPOINT_BYTES = 5026367224
EXPECTED_TENSORS = 1797
MAX_HEADER = 64 * 1024 * 1024


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(4 * 1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def demand(test: bool, message: str) -> None:
    if not test:
        raise RuntimeError(message)


def header_metadata(checkpoint: Path) -> dict:
    demand(checkpoint.name == "model.safetensors", "WRONG_CHECKPOINT_FILENAME")
    demand(checkpoint.stat().st_size == CHECKPOINT_BYTES, "CHECKPOINT_SIZE_DRIFT")
    with checkpoint.open("rb") as handle:
        header_size_data = handle.read(8)
        demand(len(header_size_data) == 8, "SAFETENSORS_HEADER_MISSING")
        header_size = struct.unpack("<Q", header_size_data)[0]
        demand(0 < header_size <= MAX_HEADER, "SAFETENSORS_HEADER_TOO_LARGE")
        raw_header = handle.read(header_size)
        demand(len(raw_header) == header_size, "SAFETENSORS_HEADER_TRUNCATED")
    record = json.loads(raw_header)
    tensor_map = {}
    ranges = []
    for name, value in record.items():
        if name == "__metadata__":
            continue
        demand(isinstance(value, dict), "INVALID_TENSOR_HEADER")
        shape = value.get("shape")
        offset = value.get("data_offsets")
        dtype = value.get("dtype")
        demand(dtype == "F32" and isinstance(shape, list) and
               all(isinstance(k, int) and k >= 0 for k in shape) and
               isinstance(offset, list) and len(offset) == 2 and
               all(isinstance(k, int) and k >= 0 for k in offset) and
               offset[0] <= offset[1], "INVALID_F32_TENSOR_METADATA")
        numel = math.prod(shape)
        demand(offset[1] - offset[0] == numel * 4, "TENSOR_BYTE_SIZE_MISMATCH")
        tensor_map[name] = tuple(shape)
        ranges.append(tuple(offset))
    demand(len(tensor_map) == EXPECTED_TENSORS, "CHECKPOINT_TENSOR_COUNT_MISMATCH")
    ranges.sort()
    previous_end = 0
    for start, end in ranges:
        demand(start == previous_end, "SAFETENSORS_PAYLOAD_GAP_OR_OVERLAP")
        previous_end = end
    demand(8 + header_size + previous_end == CHECKPOINT_BYTES,
           "SAFETENSORS_PAYLOAD_LENGTH_MISMATCH")
    return tensor_map


def compare_shapes(expected: dict, actual: dict) -> dict:
    expected_keys, actual_keys = set(expected), set(actual)
    missing = sorted(expected_keys - actual_keys)
    unexpected = sorted(actual_keys - expected_keys)
    changed = [{
        "name": name,
        "checkpoint_shape": list(expected[name]),
        "installed_model_shape": list(actual[name]),
    } for name in sorted(expected_keys & actual_keys)
       if tuple(expected[name]) != tuple(actual[name])]
    return {
        "checkpoint_tensor_count": len(expected),
        "model_state_tensor_count": len(actual),
        "matching_tensor_count": len(expected_keys & actual_keys) - len(changed),
        "missing_in_installed_model_count": len(missing),
        "extra_in_installed_model_count": len(unexpected),
        "shape_mismatch_count": len(changed),
        "missing_in_installed_model_examples": missing[:16],
        "extra_in_installed_model_examples": unexpected[:16],
        "shape_mismatch_examples": changed[:16],
        "exact_match": not (missing or unexpected or changed),
    }


def read_and_validate_evidence(stage: Path) -> tuple[dict, dict, Path]:
    stage = stage.resolve()
    demand(stage.name == STAGE_NAME and stage.parent == ROOT.resolve(),
           "STAGE_DIRECTORY_NOT_PINNED")
    receipt = stage / "approved_trial_input_manifest.json"
    deep = stage / DEEP_INVENTORY_NAME
    demand(receipt.is_file() and deep.is_file(), "STAGED_EVIDENCE_MISSING")
    demand(sha256(receipt) == STAGE_RECEIPT_SHA, "STAGE_RECEIPT_HASH_DRIFT")
    demand(sha256(deep) == DEEP_INVENTORY_SHA, "DEEP_INVENTORY_HASH_DRIFT")
    source = json.loads(receipt.read_text(encoding="utf-8"))
    inventory = json.loads(deep.read_text(encoding="utf-8"))
    demand(source.get("item_id") == SKU and inventory.get("item_id") == SKU,
           "SKU_IDENTITY_DRIFT")
    demand(source.get("human_gate", {}).get("state") ==
           "PASS_FOR_ISOLATED_3D_EVALUATION_ONLY", "HUMAN_GATE_SCOPE_DRIFT")
    demand(inventory.get("verified_image_mask_pairs") == 30,
           "PRIOR_DEEP_PROBE_PAIR_COUNT_MISMATCH")
    rows = source.get("trial_inputs", [])
    demand(len(rows) == 30, "TRIAL_INPUT_COUNT_DRIFT")
    for i, row in enumerate(rows):
        name = "frame_%03d.png" % i
        frame = stage / "images" / name
        mask = stage / "masks" / name
        demand(row.get("frame_index") == i and row.get("width") == 960 and
               row.get("height") == 540 and frame.is_file() and mask.is_file(),
               "TRIAL_FRAME_OR_MASK_MISSING:" + str(i))
        demand(sha256(frame) == row["source_sha256"] and
               sha256(mask) == row["mask_sha256"],
               "STAGED_IMAGE_MASK_HASH_DRIFT:" + str(i))
    weights = inventory["weights"]
    checkpoint = Path(weights["path"])
    demand(weights["file_size_bytes"] == CHECKPOINT_BYTES and
           weights["tensor_count"] == EXPECTED_TENSORS and
           weights["tensor_dtypes"] == {"F32": EXPECTED_TENSORS},
           "DEEP_INVENTORY_MODEL_IDENTITY_DRIFT")
    demand(checkpoint.parent.name == EXPECTED_SNAPSHOT and
           checkpoint.parent.parent.name == "snapshots" and
           checkpoint.parent.parent.parent.name ==
           "models--facebook--VGGT-1B-Commercial", "NOT_PINNED_COMMERCIAL_CHECKPOINT")
    demand(checkpoint.is_file(), "PINNED_COMMERCIAL_CHECKPOINT_NOT_FOUND")
    demand(inventory.get("installed_modules", {}).get("model_class_import") ==
           "PASS_VGGT_CLASS", "VGGT_CLASS_NOT_IMPORTED_IN_PRIOR_PROBE")
    return source, inventory, checkpoint


def metadata_and_meta_model(stage: Path) -> dict:
    receipt, inventory, checkpoint = read_and_validate_evidence(stage)
    header = header_metadata(checkpoint)
    # torch.device("meta") prevents initializing a ~5-GB FP32 CPU model,
    # loading any checkpoint tensor, or allocating even a half-precision GPU model.
    import torch
    from vggt.models.vggt import VGGT
    installed_source = Path(sys.modules["vggt.models.vggt"].__file__).resolve()
    pinned_origin = Path(inventory["installed_modules"]["vggt.models.vggt"]["origin"]).resolve()
    demand(installed_source == pinned_origin, "INSTALLED_MODEL_SOURCE_CHANGED")
    with torch.device("meta"):
        model = VGGT()
    state = model.state_dict()
    nonmeta = [name for name, tensor in state.items()
               if not getattr(tensor, "is_meta", False)]
    demand(not nonmeta, "UNSAFE_NONMETA_STATE:" + ",".join(nonmeta[:4]))
    shapes = {name: tuple(tensor.shape) for name, tensor in state.items()}
    compared = compare_shapes(header, shapes)
    del state, model
    free_bytes = None
    try:
        if torch.cuda.is_available():
            free_bytes = int(torch.cuda.mem_get_info()[0])
    except (RuntimeError, AssertionError):
        pass
    return {
        "schema_version": "1.0",
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "item_id": SKU,
        "authority": "EVALUATION_ONLY",
        "source_receipt_sha256": STAGE_RECEIPT_SHA,
        "source_deep_inventory_sha256": DEEP_INVENTORY_SHA,
        "verified_image_mask_pairs": 30,
        "checkpoint": {
            "path": str(checkpoint), "size_bytes": CHECKPOINT_BYTES,
            "num_tensors": EXPECTED_TENSORS,
            "metadata_validated": True,
            "full_checkpoint_sha256": sha256(checkpoint),
            "torch_weights_loaded": False,
        },
        "installed_model_source": str(installed_source),
        "installed_model_source_sha256": sha256(installed_source),
        "installed_vggt_distribution": inventory["installed_modules"]["vggt_distribution"],
        "meta_state_comparison": compared,
        "compatibility_gate": "PASS" if compared["exact_match"] else "FAIL_MODEL_SOURCE_MISMATCH",
        "torch_version": torch.__version__,
        "free_vram_gib_at_probe": round(free_bytes / (1024 ** 3), 3)
        if free_bytes is not None else None,
        "fp32_checkpoint_gib": round(CHECKPOINT_BYTES / (1024 ** 3), 3),
        "estimated_fp16_parameter_gib_excludes_activations":
            round(sum(math.prod(dims) * 2 for dims in header.values()) / (1024 ** 3), 3),
        "commercial_license_acceptance": "NOT_ATTESTED_BY_LOCAL_FILES",
        "model_loaded": False, "forward_executed": False,
        "reconstruction_executed": False, "archive": "BLOCKED", "pdp": "UNCHANGED",
        "next": "Only if meta gate PASS and model license compliance confirmed: separately designed 2-view masked-image half-precision GPU smoke with VRAM guard",
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--stage", type=Path, required=True)
    ap.add_argument("--output", type=Path, required=True)
    args = ap.parse_args()
    try:
        demand(not args.output.exists(), "OUTPUT_ALREADY_EXISTS")
        # Fail closed if output not inside the pinned isolated experiment directory.
        demand(args.output.resolve().parent == args.stage.resolve(),
               "OUTPUT_NOT_IN_ISOLATED_STAGE")
        result = metadata_and_meta_model(args.stage)
        args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n",
                               encoding="utf-8")
        print("P3B_VGGT_META_COMPAT_PROBE=COMPLETE", flush=True)
        print("MODEL_SOURCE_SHA256=" + result["installed_model_source_sha256"], flush=True)
        print("COMMERCIAL_WEIGHT_SHA256=" + result["checkpoint"]["full_checkpoint_sha256"], flush=True)
        print("META_COMPATIBILITY=" + result["compatibility_gate"], flush=True)
        print("META_KEYS_MATCH=" + str(result["meta_state_comparison"]["matching_tensor_count"]), flush=True)
        print("META_MISSING=" + str(result["meta_state_comparison"]["missing_in_installed_model_count"]), flush=True)
        print("META_EXTRA=" + str(result["meta_state_comparison"]["extra_in_installed_model_count"]), flush=True)
        print("META_SHAPE_MISMATCH=" + str(result["meta_state_comparison"]["shape_mismatch_count"]), flush=True)
        print("FP16_PARAMETER_ONLY_GIB=" +
              str(result["estimated_fp16_parameter_gib_excludes_activations"]), flush=True)
        print("META_PROBE_JSON=" + str(args.output), flush=True)
        print("GPU_MODEL_LOAD=NOT_EXECUTED", flush=True)
        print("RECONSTRUCTION=NOT_EXECUTED", flush=True)
        return 0 if result["compatibility_gate"] == "PASS" else 1
    except Exception as exc:
        print("P3B_VGGT_META_COMPAT_PROBE=FAIL", flush=True)
        print("error_type=" + type(exc).__name__, flush=True)
        print("error_summary=" + str(exc).splitlines()[0][:240], flush=True)
        print("GPU_MODEL_LOAD=NOT_EXECUTED", flush=True)
        print("RECONSTRUCTION=NOT_EXECUTED", flush=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
