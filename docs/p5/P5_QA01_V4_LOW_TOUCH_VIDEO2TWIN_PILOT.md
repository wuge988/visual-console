# P5 QA01 — v4 Low-Touch Video2Twin Pilot

Date: 2026-09-08

Status: `V32_ROUTE_TERMINATED / REALITYSCAN_MOBILE_MANUAL_CAPTURE_TERMINATED / LOW_TOUCH_VIDEO2TWIN_PILOT_IMPLEMENTED / QA01_DISABLED`

## Decision

The next P5 experiment is a **one-SKU, existing-video, low-touch reconstruction pilot**. It must not ask the operator to reshoot hundreds of stills or manually triage per-frame connectivity.

Pilot SKU: `DC-ZY-SZ-31001`.

Input contract: one existing short turntable video from the DRIFT CURIO RAW evidence set. No reshoot is required for the first Gate.

The pilot produces an **identity-oriented 3D Gaussian Splat** first. Mesh export is deliberately deferred until the splat proves that thin branches, cavities and overall product identity can be reconstructed with materially lower human effort than manual Mobile photogrammetry.

## Architecture

```text
existing SKU video
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

## Upstream donors and pinned provenance

The pilot borrows architecture and small implementation ideas from audited open-source projects. It does not vendor entire repositories into Visual Console.

### recon3d — primary reconstruction donor

- Repository: `jashshah999/recon3d`
- Pinned commit: `59fe356bceab74ef7d5839b68aba232bce20e14d`
- License: MIT
- Borrowed concepts: one-command video/image reconstruction, VGGT pose path, gsplat training, optional later mesh path.

The upstream source hardcodes `facebook/VGGT-1B`. That checkpoint is **not permitted** in this pilot. A fresh pinned clone is runtime-patched to use only `facebook/VGGT-1B-Commercial`.

### photo-to-mesh — frame-selection donor

- Repository: `Hasasasaki/photo-to-mesh`
- Pinned commit: `6a1697e839113e12802b52d5cc6951044a4abe47`
- License: MIT
- Borrowed concept: sample a video temporally, keep the sharpest frame inside a small temporal window, then evenly cap the final set.

The SAM 3 path from this donor is **not used**.

### VGGT code + commercial checkpoint

- Code repository: `facebookresearch/vggt`
- Pinned code commit: `a288dd0f14786c93483e45524328726ab7b1b4ce`
- Required model ID: `facebook/VGGT-1B-Commercial`

The commercial model is gated by Hugging Face/Meta terms. The local Gate must test access **before** installing the heavy reconstruction environment. If access is absent, it must stop as `V4_VGGT_COMMERCIAL_ACCESS_REQUIRED`. There is no fallback to `facebook/VGGT-1B`.

### SAM 2.1

- Repository: `facebookresearch/sam2`
- Pinned commit: `2b90b9f5ceec907a1c18123530e92e794ad901a4`
- License: Apache-2.0
- Model: `facebook/sam2.1-hiera-base-plus`

SAM 2.1 is used only for automatic object segmentation of already-selected frames. The pilot uses its automatic mask generator; no per-frame clicks are part of the normal path.

### gsplat

- Repository: `nerfstudio-project/gsplat`
- Pilot package version: `1.5.3`
- License: Apache-2.0
- Windows pilot environment: Python 3.10 + PyTorch 2.9.1 + CUDA 12.8 wheel path.

### uv

- Version: `0.12.10`
- Official x64 Windows ZIP SHA256: `f65744f94072152b1f86ba2aace4d01f1124d9a8ecb235805039e3718c36cac2`

The portable tool is used to keep this experiment isolated from ComfyUI and Blender Python environments.

## Frame-preparation contract

`tools/p5_qa01_v4_video2twin_prep.py` must:

1. Read the existing input video without modifying it.
2. Sample candidate frames in temporal order.
3. Keep the sharpest frame within small temporal windows instead of globally choosing only the sharpest frames.
4. Evenly cap the final set to at most 30 frames for the first 8 GB GPU pilot.
5. Run SAM 2.1 automatic mask generation with no normal-path per-frame manual clicks.
6. Choose the likely driftwood mask deterministically using geometry, center, border and warm/brown-pixel evidence.
7. Reject obviously invalid masks and fail if too few usable views remain.
8. Place the accepted object on exact RGB `(127,127,127)` background so downstream patches can deterministically identify non-product pixels.
9. Save raw selected frames, masks, masked frames, contact sheets and `prep_manifest.json` into the evidence directory.

No files are written back into `F:\...\01_RAW`.

## recon3d runtime patch contract

`tools/p5_qa01_v4_patch_recon3d.py` may patch only a **fresh clone at the frozen upstream commit**. It must fail closed if the expected source structure has changed.

Required patches:

- `facebook/VGGT-1B` -> `facebook/VGGT-1B-Commercial` in both short and chunked VGGT paths.
- Exclude exact neutral-gray background pixels from initial point-cloud colors/points.
- Train L1 photometric loss only on non-gray foreground pixels.
- Set the pilot SSIM weight to `0.0` so an unmasked global SSIM term cannot reward background fitting.
- Write a provenance marker describing all patched files and upstream commit.

The patcher must not enable MASt3R. MASt3R is outside this pilot because its model license is not the commercial production route being evaluated.

## First pilot parameters

The 8 GB pilot intentionally starts small:

- selected usable frames: target 24–30, minimum 16;
- reconstruction input long edge: 640 px;
- VGGT: commercial checkpoint only;
- metric alignment: OFF for the first identity test;
- factor graph: OFF for the first <=30-frame test;
- gsplat training: 3500 steps;
- viewer: not auto-launched during training;
- mesh: OFF for the first Gate.

This is a quality/progress Gate, not a throughput benchmark.

## Human Identity Gate

The produced `scene.ply` is judged against the exact SKU on:

1. top double crowns;
2. central thin/upright branch;
3. central-left large cavity;
4. major right fork;
5. longest lower-right branch;
6. overall proportions/orientation/silhouette;
7. recognizable real wood-grain appearance;
8. materially fewer floating/phantom structures than the existing RealityScan baseline.

### PASS

If the splat is recognizably the exact piece and materially better or more useful than the current low-touch baseline, then add a second stage for interaction mesh/proxy geometry and compare with Postshot using the exact same video/mask evidence.

### FAIL / stop-loss

If this one-video route cannot preserve the critical exact-piece landmarks on the existing capture, do not build Visual Console orchestration around it. Evaluate Postshot or one other low-touch reconstruction family before further engineering.

## Production boundary

- `QA01` remains `NOT_REGISTERED / executable=false`.
- QA01 remains absent from site `enabled_workflows`.
- No production Manifest mutation.
- No F archive mutation.
- No deploy/merge/enable.
- Input RAW video is read-only.
- Output is P5 evidence only.
- No noncommercial model may silently replace the commercial checkpoint.
