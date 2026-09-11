# Visual Console V2 — Final Design Freeze

Date: 2026-09-12  
Status: `DESIGN_FROZEN / IMPLEMENTATION_NOT_STARTED / P5_QA01_UNCHANGED`

## 1. Product position

Visual Console V2 is the site-neutral visual production control plane for one-person, low-cost AI commerce operations. DRIFT CURIO remains the first Site Profile, but the application must not hard-code driftwood, TikTok, or any single model/provider.

V2 adopts the mature SaaS-shell patterns observed in the UUclip reference console—global job visibility, stable navigation, task-centric workspaces, prompt/assets as first-class objects, a visual canvas, and an in-canvas AI assistant—while keeping Visual Console's stronger requirements around Exact Piece identity, provenance, reproducibility, local-first execution, QA, archive truth, and immutable source assets.

The target is not a 1:1 code clone. The target is an equivalent or stronger operational UX with Visual Console's own data model and production truth.

## 2. Frozen principles

1. **Local-first, cloud-escalation.** Routine work runs locally. Paid cloud generation is an exception path, not the default path.
2. **Model-agnostic.** UI and workflow definitions never hard-code GPT Image, Seedance, Flux, Wan, or a future provider.
3. **Exact Piece identity before aesthetics.** Generated beauty cannot override the identity of the real SKU.
4. **Source is immutable.** RAW/source assets are never modified or replaced by generated derivatives.
5. **Generation success is not QA success.** Job state, QA state, and archive state remain separate state machines.
6. **Registry-driven operation.** Models, workflows, prompts, engines, node types, cost metadata, and site capabilities come from registries.
7. **Evidence-first archive.** No generated output becomes formal Evidence/Archive merely because a model call succeeded.
8. **Single-operator efficiency.** Routine operation must not require BAT/PowerShell/manual file shuffling.
9. **Fail closed on cost and truth boundaries.** Unknown provider price, missing provenance, identity uncertainty, or invalid source state blocks the next irreversible step.
10. **Existing physical truth survives V2.** P1–P4C and the active P5 QA01 work are not reset or reinterpreted by a UI redesign.

## 3. Target information architecture

```text
Visual Console
├── Dashboard
│
├── Production
│   ├── Production Pieces
│   ├── Image Generation
│   ├── Scene Generation
│   ├── Batch Generation
│   └── Creation Canvas
│
├── Jobs
│   ├── Queue
│   ├── History
│   └── Failed / Retry
│
├── Quality
│   ├── Automated QA
│   └── Human Visual Gate
│
├── Assets
│   ├── Piece Assets
│   ├── Prompt Library
│   ├── Material Boards
│   └── Reference Library
│
├── Evidence
│   ├── SKU Manifest
│   ├── Evidence Record
│   └── Archive
│
└── System
    ├── ComfyUI / Local Engines
    ├── Model Registry
    ├── Workflow Registry
    ├── Budget & Providers
    ├── Storage
    └── Settings
```

## 4. Global shell

### 4.1 Sidebar

- Desktop target width: approximately 210 px; collapsible.
- Grouped navigation rather than one flat list.
- Site Profile selector remains globally visible but secondary to task context.
- Navigation state must survive reload.

### 4.2 Global Job Monitor

Persistent top bar on every route:

```text
TODAY
Generation  Queued | Running | Completed | Failed
QA          Pending | Passed | Rejected
Archive     Ready | Archived
System      ComfyUI | Worker | Queue
Cloud Cost  Today | Month
```

The monitor is driven by a server-side summary endpoint. It is not derived from whichever page is open.

### 4.3 Workspace tabs

Recently opened working pages may remain as closable tabs. The tab strip is an operator productivity feature; it is not the source of route truth.

### 4.4 Command/search surface

Global search/command palette should locate:

- SKU;
- job;
- workflow;
- prompt;
- asset;
- route/action.

## 5. Dashboard

The dashboard answers five questions immediately:

1. What is running now?
2. What failed?
3. What requires human review?
4. Is the local engine healthy?
5. Has any paid cloud budget been consumed?

Primary panels:

- global task summary;
- active jobs;
- Human Visual Gate inbox;
- recently touched Exact Pieces;
- provider/engine health;
- daily/monthly cloud spend;
- recent failures with retry eligibility.

## 6. Generation Composer

Image Generation and Scene Generation use one consistent task-composer pattern:

```text
Exact Piece / Reference
        ↓
Prompt / Prompt Template
        ↓
Workflow
        ↓
Model / Engine capability
        ↓
Output parameters
        ↓
Cost estimate + truth checks
        ↓
Create Job
```

The screen must expose only business-relevant controls. Raw ComfyUI graph complexity remains behind the Workflow Registry.

### 6.1 Output modes

Initial high-level modes:

- Product;
- Aquarium;
- Rainforest / Paludarium;
- Reptile;
- Collectible;
- Detail;
- Motion.

