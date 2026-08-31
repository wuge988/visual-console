# P5 QA01 Kontext D3.1 Stage-2 Latent-Mask Repair

Status: `D3_STAGE2_ARTIFACT_FAIL / D31_LATENT_MASK_REPAIR_IMPLEMENTED / HUMAN_VISUAL_GATE_REQUIRED / QA01_DISABLED`

## Purpose

D3 proved that the two-stage architecture can materially improve the environment while preserving Exact Piece identity, but its Stage 2 local refinement used `VAEEncodeForInpaint` at denoise `0.72`. The human review exposed broad gray placeholder regions aligned to the editable mask.

D3.1 is deliberately bounded. It does not regenerate Stage 1 and does not change the scene recipe, mask geometry, prompt, seed, steps, guidance or denoise. It changes only the Stage 2 latent construction.

## Frozen prior evidence

D3.1 reuses exactly:

- prior D3 head `11b2164a4bb017e45d3361d360bd986b611710dd`
- source SC01 SHA256 `f31c77589ab71874655744f8f5dc92f2ece77fbf5b7b52f22e53476836a62399`
- Stage 1 candidate SHA256 `6bd58f363026e9a73edcd67b3403c7448f0fd484c1ec491c571bd86270410136`
- broken D3 final SHA256 `d938ecb2e99fc7a25a9b809c06694661f457b0652edf87f30c0c430927d920f1`
- Stage 2 editable pixel count `138108`
- prior evidence directory `P5_QA01_V2_KONTEXT_D3_20260828-211413`

Any mismatch fails closed before inference.

## Stage 2 runtime change

D3 Stage 2:

`LoadImage -> VAEEncodeForInpaint -> KSampler`

D3.1 Stage 2:

`LoadImage(Stage1 RGB + alpha mask) -> VAEEncode(full Stage1 RGB) -> SetLatentNoiseMask(mask) -> KSampler`

The corrected route preserves the actual Stage 1 latent underneath the editable region instead of replacing masked pixels with the inpaint encoder's neutral fill before encoding.

## Parameters intentionally unchanged

- prompt: exact D3 Stage 2 prompt
- seed `52073132`
- steps `18`
- guidance `2.0`
- sampler `euler`
- scheduler `simple`
- denoise `0.72`
- editable mask: exact prior D3 `stage2_editable_mask.png`

This isolates the latent-path correction from scene-design changes.

## Exact Piece and safety rules

- QA01 stays `NOT_REGISTERED / executable=false`
- QA01 remains absent from `enabled_workflows`
- evaluation only
- no production Manifest mutation
- no F aquarium archive mutation
- prior evidence path must be under the configured control-root evidence directory
- prior source, Stage 1 and broken-final hashes must match the frozen D3 run
- editable-mask pixel count must match the frozen D3 run
- final dimensions must remain unchanged
- exact SC01 Protected Core is deterministically reasserted after repaired Stage 2
- any protected-core mismatch fails closed

## Review

The D3.1 review page compares:

1. VERIFIED SC01 reference
2. D3.1 final candidate
3. exact reused D3 Stage 1
4. D3.1 raw Stage 2
5. prior broken D3 final
6. exact Stage 2 editable mask

The next hard Gate is one target-Windows D3.1 Stage-2-only run followed by human visual review.
