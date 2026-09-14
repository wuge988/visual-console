# Visual Console

Visual Console is the **single, site-neutral visual-production Control Plane** for DRIFT CURIO and future Site Profiles.

It is not a ComfyUI skin, not a collection of separate scene/3D tools, and not a 1:1 clone of any reference console. It owns the production truth around Exact Piece/SKU, Capture Sessions, Jobs, QA, Asset Registry, Archive and publish readiness while delegating compute to replaceable Engine Adapters.

## Canonical architecture

```text
Exact Piece / SKU
      ↓
Capture Session
      ↓
Canonical Source Assets
      ↓
┌───────────────┬───────────────┬───────────────┐
│ Product Image │  Scene Image  │    3D Model   │
│   Pipeline    │   Pipeline    │   Pipeline    │
└───────────────┴───────────────┴───────────────┘
      ↓
Human Review / QA
      ↓
Asset Registry / Archive
      ↓
Publish / PDP / Library
```

Canonical design: `docs/CANONICAL_ARCHITECTURE_2026-09-14.md`.

## What is retained

### Production Core

Validated production truth from the original Visual Console line remains authoritative:

- iPhone/private-LAN Capture + RAW;
- immutable source assets;
- SC01 transparent master;
- SW01 white master;
- SD01 dark master;
- Jobs and restart recovery;
- SHA256/byte-size checks;
- Manifest/journal/D-E-F provenance;
- QA and formal Archive semantics;
- no-overwrite boundaries.

### Current V2 Control Plane

The current V2 implementation remains the operator shell and service layer:

- Production / Jobs / Assets / Review surfaces;
- registries and engine health;
- Creation Canvas;
- Visual Copilot draft/suggestion flow;
- provider abstraction;
- Cost Guard;
- paid-provider execution safety and spend audit.

Provider internals are backend/advanced safety primitives, not the target daily workflow.

## Canonical Pipelines

### Product Image

```text
RAW → SC01 → SW01 → SD01 → QA → Archive
```

Existing validated stages are not reset by this consolidation.

### Scene Image

Aquarium first. Scene output must preserve Exact Piece identity. Previous P5/QA01 experiments are retained as R&D evidence only; PR #9 was closed without merge.

See `docs/SCENE_PIPELINE_2026-09-14.md`.

### 3D Model

3D runs as a parallel Pipeline:

```text
Capture → Frame QC → Wood-only Mask → Reconstruction
→ Mesh/Texture Cleanup → Scale Calibration → GLB
→ 3D QA → Archive → PDP progressive enhancement
```

3D is `NON_BLOCKING_ENHANCEMENT`; the PDP must remain complete with approved 2D assets alone.

See `docs/THREED_PIPELINE_2026-09-14.md`.

## Engine model

Engines are replaceable execution backends, for example:

- deterministic local renderer;
- ComfyUI;
- OpenAI image provider;
- future cloud providers;
- future 3D reconstruction tools.

An Engine may execute a Job. It does not own SKU identity, QA PASS, Archive truth, inventory, price or publication authority.

## Target daily UX

```text
HOME
PRODUCTION → Production Pieces
CREATE     → Product Images / Scene Images / 3D Models / Batch
REVIEW     → Human Visual Gate
LIBRARY    → Piece Assets / Archive / Prompts
SETTINGS   → Engines / Models / Budget / Storage / Advanced
```

Normal operation should be:

`Select Piece → Create → Review → Archive/Publish`.

## Current safety boundary

- RAW/source remains immutable;
- generation success ≠ QA success;
- cloud use is explicit, never silent fallback;
- Cost Guard remains mandatory for paid Providers;
- provider secrets remain local/server-side;
- Exact Piece identity remains mandatory when a workflow promises exact-piece fidelity;
- no model/engine may promote its own output into formal Archive.

## Documentation authority

Use `docs/DOCUMENT_AUTHORITY_AND_ARCHIVE_2026-09-14.md` when older packets, PRs or Gate reports conflict with current direction.

Current status: `docs/IMPLEMENTATION_STATUS.md`.

Migration/consolidation record: `docs/MIGRATION.md`.