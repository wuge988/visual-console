# P5 QA01 — Kontext D5.3 Controlled Occlusion Integration

Status: `IMPLEMENTED / LOCAL_VISUAL_GATE_REQUIRED / EVALUATION_ONLY / QA01_DISABLED`

## Why D5.3 exists

D5.2 passed runtime, exact-head, anti-replication and identity checks but failed the human visual Gate because the sellable driftwood still read as a protected product layer placed in front of an aquarium.

Formal prior review: `docs/p5/P5_QA01_KONTEXT_D52_VISUAL_REVIEW.md`.

The D5.2 failure is architectural, not primarily a seed/steps/guidance problem:

- environment generation excluded the full wood plus an expanded keepout;
- final protected-core exact-pixel reassertion removed meaningful ecological overlap;
- the bounded bottom contact pass could repair seams but could not create convincing foreground occlusion.

## D5.3 architecture

D5.3 retains the successful D5.2 anti-replication realism method and changes only the physical embedding stage.

Input evidence is frozen to the audited D5.2 Windows result:

- prior D5.2 final SHA256: `2814de612fdbc45faa9e7e3fd2fbdab82aa1007e8df9996f768fefbe07b849f4`
- realism board SHA256: `53be649505d76cce1980b97ae77996af410a5b08844f0316a5e124c3c7c17f3c`
- reference canvas SHA256: `60d86a36eed1581a00c75890c330dbbbf46243b2a802fa1d2955335d51d88c05`

The intact donor scene remains audit-only and is never copied to ComfyUI input.

### Controlled cross-boundary embedding mask

D5.3 builds a deterministic mask from the verified SC01 alpha geometry.

The mask is allowed to cross the wood/environment boundary only in bounded lower ecological zones so generation can create real occlusion:

- substrate can lap over and partially bury the lowest wood edges;
- irregular basalt/slate support faces can overlap small lower wood regions;
- narrow load-bearing contact shadows can exist at real contact points;
- sparse epiphyte leaves/rhizomes can cross the wood silhouette in sheltered lower attachment pockets.

The editable subject budget is fail-closed:

- `MAX_EDITABLE_SUBJECT_RATIO = 0.24`
- the mask must contain both subject-side and environment-side pixels;
- whole-subject repaint is forbidden.

### Critical identity lock

The embedding pass cannot edit the critical recognisable landmarks:

- top double crowns;
- central upright branch;
- central-left large cavity;
- right major fork;
- longest lower-right branch.

A derived identity lock is created from the prior protected core minus D5.3 embedding zones.

Fail-closed minimum:

- `MIN_IDENTITY_LOCK_SUBJECT_RATIO = 0.70`

### Deterministic final compositing

The generative result is not trusted outside the mask.

Finalization is deterministic:

1. composite generated pixels onto the D5.2 final only where `embedding_editable_mask` is non-zero;
2. reassert the geometry-locked wet core only where `identity_lock_mask` is non-zero;
3. verify pixels outside the embedding mask remain exactly equal to D5.2;
4. verify identity-lock pixels remain exactly equal to the wet core.

This explicitly permits local occlusion without reopening whole-piece identity drift.

## Runtime

Embedding stage:

- seed: `52073181`
- steps: `22`
- guidance: `2.15`
- denoise: `0.72`
- sampler: `euler`
- scheduler: `simple`
- runtime: D5.2 identity + anti-replication material-board reference canvas -> `ReferenceLatent` + `VAEEncode` + `SetLatentNoiseMask`

These values are evaluation defaults for the new architecture, not a return to D5.2 parameter tuning.

## Human visual acceptance criteria

D5.3 passes only if all are true:

1. exact sellable-piece identity remains immediately recognizable;
2. top crowns, upright branch, central-left cavity, right fork and long lower-right branch remain intact;
3. substrate visibly laps over / partly buries lower wood edges rather than stopping beside the wood;
4. support stone visibly transfers weight through overlap and partial burial;
5. at least sparse plausible plant attachment/foreground overlap makes plants and wood occupy the same physical depth;
6. wood no longer reads as a cutout laid over the aquarium;
7. donor hardscape/plant/substrate composition is not reconstructed;
8. scene remains photographic rather than CGI/studio visualization.

If integration improves but any critical landmark drifts, D5.3 is still FAIL.

## Review evidence

The review page shows:

- VERIFIED SC01;
- D5.3 final candidate;
- prior D5.2 final;
- raw embedding pass;
- embedding editable mask;
- identity lock mask;
- critical landmark lock mask;
- actual delta mask;
- original donor labelled audit-only;
- D5.2 realism material board actually used for conditioning;
- D5.2 reference canvas;
- retained D5.2 environment pass;
- recipe and prompt.

## Safety boundary

- `evaluation_only=True`
- `production_authorized=False`
- QA01 remains `NOT_REGISTERED / executable=false`
- no production Manifest mutation
- no F Aquarium archive mutation
- PR remains Draft / Unmerged until human visual approval.
