# Visual Console — Implementation Status

Date: 2026-09-14  
Status: `ARCHITECTURE_CONSOLIDATED / SINGLE_CONTROL_PLANE`

Canonical architecture: `docs/CANONICAL_ARCHITECTURE_2026-09-14.md`.

## Current repository truth

- repository: `wuge988/visual-console`;
- architecture consolidation PR #45: **SQUASH MERGED**;
- reviewed PR head: `497434d6d41b948eeeaf987ddb5983b5bc6742fd`;
- PR CI #691: **PASS**;
- current `main`: `096d5f04d15c278584d36d7fd34d9a36b23e054a`;
- main push CI #692: **PASS**;
- old P5/QA01 PR #9: **CLOSED WITHOUT MERGE**, retained as R&D history only;
- architecture consolidation modified documentation/governance only; no RAW, formal Archive, Manifest/journal or production execution authority was mutated.

## Current product state

### 1. Production Core — retained

Validated production behavior from the original Visual Console line remains part of the final architecture:

- iPhone/private-LAN Capture and RAW ingestion;
- immutable RAW/source boundary;
- SKU-scoped storage and isolation;
- SC01 transparent master;
- SW01 white master;
- SD01 dark master;
- Job/journal behavior;
- restart recovery;
- SHA256/byte-size verification;
- Manifest and D/E/F provenance;
- QA separation from generation success;
- formal Archive/no-overwrite semantics.

These are not deprecated by the V2 shell.

### 2. Current V2 Control Plane — retained

Implemented V2 work is retained as the single operator/control plane:

- V2 shell/navigation and summary surfaces;
- registries and engine-health projections;
- Jobs/Queue/History/Retry surfaces;
- Asset and Prompt Library;
- Production Image/Scene/Batch composer surfaces;
- Creation Canvas;
- Visual Copilot draft/suggestion integration;
- Cloud registry/activation/cost infrastructure;
- Provider Adapter contract;
- OpenAI image submit/preflight path;
- single-use exact-envelope Execution Intent safety chain;
- Cloud Spend Audit.

The V2 shell is now subject to UX consolidation; its low-level provider safety panels are not the desired permanent daily workflow.

### 3. Product Image Pipeline — production truth retained

```text
RAW → SC01 → SW01 → SD01 → QA → Archive
```

Already validated product-image stages are not reset by this architecture consolidation.

### 4. Scene Image Pipeline — R&D, not production registered

Status: `AQUARIUM_FIRST / R&D / NO_PRODUCTION_WORKFLOW_REGISTERED`.

The old PR #9 branch is not merged. It remains research evidence only.

Retained lessons:

- whole-frame/high-denoise scene generation can change Exact Piece identity;
- low-denoise identity preservation can under-generate the scene;
- complete donor compositions can leak composition;
- protected identity region / masks remain useful;
- material-only references and Human Visual Gate remain valid;
- future work must use bounded Engine comparison rather than endless parameter tuning.

Active contract: `docs/SCENE_PIPELINE_2026-09-14.md`.

### 5. 3D Model Pipeline — planned MVP, non-blocking

Status: `PLANNED_MVP / PARALLEL_PIPELINE / PDP_NON_BLOCKING`.

```text
Capture → Frame QC → Wood-only Mask → Reconstruction
→ Mesh/Texture Cleanup → Scale Calibration → GLB
→ 3D QA → Archive → PDP progressive enhancement
```

Retained capture lesson: transparent/reflective support or background can contaminate reconstruction. Prefer controlled matte/opaque separation and reject unreliable frames.

Active contract: `docs/THREED_PIPELINE_2026-09-14.md`.

## Paid cloud execution status

Backend safety infrastructure is retained, but **architecture consolidation does not authorize a real paid Provider execution**.

Protections include:

- explicit Cloud/Provider/Model activation;
- credential presence checks;
- paid-network runtime gate;
- Cost Guard;
- submit preflight;
- exact-envelope mutation invalidation;
- single-use short-lived execution intent;
- submit must consume valid intent;
- spend audit.

Normal operator UX will later consolidate these mechanisms under a simpler Generate action while keeping backend enforcement.

## Current architecture decisions

### KEEP

Exact Piece identity; Capture Session; RAW/source immutable; Manifest/journal/D-E-F provenance; SC01/SW01/SD01; Jobs; generation/QA/archive separation; Human Visual Gate; Asset Registry/Archive; local-first Engine support; Provider abstraction and Cost Guard; scene R&D evidence; 3D capture/reconstruction lessons.

### MERGE

Old production core + current V2 shell; product/scene/3D workflows under one Job/QA/Asset/Archive model; friend/reference-console UX lessons into the current shell only.

### ARCHIVE

Old 8.27 front-end shell; PR #9 P5/QA01 as an independent architecture; open-source/reconstruction projects as control-plane candidates; older V2 implementation packets as implementation evidence rather than current architecture authority.

### STOP

Building another Visual Console; 1:1 backend replication of the friend/reference console; treating ComfyUI/3D tools as business truth; full donor composition copying for scene realism; endless D0–D5 tuning without a bounded benchmark; allowing 3D to block PDP/site release; exposing every provider safety primitive as a mandatory daily operator step.

## Next implementation sequence

### P1 — Core Truth Consolidation

Map validated legacy Manifest/Job/QA/Archive semantics explicitly into the current V2 domain/service layer without rewriting formal evidence.

### P2 — UX Consolidation

Target navigation:

```text
HOME
PRODUCTION
CREATE → Product / Scene / 3D / Batch
REVIEW
LIBRARY
SETTINGS → Engines / Models / Budget / Storage / Advanced
```

Move low-level Cloud activation/preflight/intent/audit diagnostics into `Settings → Advanced` while retaining backend enforcement.

### P3-A — Aquarium Scene MVP

One pilot SKU, fixed source package, bounded Engine comparison, Human Gate. No production registration before PASS.

### P3-B — 3D MVP

One pilot SKU, controlled capture, frame/mask QA, reconstruction, GLB export and 3D QA. Runs in parallel with P3-A.

### P4 — Workflow Freeze

Register only methods that pass Exact Piece, visual, provenance and operational gates.

### P5 — Site/PDP publication

Scene and 3D assets remain progressive enhancements and are published only after independent release gates.

## Documentation authority

See `docs/DOCUMENT_AUTHORITY_AND_ARCHIVE_2026-09-14.md`.

Older status strings such as `P5_ACTIVE_DRAFT`, `V2_DESIGN_FROZEN / IMPLEMENTATION_NOT_STARTED`, or `PR #9 WINDOWS_GATE_NEXT` are superseded and must not be used as current state.