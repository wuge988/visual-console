#!/usr/bin/env python3
"""P3-B SAM3.1 six-frame forward-only object-loss diagnostic.

Runs at most six ordered QC frames using the EXACT prior text + point workflow
to distinguish output-ID changes, zero masks, model suppression and true tracker
loss. Unlike the full 30-frame benchmark, this is diagnostic evidence only:
no quality gate, no production registration and no reconstruction.
"""
from __future__ import annotations

import argparse
import json
import traceback
from contextlib import redirect_stdout
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import torch
from PIL import Image

from p3b_sam31_video_benchmark import (
    ITEM_ID,
    PILOT_ID,
    choose_prompt_points,
    copy_frames,
    ensure_empty_or_create,
    iou,
    load_mask,
    load_parent,
    normalize_points,
    output_mask_for_obj,
    sha256_file,
)

DIAGNOSTIC_FRAME_LIMIT = 6


def object_ids(outputs) -> list[int]:
    ids = outputs.get("out_obj_ids", []) if isinstance(outputs, dict) else []
    if hasattr(ids, "detach"):
        ids = ids.detach().cpu().numpy()
    return np.asarray(ids).reshape(-1).astype(int).tolist()


def inspected_output(outputs, reference=None) -> list[dict]:
    result = []
    for oid in object_ids(outputs):
        mask = output_mask_for_obj(outputs, oid)
        row = {"id": oid, "mask_pixels": int(mask.sum()) if mask is not None else None}
        if mask is not None and reference is not None:
            if mask.shape != reference.shape:
                row["reference_iou"] = None
                row["reference_shape_mismatch"] = True
            else:
                row["reference_iou"] = iou(mask, reference)
        result.append(row)
    return result


