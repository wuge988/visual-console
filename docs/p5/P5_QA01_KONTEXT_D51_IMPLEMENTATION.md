# P5 QA01 Kontext D5.1 Implementation

## Objective

Test whether a user-approved real Aquarium image can materially raise scene realism while preserving the exact sellable driftwood, without using the FLUX.1 chained multi-reference latent path that failed at runtime in D5.

## Architecture

`VERIFIED SC01 + USER REALISM REFERENCE -> deterministic side-by-side reference canvas -> FluxKontextImageScale -> VAEEncode -> single ReferenceLatent -> environment masked sampling -> geometry-locked wet photometry -> bounded contact repair`

The reference canvas is deterministic 1536x768:

- left panel = exact sellable driftwood identity;
- right panel = photographic realism / water / glass / material / biological-density exemplar only;
- prompt explicitly forbids copying the right panel's driftwood, hardscape layout, fish positions or plant placement.

The environment remains masked away from the sellable piece, and the final protected core is reasserted after contact refinement.

## Frozen evaluation parameters

Environment:

- seed `52073161`
- steps `32`
- guidance `2.8`
- denoise `1.0`
- sampler `euler`
- scheduler `simple`

Contact:

- seed `52073162`
- steps `18`
- guidance `1.9`
- denoise `0.56`

## Safety boundary

- `evaluation_only=True`
- `production_authorized=False`
- QA01 remains `NOT_REGISTERED / executable=false`
- no production Manifest archive mutation
- no F Aquarium production mutation
- PR remains Draft until visual approval

## Human Gate

Review must compare:

1. VERIFIED SC01 vs D5.1 final for Exact Piece identity;
2. user-approved realism reference vs D5.1 final/environment for real-use scene realism;
3. stitched reference canvas to verify reference-role construction;
4. environment/contact masks for bounded mutation.

Realism does not pass merely because D5.1 runs. The result must visually approach the user's accepted real-use Aquarium reference rather than an AI aquascape visualization.
