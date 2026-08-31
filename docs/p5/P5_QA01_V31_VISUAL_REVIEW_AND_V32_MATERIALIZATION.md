# P5 QA01 v3.1 Human Visual Review + v3.2 Foreground Materialization

Status: `V31_RUNTIME_PASS / V31_REGISTRATION_PASS / V31_OCCLUSION_PASS / V31_HUMAN_VISUAL_PASS / V31_IMMUTABLE_ARTIFACT_FROZEN / V32_GEOMETRY_LOCKED_FOREGROUND_MATERIALIZATION_NEXT / QA01_DISABLED`

## v3.1 evidence reviewed

The accepted v3.1 review was generated at head `ad01e641198c2b015265c6b12ca5b59e0e8df06e` with Blender `5.2.1 LTS`.

Frozen evidence hashes:

- exact SC01: `f31c77589ab71874655744f8f5dc92f2ece77fbf5b7b52f22e53476836a62399`
- exact D5.3 photographic backplate: `79c78c8ba14f168c96b112ba50ccee27dedea168b13ebb36156e51838dd99117`
- transparent Blender foreground plate: `726220184280d7a1ee1b3c9097063ef34e4ead950c68b7b7b09783bd25998308`
- v3.1 deterministic final composite: `66a3ef87e1ba80cebe6782a0f0735cc8c763db385870d0db68c690430c17c1ff`

The review explicitly reports `outside_foreground_pixel_exact=true`.

## Human visual decision

### Registration — PASS

The D5.3 exact backplate and the v3.1 final composite have the same frame, driftwood scale, aquarium background registration and camera composition. The photographic frame no longer passes through Blender and therefore is no longer enlarged/cropped by a rendered texture plane.

### Foreground occlusion — PASS

The foreground epiphyte clusters remain visibly in front of the sellable piece and cross the wood silhouette. The lower hardscape/substrate foreground also remains on the camera-near side. The renderer-Z-order mechanism therefore survives the registration fix.

### Photoreal foreground material quality — NOT YET GATED

The foreground is still deliberately proxy-quality. Leaves and hardscape are visibly synthetic and are not accepted as production visual quality. This is the next problem; v3.1 itself is not to be reopened.

## Frozen v3.1 architecture

- photographic backplate never enters Blender;
- Blender renders foreground geometry only to transparent RGBA;
- final composition is deterministic pixel-space alpha compositing;
- pixels with foreground alpha zero remain exact D5.3 pixels;
- no diffusion decides whether foreground occlusion exists;
- QA01 stays `NOT_REGISTERED / executable=false`.

## 2026-08-31 runtime correction — accepted v3.1 is an immutable artifact, not a reproducible Blender hash target

The first v3.2 Windows attempt exposed an incorrect assumption in the initial gate. The gate re-ran the same Blender 5.2.1 scene and required byte-identical reproduction of the accepted foreground/final SHA values. The rerender produced:

- foreground `c191950330d83fe48d94e5d84b82c8d81bef485f72a09f8f561b90429b6e5d55`
- composite `14ad76a9c9129c3b467501e55ddba62fb01ef6c18b2cdee57cbfe5229eaa6e25`

while all explicit script random seeds were already frozen. Therefore **Eevee rerender byte identity is not a valid acceptance contract**. This is not a reason to weaken the accepted v3.1 artifact hashes; it is a reason to stop rerendering an already human-approved baseline.

The corrected freeze semantics are:

1. v3.1 Human PASS refers to the exact accepted foreground/final artifact bytes listed above.
2. v3.2 must discover those exact artifacts under the local evidence root by both accepted SHA values.
3. A newly rerendered Blender image, even from the same script, must never silently replace the human-approved baseline.
4. The failed rerender evidence is retained for audit and ignored by the accepted-artifact scanner.
5. v3.2 does **not invoke Blender**. It copies the accepted v3.1 artifacts into a new evaluation evidence directory and materializes only that immutable baseline.
6. If the exact accepted artifacts cannot be found, the gate fails closed as `V32_ACCEPTED_V31_EVIDENCE_NOT_FOUND` rather than recreating them.

## v3.2 — Geometry-Locked Foreground Materialization

v3.2 keeps the v3.1 geometry/registration contract and adds a bounded materialization pass.

1. Locate and reuse the exact Human-PASS v3.1 foreground/final artifacts by frozen SHA256; do not rerender Blender.
2. Copy the immutable baseline into a new v3.2 evaluation evidence directory.
3. Derive a materialization authorization mask from the accepted transparent foreground alpha, with only a small deterministic edge dilation for anti-aliased material transitions.
4. The latent target is the accepted v3.1 proxy composite, not bare wood. The generative task is therefore to materialize already-existing foreground proxies rather than decide whether to create occlusion.
5. Condition only on the previously audited D5.2 anti-replication realism material board; the intact donor scene is never passed to ComfyUI.
6. Ask the evaluator to transform only proxy foreground into photographic wet basalt/slate, dark mixed aquarium substrate and restrained Bucephalandra / Anubias nana petite / small Java fern while matching the existing underwater light.
7. Deterministically composite the raw model result back through the geometry-derived authorization mask over the exact accepted v3.1 proxy composite.
8. Pixels outside the materialization mask must remain byte-exact to accepted v3.1; any drift fails closed.
9. No production Manifest/archive/site-registry mutation is allowed.

This does **not** reopen D5.x. D5.x used editable regions containing the sellable wood RGB and relied on diffusion to invent physical integration. v3.2 uses renderer-established foreground occupancy first; diffusion is only a bounded foreground materializer.

## v3.2 Human Gate

PASS requires:

- foreground hardscape reads as wet irregular basalt/slate rather than gray Blender proxy;
- foreground substrate reads as real fine aquarium substrate/gravel with local burial/contact;
- foreground plant clusters read as believable submerged epiphytes, not geometric leaves;
- the exact aquarium framing/background remains unchanged outside the foreground authorization mask;
- the sellable-piece landmarks remain unchanged except where the already-authorized foreground physically occludes them;
- no donor-scene composition appears.

Until this Human Gate passes, QA01 remains disabled and the PR remains unmerged/un-deployed.
