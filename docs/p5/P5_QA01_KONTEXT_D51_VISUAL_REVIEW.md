# P5 QA01 — Kontext D5.1 visual review

Status: `RUNTIME_PASS / IDENTITY_PASS / VISUAL_FAIL_REFERENCE_COMPOSITION_LEAK / QA01_DISABLED`

## Evidence

Target-Windows D5.1 completed and produced the formal review artifact for `DC-ZY-SZ-31001` using the previously accepted Aquarium realism image as the donor reference.

## Human visual decision

D5.1 is rejected. The stitched intact realism reference transferred too much donor-scene composition rather than only photographic realism. The candidate inherits the donor's bright open-tank character, pale substrate, blue water field, hardscape/support language and overall scene grammar closely enough that the result reads as a derivative reconstruction rather than an independently designed scene for this SKU.

Exact-piece identity is substantially preserved, but that does not compensate for donor-scene replication risk.

## Root cause

The D5.1 stitched canvas still exposes the complete donor aquarium as contiguous pixels to `ReferenceLatent`. Prompt wording such as `realism only / no layout copy` is not a hard separation boundary. FLUX.1 Kontext can reuse high-level scene composition from the intact donor image.

Therefore the following rule is frozen:

> A full intact realism exemplar must not be passed to the generation model when the goal is photographic realism without scene replication.

## Next architecture

D5.2 keeps the original donor image for audit/evidence only. Before any conditioning, it deterministically converts the donor into a composition-destroyed realism material board:

- 9 x 8 micro-tile grid;
- deterministic non-identity permutation with zero fixed tiles;
- per-tile mirroring/flipping/180-degree transforms;
- strong desaturation;
- mild local blur;
- no intact donor scene is copied into ComfyUI input.

D5.2 also deliberately selects a different scene design for this SKU: mature shaded forest-stream Nature Aquarium, dark mixed substrate, angular basalt/slate support system, denser shaded planting around the heavy mass, and an open right-side water lane.

The donor reference may influence local photographic/material realism only. Donor macro-layout, palette, hardscape geometry and planting placement are forbidden.

Production boundary remains unchanged: evaluation only, QA01 disabled, no Manifest/F aquarium mutation, PR remains Draft/Unmerged.
