"""Bounded adapter for SAM3.1's public video session API.

At official SAM3 commit 2345a4ad109ac29c569da749c91d84f10dc08c40,
Sam3BasePredictor.start_session always passes offload_state_to_cpu=False, but
Sam3MultiplexTrackingWithInteractivity.init_state does not accept that flag.

This adapter strips *only* a false unsupported flag. It never silently
accepts an actual state-offload request or an unknown keyword argument.
No upstream install or SAM2 runtime files are modified.
"""

from __future__ import annotations

import inspect


def install_sam31_session_compat(predictor) -> str:
    """Patch this one predictor instance, preserving upstream init semantics."""
    model = predictor.model
    original = model.init_state
    signature = inspect.signature(original)
    parameters = signature.parameters

    if "offload_state_to_cpu" in parameters:
        return "NATIVE_SUPPORTED"

    if "resource_path" not in parameters:
        raise RuntimeError("SAM31_INIT_STATE_UNKNOWN_SIGNATURE")

    accepts_extra_kwargs = any(
        p.kind is inspect.Parameter.VAR_KEYWORD for p in parameters.values()
    )

    def init_state_compat(**kwargs):
        if kwargs.pop("offload_state_to_cpu", False):
            raise RuntimeError("SAM31_STATE_OFFLOAD_NOT_SUPPORTED")

        unexpected = set(kwargs).difference(parameters)
        if unexpected and not accepts_extra_kwargs:
            raise TypeError(
                "SAM31_INIT_STATE_UNEXPECTED_ARGUMENTS:"
                + ",".join(sorted(unexpected))
            )
        return original(**kwargs)

    model.init_state = init_state_compat
    return "DROP_UNSUPPORTED_FALSE_FLAG_ONLY"
