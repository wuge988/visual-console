# P5 QA01 — v3.2 Stop-Loss and v4 Digital-Twin Route

Date: 2026-09-06

Status: `V32_ROUTE_TERMINATED / REALITYSCAN_MOBILE_MANUAL_CAPTURE_TERMINATED / LOW_TOUCH_3D_ROUTE_REQUIRED / QA01_DISABLED`

## Decision

Do not continue v3.2 Geometry-Locked Foreground Materialization. Do not create v3.2.1, do not tune mask size, seed, guidance, denoise, prompt, material board, or foreground proxy geometry.

The latest v3.2 review demonstrates the ceiling of the architecture: the authorization mask is only about 5.3% of the frame and the exact sellable driftwood remains a 2D image with baked product-photo lighting. Even if foreground pixels become more realistic, the wood cannot participate in shared scene lighting, water response, contact shadow, true perspective, refraction, or physically coherent occlusion. The remaining pasted-on look is structural rather than parameter-level.

## Additional stop-loss — RealityScan Mobile manual capture

The manual RealityScan Mobile Object Mode route is also terminated by explicit user decision.

Do not resume or optimize:

- multi-ring manual phone still-photo capture;
- 60–300 photo turntable protocols;
- manual connected/unconnected image triage;
- repeated recapture to repair connectivity gaps;
- manual support/masking experiments intended to make Mobile photogrammetry production-ready.

Reason: even if image quality can improve, the workflow requires too much per-SKU human labor and is incompatible with the project's one-person, repeatable, batch-oriented production target.

This is a workflow-fit stop-loss, not a claim that RealityScan Mobile is incapable of reconstructing the object.

## Frozen learnings

- D5.x whole-scene/local masked-inpaint route: closed.
- D6 forced foreground occlusion mask route: closed.
- v3.1 proved renderer Z-order can provide deterministic foreground occlusion and exact backplate registration.
- v3.2 proved that materializing only tiny foreground proxy regions does not create a credible whole-scene photograph.
- RealityScan Mobile manual capture is rejected as too labor-intensive for catalog production.
- The next route must preserve exact SKU identity while materially reducing capture labor.

## Next-route selection contract

Do not implement a new 3D production architecture until a candidate satisfies all of the following:

1. Low-touch capture: ideally one or a few short video/turntable passes, not hundreds of individually managed stills.
2. Batchability: the same protocol can be repeated across many SKUs with minimal operator decisions.
3. Exact-piece identity: branch topology, cavities, proportions and surface appearance remain faithful enough for one-piece-one-SKU commerce.
4. Scene integration: the representation can support believable occlusion, contact shadow and scene lighting, or can be converted into a form that does.
5. Early stop-loss: one-SKU pilot before automation work.
6. No generative model may silently reshape the sellable product identity.

## Candidate families retained for comparison

### A. Existing low-touch RealityScan Desktop / video-derived pipeline

Keep as an independent baseline because it already uses a lower-touch capture pattern. Improve only if a specific reconstruction defect can be removed without increasing capture labor substantially.

### B. Video-to-3D Gaussian Splatting / NeRF

Potential advantage: lower-touch video capture and strong appearance fidelity, especially for thin branches and complex cavities.

Primary concern: relighting and mesh-style physical interaction are weaker than a conventional textured mesh. Evaluate whether a splat can be converted or paired with proxy geometry for Aquarium scene interaction.

### C. Newer low-touch image/video-to-3D reconstruction systems

Evaluate only systems that can ingest a short video or a small automatically captured view set and output a high-fidelity representation with substantially less operator work than manual Mobile photogrammetry.

### D. Strong cloud image-edit models

Keep for mood/social assets only unless exact one-piece identity can be independently proven. Attractive imagery alone is insufficient for the authoritative SKU scene image.

### E. Real physical aquarium photography

Highest realism and identity certainty, but low automation. Keep as a hero-SKU benchmark/fallback rather than the default catalog route.

## Production boundary

- QA01 remains `NOT_REGISTERED / executable=false`.
- No production Manifest/archive/F mutation.
- No deploy/merge/enable.
- v3.1 artifacts remain historical accepted evidence only; they are not a production route.
- v3.2 is terminated.
- RealityScan Mobile manual capture is terminated and must not be reintroduced without explicit user reversal.
