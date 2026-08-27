# Visual Console P2 — Implementation Result

Date: 2026-08-27
Packet: `VC-P2-SC01-CONTROL-LOOP-001`
Mode: `MODE_A_STANDARD_FRONTEND`
Gate authorization: `G4A-P2 APPROVED`
Status: `S5_CODE_COMPLETE / AUTOMATED_VALIDATION_PASS / TARGET_WINDOWS_RUNTIME_PASS_WITH_NOTED_INHERITED_COVERAGE / G4B_REVIEW_REQUIRED`

## Exact audited implementation target

- repository: `wuge988/visual-console`
- base branch: `main`
- base commit: `024da283e9f92e35c1b0460f02df0eaa4a6ad877`
- working branch: `feat/p2-sc01-control-loop`
- current production-code/UI HEAD before this result update: `133c4fdca4dc40c60a2bc33b6cfac773132eb1dd`
- current-head CI: `#116 SUCCESS`
- Draft PR: `#2`

This result document is a documentation-only successor to the production/UI HEAD above. G4B must read the live PR head and compare it to `133c4fdca4dc40c60a2bc33b6cfac773132eb1dd` rather than treating this result update as a production-code change.

## Implemented architecture

### Desktop application

The former visual-only left rail is replaced by six URL-addressable routes using the History API as the approved equivalent router:

- `/workspace` — 工作台
- `/workflows` — 工作流
- `/jobs` — 任务队列
- `/qa` — 质量审核
- `/assets` — 素材资产
- `/system` — 系统状态

Browser back/forward and deep-link refresh preserve the selected route. The persistent Site + SKU context remains visible in the application chrome. No top-level navigation item remains a dead button.

### Truthful Workflow Registry

`config/workflows/registry.json` contains the 13 known workflow presets while preserving `preset_status` vs `workflow_status`. The sidebar workflow count is derived from runtime-executable registrations, not the legacy hard-coded `13`.

Only `SC01` can become executable in P2.

### SC01 registration

A localhost-only registration endpoint validates a selected ComfyUI API-format JSON and requires:

- exactly one `LoadImage` node;
- exact frozen signature: sensitivity 1.00, process_res 1024, mask_blur 0, mask_offset -1, invert_output false, refine_foreground true;
- exact `inputs.background = Alpha` semantics while correctly ignoring the independent RMBG `background_color` field;
- hash-bound registration with idempotent same-hash reuse;
- different-hash overwrite rejection.

The validated workflow and registration state are stored under the Site Profile control root, not from a browser-provided Windows path.

### Local control service

P2 introduces a bounded localhost-only companion control service on `127.0.0.1:4179`, automatically started by the existing single `npm run dev` entrypoint together with the P1 Core API and Vite UI. It is not a new operator-facing launcher and is not reachable from LAN clients.

The service handles only the approved P2 control-plane endpoints and never exposes ComfyUI outside loopback.

### ComfyUI execution

The server-side client uses `http://127.0.0.1:8188` by default and allows only loopback environment overrides. It supports `/system_stats`, `/queue`, `/prompt`, and prompt-specific `/history/{prompt_id}` polling. The browser cannot supply a ComfyUI host.

### Serial SC01 queue

JPEG/JPG/PNG/WebP RAW assets are resolved only through registered `site_id + item_id + asset_id`. HEIC/HEIF remains preserved in RAW but is visibly non-executable in P2.

Multiple source assets create a serial application queue. The implementation submits only one active SC01 job at a time by default, preserving the current 8GB-GPU safety policy.

### Input preparation and output capture

- F RAW originals are preserved;
- workflow input derivatives are verified copies under the configured local ComfyUI input root;
- only the generated input filename is injected into the bound `LoadImage` node;
- output capture is correlated to the submitted `prompt_id` through ComfyUI history metadata;
- no “latest file” guessing is used;
- ambiguous multiple PNG outputs fail closed;
- output paths are constrained to configured roots with traversal/realpath checks;
- captured staging names use `{ITEM_OR_SKU}__cutout__master__wf-SC01__vNNN.png`;
- version allocation is no-overwrite.

