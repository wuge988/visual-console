"""SAM3.1 decoder-only SDPA compatibility for the bounded Windows benchmark.

The locally verified upstream SAM3 commit 2345a4ad109ac29c569da749c91d84f10dc08c40
forces FLASH_ATTENTION *inside* decoder.functional_attention when use_fa3=False.
Changing global torch.backends.cuda flags cannot override that nested restriction.

Widen only that decoder-local, flash-only context to permit PyTorch's math
fallback. All other backend requests and modules remain unchanged. This does
not modify the official SAM3 checkout or the separate SAM2 runtime. Math
attention may need more VRAM: a local 8-GB GPU execution gate is still required.
"""
from __future__ import annotations

import inspect


POLICY = "DECODER_FLASH_OR_MATH"
_MARKER = "_p3b_sam31_decoder_fallback_original"


def install_sam31_decoder_sdpa_fallback(
    decoder_module=None,
    native_sdpa_kernel=None,
    backend_enum=None,
) -> str:
    """Apply a narrowly scoped, idempotent import-time patch to one decoder module.

    The explicit optional dependencies allow stdlib-only unit tests on CI.
    Production benchmark callers do not supply them.
    """
    if decoder_module is None:
        import sam3.model.decoder as decoder_module
    if native_sdpa_kernel is None or backend_enum is None:
        from torch.nn.attention import SDPBackend, sdpa_kernel
        if native_sdpa_kernel is None:
            native_sdpa_kernel = sdpa_kernel
        if backend_enum is None:
            backend_enum = SDPBackend

    flash = backend_enum.FLASH_ATTENTION
    math = backend_enum.MATH
    decoder_backends = decoder_module.SDPBackend
    if decoder_backends.FLASH_ATTENTION is not flash or decoder_backends.MATH is not math:
        raise RuntimeError("SAM31_DECODER_BACKEND_IDENTITY_MISMATCH")

    # Fail closed if an upstream revision stops using this exact flash-only
    # context. Do not apply a stale compatibility patch to unrelated code.
    try:
        source = inspect.getsource(decoder_module.functional_attention)
    except (OSError, TypeError) as exc:
        raise RuntimeError("SAM31_DECODER_SOURCE_UNAVAILABLE") from exc
    if "with sdpa_kernel(SDPBackend.FLASH_ATTENTION):" not in source:
        raise RuntimeError("SAM31_DECODER_FLASH_ONLY_CONTEXT_NOT_FOUND")

    current = decoder_module.sdpa_kernel
    if getattr(current, _MARKER, None) is native_sdpa_kernel:
        return POLICY + "_ALREADY_INSTALLED"
    if current is not native_sdpa_kernel:
        raise RuntimeError("SAM31_DECODER_SDPA_ALREADY_MODIFIED")

    def bounded_decoder_kernel(backends, *args, **kwargs):
        if backends is flash:
            backends = [flash, math]
        return native_sdpa_kernel(backends, *args, **kwargs)

    setattr(bounded_decoder_kernel, _MARKER, native_sdpa_kernel)
    decoder_module.sdpa_kernel = bounded_decoder_kernel
    return POLICY
