# P5 QA01 — Kontext D5.2 Human Visual Review

Status: `D52_RUNTIME_PASS / D52_ANTI_REPLICATION_PASS / D52_IDENTITY_PASS / D52_VISUAL_FAIL_PHYSICAL_INTEGRATION_PASTED_ON / QA01_DISABLED`

Date: 2026-08-31

## Audited Windows evidence

- exact evaluated head: `1222fc8ce7d6f54e46856ed9c65e9e1b00fa27b3`
- SKU: `DC-ZY-SZ-31001`
- evidence: `E:\AI_PROJECTS\DRIFT_CURIO_VISUAL\visual-console-p2\drift-curio\evidence\P5_QA01_V2_KONTEXT_D52_20260831-103418`
- D5.2 final SHA256: `2814de612fdbc45faa9e7e3fd2fbdab82aa1007e8df9996f768fefbe07b849f4`
- realism material board SHA256: `53be649505d76cce1980b97ae77996af410a5b08844f0316a5e124c3c7c17f3c`
- reference canvas SHA256: `60d86a36eed1581a00c75890c330dbbbf46243b2a802fa1d2955335d51d88c05`

The Windows evaluator and launcher both returned PASS. Those PASS results mean runtime, exact-head, anti-replication and fail-closed invariants passed; they are not a human visual approval.

## Human visual result

**FAIL — PHYSICAL INTEGRATION / PASTED-ON PRODUCT READ**

The anti-replication objective is materially improved: the candidate no longer reads as a reconstruction of the intact donor aquarium. Exact-piece identity also remains recognizable.

However, the sellable driftwood does not look naturally installed into the aquascape. The candidate still reads as an exact protected wood layer placed in front of an aquarium environment.

Observed failure cues:

- substrate mostly terminates beside or behind the wood instead of naturally lapping over the lowest wood edges;
- support stone does not visibly carry the heavy root mass through convincing overlap, burial and load transfer;
- plants remain predominantly background/adjacent elements instead of attaching to sheltered wood pockets or crossing the silhouette in sparse plausible places;
- contact shadow and micro-occlusion are too weak to join wood, stone, substrate and plants into one physical scene;
- the exact wood surface remains too continuously unobstructed, which reads as product compositing rather than a mature installed aquarium.

## Root cause in D5.2 architecture

This is not primarily a prompt-strength or sampler-parameter problem.

D5.2 inherits two structural constraints that work against physical integration:

1. environment generation excludes the complete driftwood silhouette plus the expanded environment keepout, so the environment pass cannot place substrate, stone faces or plant leaves in front of the wood;
2. the final protected-core reassertion restores exact wet-core pixels over the protected area, suppressing meaningful ecological overlap even if a prior generative stage proposes it.

The bounded contact pass only has enough authority to repair seams near the existing lower contact mask. It cannot create the controlled cross-boundary occlusion required by a real mature aquascape.

## Frozen decision

Do **not** continue D5.2 by only changing seed, denoise, steps or guidance.

D5.3 must change the integration architecture while retaining the successful D5.2 anti-replication boundary:

- keep the composition-destroyed realism material board;
- keep the donor scene audit-only and never condition on intact donor pixels;
- retain exact critical identity landmarks;
- introduce a deterministic, bounded cross-boundary integration mask;
- permit sparse substrate burial, load-bearing stone overlap and epiphyte silhouette overlap only inside approved embedding zones;
- prohibit whole-subject repaint;
- deterministically preserve pixels outside the embedding mask;
- keep QA01 disabled and production mutation at `NONE`.

## Production boundary

`FLUX.1 Kontext [dev]` remains `EVALUATION_ONLY / NON_PRODUCTION`.

- `production_authorized=False`
- QA01 remains `NOT_REGISTERED / executable=false`
- no production Manifest mutation
- no F Aquarium archive mutation
- PR remains Draft / Unmerged until the new human visual Gate passes.
