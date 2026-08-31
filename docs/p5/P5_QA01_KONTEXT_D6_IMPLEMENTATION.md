# P5 QA01 v2 — Kontext D6 Forced Foreground Occlusion Plate

Status: `D54_HUMAN_VISUAL_FAIL / D5X_LOCAL_INPAINT_ARCHITECTURE_CLOSED / D6_IMPLEMENTATION_IN_PROGRESS / QA01_DISABLED`

## Why D5.x is closed

The target-Windows D5.4 result proved that the problem is no longer mask size, pixel budget, or sampler parameters.

D5.4 successfully selected a cross-boundary profile with `union_editable_subject_ratio=0.254058`, ran all three semantic stages, and changed large numbers of pixels:

- hardscape: `145343`
- epiphyte: `34498`
- coherence: `41278`
- final delta vs D5.3: `178540`

Human review still showed the same dominant depth reading: the driftwood remained visually in front of the scene, with no unmistakable load-bearing stone face occluding the lower wood and no convincing attached-plant silhouette crossing.

Therefore the frozen decision is:

> Do not continue D5.4 with more anchor dilation, subject-budget changes, seeds, steps, guidance, denoise, or additional local repair stages.

The `exact-pixel reassert + local masked-inpaint` family is closed for this target.

## D6 architecture

D6 is not another local-retouch pass. It changes what the model is allowed to see and what it is forced to synthesize.

### 1. Exact piece remains deterministic outside explicit occlusion zones

The D5.3 installed-scene candidate remains the base. D6 never repaints the whole subject.

Two small deterministic occlusion zones are authorized:

- **hardscape occlusion zone** — lower load-bearing contact region;
- **epiphyte occlusion zone** — restrained lower/inner attachment pockets.

All subject pixels outside those zones remain byte-identical to the audited prior candidate. Critical SKU landmarks are excluded from both zones.

### 2. Masked wood pixels are deliberately removed from the stage input

D5.4 still supplied a reference canvas containing the exact RGB driftwood, so the model could reconstruct wood inside an editable mask rather than create a foreground object.

D6 forbids that failure mode.

For every D6 occlusion stage:

- the stage input carries a latent/noise mask over the explicit occlusion zone;
- the reference canvas does **not** contain sellable-piece RGB pixels;
- identity guidance is reduced to a grayscale silhouette/edge guide plus the composition-destroyed realism material board;
- the prompt explicitly states that missing masked wood is intentional and must **not** be reconstructed.

This forces the masked region to become foreground ecology instead of a softly repainted copy of the wood.

### 3. Two forced foreground stages only

D6 intentionally reduces complexity.

#### Stage A — foreground hardscape plate

Required visible event:

- dark substrate laps over / partly buries a lowest wood edge;
- at least one angular basalt/slate face visibly occupies pixels that previously belonged to the lower wood;
- the stone reads as physically in front of the wood and load-bearing.

#### Stage B — foreground epiphyte plate

Required visible event:

- a small attached Bucephalandra / Anubias nana petite / Java fern pocket;
- roots/rhizome meet the wood;
- multiple leaves visibly occupy pixels that previously belonged to the wood silhouette and extend into foreground water.

There is **no third generative coherence pass** in D6. D5.4 demonstrated that additional local repair can consume many pixels without improving physical depth.

## Reference isolation

D6 continues the validated D5.2 anti-replication rule:

- original donor aquarium: audit only;
- donor direct pixels to ComfyUI: forbidden;
- donor macro layout reconstruction: forbidden;
- realism material board: allowed;
- D6 reference canvas: silhouette/edge guide + realism board only;
- exact sellable-piece RGB in D6 reference conditioning: forbidden.

## Identity and safety guards

D6 must fail closed unless all are true:

1. QA01 remains `NOT_REGISTERED / executable=false` and absent from `enabled_workflows`;
2. whole-subject repaint is impossible;
3. critical landmarks do not intersect either occlusion zone;
4. occlusion union subject ratio remains bounded;
5. each occlusion stage crosses the subject/environment boundary;
6. final pixels outside the occlusion union are byte-identical to D5.3;
7. critical landmark pixels are byte-identical to D5.3;
8. original donor pixels are never used as model conditioning;
9. no Manifest or F Aquarium archive mutation occurs.

## Human visual Gate

D6 passes only if a reviewer can answer **YES** to all:

1. Does substrate visibly cover/partly bury at least one lowest wood edge?
2. Is there at least one support stone visibly in front of lower wood rather than behind it?
3. Are attached epiphyte leaves visibly crossing the wood silhouette?
4. Do those foreground events make the driftwood read as installed inside one aquarium rather than a product cutout on a backdrop?
5. Are the exact-piece critical landmarks still clearly the same SKU?
6. Is the donor composition not reconstructed?

Pixel-change counts are evidence only and can never substitute for these visual conditions.

## Production boundary

`FLUX.1 Kontext [dev]` remains `EVALUATION_ONLY / NON_PRODUCTION`.

D6 does not enable QA01, does not write a production Aquarium destination, and does not merge/deploy.
