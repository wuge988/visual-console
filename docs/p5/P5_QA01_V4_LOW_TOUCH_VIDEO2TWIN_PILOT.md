# P5 QA01 — v4 Low-Touch Video2Twin Pilot

Date: 2026-09-11

Status: `V32_ROUTE_TERMINATED / REALITYSCAN_MOBILE_MANUAL_CAPTURE_TERMINATED / LOW_TOUCH_VIDEO2TWIN_PILOT_IMPLEMENTED / GPU_PROBE_SEMANTIC_VALIDATION_PASS / QA01_DISABLED`

## Decision

The next P5 experiment remains a **one-SKU, existing-video, low-touch reconstruction pilot**. It must not ask the operator to reshoot hundreds of stills or manually triage per-frame connectivity.

Pilot SKU: `DC-ZY-SZ-31001`.

Input contract: one existing short turntable video from the DRIFT CURIO evidence set or another already-existing local DRIFT CURIO / 3D work area. No reshoot is required for the first Gate.

The pilot produces an **identity-oriented 3D Gaussian Splat** first. Mesh export is deliberately deferred until the splat proves that thin branches, cavities and overall product identity can be reconstructed with materially lower human effort than manual Mobile photogrammetry.

## Architecture

```text
existing SKU video
  -> bounded read-only source discovery
  -> automatic temporal sampling
  -> local sharp-frame selection
  -> automatic SAM 2.1 object masks
  -> exact neutral-gray object-only frames
  -> VGGT commercial checkpoint camera/geometry estimation
  -> gsplat training
  -> scene.ply + scene.splat
  -> Human Identity Gate
```

The first pilot does **not** attempt Aquarium rendering and does **not** register QA01.

## Windows runtime evidence confirmed

The Windows physical path has already proved the heavy runtime/source prerequisites:

- source video SHA256 frozen as `a322cd09820af0fe7d3092101d7660787853c7b2979c7e207c3be5e0bf4778aa`;
- `facebook/VGGT-1B-Commercial` gated access PASS;
- `torch=2.9.1+cu128` PASS;
- `torchvision=0.24.1+cu128` PASS;
- CUDA PASS on `NVIDIA GeForce RTX 3060 Ti`;
- `gsplat=1.5.3` PASS;
- pinned VGGT code PASS;
- SAM2 official exact source ZIP / integrity / local install PASS;
- combined SAM2/VGGT/gsplat/Torch/CUDA runtime import PASS;
- runtime marker PASS;
- recon3d exact pinned commit local bare cache PASS.

## Final Resume v2 defect and strengthened self-review gate

The v2 Windows run failed because its embedded Python runtime probe contained `torch.cuda.is_availe()` instead of `torch.cuda.is_available()`. This was a script defect, not a CUDA/model/runtime failure.

The prior v2 CI executed the PowerShell patch path and parsed the generated temp Gate but did not semantically execute the decoded embedded Python probe. A valid Python attribute expression with a misspelled runtime API therefore escaped that check.

The handoff standard has now been strengthened with `tools/P5_QA01_V4_FINAL_RESUME_RECOVERY_V3.ps1` and `apps/server/test/p5-qa01-v4-final-resume-v3.test.ts`:

- the corrected embedded probe is decoded and its expected CUDA API contract is checked;
- CI semantically **executes the exact decoded probe** against lightweight stub modules exposing `torch.cuda.is_available()` and `torch.cuda.get_device_name()`; an `is_availe()` typo raises `AttributeError` and fails CI;
- CI executes the actual v3 `-PatchOnly` path against the exact byte-pinned v2 runner, then parses the corrected temp runner under PowerShell StrictMode;
- a StrictMode interpolation defect in an intermediate v3 implementation was caught by CI before Windows handoff and repaired;
- the final exact-head CI then passed all 99 tests and the full server/web build.

Final validated v3 runner Git blob: `d3bc233484cb3815a564ba832d9bfe913782a21b`.

The semantic v3 code path passed CI #479. A documentation-only follow-up briefly failed CI because required frozen provenance tokens were omitted from this document; those tokens were restored before handoff. The current exact branch head and its CI status are authoritative in PR #9.

## Existing-video discovery recovery

The first Windows run proved that formal `01_RAW` did not contain a discoverable video for `DC-ZY-SZ-31001`. The bounded read-only discovery layer found the frozen existing video elsewhere under the DRIFT CURIO pipeline without requesting a reshoot.

Selection remains fail-closed: only exact SKU/compact SKU/serial path evidence may auto-select; unrelated generic videos are never silently selected; the input video remains read-only.

## Upstream donors and pinned provenance

### recon3d

- Repository: `jashshah999/recon3d`
- Pinned commit: `59fe356bceab74ef7d5839b68aba232bce20e14d`
- License: MIT

The upstream non-commercial `facebook/VGGT-1B` checkpoint is not permitted. The pilot uses only `facebook/VGGT-1B-Commercial`.

### photo-to-mesh

- Repository: `Hasasasaki/photo-to-mesh`
- Pinned commit: `6a1697e839113e12802b52d5cc6951044a4abe47`
- License: MIT

Only the temporal-window sharp-frame-selection concept is borrowed.

### VGGT

- Code repository: `facebookresearch/vggt`
- Pinned code commit: `a288dd0f14786c93483e45524328726ab7b1b4ce`
- Required model ID: `facebook/VGGT-1B-Commercial`

### SAM 2.1

- Repository: `facebookresearch/sam2`
- Pinned commit: `2b90b9f5ceec907a1c18123530e92e794ad901a4`
- License: Apache-2.0
- Model: `facebook/sam2.1-hiera-base-plus`

### gsplat

- Repository: `nerfstudio-project/gsplat`
- Pilot package version: `1.5.3`
- License: Apache-2.0

### uv

- Portable runtime manager version: `0.12.10`.
- Official x64 Windows archive SHA256: `f65744f94072152b1f86ba2aace4d01f1124d9a8ecb235805039e3718c36cac2`.
- The portable environment remains isolated from ComfyUI and Blender Python environments.

## First pilot parameters

- selected usable frames: target 24–30, minimum 16;
- reconstruction input long edge: 640 px;
- VGGT: commercial checkpoint only;
- metric alignment: OFF;
- factor graph: OFF;
- gsplat training: 3500 steps;
- viewer: not auto-launched during training;
- mesh: OFF for the first Gate.

## Human Identity Gate

The produced `scene.ply` is judged against the exact SKU on:

1. top double crowns;
2. central thin/upright branch;
3. central-left large cavity;
4. major right fork;
5. longest lower-right branch;
6. overall proportions/orientation/silhouette;
7. recognizable real wood-grain appearance;
8. materially fewer floating/phantom structures than the existing baseline.

If the splat is recognizably the exact piece and materially useful, proceed to the interaction/proxy stage and optional Postshot A/B. If the one-video route fails exact-piece identity, stop v4 parameter engineering and evaluate another low-touch family.

## No-write and production boundary

No files are written back into the source RAW/evidence location. The exact source video remains read-only.

- `QA01` remains `NOT_REGISTERED / executable=false`.
- QA01 remains absent from site `enabled_workflows`.
- No production Manifest mutation.
- No F archive mutation.
- No deploy/merge/enable.
- Input video remains read-only.
- Output is P5 evidence only.
- No noncommercial model may silently replace the commercial checkpoint.
