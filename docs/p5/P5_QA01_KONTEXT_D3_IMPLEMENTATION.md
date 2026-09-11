# P5 QA01 Kontext D3 Implementation

Status: `D2_VISUAL_FAIL / D3_TWO_STAGE_MASKED_IMPLEMENTED / HUMAN_VISUAL_GATE_REQUIRED / QA01_DISABLED`

## Why D3 exists

D2 proved that protected-core reassertion can preserve the Exact Piece, but one-pass masked generation still produced a template-like aquarium environment. D3 keeps the D2 identity architecture and changes the realism strategy from one-pass scene synthesis to two bounded generative stages.

## Scene archetype

For `DC-ZY-SZ-31001`, the frozen adaptive archetype is:

`Heavy Stump + Rightward Branch Flow + Central Negative Space`

This means the scene is not a reusable generic aquarium template. The central-left mass carries the composition, the major branch flow opens to the right, the central-left cavity and right-side windows remain negative-space swim-throughs, and the longest low-right branch stays visually open.

## Stage 1 — environment skeleton

Purpose: establish a credible mature aquarium around the fixed hardscape before local contact refinement.

- exact VERIFIED SC01 remains the reference latent;
- protected Identity Core is excluded from generation by the native `VAEEncodeForInpaint` noise mask;
- a deterministic scaffold supplies non-template spatial guidance: dark-neutral planted rear depth, subtle sand terrain and one coherent support-stone cluster rather than isolated pebbles;
- environment generation uses full denoise only outside the protected core;
- exact protected SC01 core pixels are deterministically reasserted after Stage 1.

Frozen Stage 1 evaluation parameters:

- seed `52073131`
- steps `30`
- guidance `2.6`
- sampler `euler`
- scheduler `simple`
- denoise `1.0`

## Stage 2 — local contact refinement

Purpose: repair physical integration without reopening the whole scene or wood geometry.

Editable regions are deliberately bounded to:

- lower contact band;
- expanded local contact context;
- selected anchor zones near support points and plausible attachment pockets.

Stage 2 starts from the Stage 1 core-reasserted candidate. Its alpha is constructed so ComfyUI `LoadImage` exposes only the local editable mask to `VAEEncodeForInpaint`. The rest of the Stage 1 scene remains protected from the second pass.

Frozen Stage 2 evaluation parameters:

- seed `52073132`
- steps `18`
- guidance `2.0`
- sampler `euler`
- scheduler `simple`
- denoise `0.72`

## Mask hierarchy

D3 writes visual evidence for:

- `protected_core.png`
- `upper_fine_band.png`
- `lower_contact_band.png`
- `local_anchor_zones.png`
- `integration_band.png`
- `stage1_generation_mask.png`
- `stage2_editable_mask.png`

The protected core uses tighter erosion above the contact region and wider erosion at the lower contact region. The evaluator fails closed when protected-core coverage falls below `0.78` of the SC01 subject pixels.

## Exact Piece fail-closed rules

After both Stage 1 and Stage 2:

1. output dimensions must equal the VERIFIED SC01 dimensions;
2. exact SC01 RGB pixels are copied back over the protected core;
3. any protected-core pixel mismatch after reassertion fails the evaluation;
4. the source SC01 must still match persisted Gate15 Manifest identity and current F archive bytes.

## Production boundary

D3 remains strictly evaluation-only:

- `evaluation_only=True`
- `production_authorized=False`
- QA01 stays `NOT_REGISTERED / executable=false`
- QA01 stays absent from the site `enabled_workflows`
- no production Manifest mutation
- no F aquarium archive mutation
- no merge/release authorization is implied by a runtime PASS

## Review artifacts

The D3 review page shows:

1. VERIFIED SC01 reference
2. D3 final candidate
3. Stage 1 environment skeleton candidate
4. Stage 2 raw local-contact refinement
5. deterministic Stage 1 scaffold preview
6. Protected Core
7. Upper Fine Band
8. Lower Contact Band
9. Local Anchor Zones
10. Stage 2 Editable Mask
11. SceneRecipe and both prompts

The next hard Gate is human visual review. Exact Piece fidelity must remain at least as strong as D2, while scene realism must materially improve beyond the D2 smooth-background / isolated-pebble failure mode.