def inspect_internal_state(predictor, session_id: str, frame_idx: int) -> dict:
    """Read-only snapshot; do not retain GPU tensors, change state or suppress outputs."""
    state = predictor._get_session(session_id)["state"]
    metadata = state.get("tracker_metadata", {})
    rank0 = metadata.get("rank0_metadata", {})
    cache = state.get("cached_frame_outputs", {}).get(frame_idx, {})
    tracker_states = state.get("sam2_inference_states", [])
    return {
        "tracker_obj_ids": list(map(int, metadata.get("obj_ids_all_gpu", []))),
        "tracker_state_obj_ids": [
            list(map(int, st.get("obj_ids", []))) for st in tracker_states
        ],
        "cached_obj_ids": sorted(map(int, cache.keys())),
        "cached_mask_pixels": {
            str(oid): int(mask.sum().item()) for oid, mask in cache.items()
        },
        "suppressed_obj_ids": sorted(
            map(int, rank0.get("suppressed_obj_ids", {}).get(frame_idx, []))
        ),
        "removed_obj_ids": sorted(
            map(int, rank0.get("removed_obj_ids", []))
        ),
        "action_history": [
            str(action.get("type")) for action in state.get("action_history", [])
        ],
    }


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--support-v3-dir", required=True)
    p.add_argument("--checkpoint", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--text-prompt", default="driftwood")
    p.add_argument("--item-id", default=ITEM_ID)
    return p.parse_args()


def run() -> int:
    args = parse_args()
    if args.item_id != ITEM_ID:
        raise RuntimeError("P3B_SAM31_DIAG_ITEM_MISMATCH")
    manifest_path, parent_rows = load_parent(Path(args.support_v3_dir).resolve())
    rows = parent_rows[:DIAGNOSTIC_FRAME_LIMIT]
    if len(rows) != DIAGNOSTIC_FRAME_LIMIT:
        raise RuntimeError("P3B_SAM31_DIAG_SIX_FRAMES_UNAVAILABLE")
    checkpoint = Path(args.checkpoint).resolve()
    if not checkpoint.is_file():
        raise RuntimeError("P3B_SAM31_DIAG_CHECKPOINT_MISSING")
    out = Path(args.out).resolve()
    ensure_empty_or_create(out)
    frames_dir = out / "frames"
    copy_frames(rows, frames_dir)
    sources = {
        str(Path(str(row["source_file"])).resolve()): sha256_file(
            Path(str(row["source_file"])).resolve()
        )
        for row in rows
    }
    manifest = {
        "schema_version": "1.0",
        "pilot_id": PILOT_ID,
        "item_id": ITEM_ID,
        "phase": "P3-B",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "authority": "EVALUATION_ONLY",
        "diagnostic_only": True,
        "six_frame_limit": DIAGNOSTIC_FRAME_LIMIT,
        "propagation_direction": "forward",
        "acceptance_gate_executed": False,
        "production_registration": False,
        "archive_eligible": False,
        "pdp_blocking": False,
        "reconstruction": "BLOCKED",
        "parent_support_v3_manifest": str(manifest_path),
        "parent_support_v3_manifest_sha256": sha256_file(manifest_path),
        "source_sha256_before": sources,
        "model": {
            "family": "SAM_3_1",
            "checkpoint": str(checkpoint),
            "multiplex_count": 16,
            "max_num_objects": 4,
            "use_fa3": False,
            "compile": False,
        },
        "frames": [],
    }
    mp = out / "diagnostic_manifest.json"

    def save():
        tmp = out / "diagnostic_manifest.tmp"
        tmp.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
        tmp.replace(mp)

    save()
    from sam3.model_builder import build_sam3_multiplex_video_predictor
    from sam31_decoder_sdpa_compat import install_sam31_decoder_sdpa_fallback
    from sam31_session_compat import install_sam31_session_compat

    manifest["model"]["sdpa_policy"] = install_sam31_decoder_sdpa_fallback()
    print(f"SAM31_DIAG_SDPA_POLICY={manifest['model']['sdpa_policy']}", flush=True)
    with (out / "model_load_details.log").open("w", encoding="utf-8") as log:
        with redirect_stdout(log):
            predictor = build_sam3_multiplex_video_predictor(
                checkpoint_path=str(checkpoint),
                max_num_objects=4,
                multiplex_count=16,
                use_fa3=False,
                use_rope_real=False,
                compile=False,
                warm_up=False,
                async_loading_frames=False,
            )
    print("SAM31_DIAG_MODEL_LOAD=PASS", flush=True)
    manifest["model"]["session_compat"] = install_sam31_session_compat(predictor)
    response = predictor.handle_request({
        "type": "start_session",
        "resource_path": str(frames_dir),
    })
    session_id = response["session_id"]
    print("SAM31_DIAG_SESSION=PASS", flush=True)
    try:
        seed = rows[0]
        reference = load_mask(Path(str(seed["output_mask_file"])).resolve())
        seed_rgb = np.asarray(
            Image.open(Path(str(seed["source_file"])).resolve()).convert("RGB")
        ).copy()
        height, width = reference.shape
        prompt = predictor.handle_request({
            "type": "add_prompt",
            "session_id": session_id,
            "frame_index": 0,
            "text": args.text_prompt,
        })
        initial = prompt["outputs"]
        candidates = inspected_output(initial, reference)
        if not candidates:
            raise RuntimeError("P3B_SAM31_DIAG_SEED_TEXT_NO_OBJECTS")
        valid = [r for r in candidates if r.get("reference_iou") is not None]
        if not valid:
            raise RuntimeError("P3B_SAM31_DIAG_SEED_NO_COMPARABLE_MASKS")
        best = max(valid, key=lambda r: r["reference_iou"])
        best_obj = int(best["id"])
        manifest["seed"] = {
            "text_prompt": args.text_prompt,
            "objects_after_text": candidates,
            "selected_obj_id": best_obj,
            "selected_reference_iou": best["reference_iou"],
            "frame_index": 0,
        }
        save()
        for oid in object_ids(initial):
            if oid != best_obj:
                predictor.handle_request({
                    "type": "remove_object",
                    "session_id": session_id,
                    "obj_id": oid,
                })

        points, labels = choose_prompt_points(seed_rgb, reference)
        refined = predictor.handle_request({
            "type": "add_prompt",
            "session_id": session_id,
            "frame_index": 0,
            "points": normalize_points(points, width, height),
            "point_labels": torch.tensor(labels, dtype=torch.int32),
            "obj_id": best_obj,
        })
        manifest["seed"]["points_xy_abs"] = points.tolist()
        manifest["seed"]["point_labels"] = labels.tolist()
        manifest["seed"]["objects_after_refine"] = inspected_output(
            refined["outputs"], reference
        )
        manifest["seed"]["state_after_refine"] = inspect_internal_state(
            predictor, session_id, 0
        )
        save()
        print(f"SAM31_DIAG_SEED_OBJ={best_obj}", flush=True)

        # Install the narrowly bounded repair only after the original
        # text/point seed has completed. Record raw SAM2 masks BEFORE merging
        # and let the unmodified upstream postprocessor enforce its filters.
        from sam31_uncached_mask_merge_diagnostic import (
            install_uncached_refined_mask_diagnostic,
        )
        merge_trace = {}
        manifest["model"]["uncached_mask_merge_policy"] = (
            install_uncached_refined_mask_diagnostic(predictor.model, merge_trace)
        )
        save()
        print(
            "SAM31_DIAG_UNCACHED_POLICY="
            + manifest["model"]["uncached_mask_merge_policy"],
            flush=True,
        )

        for result in predictor.handle_stream_request({
            "type": "propagate_in_video",
            "session_id": session_id,
            "propagation_direction": "forward",
            "start_frame_index": 0,
            "max_frame_num_to_track": DIAGNOSTIC_FRAME_LIMIT,
        }):
            idx = int(result["frame_index"])
            if idx < 0 or idx >= DIAGNOSTIC_FRAME_LIMIT:
                raise RuntimeError(f"P3B_SAM31_DIAG_UNEXPECTED_FRAME:{idx}")
            ref = load_mask(Path(str(rows[idx]["output_mask_file"])).resolve())
            returned = inspected_output(result["outputs"], ref)
            state = inspect_internal_state(predictor, session_id, idx)
            line = {
                "frame_index": idx,
                "sequence": int(rows[idx]["sequence"]),
                "returned_objects": returned,
                "selected_obj_present": best_obj in [x["id"] for x in returned],
                "merge_trace": merge_trace.get(idx),
                "state": state,
            }
            manifest["frames"].append(line)
            save()
            ids = [x["id"] for x in returned]
            print(
                f"SAM31_DIAG_FRAME={idx} returned_ids={ids}"
                f" tracker_ids={state['tracker_obj_ids']}"
                f" cached_ids={state['cached_obj_ids']}"
                f" suppressed_ids={state['suppressed_obj_ids']}"
                f" removed_ids={state['removed_obj_ids']}"
                f" raw_refined={line['merge_trace'].get('raw_refined_mask_pixels', {}) if line['merge_trace'] else None}"
                f" uncached_fix={line['merge_trace'].get('uncached_merge_applied', False) if line['merge_trace'] else None}",
                flush=True,
            )
    finally:
        predictor.handle_request({
            "type": "close_session", "session_id": session_id
        })
    for source, before in sources.items():
        if sha256_file(Path(source)) != before:
            raise RuntimeError("P3B_SAM31_DIAG_SOURCE_CHANGED")
    manifest["source_frames_mutated"] = False
    save()
    if sorted(row["frame_index"] for row in manifest["frames"]) != list(
        range(DIAGNOSTIC_FRAME_LIMIT)
    ):
        raise RuntimeError("P3B_SAM31_DIAG_INCOMPLETE_OUTPUT")
    manifest["merge_trace_frame_count"] = sum(
        1 for row in manifest["frames"] if row["merge_trace"] is not None
    )
    manifest["selected_obj_output_frame_count"] = sum(
        1 for row in manifest["frames"] if row["selected_obj_present"]
    )
    save()
    print(
        f"SAM31_DIAG_SELECTED_OUTPUT_FRAMES={manifest['selected_obj_output_frame_count']}/6",
        flush=True,
    )
    print("SAM31_SIX_FRAME_DIAGNOSTIC=COMPLETE", flush=True)
    print("SAM31_HUMAN_GATE=NOT_RUN", flush=True)
    print("RECONSTRUCTION=BLOCKED", flush=True)
    print(f"diagnostic_manifest={mp}", flush=True)
    return 0


def run_with_bounded_diagnostics() -> int:
    try:
        return run()
    except Exception as exc:
        print("SAM31_SIX_FRAME_DIAGNOSTIC=FAIL", flush=True)
        print(f"error_type={type(exc).__name__}", flush=True)
        print(f"error_summary={str(exc).splitlines()[0][:240]}", flush=True)
        try:
            out = Path(parse_args().out).resolve()
            if out.is_dir():
                log = out / "diagnostic_failure.log"
                log.write_text(traceback.format_exc(), encoding="utf-8")
                print(f"full_error_log={log}", flush=True)
        except Exception:
            print("diagnostic_error_log=UNAVAILABLE", flush=True)
        print("RECONSTRUCTION=BLOCKED", flush=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(run_with_bounded_diagnostics())