A Site Profile may enable/disable modes.

## 7. Dual-engine execution model

```text
                    Visual Console
                          │
                   Workflow Router
                          │
            ┌─────────────┴─────────────┐
            │                           │
       LOCAL ENGINE                CLOUD ENGINE
       default path              escalation path
            │                           │
   Local renderer / ComfyUI      Provider adapters
   RMBG / Flux / Kontext         GPT Image family
   Wan / deterministic ops       Seedance family
            │                           │
            └─────────────┬─────────────┘
                          │
                       Job Store
                          │
                     QA / Evidence
```

### 7.1 Routing policy

Default policy target: most production stays local; cloud use is deliberately rare and high-value. `95% local / 5% cloud` is an operating target, not a hard SLA.

Cloud escalation can occur only when one of these is true:

- a human explicitly selects Cloud;
- a workflow rule reaches a defined local-failure threshold and cloud escalation is enabled;
- a final-motion workflow is explicitly configured to use a cloud video renderer.

Cloud calls are never silently substituted for failed local jobs.

### 7.2 Cost Guard

Every cloud-capable job records:

- provider;
- model key;
- estimated cost;
- actual cost when known;
- currency;
- per-SKU accumulated cost;
- daily/monthly accumulated cost;
- approval source.

Defaults:

- `cloud_enabled=false` until configured;
- no call with unknown pricing metadata;
- configurable per-job, per-SKU, daily, and monthly limits;
- UI shows estimated cost before submission.

## 8. Registries

### 8.1 Model Registry

Each model entry includes at least:

```text
model_key
provider
engine_type
media_type
label
capabilities
required_inputs
optional_inputs
resolutions
aspect_ratios
duration_range
cost_model
cost_metadata
availability
enabled
site_scope
```

### 8.2 Workflow Registry

Each workflow entry includes:

```text
workflow_key
version
display_name
engine
input_schema
output_schema
required_assets
optional_assets
parameter_schema
identity_policy
qa_policy
archive_policy
cost_policy
enabled
site_scope
```

### 8.3 Prompt Registry

Prompts are first-class versioned assets, not textarea history. Metadata includes:

- prompt key/version;
- scene/use type;
- camera;
- lighting;
- composition;
- environment;
- Exact Piece constraints;
- negative constraints;
- compatible workflows/models;
- reference outputs;
- human rating/status.

## 9. Unified job model

Generation lifecycle:

```text
DRAFT → VALIDATING → QUEUED → RUNNING → SUCCEEDED
                              └────────→ FAILED
Any non-final state may become CANCELLED when safe.
```

QA lifecycle is independent:

```text
NOT_REQUIRED | QA_PENDING | QA_PASS | QA_FAIL
```

Archive lifecycle is independent:

```text
STAGING | ARCHIVE_READY | VERIFIED_ARCHIVE | REJECTED
```

A `SUCCEEDED` generation may still be `QA_FAIL` and must remain outside formal Evidence/Archive.

## 10. Assets and provenance

Asset roles are explicit:

- RAW_SOURCE;
- VERIFIED_CUTOUT;
- STATIC_MASTER;
- GENERATED_DERIVATIVE;
- REFERENCE_ONLY;
- MATERIAL_BOARD;
- QA_EVIDENCE;
- VERIFIED_ARCHIVE.

Every managed derivative retains:

- site/SKU;
- parent asset(s);
- SHA256 and byte size;
- dimensions/media metadata;
- workflow key/version;
- model/engine key;
- prompt version;
- job id;
- creation time;
- QA state;
- archive destination when formalized.

A rebuildable local metadata index may be introduced for fast search, but existing Manifest/journal/file provenance remains authoritative unless a separately gated migration changes that rule.

## 11. Creation Canvas

The Canvas is a **Visual Production Orchestrator**, not a raw ComfyUI clone.

### 11.1 Node families

```text
INPUT
  Exact Piece
  Source Photos
  Cutout
  Reference

CONTEXT
  Manifest
  Measurements
  Material Board

PROMPT
  Prompt Template
  Prompt Draft

EXECUTION
  Workflow
  Model
  Generate
  Batch

REVIEW
  Compare
  Automated QA
  Human Gate

OUTPUT
  Evidence
  Archive Candidate
```

### 11.2 Canvas UX

Required behaviors:

- upload/add asset;
- add node;
- drag/connect;
- undo/redo;
- copy/paste;
- zoom/pan;
- autosave;
- explicit save/version;
- preview;
- new workflow;
- workflow library;
- selected-node inspector.

Default implementation target is a Vue-native graph layer behind a Canvas adapter so the graph library can be replaced without changing the domain model.

## 12. Visual Copilot

The right-side assistant is contextual to the current Site, SKU, selected nodes, assets, workflow, historical outputs, and QA results.

Initial commands:

