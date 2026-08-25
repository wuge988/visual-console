# Visual Console v0.1 — S7 Repair Packet G4B-001

Status: `READY_FOR_FRESH_G4A`  
Workflow Mode: `MODE_A_STANDARD_FRONTEND`  
AI Studio Spike: `NOT_REQUIRED`  
Source review: `docs/G4B_REVIEW_RESULT_2026-08-25.md`

## Purpose

Close the blocking G4B findings without expanding Visual Console into the next SC01/ComfyUI production phase.

This packet is **repair-only**. It does not authorize edits by itself.

## Exact in-scope repair

### 1. Canonical runtime entrypoints

- make one canonical server entrypoint (`apps/server/src/index.ts`);
- make one canonical web app entrypoint (`apps/web/src/App.vue`);
- migrate the proven P1/P1.3 behavior into the canonical files;
- remove superseded executable `index-p1.ts` / `AppP1.vue` after parity is verified;
- preserve the proven 12-hour mobile capture, smart LAN, D→F verified persistence, Source Gallery and `×` trash behavior.

### 2. Consolidate trash into Core Asset API

- remove the temporary standalone 4178 trash runtime from the normal product path;
- move localhost-only RAW trash endpoint into the 4177 Core API;
- preserve `trash_root` from Site Profile;
- preserve `100_Trash\<SKU>\<file>`;
- preserve no-confirmation UI;
- preserve no-overwrite + size + SHA256 verification + `trash-index.jsonl`;
- update Vite/root scripts so one canonical local backend contract is sufficient.

### 3. Server-enforced upload limits

Freeze initial limits:

- direct multipart upload maximum: `32 MiB`;
- chunk size: `8 MiB`;
- maximum declared mobile source file: configurable, default `5 GiB`;
- each chunk must equal the exact expected size except the final chunk;
- oversized direct requests must be rejected server-side;
- oversized/invalid chunks must be rejected before persistence;
- abandoned chunk directories and expired sessions receive bounded garbage collection;
- no client-controlled local filesystem path is accepted.

### 4. Site Profile discovery + DRIFT CURIO item adapter

- discover available Site Profiles from `config/sites/*.json` rather than hard-code the sites response;
- activate `item_adapter` instead of treating it as inert metadata;
- DRIFT CURIO validator must accept only the frozen SKU form:

`DC-{WOOD}-{FORM}-{NNNNN}`

WOOD: `ZY | TL | YT | XX`  
FORM: `DZ | GQ | KD | SZ | YY`  
serial: exactly 5 digits.

- invalid DRIFT CURIO item IDs must not create RAW/Trash directories or mobile sessions;
- Core remains generic: adapter selection is profile-driven.

### 5. Filesystem hardening

- reject symlink/reparse-point assets for preview/trash operations, or resolve canonical real paths and prove they remain under the configured site root;
- keep lexical `assertInside` as defense-in-depth, not the sole destructive-operation boundary;
- preserve no-overwrite semantics.

### 6. Deterministic dependency/build contract

- generate and commit root workspace `package-lock.json`;
- CI uses `npm ci`;
- Windows launcher may retain the documented official-registry → temporary mirror fallback for installation, but must not change global npm configuration.

### 7. Focused automated tests

Use the lowest-dependency test path compatible with the existing Node/TypeScript stack.

Required automated coverage:

- D→F verified transfer success;
- target no-overwrite;
- transfer size/hash failure cleanup;
- session expiry/invalidation;
- Karing/TUN/VPN exclusion and WLAN preference;
- DRIFT CURIO SKU adapter accept/reject cases;
- path traversal rejection;
- symlink/reparse escape rejection where test environment supports it;
- direct upload maximum;
- exact chunk-size validation;
- maximum declared file size;
- trash move + index record.

CI must run tests before build is considered green.

## Exact non-scope

- SC01/ComfyUI API production job submission;
- Workflow Registry runner implementation beyond preserving current SC01 config;
- SQLite persistence;
- upload resume after service restart;
- Trash restore UI;
- batch delete;
- mobile delete permission;
- public/internet exposure;
- cloud tunnel/relay;
- native iOS app;
- production deployment;
- PR merge;
- destructive cleanup of legacy D/E/F scripts outside this repository.

## Allowed production files/modules

- `package.json`
- `package-lock.json`
- `.github/workflows/ci.yml`
- `apps/server/package.json`
- `apps/server/tsconfig.json` only if test/include config requires it
- `apps/server/src/index.ts`
- `apps/server/src/index-p1.ts` only for migration/removal
- `apps/server/src/trash-service.ts` only for migration/removal
- new bounded helper/test files under `apps/server/src/` or `apps/server/test/`
- `apps/web/src/App.vue`
- `apps/web/src/AppP1.vue` only for migration/removal
- `apps/web/src/main.ts`
- `apps/web/src/style.css` only when required to preserve the existing `×`/toast behavior
- `apps/web/vite.config.ts`
- `config/sites/*.json`
- bounded governance/result docs under `docs/`

Any other production file requires a superseding G4A.

## Validation plan

1. deterministic install with lockfile;
2. focused automated tests;
3. `npm run build`;
4. GitHub Actions current-HEAD CI green;
5. Windows target regression:
   - Console starts;
   - LAN selects WLAN `192.168.3.8` on the known target environment;
   - QR page opens;
   - 12-hour SKU-bound Session visible;
   - direct photo upload PASS;
   - >32 MiB video chunk upload PASS;
   - F RAW landing PASS;
   - Desktop Gallery refresh PASS;
   - `×` trash PASS to `100_Trash\<SKU>`;
6. negative regression:
   - invalid SKU rejected;
   - oversized direct upload rejected;
   - malformed/oversized chunk rejected;
   - path escape rejected.

## Allowed actions

- edit only the bound files/modules;
- add focused tests and lockfile;
- run tests/build locally where available;
- push bounded repair commits to the bound working branch;
- update Draft PR evidence/status;
- request target-Windows verification from the user only for checks that cannot be executed by the remote implementation environment.

## Forbidden actions

- merge PR;
- deploy;
- expose service publicly;
- delete user RAW/Trash data for testing;
- alter D/E/F root responsibilities;
- add recurring paid services;
- start SC01/ComfyUI integration;
- expand to unrelated UI redesign.

## Proposed implementation owner/tool for fresh G4A

`ChatGPT GPT-5.6 Sol + GitHub connector`, single implementation owner for the bounded S7 repair.

Target runtime verification worktree:

`E:\AI_PROJECTS\VISUAL_CONSOLE`

The actual G4A must bind the repository, base/working refs, current pre-repair HEAD, this exact packet, permissions, owner/tool and executor identity before any production-code edit.