### Persistent job/QA journal

The local E/control journal stores stable English job snapshots and reconstructs state after restart. A malformed torn tail preserves prior valid snapshots and is recovered to a backup rather than silently discarding prior state. QA decisions and notes are persisted in the same audit stream.

### Dynamic QA

The QA page renders the same transparent Master over Red / Black / White / Checkerboard backgrounds in-browser. It provides Fit / 100% / 200% / 400%, pan/drag at zoom, Original↔Master, PASS / FAIL / Retry / Note, and batch PASS. No persistent QA-background derivative files are generated.

After target-Windows review, `QA_PASS` items are intentionally removed from the active QA worklist and remain visible in Assets as `通过 · 待归档`. A select-all checkbox was added for pending QA items. The 100/200/400% controls were corrected to represent real multiplicative zoom rather than near-identical container fitting.

### Workspace cockpit

The final accepted P2 Workspace structure is frozen as:

- title + compact current-SKU context at the top;
- runtime workflow context moved beside the RAW execution controls so this position can evolve into future workflow selection/filtering;
- central RAW pool sized for approximately 15–30 assets with smaller thumbnails and internal scrolling;
- detailed recent jobs table with state/source+job/prompt/output/update time;
- right rail dedicated to production state + current-SKU asset inventory, then mobile capture;
- mobile upload URL / WLAN / bound SKU shown below the recent-jobs block when a session exists.

Human Owner accepted the final Workspace structure on 2026-08-27. Remaining small typography/spacing polish is deferred and non-blocking.

### Assets and System

Assets shows RAW + SC01 Cutout staging assets with preview and workflow/version/state metadata. Existing RAW recoverable Trash remains available; generated-asset delete is not added.

System reports Core API, P2 control service, LAN, ComfyUI online/offline, native queue depth, GPU/VRAM when available, Workflow Registry state, SC01 hash, configured roots, reachability and disk capacity where safely available.

## Changed production areas

All production changes remain inside the G4A `allowed_files_modules`, including `apps/web/src/**`, `apps/server/src/**`, `apps/server/test/**`, workflow/site configuration, package metadata, CI, and `docs/p2/**`. No production file outside the authorized list was intentionally edited.

## Automated validation

Latest accepted production/UI HEAD validation:

- production/UI HEAD: `133c4fdca4dc40c60a2bc33b6cfac773132eb1dd`
- GitHub Actions: `ci #116`
- result: `SUCCESS`
- contract: `npm ci → npm test → npm run build`
- focused + regression tests remain PASS;
- server TypeScript build: PASS;
- Vue TypeScript + Vite production build: PASS.

P2 integration coverage includes localhost-only mutation rejection, truthful registry state, SC01 exact signature validation, `background` vs `background_color` regression protection, different-hash overwrite prevention, serial three-image submission, prompt-correlated output capture, no-overwrite versioning, F RAW source preservation, QA persistence, traversal rejection, restart reconstruction, and mocked ComfyUI system status.

Existing P1 tests remain PASS for SKU validation, LAN selection, Session behavior, upload limits, path safety, verified transfer, no-overwrite, failure cleanup, and recoverable RAW Trash.

## Target Windows runtime evidence — 2026-08-26/27

### Directly observed PASS

