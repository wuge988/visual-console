# Visual Console P2 — Implementation Result

Date: 2026-08-26
Packet: `VC-P2-SC01-CONTROL-LOOP-001`
Mode: `MODE_A_STANDARD_FRONTEND`
Gate authorization: `G4A-P2 APPROVED`
Status: `S5_CODE_COMPLETE / AUTOMATED_VALIDATION_PASS / TARGET_WINDOWS_RUNTIME_REQUIRED / G4B_NOT_YET_REQUESTED`

## Exact audited implementation target

- repository: `wuge988/visual-console`
- base branch: `main`
- base commit: `024da283e9f92e35c1b0460f02df0eaa4a6ad877`
- working branch: `feat/p2-sc01-control-loop`
- implementation code HEAD before this result-only document: `fd3cfe61782f52881b1ece2e6d76ac8c96abd800`
- Draft PR: `#2`

This result document is added after the code HEAD above, so the PR head after this document is necessarily a documentation-only successor. G4B must read the live PR head and compare it to the implementation code HEAD rather than treating this self-referential evidence file as a production-code change.

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
- Alpha background semantics where represented;
- hash-bound registration with idempotent same-hash reuse;
- different-hash overwrite rejection.

The validated workflow and registration state are stored under the Site Profile control root, not from a browser-provided Windows path.

### Local control service

P2 introduces a bounded localhost-only companion control service on `127.0.0.1:4179`, automatically started by the existing single `npm run dev` entrypoint together with the P1 Core API and Vite UI. It is not a new operator-facing launcher and is not reachable from LAN clients.

The service handles only the approved P2 control-plane endpoints and never exposes ComfyUI outside loopback.

### ComfyUI execution

The server-side client uses `http://127.0.0.1:8188` by default and allows only loopback environment overrides. It supports:

- `/system_stats`;
- `/queue`;
- `/prompt`;
- prompt-specific `/history/{prompt_id}` polling.

The browser cannot supply a ComfyUI host.

### Serial SC01 queue

JPEG/JPG/PNG/WebP RAW assets are resolved only through registered `site_id + item_id + asset_id`. HEIC/HEIF remains preserved in RAW but is visibly non-executable in P2.

Multiple source assets create a serial application queue. The implementation submits only one active SC01 job at a time by default, preserving the current 8GB-GPU safety policy.

### Input preparation and output capture

- F RAW originals are preserved.
- workflow input derivatives are verified copies under the configured local ComfyUI input root;
- only the generated input filename is injected into the bound `LoadImage` node;
- output capture is correlated to the submitted `prompt_id` through ComfyUI history metadata;
- no “latest file” guessing is used;
- ambiguous multiple PNG outputs fail closed;
- output paths are constrained to configured roots with traversal/realpath checks;
- captured staging names use `{ITEM_OR_SKU}__cutout__master__wf-SC01__vNNN.png`;
- version allocation is no-overwrite.

### Persistent job/QA journal

The local E/control journal stores stable English job snapshots and reconstructs state after restart. A malformed torn tail preserves prior valid snapshots and is recovered to a backup rather than silently discarding prior state.

QA decisions and notes are persisted in the same audit stream.

### Dynamic QA

The QA page renders the same transparent Master over Red / Black / White / Checkerboard backgrounds in-browser. It provides:

- 适应窗口 / 100% / 200% / 400%;
- pan/drag at zoom;
- 原图 ↔ Master;
- PASS / FAIL / Retry / Note;
- batch PASS.

No persistent QA-background derivative files are generated.

### Assets and System

Assets shows RAW + SC01 Cutout staging assets with preview and workflow/version/state metadata. Existing RAW recoverable Trash remains available; generated-asset delete is not added.

System reports Core API, P2 control service, LAN, ComfyUI online/offline, native queue depth, GPU/VRAM when available, Workflow Registry state, SC01 hash, configured roots, reachability and disk capacity where safely available.

## Changed production areas

All production changes remain inside the G4A `allowed_files_modules`:

