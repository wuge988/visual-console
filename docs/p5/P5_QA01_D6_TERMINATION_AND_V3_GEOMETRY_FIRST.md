# P5 QA01 — D6 Termination / v3 Geometry-First Pivot

Status: `D6_PREFLIGHT_FAIL_CLOSED / D6_MASK_REPAIR_FORBIDDEN / KONTEXT_2D_ROUTE_CLOSED / QA01_V3_GEOMETRY_FIRST_IMPLEMENTED / HUMAN_VISUAL_GATE_NEXT / QA01_DISABLED`

## D6 target-Windows result

D6 did not reach inference. The target Windows preflight at exact head `ca8be15dc8c0d877a90132e2ca67beb67177a921` failed with `D6_OCCLUSION_MASK_PROFILE_NOT_FOUND`.

All tested profiles were comfortably below the frozen `0.20` subject-side occlusion budget. Hardscape was cross-boundary, but the epiphyte outside-subject region remained exactly `244 px` for every depth, below the D6 cross-boundary threshold of `512 px`.

Code audit confirms that making D6 executable would require enlarging or reshaping the epiphyte outside-subject mask. That is exactly the kind of continued mask engineering that the D6 stop-loss rule forbids.

Decision: **do not create D6.1, do not lower the cross-boundary threshold, do not add another outside bridge, and do not retry Kontext.**

## Why the 2D Kontext family is closed

D5.2–D5.4 already demonstrated that large pixel deltas and increasingly explicit masked prompts do not reliably create a foreground object that visually occupies the same physical depth as the sellable piece. D6 attempted to remove sellable-piece RGB from conditioning and force replacement inside occlusion windows, but even its deterministic mask preflight requires another round of hand-shaped boundary engineering before the model can be tested.

The project therefore exits the local masked-inpaint family rather than spending more Windows cycles on mask geometry.

## QA01 v3 — Geometry-First 2.5D Occlusion Proof

The next evaluation changes the renderer, not the diffusion mask.

Architecture:

1. use the already audited D5.3 Aquarium candidate as a photographic backplate;
2. preserve its camera/composition as the evaluation baseline;
3. load the exact SC01 alpha only to locate the sellable-piece silhouette in image coordinates;
4. create foreground hardscape and epiphyte proxy geometry in Blender at a strictly nearer Z depth than the backplate;
5. place support stones / substrate so they physically cover a small lower portion of the existing wood silhouette in the final render;
6. place attached-leaf geometry so multiple leaves physically cross the existing wood edge in screen space;
7. render one deterministic proof frame at the source resolution;
8. no diffusion model is called, no donor composition is conditioned, no QA01 registry/site-profile/Manifest/F archive is mutated.

This proof is deliberately a geometry/depth test, not a final photoreal material approval. It answers one blocked question decisively: can the pipeline guarantee real foreground occlusion instead of asking a 2D model to infer it?

## Gate semantics

The Windows Gate must fail closed if Blender is unavailable. It must not download or install Blender automatically.

When Blender is available, it renders a deterministic proof and opens a review page containing:

- D5.3 backplate;
- exact SC01 identity source;
- v3 geometry-first proof render;
- Blender version and SHA256 evidence.

Human review passes the geometry proof only if the lower wood is visibly covered by foreground hardscape and at least one epiphyte cluster visibly crosses the wood silhouette. Material realism may remain a separate next gate; depth/occlusion itself must be unmistakable.

## Safety boundary

- QA01 remains `NOT_REGISTERED / executable=false`.
- Production mutation: `NONE`.
- No merge/deploy/archive before human approval.
- D6/D5.x Kontext retries are forbidden.