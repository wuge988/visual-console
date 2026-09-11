# P5 QA01 Kontext D5 Real-Reference Guided Aquarium Evaluation

Status: `D4_IDENTITY_PASS / D4_SCENE_REALISM_FAIL / D5_MULTI_REFERENCE_IMPLEMENTED / HUMAN_VISUAL_GATE_REQUIRED / QA01_DISABLED`

## Why D5 exists

D4 proved that Exact Piece geometry and deterministic underwater photometry can be preserved, but text-only environment generation still produced a synthetic aquarium visualization below the user's accepted real-use reference bar.

D5 changes the environment-generation evidence model rather than continuing parameter tuning. It uses two separate image references:

1. reference 1 — the exact VERIFIED SC01 sellable driftwood, identity only;
2. reference 2 — one user-approved realistic Aquarium reference image, photographic-realism exemplar only.

The second image is not a layout template. Its driftwood, stone layout, fish positions and plant placement must not be copied. It guides real-camera evidence, water optics, material realism, biological density, scale and natural imperfection.

## Frozen prior evidence

D5 consumes exactly the D4 target-Windows result:

- prior head `4d84a5f63b82322cb9c1b247fd19cb7f7cd126a4`
- prior evidence `P5_QA01_V2_KONTEXT_D4_20260828-233428`
- source SC01 SHA256 `f31c77589ab71874655744f8f5dc92f2ece77fbf5b7b52f22e53476836a62399`
- prior D4 final SHA256 `904acda038d220a35046776dc217ef0e84b3eac7fc3726872dfcb9ec465fb9d3`
- contact editable pixels `138108`

Any mismatch fails closed before inference.

## User-supplied scene reference

The Windows local gate accepts `-SceneReferencePath`. If omitted, it opens a native file picker so the user can choose one of the previously accepted Aquarium reference images.

The evaluator:

- reads PNG/JPEG/WebP through Pillow;
- applies EXIF orientation;
- requires at least `700000` pixels and minimum dimension `600`;
- rejects extreme aspect ratios outside `0.65..2.4`;
- records the original file SHA256;
- normalizes a copy to RGB PNG inside the evaluation evidence directory and records the normalized SHA256;
- never writes the reference into production asset storage.

## Multi-reference environment phase

D5 uses two chained `ReferenceLatent` nodes and the built-in `FluxKontextMultiReferenceLatentMethod` with method `index_timestep_zero`.

- reference 1: exact sellable-piece identity;
- reference 2: photographic realism exemplar;
- sampling remains masked outside a 9 px expanded SC01 keepout;
- the product and immediate seam are not environment-generated.

Frozen environment parameters:

- seed `52073151`
- steps `32`
- guidance `2.8`
- sampler `euler`
- scheduler `simple`
- denoise `1.0`

The environment prompt explicitly forbids copying the second reference's hardscape layout and asks for a new scene designed around the SKU's `Heavy Stump + Rightward Branch Flow + Central Negative Space` structure.

The visual target is an actual installed aquarium photograph through front glass: mature layered planting, non-sterile substrate, irregular partially buried load-bearing stones, subtle glass/water optics and natural micro-imperfection. Smooth teal gradients, decorative pebble staging and generic CGI aquascapes are rejected.

## Geometry-locked wet core and contact repair

D5 intentionally keeps D4's geometry-locked photometric component so the environment-reference change can be isolated.

After the multi-reference environment pass:

1. the exact VERIFIED SC01 pixels receive deterministic underwater/wet photometric adaptation with unchanged alpha geometry;
2. the wet core is composited over the new environment;
3. the frozen local contact mask is refined with ordinary `VAEEncode + SetLatentNoiseMask`;
4. the photometric Protected Core is deterministically reasserted.

Contact parameters:

- seed `52073152`
- steps `18`
- guidance `1.9`
- sampler `euler`
- scheduler `simple`
- denoise `0.56`

## Review evidence

D5 review shows:

1. VERIFIED SC01 identity reference;
2. D5 final candidate;
3. exact user-selected scene reference;
4. D5 multi-reference environment output;
5. prior D4 final;
6. wet-core composite before contact;
7. raw contact refinement;
8. wet-core preview;
9. environment editable mask;
10. contact editable mask;
11. recipe and prompts.

The human Gate must judge whether D5 finally reaches the accepted real-use + integrated-scene reference bar, not merely whether it is an improvement over D4.

## Production boundary

D5 remains strictly evaluation-only:

- `evaluation_only=True`
- `production_authorized=False`
- QA01 remains `NOT_REGISTERED / executable=false`
- QA01 remains absent from site `enabled_workflows`
- no Manifest production mutation
- no F aquarium archive mutation
- FLUX.1 Kontext dev remains non-production evaluation use only
- PR #9 remains Draft / Open / Unmerged until visual acceptance.
