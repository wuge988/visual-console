# P5 QA01 — Kontext D5.4 Semantic Foreground Ecological Anchors

Status: `IMPLEMENTED / LOCAL_VISUAL_GATE_REQUIRED / EVALUATION_ONLY / QA01_DISABLED`

## Why D5.4 exists

D5.3 proved that controlled cross-boundary editing can run safely, but human visual review still failed. The final candidate changed many pixels inside the allowed embedding region without producing clearly visible semantic foreground events.

Formal prior review: `docs/p5/P5_QA01_KONTEXT_D53_VISUAL_REVIEW.md`.

The D5.3 failure is not a simple mask-size or sampler-parameter issue. It combined substrate burial, load-bearing stone overlap, epiphyte attachment and contact-shadow coherence into one pass. The model could satisfy that request through subtle local texture changes instead of actually placing foreground objects across the wood/environment boundary.

## D5.4 architecture

D5.4 keeps the already validated D5.2 anti-replication boundary and the D5.3 exact-piece safety logic, but changes physical integration into three independently forced semantic stages.

Input evidence is frozen to the audited D5.3 Windows result:

- prior D5.3 final SHA256: `79c78c8ba14f168c96b112ba50ccee27dedea168b13ebb36156e51838dd99117`
- realism board SHA256: `53be649505d76cce1980b97ae77996af410a5b08844f0316a5e124c3c7c17f3c`
- reference canvas SHA256: `60d86a36eed1581a00c75890c330dbbbf46243b2a802fa1d2955335d51d88c05`

The intact donor Aquarium scene remains audit-only and is never copied to ComfyUI input.

### Stage A — foreground substrate + load-bearing hardscape

A dedicated lower-left anchor window gives the model enough spatial authority to create a visibly foreground hardscape event rather than a seam touch-up.

The stage prompt requires:

- a dark mixed substrate mound;
- substrate lapping over / partially burying the lowest wood edge;
- two or three irregular angular basalt/slate support faces;
- at least one stone face visibly in front of a small lower wood region;
- narrow load-bearing contact shadow at the actual support point;
- no solution by recolor/texture-only change.

Frozen evaluation runtime:

- seed `52073191`
- 30 steps
- guidance `2.6`
- denoise `0.92`
- `euler / simple`

### Stage B — attached epiphyte foreground overlap

A separate pair of lower attachment pockets forces a plant-specific event instead of competing with hardscape instructions.

The stage prompt requires:

- two to four restrained Bucephalandra / Anubias nana petite / small Java fern attachment pockets;
- rhizome/root contact on the wood;
- several leaves crossing the wood silhouette into foreground water;
- no blanket moss and no green-tint-only solution.

Frozen evaluation runtime:

- seed `52073192`
- 26 steps
- guidance `2.4`
- denoise `0.84`
- `euler / simple`

### Stage C — contact coherence

The final stage is intentionally narrow. It may only refine the local boundary after Stage A/B and must preserve the already visible burial, stone overlap and attached-leaf events.

Frozen evaluation runtime:

- seed `52073193`
- 18 steps
- guidance `1.8`
- denoise `0.58`
- `euler / simple`

## Deterministic anchor safety

D5.4 no longer relies on a broad exact-pixel identity lock covering most of the wood. Instead, exactness is enforced by localized write authority:

- each stage may write only inside its own deterministic mask;
- the union of subject-side anchor pixels is capped at `0.32` of the exact piece;
- at least `0.68` of subject pixels therefore remain completely outside all generative anchors;
- top double crowns, central upright branch, central-left large cavity, right major fork and longest lower-right branch are unavailable to all stages;
- final pixels outside the anchor union remain equal to the audited D5.3 candidate, except the explicit critical-landmark wet-core reassertion;
- critical landmarks are deterministically reasserted from the geometry-locked wet core;
- whole-subject repaint is forbidden.

The union budget is deliberately larger than D5.3's single-pass editable budget because D5.4 needs enough local spatial room to create a real foreground stone/substrate object. The permission remains bounded and excludes all critical landmarks.

## Runtime guards

Each semantic stage must change at least `1000` pixels inside its own anchor. This guard prevents silent no-op execution but does **not** claim semantic visual success. Human review remains mandatory.

Review evidence includes:

- VERIFIED SC01;
- D5.4 final candidate;
- D5.3 prior candidate;
- localized Stage A / B / C results;
- one anchor mask and one delta mask per stage;
- anchor union;
- critical landmark lock;
- final actual delta vs D5.3;
- original donor labelled audit-only;
- D5.2 anti-replication material board;
- exact identity + destroyed-board reference canvas;
- retained D5.2 environment pass;
- recipe and all three prompts.

## Human visual acceptance criteria

D5.4 passes only if all are true:

1. exact sellable-piece identity remains immediately recognizable;
2. critical crowns, upright branch, central-left cavity, right fork and longest lower-right branch remain intact;
3. substrate visibly laps over / partly buries at least one lowest wood edge;
4. at least one angular support stone visibly sits in front of a lower wood region and reads as load-bearing;
5. at least one restrained attached epiphyte cluster has leaves crossing the wood silhouette;
6. contact shadow aligns with the same load/overlap geometry;
7. the wood no longer reads as a cutout laid over the aquarium;
8. donor composition is not reconstructed;
9. scene remains photographic rather than CGI/studio visualization.

Pixel-delta metrics alone can never satisfy this Gate.

## Safety boundary

- `evaluation_only=True`
- `production_authorized=False`
- QA01 remains `NOT_REGISTERED / executable=false`
- no production Manifest mutation
- no F Aquarium archive mutation
- PR remains Draft / Unmerged until human visual approval.
