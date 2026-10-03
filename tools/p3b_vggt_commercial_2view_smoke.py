#!/usr/bin/env python3
"""Isolated two-view Commercial VGGT camera feasibility smoke, never 3D release.

Explicitly local cached Commercial weights; no hub call, optimizer, COLMAP, gsplat,
production mutation, all-view inference or output image uploads. One attempt per
unique output directory. The driver runs in a separate local Python process.
"""
from __future__ import annotations

import argparse
import gc
import hashlib
import json
import math
import os
import sys
import traceback
from datetime import datetime, timezone
from pathlib import Path

SKU = "DC-ZY-SZ-31001"
STAGE = Path(r"E:\AI_PROJECTS\DRIFT_CURIO_VISUAL\p3b\DC-ZY-SZ-31001\20261003-001219-approved-recon-eval-input")
META_FILENAME = "engine_meta_compat_20261003-160951.json"
RECEIPT_HASH = "5fe8c92c7476e70e1f7e6bd3139efa251383ebd986449743b330a37b1ad46b27"
DEEP_HASH = "b34384a36807fd8ae8efd87b626772334b7c6e6fb3186e765a3d4a8f1efcf34f"
MODEL_SOURCE_HASH = "424f90a90dab325dd04800ce14464f2458bd25f2c02e7befd3c33130777ac586"
COMMERCIAL_WEIGHT_HASH = "2b766b284359bc47ce26be107254621f685b758a0282082ff109f3ff02788b53"
SELECTED_FRAMES = (0, 5)
MIN_SYSTEM_RAM_GIB = 7.0
MIN_FREE_VRAM_GIB = 6.0
MIN_POST_LOAD_VRAM_GIB = 3.0
MAX_PROCESS_GPU_FRACTION = 0.75
EXPECTED_CHECKPOINT_BYTES = 5026367224


def digest(p: Path) -> str:
    h = hashlib.sha256()
    with p.open("rb") as f:
        for data in iter(lambda: f.read(4 * 1024 * 1024), b""):
            h.update(data)
    return h.hexdigest()


def need(ok: bool, reason: str) -> None:
    if not ok:
        raise RuntimeError(reason)


def usable_system_ram_gib() -> float | None:
    if os.name != "nt":
        try:
            import psutil
            return psutil.virtual_memory().available / 2**30
        except ImportError:
            return None
    import ctypes
    class MemoryStatus(ctypes.Structure):
        _fields_ = [("dwLength", ctypes.c_ulong), ("dwMemoryLoad", ctypes.c_ulong)] + [
            (key, ctypes.c_ulonglong) for key in (
                "ullTotalPhys", "ullAvailPhys", "ullTotalPageFile",
                "ullAvailPageFile", "ullTotalVirtual", "ullAvailVirtual",
                "ullAvailExtendedVirtual")]
    state = MemoryStatus()
    state.dwLength = ctypes.sizeof(state)
    need(bool(ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(state))), "SYSTEM_RAM_PROBE_FAILED")
    return state.ullAvailPhys / 2**30


