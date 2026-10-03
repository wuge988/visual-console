# P3-B: Commercial VGGT two-view GPU feasibility gate

Piece: DC-ZY-SZ-31001. Authority: isolated evaluation only.

This gate consumes approved SAM3.1 input stage 20261003-001219, the local meta compatibility PASS result engine_meta_compat_20261003-160951.json, pinned VGGT source hash 424f90a90dab325dd04800ce14464f2458bd25f2c02e7befd3c33130777ac586 and Commercial checkpoint hash 2b766b284359bc47ce26be107254621f685b758a0282082ff109f3ff02788b53. The user supplied the meta PASS terminal summary, not the full JSON; the script checks actual local JSON content and byte-level evidence before GPU work.

- Default Windows command: read-only preflight. Actual GPU evaluation requires both -RunGpuSmoke and -ConfirmCommercialTerms. The flag is user confirmation of applicable usage rights; possession of cached weights does not establish legal acceptance or business compliance.
- Only masked frame indices 0 and 5. All nonwood pixels become neutral gray; images are padded, not cropped, before resizing to 518 square. Originals are never changed.
- At least 7GiB free system RAM and 6GiB free GPU memory are required initially. PyTorch GPU process limit is 75% of total RTX 3060 Ti VRAM. After loading the model, require at least 3GiB remaining before any camera forward; stop safely otherwise. These checks limit but cannot guarantee against Windows driver-level OOM.
- Reuse the verified one-call CPU scalar workaround to instantiate VGGT on meta, cast to FP16 before CPU materialization, copy pinned local FP32 weights to existing FP16 tensors one at a time, and reset known nonpersistent normalization buffers. Reject added unknown buffers, changed source or keys. No default Hugging Face weights, network, downloads or installing dependencies.
- Two-view, camera-branch-only no-gradient smoke: verify finite camera matrices and positive focal lengths. Outputs unscaled and geometrically unreviewed JSON, not a reconstruction or QA pass. Do not infer camera motion validity from a rotating-object recording without downstream review.
- No depth/point model heads, gsplat training, full 30-view compute, asset archive, GLB output, PDP or commerce changes. Save a new isolated result directory and retain failed logs and all earlier masks.

This is a feasibility check for the exact Commercial checkpoint and installed code, not model licensing certification, 3D QA or authorization to register any new production asset.
