# P5 QA01 — Kontext D5.3 Human Visual Review

Status: `D53_RUNTIME_PASS / D53_MASK_GUARDS_PASS / D53_IDENTITY_PASS / D53_VISUAL_FAIL_SEMANTIC_OCCLUSION_INSUFFICIENT / QA01_DISABLED`

Date: 2026-08-31

## Audited Windows evidence

- exact evaluated head: `52448b652b45e7dd767e1e58d791d42978b85f73`
- SKU: `DC-ZY-SZ-31001`
- evidence: `E:\AI_PROJECTS\DRIFT_CURIO_VISUAL\visual-console-p2\drift-curio\evidence\P5_QA01_V2_KONTEXT_D53_20260831-113257`
- final SHA256: `79c78c8ba14f168c96b112ba50ccee27dedea168b13ebb36156e51838dd99117`
- editable subject ratio: `0.220945`
- identity lock subject ratio: `0.718668`
- actual changed pixels: `96194`

The Windows evaluator and local launcher both returned PASS. Those PASS results establish exact-head, runtime, anti-replication, mask-budget, identity-lock and deterministic-compositing invariants only. They are not a human visual approval.

## Human visual result

**FAIL — SEMANTIC OCCLUSION / ECOLOGICAL EMBEDDING IS STILL INSUFFICIENT**

D5.3 is structurally safer than D5.2 and proves that controlled cross-boundary editing can run without identity drift. However, the visible result remains too close to the D5.2 pasted-on composition.

Observed failure cues in the review evidence:

- the D5.3 final and the D5.2 prior have almost the same foreground-depth read;
- the lower wood is still continuously product-readable instead of being visibly seated into a substrate mound;
- no convincing angular load-bearing stone face visibly occludes the lower wood at a support point;
- sparse epiphyte leaves do not clearly cross the wood silhouette in a way that establishes shared physical depth;
- contact shadows and micro-occlusion remain too subtle to establish weight transfer;
- the `actual_delta_mask` shows substantial pixel change, but the changes resolve mostly as local texture/contact variation rather than the required semantic foreground events.

## Root cause

D5.3 combined four different ecological objectives into one masked generation prompt:

1. substrate burial;
2. load-bearing stone overlap;
3. epiphyte attachment;
4. contact-shadow coherence.

The mask granted enough local authority, but the single pass was free to satisfy the prompt through low-amplitude local texture changes. Pixel-delta presence therefore did not guarantee that any required semantic event became visually obvious.

This is an architectural failure of **semantic under-specification**, not evidence that the editable-subject budget should simply be enlarged or that seed/steps/guidance/denoise should be tuned.

## Frozen decision

Do **not** continue D5.3 by enlarging the same combined mask or by parameter-only tuning.

D5.4 must preserve the successful boundaries from D5.2/D5.3 while splitting ecological integration into independently forced semantic stages:

- Stage A — foreground substrate + load-bearing hardscape anchor;
- Stage B — sparse epiphyte attachment anchor;
- Stage C — contact-shadow / seam coherence;
- each stage gets its own deterministic anchor mask and dedicated prompt;
- each stage may write only inside its own mask;
- critical SKU landmarks remain unavailable to all stages;
- the union of subject-side anchor pixels remains capped;
- intact donor pixels remain audit-only and are never conditioned;
- final pixels outside the union anchor mask remain exactly equal to the audited prior candidate;
- QA01 remains disabled and production mutation remains `NONE`.

## Human acceptance requirement for D5.4

A D5.4 candidate cannot pass merely because pixels changed. Human review must visibly confirm all of the following:

1. dark mixed substrate laps over / partly buries at least one lowest wood edge;
2. at least one irregular load-bearing stone face visibly sits in front of a lower wood region and reads as structural support;
3. at least one restrained epiphyte cluster is physically attached to the wood with leaves crossing the silhouette;
4. contact shadows support the same load/overlap geometry rather than appearing as generic darkening;
5. critical driftwood identity landmarks remain intact;
6. the donor scene composition is not reconstructed;
7. the result reads as a mature installed aquarium rather than a product cutout on a backdrop.

## Production boundary

`FLUX.1 Kontext [dev]` remains `EVALUATION_ONLY / NON_PRODUCTION`.

- `production_authorized=False`
- QA01 remains `NOT_REGISTERED / executable=false`
- no production Manifest mutation
- no F Aquarium archive mutation
- PR remains Draft / Unmerged until the new human visual Gate passes.