def preflight(stage: Path, meta_file: Path, output: Path) -> dict:
    stage, meta_file, output = stage.resolve(), meta_file.resolve(), output.resolve()
    need(stage == STAGE.resolve(), "STAGE_ROOT_CHANGED")
    need(meta_file == stage / META_FILENAME and meta_file.is_file(), "META_EVIDENCE_NOT_PINNED")
    need(output.parent == stage and not output.exists(), "OUTPUT_NOT_NEW_ISOLATED_DIRECTORY")
    receipt_file = stage / "approved_trial_input_manifest.json"
    need(receipt_file.is_file() and digest(receipt_file) == RECEIPT_HASH, "RECEIPT_HASH_DRIFT")
    receipt = json.loads(receipt_file.read_text(encoding="utf-8"))
    meta = json.loads(meta_file.read_text(encoding="utf-8"))
    need(receipt.get("item_id") == SKU and meta.get("item_id") == SKU, "SKU_MISMATCH")
    need(receipt.get("human_gate", {}).get("state") == "PASS_FOR_ISOLATED_3D_EVALUATION_ONLY", "HUMAN_GATE_NOT_APPROVED")
    need(meta.get("authority") == "EVALUATION_ONLY" and meta.get("compatibility_gate") == "PASS", "META_GATE_NOT_PASS")
    need(meta.get("source_receipt_sha256") == RECEIPT_HASH and meta.get("source_deep_inventory_sha256") == DEEP_HASH, "META_LINEAGE_DRIFT")
    need(meta.get("verified_image_mask_pairs") == 30 and meta.get("meta_state_comparison", {}).get("exact_match") is True, "META_KEY_MATCH_MISSING")
    need(meta["meta_state_comparison"].get("matching_tensor_count") == 1797, "META_KEYS_NOT_1797")
    need(meta.get("installed_model_source_sha256") == MODEL_SOURCE_HASH, "VGGT_CODE_HASH_DRIFT")
    need(meta.get("checkpoint", {}).get("full_checkpoint_sha256") == COMMERCIAL_WEIGHT_HASH, "COMMERCIAL_WEIGHT_HASH_DRIFT")
    need(meta.get("model_loaded") is False and meta.get("forward_executed") is False, "META_EVIDENCE_STATE_CHANGED")
    need(len(receipt.get("trial_inputs", [])) == 30 and receipt.get("source_frames") == 30, "INPUT_COUNT_CHANGED")
    weights = Path(meta["checkpoint"]["path"])
    need(weights.is_file() and weights.name == "model.safetensors" and
         weights.parent.parent.parent.name == "models--facebook--VGGT-1B-Commercial" and
         weights.stat().st_size == EXPECTED_CHECKPOINT_BYTES, "COMMERCIAL_CHECKPOINT_PATH_OR_SIZE_DRIFT")
    need(digest(weights) == COMMERCIAL_WEIGHT_HASH, "COMMERCIAL_CHECKPOINT_BYTES_DRIFT")
    selected = []
    for idx in SELECTED_FRAMES:
        record = receipt["trial_inputs"][idx]
        need(record.get("frame_index") == idx and record.get("width") == 960 and record.get("height") == 540, "FRAME_METADATA_DRIFT")
        label = f"frame_{idx:03d}.png"
        image_path, mask_path = stage / "images" / label, stage / "masks" / label
        need(image_path.is_file() and mask_path.is_file() and
             digest(image_path) == record.get("source_sha256") and
             digest(mask_path) == record.get("mask_sha256"), "SELECTED_INPUT_HASH_DRIFT:" + label)
        selected.append({"index": idx, "image_path": str(image_path), "mask_path": str(mask_path),
                         "image_sha256": record["source_sha256"], "mask_sha256": record["mask_sha256"]})
    return {"meta_sha256": digest(meta_file), "weights": weights, "selected": selected,
            "source_path": Path(meta["installed_model_source"]).resolve()}


def prepare_masked_inputs(selected: list[dict]):
    import numpy as np
    import torch
    from PIL import Image
    tensors = []
    for entry in selected:
        with Image.open(entry["image_path"]) as opened:
            source = opened.convert("RGB")
        with Image.open(entry["mask_path"]) as opened:
            mask = opened.convert("L")
        need(source.size == (960, 540) and mask.size == source.size, "INPUT_IMAGE_SIZE_MISMATCH")
        # Use only wood pixels, then pad (never crop thin wood extremities).
        neutral = Image.new("RGB", source.size, (127, 127, 127))
        masked = Image.composite(source, neutral, mask)
        square = Image.new("RGB", (960, 960), (127, 127, 127))
        square.paste(masked, (0, 210))
        square = square.resize((518, 518), Image.Resampling.BICUBIC)
        data = np.asarray(square, dtype=np.uint8).copy()
        tensors.append(torch.from_numpy(data).permute(2, 0, 1).float().div_(255))
    return torch.stack(tensors, dim=0)


def measure_geometry(extrinsic, intrinsic) -> dict:
    import numpy as np
    e, k = extrinsic.detach().float().cpu().numpy(), intrinsic.detach().float().cpu().numpy()
    need(e.shape == (1, 2, 3, 4) and k.shape == (1, 2, 3, 3), "GEOMETRY_SHAPE_INVALID")
    need(bool(np.isfinite(e).all()) and bool(np.isfinite(k).all()), "GEOMETRY_NONFINITE")
    need(bool((k[..., 0, 0] > 0).all() and (k[..., 1, 1] > 0).all()), "GEOMETRY_NONPOSITIVE_FOCAL")
    rotation = e[0, :, :, :3]
    origins = -np.einsum("nij,nj->ni", rotation.transpose(0, 2, 1), e[0, :, :, 3])
    baseline = float(np.linalg.norm(origins[1] - origins[0]))
    return {"extrinsics_3x4": e[0].round(6).tolist(), "intrinsics_3x3": k[0].round(6).tolist(),
            "camera_centers_model_units": origins.round(6).tolist(),
            "two_view_baseline_model_units": round(baseline, 6),
            "finite": True, "positive_focal": True,
            "interpretation": "UNSCALED_CAMERA_PREDICTIONS_ONLY_NOT_3D_QA"}


