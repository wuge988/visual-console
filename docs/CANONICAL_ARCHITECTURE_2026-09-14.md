# Visual Console — Canonical Architecture

Date: 2026-09-14  
Status: `CANONICAL / ACTIVE`  
Repository authority: `wuge988/visual-console`

## 1. Decision

Visual Console is the **single visual-production Control Plane** for DRIFT CURIO and future Site Profiles.

The project must no longer maintain separate competing systems for:

- product-image production;
- Aquarium/scene generation research;
- third-party/open-source workflow experiments;
- friend/reference console replication;
- 3D reconstruction;
- cloud-provider execution.

Those are different **Pipelines** and **Engine Adapters** inside one Control Plane, not independent Visual Console products.

The canonical model is:

```text
                    VISUAL CONSOLE
                         │
               Exact Piece / SKU truth
                         │
                  Capture Session
                         │
              Canonical Source Assets
                         │
        ┌────────────────┼────────────────┐
        │                │                │
        ▼                ▼                ▼
 PRODUCT IMAGE        SCENE IMAGE       3D MODEL
   Pipeline             Pipeline         Pipeline
        │                │                │
 SC01/SW01/SD01    Aquarium first    Reconstruction
        │                │                │
        └────────────────┼────────────────┘
                         ▼
                    HUMAN REVIEW
                         │
                       QA PASS
                         │
                  ASSET REGISTRY
                         │
                      ARCHIVE
                         │
               Publish / PDP / Library
```

## 2. Four architecture layers

### 2.1 Control Plane

The operator-facing application.

Authority:

- SKU / Exact Piece selection;
- Capture Session;
- Jobs;
- Pipeline selection;
- Engine selection through registries;
- Human review;
- QA state;
- Asset Registry;
- Archive and publish readiness;
- cost/budget policy.

There is only one Control Plane: **Visual Console**.

### 2.2 Pipeline

A business production sequence applied to one Exact Piece.

Initial canonical Pipelines:

1. **Product Image Pipeline** — transparent/white/dark product masters and later approved derivatives;
2. **Scene Image Pipeline** — Aquarium first; other realms only after the Aquarium method is frozen;
3. **3D Model Pipeline** — capture through GLB/web-ready asset and 3D QA;
4. Batch is an orchestration mode over the above Pipelines, not a fourth truth model.

### 2.3 Engine Adapter

A replaceable execution backend. Engines do not own business truth.

Examples:

- deterministic local renderer;
- ComfyUI workflows;
- OpenAI image provider;
- future Google/image/video providers;
- future 3D reconstruction engines;
- local Python/geometry tools.

An Engine may execute a Job. It may not independently decide SKU identity, QA PASS, Archive truth, pricing, inventory or publication authority.

### 2.4 Asset Truth

The durable production record.

Authority remains:

- RAW/source immutable;
- SHA256/byte-size evidence;
- Manifest / journal / D-E-F provenance where already validated;
- parent-child lineage;
- workflow/model/engine provenance;
- generation state;
- QA state;
- archive state.

A generated file is not formal evidence merely because an Engine returned success.

## 3. Consolidation of the previous four workstreams

### 3.1 C — 2026-08-27 Visual Console line

**KEEP / MERGE INTO CORE**

Keep:

- browser UI ↔ local control service ↔ engines ↔ D/E/F storage architecture;
- Exact SKU identity;
- RAW ingestion;
- Jobs;
- no-overwrite semantics;
- SHA256/size verification;
- Manifest/journal;
- QA;
- restart recovery;
- archive lifecycle;
- SC01/SW01/SD01 production truth.

Archive as historical UI:

- the old 8.27 front-end shell and old navigation assumptions.

The old production core is not replaced by the V2 shell; it is the validated truth layer underneath it.

### 3.2 A — Scene-generation / P5 research line

**KEEP R&D EVIDENCE / STOP AS INDEPENDENT ARCHITECTURE**

Preserved conclusions:

- whole-frame/high-denoise generation can create a convincing environment while changing Exact Piece identity;
- low-denoise preservation can keep identity while failing to generate a useful scene;
- complete donor compositions can leak composition and are not production-safe realism references;
- protected-subject / identity-core masking is directionally valid;
- material-only / anti-replication reference boards are preferable to whole-scene donor copying;
- Human Visual Gate is mandatory.

The old P5 PR #9 is closed without merge and retained only as R&D history. QA01 is not production-registered by virtue of that research.

The successor is the bounded **Scene Image Pipeline** documented separately.

### 3.3 Open-source / external workflow experiments

**ARCHIVE AS ENGINE/R&D REFERENCES**

Projects such as reconstruction/scene research code may contribute algorithms, nodes, models or implementation ideas.

They do **not** become:

- the Visual Console backend;
- the Job authority;
- the Asset Registry;
- the QA authority;
- the Archive authority.

No future open-source experiment should create a second control plane.

### 3.4 Friend/reference console replication and current V2

**KEEP UI/UX LESSONS / KEEP CURRENT V2 CONTROL PLANE / DO NOT CLONE A SECOND BACKEND**

The friend/reference console is an interaction reference, not architecture authority.

Keep from the current V2 work:

- site-neutral shell;
- Production / Jobs / Review / Library concepts;
- registry projections;
- engine health;
- Creation Canvas as orchestrator;
- Visual Copilot as draft/suggestion assistant;
- Provider Adapter abstraction;
- Cost Guard;
- paid-provider execution safety;
- spend audit.

Do not keep exposing each internal safety layer as a permanent first-class daily-production panel.

`Activation / Adapter / Preflight / Confirmation / Execution Intent / Spend Ledger` remain backend/advanced safety functions and should converge under **Settings → Advanced**.

## 4. Canonical daily UX

The operator should primarily see:

