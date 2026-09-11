# P5 QA01 Kontext D3 Visual Review

Status: `D3_RUNTIME_PASS / D3_IDENTITY_PASS / D3_STAGE1_REALISM_IMPROVED / D3_STAGE2_ARTIFACT_FAIL / QA01_DISABLED`

## Runtime evidence

Target Windows completed the exact-head D3 two-stage evaluation at:

- head `11b2164a4bb017e45d3361d360bd986b611710dd`
- SKU `DC-ZY-SZ-31001`
- architecture `TWO_STAGE_MASKED_INPAINT`
- protected-core coverage `0.894739`
- Stage 1 exact-core reassertion `True`
- Stage 2 exact-core reassertion `True`
- Stage 1 candidate SHA256 `6bd58f363026e9a73edcd67b3403c7448f0fd484c1ec491c571bd86270410136`
- D3 final candidate SHA256 `d938ecb2e99fc7a25a9b809c06694661f457b0652edf87f30c0c430927d920f1`
- evidence `E:\AI_PROJECTS\DRIFT_CURIO_VISUAL\visual-console-p2\drift-curio\evidence\P5_QA01_V2_KONTEXT_D3_20260828-211413`

Runtime Gate passed. This does not authorize production.

## Human visual Gate

Overall result: **FAIL**.

### Exact Piece identity — PASS

The protected-core approach continues to preserve the photographed piece. The two upper crowns, central upright prong, central-left cavity, major rightward branch flow, longest low-right branch, overall orientation and major surface landmarks remain recognizable as the same physical SKU.

### Stage 1 environment — MATERIAL IMPROVEMENT, NOT YET RELEASED

Stage 1 is materially better than D2:

- the background is darker and more planted rather than a smooth blue/teal studio field;
- support stones form a more coherent grouped system rather than isolated decorative pebbles;
- substrate and water-depth cues are stronger;
- the scene reads more like an aquarium environment and less like a product pedestal.

Stage 1 remains evaluation evidence only, but it is worth preserving exactly rather than regenerating during the immediate Stage 2 repair.

### Stage 2 — HARD ARTIFACT FAIL

The D3 review page shows broad flat gray regions across the lower wood/contact areas in both the Stage 2 raw output and the final candidate. These shapes closely track the Stage 2 editable mask. They are not acceptable scene content and make the final image unusable.

This is a pipeline artifact, not a stylistic preference.

## Root cause

D3 Stage 2 used `VAEEncodeForInpaint` with denoise `0.72`. ComfyUI's implementation neutralizes masked pixels before VAE encoding by subtracting `0.5`, multiplying by the inverse mask, then adding `0.5`; masked pixels therefore enter the VAE from a neutral gray value. With partial denoise, the Stage 2 sampler did not fully replace those neutralized regions, and the gray placeholder leaked visibly into the decoded image.

## Decision

Do **not** tune prompts, widen masks or regenerate Stage 1.

The bounded repair is D3.1:

1. reuse the exact D3 Stage 1 candidate bytes;
2. reuse the exact D3 Stage 2 editable mask;
3. encode the full real Stage 1 RGB with ordinary `VAEEncode`;
4. attach the local mask with `SetLatentNoiseMask`;
5. run the same Stage 2 prompt/seed/steps/guidance/denoise;
6. deterministically reassert the exact SC01 Protected Core again;
7. stop for human visual review.

QA01 remains disabled and no production Manifest/F aquarium state may be mutated.
