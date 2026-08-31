# P5 QA01 — v3.2 Stop-Loss and v4 Digital-Twin Route

Date: 2026-08-31

Status: `V32_ROUTE_TERMINATED / NO_MORE_FOREGROUND_MASK_MATERIALIZATION / V4_DIGITAL_TWIN_RECOMMENDED / QA01_DISABLED`

## Decision

Do not continue v3.2 Geometry-Locked Foreground Materialization. Do not create v3.2.1, do not tune mask size, seed, guidance, denoise, prompt, material board, or foreground proxy geometry.

The latest v3.2 review demonstrates the ceiling of the architecture: the authorization mask is only about 5.3% of the frame and the exact sellable driftwood remains a 2D image with baked product-photo lighting. Even if foreground pixels become more realistic, the wood cannot participate in shared scene lighting, water response, contact shadow, true perspective, refraction, or physically coherent occlusion. The remaining pasted-on look is therefore structural rather than parameter-level.

## Frozen learnings

- D5.x whole-scene/local masked-inpaint route: closed.
- D6 forced foreground occlusion mask route: closed.
- v3.1 proved renderer Z-order can provide deterministic foreground occlusion and exact backplate registration.
- v3.2 proved that materializing only tiny foreground proxy regions does not create a credible whole-scene photograph.
- The next route must move the exact SKU itself from a 2D cutout into a 3D representation.

## Recommended v4 — Exact-SKU Photogrammetry Digital Twin + Partial 3D Aquarium

### Core principle

Capture the real sellable driftwood as a textured 3D digital twin from many photographs. Use that real mesh as the identity source in Blender. Let Blender/Cycles solve shared lighting, contact shadow, water/glass response, perspective and true front/back occlusion. Use AI only for non-identity concepting or bounded cleanup, never to reconstruct the product silhouette.

### Capture

Preferred first pilot: RealityScan Mobile / RealityScan desktop.

- Existing iPhone + turntable are suitable for a pilot.
- Use automatic object masking / masks so the object may rotate or be flipped while the background is excluded.
- Capture multiple elevation rings plus underside coverage.
- Keep exposure, focus and white balance fixed.
- Use diffuse, even illumination; avoid strong moving cast shadows and glossy hotspots.
- Preserve raw photos as the identity evidence set.

RealityScan currently supports object scanning with masks and mobile automatic object masking for rotating/flipping an object. Its desktop product is free for individuals and companies below USD 1M annual gross revenue, subject to its current license terms.

Official references:
- https://www.realityscan.com/download
- https://www.realityscan.com/mobile
- https://www.realityscan.com/news/realityscan-mobile-new-release-exciting-new-features

### Reconstruction

1. Align masked multi-view photos.
2. Reconstruct dense geometry.
3. Generate high-resolution texture.
4. Clean only obvious floating geometry/background residue.
5. Preserve branch topology, cavities, crown geometry and proportions.
6. Export textured mesh for Blender (OBJ/FBX/GLB as supported by the chosen route).

### Scene architecture

Do not build the entire image through diffusion.

Use a hybrid partial-3D scene:

- exact textured driftwood mesh = product identity;
- real or high-quality 3D substrate / stones / epiphytes = physical integration;
- optional photographic or generated aquarium backplate = environment/background only;
- proxy geometry behind/in front of the wood = depth, contact and shadow interaction;
- Cycles = final physically based render;
- Cryptomatte / Shadow Catcher / render passes = controlled compositing and evidence.

Blender 5.2 Cycles is the preferred quality renderer for the pilot because it supports physically based path tracing; Blender render passes include Cryptomatte and Shadow Catcher workflows for controlled compositing.

Official references:
- https://docs.blender.org/manual/en/latest/render/cycles/index.html
- https://docs.blender.org/manual/en/latest/render/layers/passes.html

### Why this has a materially higher ceiling

The exact wood is no longer a flat RGB cutout. It can:

- receive the same key/fill/environment lighting as the aquarium;
- cast and receive real contact shadows;
- be partially buried by substrate in 3D;
- be genuinely overlapped by stones and plant leaves;
- exhibit camera-dependent perspective and depth of field;
- interact consistently with water/glass shading;
- support multiple scene viewpoints from one SKU capture.

This directly attacks the pasted-product failure that D5.x–v3.2 could not solve.

## Alternatives considered

### A. 3D Gaussian Splatting / NeRF

Pros: very high appearance fidelity and thin-branch preservation from multi-view capture; potentially useful for interactive spins or product viewers.

Cons: lighting is largely baked into the representation, relighting and precise mesh-style interaction with aquarium assets is harder. Better as a secondary product-viewer route than the primary Aquarium still-image route.

### B. Stronger cloud image-edit model with multiple references

Pros: fastest path to attractive marketing imagery.

Cons: exact one-piece identity cannot be guaranteed; product silhouette, cavities and branches may drift. Suitable for mood/social assets, not the authoritative one-SKU Aquarium image.

### C. Real physical aquarium photography

Pros: highest realism and exact identity.

Cons: manual setup per SKU, wet/dry handling, repeated physical staging, low automation. Keep as a benchmark / hero-SKU fallback, not the default scalable pipeline.

## v4 pilot Gate

Do not automate the whole pipeline yet. First prove one SKU.

Pilot SKU: `DC-ZY-SZ-31001`.

Required proof:

1. Multi-view capture produces a faithful textured mesh with recognizable double crowns, upright thin branch, central-left cavity, right fork, lower-right branch and overall proportions.
2. A Blender Cycles Aquarium test render shows the exact wood genuinely inside the scene rather than pasted over it.
3. At least one stone/substrate object physically occludes part of the wood, and the wood casts/receives coherent contact shadow.
4. Shared lighting materially changes the wood appearance consistently with the aquarium while preserving product identity.
5. No generative model is permitted to reshape the product mesh.

If this one-SKU v4 proof fails on reconstruction fidelity, stop and compare RealityScan desktop versus another photogrammetry/3DGS capture route before building automation.

## Production boundary

- QA01 remains `NOT_REGISTERED / executable=false`.
- No production Manifest/archive/F mutation.
- No deploy/merge/enable.
- v3.1 artifacts remain historical accepted evidence only; they are not a production route.
- v3.2 is terminated and must not be resumed without an explicit architecture review.