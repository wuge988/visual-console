"""Bounded SAM3.1 multiplex uncached-frame mask merge compatibility.

Pinned official SAM3 commit 2345a4ad109ac29c569da749c91d84f10dc08c40
has an early return in _build_sam2_output when cached_frame_outputs lacks
the current frame, even when partial SAM2 propagation provides a fresh
refined_obj_id_to_mask. This per-instance adapter allows the fresh masks to
reach normal upstream postprocessing on uncached frames only.

Diagnostic-only for the P3-B six-frame gate; NOT installed into the full
benchmark or other SAM3 sessions. Retain only CPU integer telemetry.
"""
from __future__ import annotations

import inspect


_MARKER = "_p3b_sam31_uncached_mask_merge_original"
POLICY = "USE_REFINED_MASKS_ON_UNCACHED_FRAME_ONLY"


def install_uncached_refined_mask_diagnostic(model, trace: dict) -> str:
    original = model._build_sam2_output
    if getattr(original, _MARKER, None) is not None:
        raise RuntimeError("SAM31_UNCACHED_MASK_ADAPTER_ALREADY_INSTALLED")

    signature = inspect.signature(original)
    if list(signature.parameters) != [
        "inference_state", "frame_idx", "refined_obj_id_to_mask"
    ]:
        raise RuntimeError("SAM31_UNCACHED_MASK_SIGNATURE_CHANGED")
    try:
        source = inspect.getsource(original)
    except (OSError, TypeError) as exc:
        raise RuntimeError("SAM31_UNCACHED_MASK_UPSTREAM_SOURCE_UNAVAILABLE") from exc
    if 'if not frame_idx in inference_state["cached_frame_outputs"]:' not in source:
        raise RuntimeError("SAM31_UNCACHED_MASK_UPSTREAM_GUARD_CHANGED")

    def diagnostic_merge(inference_state, frame_idx, refined_obj_id_to_mask=None):
        cached = inference_state["cached_frame_outputs"]
        cache_hit = frame_idx in cached
        raw = refined_obj_id_to_mask or {}
        event = {
            "frame_index": int(frame_idx),
            "cache_hit_before_merge": bool(cache_hit),
            "cached_obj_ids_before_merge": sorted(
                int(oid) for oid in cached.get(frame_idx, {})
            ),
            "raw_refined_mask_pixels": {
                str(int(oid)): int(mask.sum().item())
                for oid, mask in raw.items()
            },
            "uncached_merge_applied": bool(not cache_hit and raw),
        }
        if not cache_hit and raw:
            # Only fill the verified uncached-frame gap. Upstream still
            # postprocesses masks normally, including empty-mask filtering
            # and suppression. Never edit the raw masks or frame sources.
            result = raw.copy()
        else:
            result = original(
                inference_state, frame_idx, refined_obj_id_to_mask
            )
        event["merged_obj_ids"] = sorted(int(oid) for oid in result)
        trace[int(frame_idx)] = event
        return result

    setattr(diagnostic_merge, _MARKER, original)
    model._build_sam2_output = diagnostic_merge
    return POLICY