1. Six left-nav modules route correctly; browser navigation behavior was accepted.
2. Core API 4177, P2 Control 4179 and Web 5173 start together under `npm.cmd run dev`.
3. System truthfully showed ComfyUI offline before launch and online after launch; GPU/VRAM and queue information appeared when online.
4. A real ComfyUI **API-format** SC01 workflow imported and became `REGISTERED`; sidebar executable workflow count changed from 0 to 1 and a workflow hash appeared.
5. The real RMBG API JSON was inspected and confirmed to contain one `LoadImage`, exact frozen RMBG-2.0 parameters, `background = Alpha`, and an independent `background_color` field.
6. One real RAW completed SC01 and produced `DC-ZY-SZ-31001__cutout__master__wf-SC01__v001.png` in D staging.
7. Job Queue displayed a real ComfyUI `prompt_id`, source filename, workflow code and generated filename.
8. Dynamic transparent-Master QA rendered against Red / Black / White / Checkerboard; Original↔Master and corrected zoom UI were accepted after bounded repair.
9. QA PASS correctly produced `通过 · 待归档`; passed items leave the active QA worklist and remain in Assets.
10. Three additional RAW inputs completed through the P2 batch flow without OOM or overwrite, producing consecutive `v002`, `v003`, `v004` staging outputs with distinct prompt IDs.
11. Visual Console was stopped and restarted; SC01 registration, jobs, generated assets and QA state reconstructed successfully. Human Owner explicitly reported restart recovery as normal.
12. Assets showed three RAW originals plus four SC01 transparent Masters after restart; the F RAW source set remained available.
13. No Gate-15 archive occurred: generated Masters remained in D staging and no approved generated asset appeared in F formal archive. This was expected P2 behavior.
14. Final six-module UI was accepted except deferred minor typography polish; final Workspace structure was subsequently accepted and frozen.

### Inherited / non-destructive regression evidence

- P1 real Windows/iPhone validation had already passed mobile upload, large/chunk upload, SKU rejection, RAW Trash and verified transfer before P2. During P2 runtime review, QR generation and existing RAW access remained functional; the destructive RAW Trash path was not unnecessarily re-executed against production test assets.
- P1 upload/Trash/path behavior remains covered by the unchanged regression suite on the latest green CI.
- QA NOTE persistence and Retry/FAIL endpoints are covered by P2 automated tests and route/state-machine implementation. The P2 target-Windows session concentrated on real PASS, batch execution, dynamic QA and restart reconstruction rather than manufacturing destructive/failure cases after the real production loop had already succeeded.
- Strict `max concurrency = 1` is enforced by the application runner and automated three-image serial test. The real three-image Windows batch completed without parallel-GPU OOM; the review evidence did not require capturing every transient QUEUED→RUNNING frame on screen.

These inherited/non-destructive items are disclosed so G4B/G5 do not mistake automated or prior-release evidence for a newly repeated destructive manual action.

## Known bounded deviations / residual risks

1. P2 control-plane endpoints run in a separate localhost-only process on port 4179 rather than being mounted into the P1 4177 process. It starts automatically under the single existing `npm run dev` operator entrypoint and remains loopback-only. G4B should explicitly review whether consolidation is required before later archive migration.
2. SC01 first-slice output capture intentionally fails closed if ComfyUI history reports more than one output PNG. The imported production API workflow therefore exposes exactly the transparent Master output for this slice.
3. Input derivatives under the configured D ComfyUI input root are not automatically garbage-collected in P2; they are generated copies, not F RAW originals. Cleanup policy is deferred until archive behavior is designed.
4. P2 does not auto-start or stop ComfyUI; System is observe-only by packet requirement.
5. Minor typography/spacing polish remains deferred by explicit Human Owner acceptance; it is not a P2 functional blocker.

## Non-Scope confirmation

S5/S7 did **not** implement or execute Gate-15 archive migration, F approved-asset archive moves, staging deletion after archive, permanent delete/Restore UI, generated-asset Trash, execution of any workflow other than SC01, SC01 retuning/1536, HEIC normalization, WAN/video generation, public/cloud exposure, auth/multi-user/multi-GPU, arbitrary shell/path APIs, destructive legacy cleanup, Merge, or deployment.

## Current stop

`TARGET_WINDOWS_RUNTIME_PASS_WITH_NOTED_INHERITED_COVERAGE / G4B_REVIEW_REQUIRED`