- `apps/web/src/App.vue`
- `apps/web/src/style.css`
- `apps/server/src/p2-runtime.ts`
- `apps/server/src/p2-routes.ts`
- `apps/server/src/p2-server.ts`
- `apps/server/test/p2-runtime.test.ts`
- `apps/server/test/p2-routes.test.ts`
- `apps/server/package.json`
- `config/workflows/registry.json`
- additive P2 fields in `config/sites/drift-curio.json`
- root `package.json`
- `docs/p2/**`

No production file outside the authorized list was edited.

## Automated validation

Current implementation code HEAD CI:

- GitHub Actions: `ci #104`
- result: `SUCCESS`
- contract: `npm ci → npm test → npm run build`
- npm audit during CI: `0 vulnerabilities`
- focused + regression tests: `19 / 19 PASS`
- server TypeScript build: PASS
- Vue TypeScript + Vite production build: PASS

New P2 integration coverage includes:

- localhost-only mutation rejection;
- truthful 13-preset / 1-executable Workflow Registry;
- SC01 exact frozen signature validation;
- different-hash registration overwrite prevention;
- serial three-image submission;
- prompt-correlated history/output capture;
- `v001/v002/v003` no-overwrite allocation;
- F RAW source preservation;
- QA PASS + Note persistence;
- output traversal rejection;
- restart reconstruction;
- mocked ComfyUI System status.

Existing P1 tests remain PASS for SKU validation, LAN selection, 12-hour Session invalidation/expiry, direct/chunk limits, lexical and symlink path safety, verified cross-volume transfer, no-overwrite, failure cleanup and flat Trash + audit index.

## Target Windows runtime evidence still required

Before G4B, the Human Owner must verify on `E:\AI_PROJECTS\VISUAL_CONSOLE` with the real local ComfyUI runtime:

1. all six left-nav modules route correctly and browser back/forward works;
2. P1 QR/mobile upload and RAW Trash still work;
3. System reports ComfyUI offline when stopped and online when running;
4. real SC01 **API-format** workflow JSON imports once and shows `REGISTERED` with hash;
5. one JPEG/PNG RAW runs through SC01;
6. exact transparent output lands under D staging with `__wf-SC01__v001`-style naming;
7. Job Queue shows actual transitions and the exact completed prompt;
8. Red/Black/White/Checkerboard and Original↔Master QA work;
9. PASS/FAIL/Note/Retry survive refresh;
10. a three-image batch runs serially;
11. Visual Console restart reconstructs Job/generated/QA history;
12. F RAW originals remain present and no Gate-15 archive occurs.

## Known bounded deviations / residual risks

1. P2 control-plane endpoints run in a separate localhost-only process on port 4179 rather than being mounted into the P1 4177 process. It starts automatically under the single existing `npm run dev` operator entrypoint and remains strictly loopback-only. This separation is implementation-bounded, not a new operator workflow; G4B should explicitly review whether consolidation is required before later archive migration.
2. SC01 first-slice output capture intentionally fails closed if ComfyUI history reports more than one output PNG. The imported production API workflow should therefore expose exactly the transparent Master output for this slice.
3. Input derivatives under the configured D ComfyUI input root are not automatically garbage-collected in P2; they are generated copies, not F RAW originals. Cleanup policy is deferred until runtime behavior is proven.
4. P2 does not auto-start or stop ComfyUI; System is observe-only by packet requirement.

## Non-Scope confirmation

S5 did **not** implement or execute:

- Gate-15 archive migration;
- F approved-asset archive moves;
- staging deletion after archive;
- permanent delete or Restore UI;
- generated-asset Trash;
- execution of any workflow other than SC01;
- SC01 parameter experimentation or 1536;
- HEIC/HEIF normalization;
- WAN/generative video;
- public/cloud exposure or router changes;
- authentication/multi-user/multi-GPU;
- arbitrary shell/path APIs;
- destructive legacy script cleanup;
- Merge;
- deployment.

## Current stop

`TARGET_WINDOWS_RUNTIME_REQUIRED / G4B_NOT_YET_REQUESTED`
