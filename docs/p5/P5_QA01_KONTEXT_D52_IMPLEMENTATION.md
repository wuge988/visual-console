# P5 QA01 — Kontext D5.2 anti-replication realism board

Status: `IMPLEMENTED / LOCAL_VISUAL_GATE_REQUIRED / EVALUATION_ONLY / QA01_DISABLED`

## Why D5.2 exists

D5.1 proved that an intact side-by-side realism exemplar can leak donor composition even when the prompt says `realism only / no layout copy`. The user requirement is not to replicate the exemplar. Each sellable driftwood piece must receive its own scene design while the exemplar is used only to raise photographic/material realism.

## Hard boundary

The intact donor scene is never copied to ComfyUI input in D5.2.

It is retained only in the evidence folder and review page for audit. The model sees only:

1. LEFT: VERIFIED SC01 exact product identity;
2. RIGHT: a deterministic composition-destroyed realism material board derived from the donor image.

## Realism material board

The donor reference is transformed before conditioning:

- canvas role: `composition_destroyed_realism_material_board_only`;
- 9 x 8 grid = 72 micro-tiles;
- source tile permutation: `(dest * 37 + 17) mod 72`;
- this permutation has zero fixed tiles;
- tile transforms cycle through identity / horizontal mirror / vertical flip / 180-degree rotation;
- color saturation reduced to 0.15;
- mild Gaussian blur radius 0.8;
- donor macro-layout is therefore unavailable as a contiguous scene.

The evaluator fails closed if any tile remains at its original grid position or if a direct-donor-conditioning flag is ever enabled.

## SKU-specific scene direction

D5.2 deliberately does not reuse the donor's bright white-sand/open-tank scene grammar.

For `DC-ZY-SZ-31001` the frozen evaluation direction is:

`Mature shaded forest-stream Nature Aquarium`

- heavy root mass supported by irregular angular basalt/slate;
- dark mixed natural gravel + fine brown substrate;
- partial burial and believable load transfer;
- denser shaded Bucephalandra / Anubias / small Java fern / crypt-style planting around lower/inner mass;
- central cavity and branch windows remain open swim-through negative space;
- longest rightward branch leads into a more open right-side water lane;
- mature front-glass, water-column depth and small natural imperfections;
- no turquoise studio gradient, flat white/pale floor, isolated decorative pebbles or donor-layout reconstruction.

## Runtime

Environment:

- seed: `52073171`
- steps: `34`
- guidance: `2.7`
- denoise: `1.0`
- sampler: `euler`
- scheduler: `simple`
- runtime: single `ReferenceLatent` using identity + anti-replication realism board canvas, with environment `SetLatentNoiseMask`.

Contact:

- seed: `52073172`
- steps: `18`
- guidance: `1.9`
- denoise: `0.56`
- bounded local contact repair only.

Exact-piece geometry remains protected by the existing geometry-locked wet core and deterministic protected-core reassertion.

## Review evidence

The review page must show:

- VERIFIED SC01;
- D5.2 final candidate;
- original donor scene labelled `AUDIT ONLY, NOT PASSED TO COMFYUI`;
- composition-destroyed realism material board actually used for conditioning;
- D5.2 environment pass;
- identity + realism-board reference canvas;
- prior D4;
- wet-core/contact intermediates;
- environment/contact masks;
- recipe and prompts.

## Acceptance criteria

D5.2 fails the human visual Gate if any of these are true:

- output reads as a reconstruction of the donor scene;
- donor hardscape/plant/substrate layout is recognizably reproduced;
- exact sellable-piece identity drifts;
- environment still reads as generic AI aquarium visualization;
- product appears pasted into the environment;
- scene does not look specifically designed around this piece.

## Safety boundary

- `evaluation_only=True`
- `production_authorized=False`
- QA01 remains `NOT_REGISTERED / executable=false`
- no production Manifest mutation
- no F aquarium archive mutation
- PR remains Draft / Unmerged until human visual approval.
