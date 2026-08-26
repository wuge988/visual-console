# Visual Console P2 — SC01 Control Loop Implementation Packet

Date: 2026-08-26
Workflow: `JZ-v0.4 / MODE_A_STANDARD_FRONTEND`
Packet ID: `VC-P2-SC01-CONTROL-LOOP-001`
Status: `G4A_APPROVED / S5_CODE_COMPLETE / AUTOMATED_VALIDATION_PASS / TARGET_WINDOWS_RUNTIME_REQUIRED`

## 1. Goal

Implement the next approved Visual Console v0.1 slice on top of released P1:

`six real routes → truthful Workflow Library → SC01 API workflow registration → RAW selection → serial batch queue → ComfyUI prompt submission → prompt-correlated output capture/versioning → dynamic QA → PASS/FAIL/Retry/Note → staging asset visibility → system health`

This packet deliberately stops before Gate-15-equivalent archive migration.

## 2. Repository binding target

- repository: `wuge988/visual-console`
- base branch: `main`
- base commit: `024da283e9f92e35c1b0460f02df0eaa4a6ad877`
- working branch: `feat/p2-sc01-control-loop`
- expected Windows worktree for runtime evidence: `E:\AI_PROJECTS\VISUAL_CONSOLE`
- approved upstream design source: `wu-e-commerce/driftwood-commerce@docs/visual-console-v0.1-design-source`
- baseline inheritance record: `docs/p2/P2_BASELINE_INHERITANCE.md`

## 3. In scope

### 3.1 Six top-level routes

Replace visual-only sidebar buttons with real application navigation using Vue Router or an equivalent URL-addressable router.

Required routes:

- `/workspace` — 工作台
- `/workflows` — 工作流
- `/jobs` — 任务队列
- `/qa` — 质量审核
- `/assets` — 素材资产
- `/system` — 系统状态

Requirements:

- current route has clear active state;
- browser back/forward works;
- reload/deep-link does not lose the selected route;
- site + item/SKU context remains visible in application chrome;
- no navigation item may remain a dead button;
- mobile route shell may remain simplified, but desktop six-route behavior is mandatory.

### 3.2 Truthful Workflow Library

Create a machine-readable Visual Console workflow registry derived from the approved legacy registry semantics.

Known codes may be migrated as metadata:

`SW01 / SD01 / SC01 / QA01 / QR01 / QP01 / QC01 / VP01 / VS01 / ET01 / EI01 / EP01 / EH01`

Rules:

- preserve distinction between `preset_status` and `workflow_status`;
- do not claim a workflow is executable unless a real runtime workflow is registered;
- sidebar workflow badge is derived from executable/registered workflows, not the legacy hard-coded `13`;
- Workflows page may show all known presets with Chinese labels and explicit states such as 已注册 / 待绑定 / 计划中;
- `SC01` is the only workflow permitted to become executable in this packet.

### 3.3 SC01 local API-workflow registration

Because the validated SC01 graph exists as an operator-tested ComfyUI workflow but the legacy registry did not contain a formally bound production API JSON, P2 must provide a bounded one-time registration path instead of inventing node IDs.

Desktop-local registration flow:

1. Workflows page provides `导入 SC01 API Workflow JSON`.
2. Browser sends the selected JSON file to a localhost-only endpoint.
3. Server enforces a small JSON-only size limit and parses it as ComfyUI API-format workflow data.
4. Server identifies exactly one `LoadImage` input node.
5. Server scans workflow node inputs for the frozen SC01 parameter signature and requires exact values:
   - sensitivity `1.00`;
   - process_res `1024`;
   - mask_blur `0`;
   - mask_offset `-1`;
   - invert_output `false`;
   - refine_foreground `true`;
   - Alpha background semantics where represented in the API JSON.
6. A mismatching workflow is rejected; P2 must not silently retune parameters.
7. Valid workflow is stored under local E/control runtime data, not as an arbitrary client filesystem path.
8. Registry records hash, registration time and `workflow_status = REGISTERED`.

A new different workflow hash must never silently overwrite the existing binding.

### 3.4 ComfyUI client

Add a server-side ComfyUI client with a default local endpoint of `http://127.0.0.1:8188` and optional trusted environment override.

Allowed behavior:

- health/system stats;
- native queue visibility;
- `POST /prompt` submission;
- prompt-specific history polling;
- output metadata retrieval needed to capture the exact prompt result.

Security:

- browser cannot submit arbitrary ComfyUI host URLs;
- P2 does not expose ComfyUI to LAN/public internet;
- ComfyUI remains a localhost execution engine.