- Analyze Piece;
- Generate Prompt;
- Create Scene Plan;
- Suggest References;
- Compare Outputs;
- Diagnose QA Failure;
- Revise Prompt;
- Create Retry Draft.

Safety boundaries:

- Copilot may create drafts and suggestions;
- Copilot may not silently spend cloud budget;
- Copilot may not mark Human Visual Gate PASS;
- Copilot may not promote to VERIFIED_ARCHIVE;
- Copilot may not overwrite RAW/source assets.

## 13. Exact Piece policy

For DRIFT CURIO and any future one-of-one inventory profile:

- the real SKU identity is upstream truth;
- generative outputs are derivatives, never replacements for source identity evidence;
- geometry/branch/hole/texture drift is a QA failure when the workflow promises Exact Piece fidelity;
- cloud image/video outputs follow the same identity gate as local outputs;
- a visually attractive hallucination cannot become Evidence.

Final cloud video is positioned as marketing/lifestyle motion unless a dedicated workflow later proves stronger identity guarantees.

## 14. Technical architecture

Preserve the current repository foundation:

- frontend: Vue 3 + TypeScript + Vite;
- backend: Fastify + TypeScript;
- local-first Windows runtime;
- current Manifest / journal / D-E-F storage semantics;
- ComfyUI as a local generation engine where applicable.

V2 adds domain services rather than replacing validated renderers:

```text
apps/web
  shell/
  dashboard/
  production/
  jobs/
  quality/
  assets/
  evidence/
  canvas/
  system/

apps/server
  registries/
  jobs/
  engines/
    local/
    comfyui/
    cloud/
  assets/
  prompts/
  canvas/
  budget/
  qa/
  evidence/
```

Provider credentials stay server-side/local-only and must never be committed or exposed to the browser.

## 15. Update transport

V2 does not require WebSocket as a baseline dependency.

- running-job pages may poll quickly while active;
- global summary/server health polls more slowly when idle;
- SSE may be introduced later if measurements show a real need;
- no transport choice may change job/QA/archive truth semantics.

## 16. Visual direction

The V2 console should keep a professional neutral dark/light system rather than clone UUclip branding.

Frozen direction:

- dark sidebar;
- light operational workspace by default;
- dark Canvas workspace;
- restrained purple/blue accent;
- compact status chips;
- dense but readable task tables;
- cards used for summaries, not for every piece of information;
- desktop-first but responsive enough for operational tablet/mobile review;
- Mobile Capture remains a focused capture surface, not a compressed desktop console.

## 17. Migration rule

V2 is an additive architecture migration.

It must not:

- rewrite validated P1–P4C outputs;
- mutate historical Manifest entries;
- change SC01/SW01/SD01 rendering truth without a separate gate;
- enable QA01 merely because the V2 UI can display it;
- merge or alter active P5 PR #9 as part of the shell redesign.

## 18. Implementation sequence

### V2-A — Shell

Sidebar, top monitor, route tabs, command search, Dashboard frame, responsive shell.

### V2-B — Registries and health

Model Registry, Workflow Registry, engine health, server-side navbar summary, budget metadata.

### V2-C — Unified Jobs

Single job abstraction, queue/history/failed views, retry policy, polling, summary counters.

### V2-D — Asset and Prompt Library

Visual asset browser, prompt registry, material/reference boards, lineage views.

### V2-E — Production Composer

Image/scene/batch composers using registry-driven capabilities.

### V2-F — Creation Canvas

Node/edge schema, workflow save/versioning, selected-node inspector, workflow library.

### V2-G — Visual Copilot

Context packing, draft-only actions, QA diagnosis, no autonomous spend/archive authority.

### V2-H — Cloud Escalation

Provider adapter contract, Cost Guard, paid generation audit, first approved image/video providers.

## 19. Acceptance criteria

V2 architecture is considered implemented only when:

1. a single dashboard shows trustworthy local job, QA, archive, engine, and cost state;
2. the same workflow can switch engine/provider through registries without page rewrites;
3. a local job and a cloud job produce the same provenance/QA envelope;
4. cloud spend cannot occur without configured budget metadata and authorization;
5. Exact Piece identity failures cannot enter formal Evidence/Archive;
6. Canvas workflows persist and can be reopened/versioned;
7. Visual Copilot can create drafts but cannot bypass Human Gate or Cost Guard;
8. P1–P5 historical truth remains readable and unmodified;
9. build/tests and Windows physical gates remain green for touched production paths.

## 20. Current boundary at freeze time

Repository stable `main` is P4C released. Active PR #9 (`feat/p5-qa01-scene-freeze`) remains Draft/Open/Unmerged and QA01 remains disabled while the physical Video2Twin identity path is still under Gate.

This V2 document freezes product/architecture direction only. It does not claim V2 implementation, P5 approval, cloud-provider activation, deployment, or production migration.