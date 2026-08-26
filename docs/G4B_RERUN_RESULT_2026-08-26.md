# Visual Console v0.1 — G4B Rerun Result

Date: 2026-08-26  
Workflow: `JZ-v0.4 / MODE_A_STANDARD_FRONTEND`  
Repository: `wuge988/visual-console`  
PR: `#1`  
Reviewed HEAD: `47bc682edeed47fe0e21f62d7295c897d7e66400`  
Current-head CI: `#81`, `success`  
Repair binding: `docs/G4A_REPAIR_BINDING_G4B_001.md`  
Repair packet: `docs/S7_REPAIR_PACKET_G4B_001.md`  
Repair result: `docs/S7_REPAIR_IMPLEMENTATION_RESULT_G4B_001.md`

## Decision

`G4B_PASS / G5_REQUIRED`

The bounded S7 repair closes the blocking findings from the initial G4B, and the target Windows + iPhone regression required by the repair packet has now passed in full.

This PR remains **Draft / Open / Unmerged**. G4B does not authorize Merge, deployment or SC01/ComfyUI production integration.

## Evidence reviewed

### Current implementation / repair scope

Comparison from the bound pre-repair HEAD `66fc00c052303be0e54657be3ac85d37b00aa0ad` to reviewed HEAD shows the repair remained bounded to the authorized modules and evidence files. Key production changes include:

- canonical server `apps/server/src/index.ts`;
- canonical web app `apps/web/src/App.vue`;
- removal of superseded `index-p1.ts`, `AppP1.vue` and standalone `trash-service.ts`;
- new bounded helper `apps/server/src/runtime-utils.ts`;
- focused tests under `apps/server/test/`;
- deterministic `package-lock.json`;
- CI hardening and bounded Site Profile/config changes.

No SC01/ComfyUI production submission, SQLite, public/cloud exposure, Trash restore/batch-delete, deployment or PR merge entered the repair scope.

### Automated evidence

Current HEAD CI #81 completed successfully with:

1. `npm ci` — PASS;
2. `npm test` — PASS;
3. `npm run build` — PASS.

Focused tests cover 10 required safety areas:

1. DRIFT CURIO SKU adapter accept/reject;
2. Karing/TUN exclusion + WLAN preference;
3. same-item Session invalidation + expiry;
4. direct/declared/chunk upload limits;
5. lexical path traversal rejection;
6. real-path/symlink escape rejection where supported;
7. verified transfer success + hash preservation;
8. target no-overwrite;
9. verification-failure cleanup + source preservation;
10. flat SKU Trash move + audit index.

### Target Windows + iPhone regression

The project owner confirmed all required Windows regression checks passed on `E:\AI_PROJECTS\VISUAL_CONSOLE` after pulling the repaired runtime:

- Console starts normally — PASS;
- `/api/health` reports `0.1.0-p1.4-repair` — PASS;
- WLAN remains `192.168.3.8` on the known target environment — PASS;
- QR + 12-hour SKU-bound Session — PASS;
- direct iPhone photo → F RAW + Desktop Gallery — PASS;
- >32 MiB video through chunk path → F RAW — PASS;
- compact `×` → `100_Trash\<SKU>` without confirmation — PASS;
- invalid SKU such as `DC-ZZ-SZ-31001` is rejected and does not create a RAW directory — PASS.

The earlier accepted P1 behavior also remains valid: same-SKU QR invalidation, new-SKU isolation, D→F verified persistence, Gallery refresh and flat Trash layout.

## Closure of initial G4B blocking findings

### P0-GOV-001 — CLOSED

A fresh exact G4A repair binding now exists and binds repository, branch, worktree, packet, scope, validation, permissions and implementation owner/tool/executor.

### P1-CODE-001 — CLOSED

Canonical runtime entrypoints are `index.ts` and `App.vue`; superseded executable sources are removed from the final tree/build graph.

### P1-DATA-002 — CLOSED

Server now enforces:

- direct multipart max `32 MiB`;
- chunk body max `8 MiB`;
- exact expected chunk length;
- configurable max declared source file, default `5 GiB`;
- maximum active chunk uploads per Session;
- bounded Session/abandoned-upload GC.

### P1-QA-003 — CLOSED

CI now runs focused data-safety regression tests before build and the current-head run is green.

### P1-BUILD-004 — CLOSED

Root `package-lock.json` is committed and CI uses deterministic `npm ci`.

### P1-RUNTIME-005 — CLOSED

Trash is consolidated into the canonical 4177 Core API; standalone 4178 runtime is removed from the product contract.

### P1-ARCH-006 — CLOSED for current P1 scope

Site Profiles are discovered from `config/sites/*.json`; `item_adapter` is active; `drift_curio_sku_v1` enforces the frozen SKU grammar before Session/RAW operations.

### P1-SAFE-007 — CLOSED for current P1 scope

Lexical path allowlisting is supplemented by realpath + symlink/reparse-style rejection for existing RAW preview/trash paths, plus post-create checks for managed directories.

## Residual non-blocking risks carried to G5

These do not block LAN-only P1 G4B, but justify an independent risk-based G5 before merge:

1. mobile upload token remains embedded in the QR URL; acceptable for current private-LAN scope, but not for broader exposure;
2. `/api/health` remains LAN-readable and exposes LAN candidate metadata;
3. Trash file movement completes before `trash-index.jsonl` append; an audit-index write failure could return an error after the file has safely moved;
4. Sessions/chunk state remain in-memory and intentionally do not survive service restart;
5. multi-user/multi-device capture-lane policy is not yet formalized;
6. runtime performs user-file movement and large-file ingestion, so merge warrants an independent data-safety/risk review even though current tests and real-device regression pass.

## G4B conclusion

No remaining **blocking implementation finding** was identified within the bound P1/S7 scope.

Formal state:

`P1_PASS / P1_3_TRASH_CONTROL_PASS / S7_REPAIR_PASS / G4B_PASS / G5_REQUIRED`

## Hard stop after G4B

Until G5 completes:

- keep PR #1 Draft / Open / Unmerged;
- do not deploy;
- do not begin SC01/ComfyUI production integration;
- do not expand public/network exposure;
- do not perform destructive cleanup of legacy D/E/F fallback scripts.
