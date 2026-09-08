# P5 QA01 — v3.2 Stop-Loss and v4 Digital-Twin Route

Date: 2026-09-08

Status: `V32_ROUTE_TERMINATED / REALITYSCAN_MOBILE_MANUAL_CAPTURE_TERMINATED / LOW_TOUCH_VIDEO2TWIN_PILOT_IMPLEMENTED / QA01_DISABLED`

## Decision

Do not continue v3.2 Geometry-Locked Foreground Materialization. Do not create v3.2.1, do not tune mask size, seed, guidance, denoise, prompt, material board, or foreground proxy geometry.

The latest v3.2 review demonstrated the ceiling of the architecture: the authorization mask was only about 5.3% of the frame and the exact sellable driftwood remained a 2D image with baked product-photo lighting. Even if foreground pixels become more realistic, the wood cannot participate in shared scene lighting, water response, contact shadow, true perspective, refraction, or physically coherent occlusion. The remaining pasted-on look is structural rather than parameter-level.

RealityScan Mobile manual multi-ring still capture is also terminated. Do not resume 60–300 manually managed photos, connected/unconnected triage, repeated angle-gap recapture, or per-SKU support/mask experiments unless the user explicitly reverses that stop-loss.

## Frozen learnings

- D5.x whole-scene/local masked-inpaint route: closed.
- D6 forced foreground occlusion mask route: closed.
- v3.1 proved renderer Z-order can provide deterministic foreground occlusion and exact backplate registration.
- v3.2 proved that materializing only tiny foreground proxy regions does not create a credible whole-scene photograph.
- RealityScan Mobile manual capture has insufficient operational fit for a one-person multi-site production system.
- The next route must move toward a 3D representation **without** imposing high per-SKU capture labor.

## Active v4 pilot — Low-Touch Video2Twin

See `docs/p5/P5_QA01_V4_LOW_TOUCH_VIDEO2TWIN_PILOT.md`.

The active one-SKU pilot now reuses an **existing turntable video** and performs automatic frame selection, automatic object masking, commercial VGGT geometry estimation and gsplat reconstruction. The first Gate produces an exact-piece identity splat (`scene.ply` / `scene.splat`) before any Aquarium automation or interaction mesh work is allowed.

Core rules:

1. No reshoot for the first pilot.
2. No manual per-frame clicks/connected-image triage in the normal path.
3. Use only `facebook/VGGT-1B-Commercial`; never silently fall back to the original VGGT checkpoint.
4. Use SAM 2.1 automatic masks to isolate the rotating object from the fixed background.
5. Keep source RAW read-only and evidence-only outputs outside production archive state.
6. Stop after one SKU if critical branch/cavity identity is not materially preserved.

## Current pilot donor architecture

- `jashshah999/recon3d` pinned at `59fe356bceab74ef7d5839b68aba232bce20e14d` (MIT) — primary video/VGGT/gsplat donor.
- `Hasasasaki/photo-to-mesh` pinned at `6a1697e839113e12802b52d5cc6951044a4abe47` (MIT) — temporal-window sharp-frame selection concept.
- `facebookresearch/vggt` pinned at `a288dd0f14786c93483e45524328726ab7b1b4ce` — code path, with gated commercial checkpoint only.
- `facebookresearch/sam2` pinned at `2b90b9f5ceec907a1c18123530e92e794ad901a4` (Apache-2.0) — automatic object masks.
- `nerfstudio-project/gsplat` pilot version `1.5.3` (Apache-2.0) — 3DGS raster/training backend.

## Why this has a higher operational ceiling

The operator action becomes roughly:

```text
existing/short turntable video
  -> automated preparation
  -> automated reconstruction
  -> one Human Identity Gate
```

instead of hundreds of still captures and manual connectivity checks. The splat can preserve exact visual appearance while a later mesh/proxy representation, only if needed after identity PASS, can carry physical Aquarium interactions.

## Alternatives retained

### Postshot

Keep as the software A/B route using the same source video and masks. Do not buy a paid tier before the open-source pilot establishes whether video-to-3DGS materially improves exact-piece identity.

### 3D Gaussian Splatting / NeRF ecosystems

Nerfstudio/gsplat remain preferred lower-level building blocks. Further architecture changes should reuse them rather than reimplementing 3DGS kernels.

### Strong cloud image-edit model

Suitable for mood/social imagery only unless exact one-piece identity can be independently demonstrated.

### Real physical aquarium photography

Highest realism and identity certainty, but manual. Keep as hero-SKU benchmark/fallback.

## v4 pilot Gate

Pilot SKU: `DC-ZY-SZ-31001`.

Required proof before further automation:

1. Existing video can be auto-discovered or explicitly supplied without reshooting.
2. Automatic frame/mask preparation yields at least 16 usable views with minimal operator work.
3. The splat preserves the recognizable double crowns, upright thin branch, central-left cavity, right fork, lower-right branch and overall proportions.
4. Floating/phantom structures are materially better controlled than the existing low-touch RealityScan baseline.
5. The commercial-model boundary is auditable.

If the one-video splat fails this identity Gate, stop and compare the same evidence in Postshot or one other low-touch family before any production integration.

## Production boundary

- QA01 remains `NOT_REGISTERED / executable=false`.
- No production Manifest/archive/F mutation.
- No deploy/merge/enable.
- v3.1 artifacts remain historical accepted evidence only; they are not a production route.
- v3.2 is terminated and must not be resumed without explicit architecture review.
- RealityScan Mobile manual capture is terminated and must not be resumed without explicit user reversal.
