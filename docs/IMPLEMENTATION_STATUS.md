# Visual Console — Implementation Status

Date: 2026-09-15  
Status: `P2_MERGED / P3_PARALLEL_MVP_ACTIVE / SINGLE_CONTROL_PLANE`

Canonical architecture: `docs/CANONICAL_ARCHITECTURE_2026-09-14.md`.

## Current repository truth

- repository: `wuge988/visual-console`;
- P0 architecture consolidation: **DONE**;
- P1 core truth/read-model consolidation: **DONE**;
- P2 UX consolidation PR #54: **SQUASH MERGED** after Human Visual Gate PASS;
- P2 merge commit on `main`: `385880de97504947e5ebdaa5ccfdb75cab92e87e`;
- main push CI #736: **PASS**;
- old P5/QA01 PR #9: **CLOSED WITHOUT MERGE**, retained as R&D history only;
- P3-A Aquarium Scene MVP and P3-B 3D MVP are now the active parallel phases.

## Current product state

### 1. Production Core — retained

Validated production behavior remains part of the final architecture:

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

### 2. V2 Control Plane — canonical daily shell

P2 Human Visual Gate passed. The normal operator shell is Chinese-first and uses one control plane:

```text
首页
生产 → 产品件 / 视觉助手
创建 → 产品图 / 场景图 / 3D 模型 / 批量生成
审核 → 人工视觉审核
资产库 → 产品素材 / 归档 / 提示词库
设置 → 引擎 / 模型 / 预算 / 存储 / 高级设置
```

Legacy `/workspace`, `/qa`, `/assets` are retired from normal operation and redirect into V2. They remain temporarily reachable only through explicit legacy bypass for rollback/debugging; they are not current product surfaces.

### 3. Product Image Pipeline — production truth retained

```text
RAW → SC01 → SW01 → SD01 → QA → Archive
```

Already validated product-image stages remain production truth.

### 4. Scene Image Pipeline — P3-A active, Aquarium only

Status: `P3-A_ACTIVE / AQUARIUM_ONLY / EVALUATION_ONLY / NO_PRODUCTION_REGISTRATION`.

Pilot:

- Site: `drift-curio`;
- SKU: `DC-ZY-SZ-31001`;
- workflow: `QA01`;
- fixed source package required;
- bounded two-route comparison maximum;
- Exact Piece identity + Aquarium realism + Human Gate + cost/time gates required.

Historical P5/QA01 findings are advisory R&D only. Closed routes are not to be restarted as parameter-tuning loops:

- D0–D6 Kontext/masked-inpaint tuning;
- v3.2 foreground materialization;
- intact donor composition conditioning.

Current contract: `docs/P3_MVP_EXECUTION_CONTRACT_2026-09-15.md`.

### 5. 3D Model Pipeline — P3-B active, PDP non-blocking

Status: `P3-B_ACTIVE / LOW_TOUCH / EVALUATION_ONLY / PDP_NON_BLOCKING`.

Pilot:

- Site: `drift-curio`;
- SKU: `DC-ZY-SZ-31001`;
- workflow: `M3D01`;
- existing/short turntable video preferred;
- automated frame QC;
- wood-only mask;
- reconstruction → identity Gate → mesh/texture cleanup → scale → GLB → 3D QA;
- no manual per-frame click workflow in the normal path;
- no return to manual RealityScan multi-ring still capture without explicit reversal.

3D remains a progressive enhancement. A missing or failed 3D asset cannot block PDP/site release when approved 2D assets exist.

## P3 shared foundation

Tracked pilot definitions live in `config/pilots/p3-registry.json` and are projected read-only through `/api/v2/pilots`.

Safety properties are contract-tested:

- `production_registration` must remain `false` during P3 evaluation;
- `pdp_blocking` must remain `false`;
- QA01 maps to canonical `SCENE_IMAGE`;
- M3D01 maps to canonical `MODEL_3D`;
- Scene/3D output kinds remain separate from Product masters;
- no Engine becomes business authority.

`QA01` and `M3D01` are not added to the site `enabled_workflows` during evaluation.

## Paid cloud execution status

Backend safety infrastructure is retained, but P3 does not authorize real paid Provider execution by default.

Protections remain:

- explicit Cloud/Provider/Model activation;
- credential presence checks;
- paid-network runtime gate;
- Cost Guard;
- submit preflight;
- exact-envelope mutation invalidation;
- single-use short-lived execution intent;
- spend audit.

## Architecture decisions still in force

### KEEP

Exact Piece identity; Capture Session; immutable RAW/source; Manifest/journal/D-E-F provenance; SC01/SW01/SD01; Jobs; generation/QA/archive separation; Human Visual Gate; Asset Registry/Archive; local-first Engine support; Provider abstraction and Cost Guard; bounded scene R&D lessons; low-touch 3D capture/reconstruction lessons.

### ARCHIVE / RETIRE

Old 8.27 front-end shell; PR #9 P5/QA01 as an independent architecture; legacy `/workspace`/`/qa`/`/assets` as daily surfaces; open-source/reconstruction projects as control-plane candidates.

### STOP

Building another Visual Console; 1:1 backend replication of a reference console; treating ComfyUI/3D tools as business truth; full donor composition copying; endless D0–D6 tuning; manual RealityScan still-photo workflow as the normal SKU path; allowing 3D to block PDP/site release.

## Active execution sequence

### P3 shared foundation

Pilot contracts, read-only pilot projection and fail-closed invariants.

### P3-A — Aquarium Scene MVP

Repository evaluation harness → local source/runtime Gate → bounded candidate comparison → Human Visual Gate → cost/time decision.

### P3-B — 3D MVP

Repository capture/reconstruction harness → target-Windows physical Gate → Exact Piece 3D identity Gate → GLB/scale/3D QA.

### P4 — Workflow Freeze

Only methods that pass identity, visual, provenance and operational gates receive versioned executable workflow registration.

### P5 — Production Registration

Only frozen P4 workflows become controlled production capabilities.

### P6 — PDP/Site Publish

2D remains sufficient. Scene and 3D remain independently gated progressive enhancements.

## Documentation authority

See `docs/DOCUMENT_AUTHORITY_AND_ARCHIVE_2026-09-14.md`. Older status strings such as `P5_ACTIVE_DRAFT`, `V2_DESIGN_FROZEN / IMPLEMENTATION_NOT_STARTED`, or `PR #9 WINDOWS_GATE_NEXT` are historical and superseded.