```text
HOME

PRODUCTION
  Production Pieces

CREATE
  Product Images
  Scene Images
  3D Models
  Batch

REVIEW
  Human Visual Gate

LIBRARY
  Piece Assets
  Archive
  Prompts

SETTINGS
  Engines
  Models
  Budget
  Storage
  Advanced
```

Normal production should read as:

```text
Select Piece → Create → Review → Archive/Publish
```

Internal safety complexity remains active but is not the primary operator workflow.

## 5. Shared domain model

All Pipelines share the same upstream and downstream truth.

### 5.1 Exact Piece / SKU

The real sellable object is upstream authority.

### 5.2 Capture Session

One Capture Session may feed Product Image, Scene and 3D Pipelines.

It can contain:

- RAW stills;
- orientation views;
- detail views;
- turntable sequence/video;
- camera/capture metadata;
- dimensions;
- masks;
- capture QA.

The goal is to reduce repeated photography and repeated imports.

### 5.3 Job

Every execution is a Job associated with:

- site;
- SKU;
- pipeline;
- workflow version;
- engine/model;
- input assets;
- parameters;
- output assets;
- cost where applicable;
- generation state.

### 5.4 QA

QA remains independent from Job success.

`SUCCEEDED` does not imply `QA_PASS`.

### 5.5 Asset Registry / Archive

Product images, Scene derivatives and GLB/3D assets use one lineage/registry/archive system.

## 6. Pipeline boundaries

### 6.1 Product Image Pipeline

Current validated production truth is retained:

```text
RAW → SC01 transparent master → SW01 white master → SD01 dark master → QA → Archive
```

These validated stages are not reset by this consolidation.

### 6.2 Scene Image Pipeline

Aquarium is the first production target.

Scene work must preserve Exact Piece identity and use the same Human Visual Gate and Archive authority as product images.

Scene generation may benchmark multiple Engines against the same source package. Engine competition is allowed; truth-model duplication is not.

### 6.3 3D Model Pipeline

3D is a parallel Pipeline, not a replacement for 2D product photography.

Canonical sequence:

```text
Capture
→ Frame QC
→ Wood-only Mask
→ Reconstruction
→ Mesh/Texture Cleanup
→ Scale Calibration
→ GLB/Web Asset
→ 3D QA
→ Archive
→ PDP feature-gated publish
```

PDP rule remains: **3D is NON_BLOCKING_ENHANCEMENT**. A PDP must remain complete and customer-usable with 2D assets alone.

3D does not own SKU, inventory, price, measurements, shipping or transaction authority.

## 7. Scene and 3D can proceed together

They should proceed in parallel because they share:

- SKU identity;
- Capture Session;
- RAW assets;
- orientation metadata;
- masks where applicable;
- Jobs;
- QA;
- Asset Registry;
- Archive;
- operator shell.

They do **not** share the same execution algorithm. Scene generation and 3D reconstruction remain separate Pipelines/Engine Adapters.

## 8. Cloud and paid-provider boundary

The current provider safety work is retained as backend infrastructure.

Current policy:

- cloud remains explicit, not silent fallback;
- Cost Guard is mandatory;
- secrets remain server/local-side;
- execution intent remains bounded/single-use where implemented;
- exact-envelope mutation invalidates prior authorization;
- spend audit remains available;
- Human Visual Gate cannot be bypassed by model success.

UX consolidation must not remove these protections; it only hides unnecessary implementation detail from normal operation.

## 9. Document authority

Current authority order:

1. live `main` code and current runtime evidence;
2. this canonical architecture document;
3. `docs/IMPLEMENTATION_STATUS.md`;
4. active Pipeline documents;
5. current explicit Human decisions;
6. historical implementation packets / old Gate reports / old conversations.

Any older document conflicting with this file is historical evidence only.

## 10. Migration phases

### P0 — Architecture consolidation

- one Control Plane;
- close abandoned competing PRs without merge;
- document authority cleanup;
- Notion/GitHub canonical synchronization.

### P1 — Core truth consolidation

- expose old validated Manifest/Job/QA/Archive lifecycle as the canonical V2 core;
- no migration that rewrites verified source/archive truth.

### P2 — UX consolidation

- reduce daily navigation;
- move provider internals to Settings/Advanced;
- preserve safety underneath a simple Generate action.

### P3-A — Scene MVP

- Aquarium only;
- one pilot SKU;
- fixed Capture/identity package;
- Engine benchmark;
- Human Gate;
- no production registration until accepted.

### P3-B — 3D MVP

- one pilot SKU;
- matte/controlled capture background;
- wood-only segmentation/mask QA;
- reconstruction and GLB export;
- 3D QA;
- no PDP blocking.

P3-A and P3-B may run in parallel.

### P4 — Engine benchmark / workflow freeze

Freeze only methods that pass measurable and Human Gates.

### P5 — Production registration

Register accepted workflows as executable Pipelines with versioned provenance.

### P6 — PDP / site publication

Publish Scene/3D assets as progressive enhancements after their independent QA/release gates.

## 11. Explicit stop rules

Stop the following patterns:

- building another independent Visual Console;
- treating a reference/open-source project as the business backend;
- 1:1 cloning the friend console backend;
- exposing every safety primitive as a daily operator step;
- endless D0–D5 parameter tuning without a bounded benchmark decision;
- letting ComfyUI own business truth;
- allowing 3D to block PDP/site release;
- allowing generated scene beauty to override Exact Piece identity.

## 12. Definition of success

Visual Console is successful when one operator can:

```text
Capture one Exact Piece
→ create product images / scene images / 3D assets from the same source truth
→ compare outputs
→ approve/reject them
→ archive approved assets
→ publish approved assets
```

without needing to understand which internal safety service, ComfyUI graph, provider adapter or reconstruction library performed each step.