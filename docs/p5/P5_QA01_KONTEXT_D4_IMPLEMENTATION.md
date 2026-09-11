# P5 QA01 Kontext D4 Geometry-Locked Photometric Integration

Status: `D31_ARTIFACT_REPAIR_PASS / D31_SCENE_REALISM_FAIL / D4_IMPLEMENTED / HUMAN_VISUAL_GATE_REQUIRED / QA01_DISABLED`

## Why D4 exists

D3.1 fixed the Stage-2 gray-mask artifact but exposed the next structural limit: exact dry SC01 RGB reassertion preserves identity but makes the photographed wood look pasted into an underwater scene. D4 keeps geometry and source texture locked while separating environment generation from deterministic underwater photometry and local contact synthesis.

This is not prompt-only tuning and does not reopen whole-frame wood generation.

## Frozen prior evidence

D4 consumes exactly the accepted D3.1 evidence for `DC-ZY-SZ-31001`:

- prior head `8ad38c80f5a24c2911984266a9e6b5007a03a728`
- source SC01 SHA256 `f31c77589ab71874655744f8f5dc92f2ece77fbf5b7b52f22e53476836a62399`
- prior D3.1 final SHA256 `1955e5ac8d7ba7c3623509f3da13636a55bc0718549115b0c90089cab99109f4`
- Stage-2 editable pixels `138108`
- evidence directory `P5_QA01_V2_KONTEXT_D31_20260828-223558`

Any mismatch fails closed before inference.

## Phase A — environment realism pass

The D3.1 final is encoded with ordinary `VAEEncode`. `SetLatentNoiseMask` permits sampling only outside a 7-pixel dilated SC01 subject keepout. The photographed wood and its immediate seam are therefore not regenerated in this phase.

Frozen evaluation parameters:

- seed `52073141`
- steps `30`
- guidance `2.6`
- sampler `euler`
- scheduler `simple`
- denoise `0.90`

The prompt targets a mature real aquarium rather than a product backdrop: layered neutral/olive planting depth, front-glass and water-column cues, irregular partially buried support stones with varied scale, non-sterile fine substrate and no smooth teal gradient or isolated decorative pebbles.

## Phase B — deterministic photometric wet core

D4 does not ask AI to repaint the protected wood geometry. Instead it transforms the exact VERIFIED SC01 pixels photometrically while keeping the source alpha bit-for-bit identical.

The frozen transform:

- base brightness factor `0.76` with highlight-dependent lift `0.08`;
- saturation `1.08`;
- local ambient color sampled from an exterior ring around the subject;
- ambient blend increases in darker wood regions;
- small luminance-dependent highlight lift;
- no resize, warp, branch synthesis, hole synthesis or spatial pixel movement.

The evaluator fails if transformed alpha differs from the SC01 alpha.

This creates a geometry-locked submerged/wet appearance without sacrificing one-piece identity.

## Phase C — bounded contact repair

The photometric wood is composited over the environment result. D4 then reuses the frozen local editable mask and performs one latent-preserving `VAEEncode + SetLatentNoiseMask` contact pass.

Frozen parameters:

- seed `52073142`
- steps `18`
- guidance `1.9`
- sampler `euler`
- scheduler `simple`
- denoise `0.58`

This pass may repair substrate overlap, stone-to-wood bearing, narrow seams, contact shadows and tiny plausible attachment pockets. It may not redesign the scene or major wood geometry.

After sampling, the geometry-locked photometric Protected Core is reasserted exactly. Any protected-core mismatch fails the run.

## Review evidence

The D4 review page shows:

1. VERIFIED SC01 reference
2. D4 final candidate
3. prior D3.1 final
4. D4 environment-only realism pass
5. photometric wet-core composite before contact repair
6. raw contact refinement
7. wet-core preview
8. Protected Core
9. environment editable mask
10. contact editable mask
11. recipe and both prompts

This makes it possible to distinguish environment quality, photometric integration and contact quality instead of judging one opaque whole-frame output.

## Production boundary

D4 remains strictly evaluation-only:

- `evaluation_only=True`
- `production_authorized=False`
- QA01 remains `NOT_REGISTERED / executable=false`
- QA01 remains absent from site `enabled_workflows`
- no Manifest production mutation
- no F aquarium archive mutation
- PR remains Draft / Open / Unmerged

A runtime PASS is not visual or release authorization.