### 3.5 SC01 batch queue

Workspace supports selecting one or more workflow-compatible RAW image assets and submitting them as an SC01 batch.

First-slice supported input types:

- JPEG / JPG
- PNG
- WebP

HEIC/HEIF originals remain preserved in RAW but must be visibly marked non-executable for SC01 in this packet rather than silently converted with an unvalidated normalizer.

GPU policy:

- one active SC01 job at a time by default on the current 8GB GPU;
- multiple selected assets form a serial application queue;
- do not submit uncontrolled parallel RMBG jobs that can increase OOM risk.

Internal job states use stable English keys:

`READY → QUEUED → RUNNING → GENERATED → CAPTURED → QA_PENDING → QA_PASS | QA_FAIL`

Failure states:

`FAILED_SUBMIT / FAILED_RUNTIME / FAILED_CAPTURE / FAILED_QA`

`ARCHIVED` / `FAILED_ARCHIVE` remain reserved for the later archive slice and are not produced by P2.

### 3.6 Safe ComfyUI input preparation

For each selected RAW source:

- resolve source via existing `site_id + item_id + asset_id` logic;
- never accept an arbitrary client path;
- copy a workflow input derivative into a configured D/ComfyUI input area;
- use collision-safe generated names;
- preserve the F RAW original;
- verify the copy before submission when a cross-root transfer occurs;
- inject only the generated ComfyUI input filename into the registered LoadImage node.

### 3.7 Prompt-correlated output capture

Do not restore Gate16A-style “latest file” guessing.

Capture must be correlated to the submitted `prompt_id` via ComfyUI history/output metadata.

For a successful SC01 result:

- resolve only output paths under configured ComfyUI/D staging roots;
- reject traversal/symlink escape;
- capture the intended image output;
- preserve no-overwrite semantics;
- assign durable staging filename:
  `{ITEM_OR_SKU}__cutout__master__wf-SC01__vNNN.png`;
- version allocation must account for already-existing staging versions and must never overwrite an existing asset;
- record source asset ID, job ID, prompt ID, workflow hash, version, SHA256, byte size and staging path in local control/audit data.

### 3.8 Job persistence

P2 queue/history must survive a normal Visual Console server restart.

Use a simple local E/control journal or equivalent deterministic local persistence. SQLite is not required for this packet.

Requirements:

- no cloud persistence;
- no credentials;
- reconstruct latest job state after restart;
- malformed/torn tail records must not cause silent data loss;
- persisted state must use stable English keys.

### 3.9 Quality Review page

QA page operates on captured transparent Masters in `QA_PENDING` state.

Required visual inspection modes:

- Red
- Black
- White
- Checkerboard

Required controls:

- 适应窗口
- 100%
- 200%
- 400%
- pan/drag at zoom
- 原图 ↔ Master comparison
- 通过
- 不通过
- 重试
- 备注
- batch PASS for selected QA items

Rules:

- QA backgrounds are browser rendering only;
- do not generate persistent `qa-red`, `qa-black`, `qa-white` files;
- PASS/FAIL/Note are persisted audit events;
- `Retry` creates a new bounded SC01 job from the same RAW source; it does not mutate the existing generated asset or silently change SC01 parameters;
- QA PASS means `可归档/待归档`, not automatically archived in P2.

### 3.10 Assets page

P2 Assets page becomes a meaningful visual gallery, not a placeholder route.

At minimum show:

- RAW assets from F;
- SC01 Cutout staging assets from D;
- workflow/version/state metadata;
- image/video preview where supported;
- current item/SKU grouping;
- status filters: RAW / QA_PENDING / QA_PASS / QA_FAIL.

Do not expose arbitrary filesystem paths as browser authority.

Existing desktop recoverable Trash behavior for RAW must remain available and safe.

Generated staging-asset deletion is not added in this packet.

### 3.11 System page

Display truthful live status for:

- Visual Console Local API;
- selected LAN interface/IP;
- ComfyUI online/offline;
- ComfyUI queue depth;
- GPU/VRAM data when returned by ComfyUI system stats;
- workflow registry state;
- SC01 registered/not-registered state and workflow hash;
- configured D/E/F roots;
- disk/root reachability and capacity when safely available.

P2 is observe-only for ComfyUI process lifecycle. It does not invent or hard-code a ComfyUI startup command without a separately validated launcher contract.

### 3.12 Workspace integration

Keep P1 Mobile Capture intact and evolve Workspace into the approved compact production surface:

- current Site + Item/SKU;
- source asset selection;
- selected executable workflow;
- `运行 SC01` batch action;
- latest 3 jobs;
- current-item asset summary;
- QR mobile capture remains available.

## 4. Non-scope

P2 must not implement or perform:

- Gate-15-equivalent batch archive into F approved roots;
- deletion of staging after archive;
- permanent delete;
- Trash Restore UI;
- generated-asset Trash semantics;
- SW01 / SD01 / QA01 / QR01 / QP01 / QC01 / VP01 / VS01 / ET01 / EI01 / EP01 / EH01 execution;
- SC01 model/parameter experimentation or 1536 resolution;
- automatic HEIC/HEIF normalization;
- WAN 2.2 or generative video production;
- cloud/public exposure;
- router port forwarding;
- authentication/multi-user roles;
- multi-GPU execution;
- arbitrary shell commands or arbitrary Windows paths;
- destructive cleanup of legacy Gate14/15/16 scripts;
- merge or deployment.

## 5. Expected modules / allowed files

Production implementation may edit only the following bounded areas after valid G4A:

- `apps/web/src/**`
- `apps/web/package.json`
- `apps/server/src/**`
- `apps/server/test/**`
- `apps/server/package.json`
- `config/workflows/**`
- `config/sites/drift-curio.json` only for additive site/runtime binding fields needed by this packet
- root `package.json` / `package-lock.json` only when required for approved dependencies/scripts
- `.github/workflows/ci.yml` only for validation coverage
- `docs/p2/**`
- README/status docs only for accurate P2 operator/governance state

No other application/repository path is authorized without a superseding G4A.

## 6. API contract additions

Exact names may be refined during implementation without changing semantics, but the server must provide bounded equivalents of:

- `GET /api/workflows`
- `POST /api/workflows/SC01/register`
- `GET /api/jobs`
- `POST /api/jobs/batch`
- `POST /api/jobs/:jobId/retry`
- `GET /api/qa`
- `POST /api/qa/:assetId/decision`
- `GET /api/assets/generated/:siteId/:itemId/:assetId/content`
- `GET /api/system/status`

All mutating/admin endpoints are localhost-only in P2.

## 7. Validation plan

### Automated

CI must remain deterministic:

`npm ci → npm test → npm run build`

Add focused tests covering at minimum:

1. router/web build with six routes;
2. workflow registry truthfulness and registered-count behavior;
3. SC01 API workflow JSON size/type validation;
4. unique LoadImage detection;
5. exact frozen SC01 parameter validation;
6. different-hash overwrite prevention;
7. localhost-only registration/mutation boundary;
8. ComfyUI mock health/queue/prompt/history flow;
9. serial queue behavior and job state transitions;
10. prompt-correlated capture rather than newest-file selection;
11. version no-overwrite behavior;
12. output traversal/symlink rejection;
13. job journal restart reconstruction;
14. QA PASS/FAIL/Note/Retry transitions;
15. P1 upload/Trash/SKU tests remain passing.

### Target Windows runtime

After CI passes, human Owner runtime evidence must verify:

1. all six sidebar modules are clickable and route correctly;
2. P1 QR/mobile upload still works;
3. System page reports ComfyUI offline truthfully when stopped and online truthfully when running;
4. import the real SC01 ComfyUI **API-format** JSON once and see `SC01 = REGISTERED`;
5. run one JPEG/PNG RAW through SC01;
6. exact result lands in D staging with `__wf-SC01__v001`-style no-overwrite naming;
7. Queue shows real state and exact completed job;
8. QA Red/Black/White/Checkerboard and Original↔Master work;
9. PASS, FAIL, Note and Retry persist after refresh;
10. submit a 3-image batch and verify serial processing;
11. restart Visual Console and verify job/generated-asset/QA history is reconstructed;
12. verify no P2 action moved or deleted the F RAW original and no Gate-15 archive occurred.

## 8. Risk classification

Recommended G5 class: `QA-3`.

Reason: P2 controls a local GPU execution engine and creates/moves workflow derivatives in real user storage while modifying QA state used for later archive decisions.

## 9. Implementation result requirement

S5 produced `docs/p2/P2_IMPLEMENTATION_RESULT.md` containing architecture, code-head, automated validation, current CI evidence, Windows runtime evidence status, deviations/risks, and Non-Scope confirmation.

## 10. Current hard stop

Human Owner approved the exact G4A binding on 2026-08-26. S5 code and automated validation are complete.

Current stop: `TARGET_WINDOWS_RUNTIME_REQUIRED / G4B_NOT_YET_REQUESTED`.