def run(stage: Path, meta_file: Path, out: Path) -> int:
    evidence = preflight(stage, meta_file, out)
    import torch
    from safetensors import safe_open
    from vggt.models.vggt import VGGT
    from vggt.utils.pose_enc import pose_encoding_to_extri_intri
    from p3b_vggt_commercial_meta_compat import construct_meta_vggt_with_scalar_cpu_init
    need(digest(evidence["source_path"]) == MODEL_SOURCE_HASH, "INSTALLED_MODEL_SOURCE_CHANGED")
    need(str(Path(sys.modules["vggt.models.vggt"].__file__).resolve()).lower() ==
         str(evidence["source_path"]).lower(), "MODEL_IMPORT_PATH_CHANGED")
    need(torch.cuda.is_available() and torch.cuda.device_count() >= 1, "CUDA_UNAVAILABLE")
    need(torch.cuda.get_device_properties(0).total_memory >= 7.5 * 2**30, "GPU_TOO_SMALL")
    ram = usable_system_ram_gib()
    need(ram is not None and ram >= MIN_SYSTEM_RAM_GIB, "INSUFFICIENT_OR_UNKNOWN_SYSTEM_RAM")
    free, total = torch.cuda.mem_get_info(0)
    need(free / 2**30 >= MIN_FREE_VRAM_GIB, "INSUFFICIENT_FREE_VRAM_PRELOAD")
    # This process is isolated by the parent PowerShell process. Limit GPU allocations.
    torch.cuda.set_per_process_memory_fraction(MAX_PROCESS_GPU_FRACTION, device=0)
    out.mkdir(parents=False, exist_ok=False)
    result_path = out / "two_view_smoke_result.json"
    result = {"schema_version": "1.0", "created_utc": datetime.now(timezone.utc).isoformat(),
              "item_id": SKU, "authority": "EVALUATION_ONLY", "human_gate": "PASS_FOR_ISOLATED_3D_EVALUATION_ONLY",
              "meta_file_sha256": evidence["meta_sha256"], "checkpoint_sha256": COMMERCIAL_WEIGHT_HASH,
              "selected_frames": evidence["selected"], "preload_free_vram_gib": round(free / 2**30, 3),
              "preload_free_system_ram_gib": round(ram, 3), "gpu_fraction_limit": MAX_PROCESS_GPU_FRACTION,
              "weights_loaded": False, "camera_forward_executed": False, "reconstruction_executed": False,
              "gsplat_training_executed": False, "archive": "BLOCKED", "pdp": "UNCHANGED",
              "commercial_license_acceptance": "NOT_ATTESTED_BY_AUTOMATION", "state": "PREPARING"}
    def save():
        result_path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    save()
    try:
        images = prepare_masked_inputs(evidence["selected"])
        model, scalar_calls = construct_meta_vggt_with_scalar_cpu_init(torch, VGGT)
        need(len(scalar_calls) == 1, "META_INIT_POLICY_CHANGED")
        # Non-persistent buffers are omitted from the signed model state_dict.
        state_keys = set(model.state_dict())
        extra_buffers = set(dict(model.named_buffers())) - state_keys
        need(extra_buffers == {"aggregator._resnet_mean", "aggregator._resnet_std"},
             "UNEXPECTED_META_NONPERSISTENT_BUFFERS:" + repr(sorted(extra_buffers)))
        model = model.half()
        model = model.to_empty(device="cpu")  # ~2.34GiB, NEVER make ~5GB FP32 model.
        with torch.no_grad():
            buffers = dict(model.named_buffers())
            for key, values in (("aggregator._resnet_mean", (0.485, 0.456, 0.406)),
                                ("aggregator._resnet_std", (0.229, 0.224, 0.225))):
                buf = buffers[key]
                buf.copy_(torch.tensor(values, dtype=buf.dtype).reshape_as(buf))
            params = model.state_dict(keep_vars=True)
            with safe_open(str(evidence["weights"]), framework="pt", device="cpu") as f:
                need(set(f.keys()) == set(params), "SAFETENSORS_STATE_KEYS_CHANGED")
                for count, (name, target) in enumerate(params.items(), 1):
                    weight = f.get_tensor(name)
                    need(tuple(weight.shape) == tuple(target.shape) and str(weight.dtype) == "torch.float32",
                         "WEIGHT_SHAPE_OR_DTYPE_DRIFT:" + name)
                    target.copy_(weight)  # FP32 -> existing half CPU buffer in place.
                    del weight
                    if count % 200 == 0:
                        gc.collect()
            del params
        model.eval()
        gc.collect()
        free_post_cpu, _ = torch.cuda.mem_get_info(0)
        need(free_post_cpu / 2**30 >= MIN_FREE_VRAM_GIB, "FREE_VRAM_CHANGED_DURING_CPU_LOAD")
        model = model.to(device="cuda:0")
        torch.cuda.synchronize(0)
        result["weights_loaded"] = True
        free_after, _ = torch.cuda.mem_get_info(0)
        result["postload_free_vram_gib"] = round(free_after / 2**30, 3)
        save()
        if free_after / 2**30 < MIN_POST_LOAD_VRAM_GIB:
            result["state"] = "SAFE_STOP_LOW_POSTLOAD_VRAM"
            save()
            print("GPU_SMOKE=SAFE_STOP_LOW_POSTLOAD_VRAM", flush=True)
            return 0
        # Two images only; camera branch only. No depth/point heads/track or training.
        with torch.inference_mode(), torch.autocast("cuda", dtype=torch.float16):
            batched = images.unsqueeze(0).to(device="cuda:0", dtype=torch.float16)
            tokens, _ = model.aggregator(batched)
            encoded = model.camera_head(tokens)[-1].float()
            extr, intr = pose_encoding_to_extri_intri(encoded, (518, 518))
            geom = measure_geometry(extr, intr)
        torch.cuda.synchronize(0)
        result["camera_forward_executed"] = True
        result["geometry"] = geom
        result["peak_allocated_vram_gib"] = round(torch.cuda.max_memory_allocated(0) / 2**30, 3)
        result["state"] = "TWO_VIEW_CAMERA_COMPUTE_PASS_GEOMETRY_UNREVIEWED"
        save()
        print("GPU_SMOKE=TWO_VIEW_CAMERA_COMPUTE_PASS", flush=True)
        print("TWO_VIEW_BASELINE_UNSCALED=" + str(geom["two_view_baseline_model_units"]), flush=True)
        return 0
    except Exception as exc:
        result["state"] = "FAIL_CLOSED"
        result["error_type"] = type(exc).__name__
        result["error_summary"] = str(exc).splitlines()[0][:240]
        save()
        traceback.print_exc(file=sys.stderr)
        print("GPU_SMOKE=FAIL_CLOSED", flush=True)
        print("error_summary=" + result["error_summary"], flush=True)
        return 1
    finally:
        print("RECONSTRUCTION=NOT_EXECUTED", flush=True)
        print("ARCHIVE=BLOCKED", flush=True)
        print("PDP=UNCHANGED", flush=True)
        print("RESULT_JSON=" + str(result_path), flush=True)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--stage", type=Path, required=True)
    ap.add_argument("--meta", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--preflight-only", action="store_true")
    args = ap.parse_args()
    try:
        evidence = preflight(args.stage, args.meta, args.out)
        print("EVIDENCE_PREFLIGHT=PASS", flush=True)
        print("SELECTED_FRAMES=" + ",".join(str(x) for x in SELECTED_FRAMES), flush=True)
        if args.preflight_only:
            print("GPU_MODEL_LOAD=NOT_EXECUTED", flush=True)
            return 0
        return run(args.stage, args.meta, args.out)
    except Exception as exc:
        traceback.print_exc(file=sys.stderr)
        print("GPU_SMOKE=PRE_EXECUTION_BLOCKED", flush=True)
        print("error_summary=" + str(exc).splitlines()[0][:240], flush=True)
        print("RECONSTRUCTION=NOT_EXECUTED", flush=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
