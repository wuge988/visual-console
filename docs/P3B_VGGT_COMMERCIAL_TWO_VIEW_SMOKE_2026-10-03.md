# P3-B Commercial VGGT: bounded two-view feasibility trial (2026-10-03)

**Authority:** EVALUATION_ONLY, original approved SAM3.1 source unchanged; exact piece DC-ZY-SZ-31001. No gsplat training, full-30 reconstruction, GLB, Archive or PDP changes are authorized at this gate.

## Confirmed from local meta-gate result (operator terminal output)

- Meta source SHA256: `424f90a90dab325dd04800ce14464f2458bd25f2c02e7befd3c33130777ac586`.
- Exact Commercial `model.safetensors` full SHA256: `2b766b284359bc47ce26be107254621f685b758a0282082ff109f3ff02788b53`.
- Full model / checkpoint meta key and shape match: `1797/1797`; missing=0, extra=0, mismatch=0.
- FP16 parameters-only theoretical memory ~2.34GiB, excluding activations, CUDA workspace and other processes. Hardware: RTX 3060 Ti 8GiB; last free memory measurement 6.96GiB.
- The operator's `engine_meta_compat_20261003-160951.json` has NOT yet been independently uploaded or inspected in this conversation. The GPU launcher must read and validate that local file; copied terminal lines alone never waive the preflight.

## Source and local offline delivery provenance

An additive offline-only candidate named `p3b_vggt_commercial_two_view_smoke.py` was prepared with local hash `cfabdc197612fc1a61c45dcf09ded5907a1deb9298106605968453894ece0cc8` and a terminal-safe Windows launcher hash `ae2368b8fdf4ac787c65837a1239d260edd972812c446fff9008fadf61233f31`. The bundle reuses the previously merged, source-identical meta helper Git blob `dc5110172e6e3abc52d7fdb54237e99580698321` (original commit `9d15c1c2192a2710f5276410bbe8021c364f9d00`).

The offline candidate is an **isolated local research script, not yet the registered Visual Console 3D Engine Adapter**. A controlled pilot result, mask/pose/depth human review and a subsequent reviewed adapter PR are mandatory for integration.

## Exact bounded technical scope

1. Require a deliberate operator switch confirming review and acceptance of the **actual applicable Commercial checkpoint license**: https://huggingface.co/facebook/VGGT-1B-Commercial/blob/main/LICENSE. Broad project authorization or cached gated weights do not attest license acceptance.
2. Revalidate all 30 staged RGB and mask hashes and exact stage/deep-probe lineage, the uploaded local meta-receipt fields (1797 matching keys, zero mismatch, approval scope), complete Commercial checkpoint SHA256, exact installed VGGT code SHA256 and 1797 FP32 tensor header.
3. Stage ONLY frame indices 000 and 008 as independently mask-neutralized RGB inputs with a constant RGB(127,127,127) non-wood background. Square-pad rather than clipping thin branches; resize to model's native 518 resolution.
4. Construct model on meta with one strictly scoped CPU scalar initialization workaround; instantiate **camera and depth heads only**, exclude point and tracking heads and their checkpoint tensors. Restore the two upstream nonpersistent RGB normalization buffers after `to_empty(cuda)`; reject unexpected nonpersistent buffers.
5. Stream matching Commercial checkpoint tensors one-at-a-time from safetensors CPU storage into half-precision CUDA parameters; never create simultaneous 5GB FP32 model and 5GB CPU checkpoint copy. Guard: >=6.5GiB available VRAM before model allocation, <=0.78 PyTorch CUDA allocator fraction; >=2.5GiB free after model load before attempting the two-view forward.
6. **Exactly one GPU attempt** in a new isolated output folder. Record actual GPU peak reservation/allocation, camera matrices, finite camera/depth results and two masked-input previews. On any OOM or runtime mismatch, stop without fallback/retry. Preserve full local traceback and additive failure JSON.
7. Even if the technical smoke succeeds, mark `NOT_3D_QA`. Two-view turntable pose geometry is not automatically physically valid, the full 30-frame sequence remains untested, and no reconstruction/gsplat or sale-facing publication is permitted.

The offline candidate has been locally syntax-checked and exercised with five unit tests for mandatory license gate, input matting, source safety contract, fixed GPU budget, and skipped-head checkpoint selection. CI in the Visual Console repository does **not** run local GPU trials.
