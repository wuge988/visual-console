# Visual Console v0.1 — G4B Implementation Review Result

Date: 2026-08-25  
Workflow: `JZ-v0.4 / MODE_A_STANDARD_FRONTEND`  
Repository: `wuge988/visual-console`  
PR: `#1`  
Reviewed Head at start: `524e4c00ae6dc23891e9ccfe5cc4599a36e72e63`  
CI reviewed: run `#58`, `success` (`npm install` + `npm run build`)

## Decision

`G4B_BLOCKED / S7_REPAIR_REQUIRED / NEW_G4A_BINDING_REQUIRED`

The P1 runtime behavior is accepted as proven on the target Windows workstation + iPhone 16e, but the implementation is **not merge-ready and must not enter independent G5 yet**.

This is not a rollback of the real-device P1 PASS. The block is caused by governance binding gaps plus code-hardening / regression-risk findings discovered during G4B read-only review.

## Evidence accepted

The following real-device behavior remains PASS:

- Desktop Console starts;
- iPhone reaches Windows Local API on the real WLAN;
- smart LAN selection rejects Karing TUN and chooses WLAN;
- QR capture page works;
- 12-hour Site + SKU session works;
- same-SKU regenerated QR invalidates the older session;
- new SKU QR writes into the new SKU directory;
- direct photo upload works;
- Photos/files image upload works;
- MOV upload works;
- >32 MiB chunk path works (about 42.7 MB MOV);
- D → F verified cross-volume persistence works;
- F RAW write works;
- Desktop Source Gallery auto-refresh works;
- one-click `×` trash flow works;
- trash target is `100_Trash\<SKU>\<file>`;
- no confirmation dialog;
- size + SHA256 verified move-to-trash works.

## Findings

### P0-GOV-001 — G4A binding became invalid after repository/tool state changed

JZ-v0.4 requires the complete `G4A_BINDING_SET`; repository, base/working branch, worktree, implementation packet, scope, validation plan, permissions, implementation owner/tool and executor are material bindings.

The original chat G4A approval occurred before the formal `wuge988/visual-console` repository existed. The implementation later moved into this repository and was executed through ChatGPT/GitHub connector operations. No canonical G4A binding record matching the final repository + branch + worktree + executor/tool exists in this repository.

Per JZ-v0.4, a repository/tool/executor material change invalidates the earlier G4A. G4B itself cannot authorize S7 edits.

**Required:** create a fresh, exact G4A binding for the bounded S7 repair before any further production-code edit.

### P1-CODE-001 — stale superseded runtime entrypoints remain compiled

`apps/server/src/index.ts` still contains the superseded 30-minute session, naive first-non-loopback LAN selection and D→F `rename()` path that already failed on Windows.

The active server is `apps/server/src/index-p1.ts`, but TypeScript still compiles both files.

Similarly, `apps/web/src/App.vue` contains the superseded 30-minute P1 UI while `main.ts` imports `AppP1.vue`.

This creates a high regression / operator-confusion risk.

**Required:** canonicalize the active implementation to one server entrypoint and one app entrypoint; remove or explicitly archive superseded executable sources outside the build graph.

### P1-DATA-002 — upload size limits are client-side, not server-enforced

The intended policy is direct upload up to 32 MiB, then 8 MiB chunks. Current server configuration still permits bodies/files up to 1 GiB, and:

- `/api/mobile/upload` does not reject files above 32 MiB;
- `application/octet-stream` parsing can buffer a request far larger than 8 MiB;
- chunk endpoints do not verify expected chunk byte length;
- upload init accepts any positive declared file size with no hard maximum or session quota.

A valid 12-hour token can therefore bypass the intended upload path and consume excessive memory/disk.

**Required:** enforce direct/file/chunk limits server-side; validate each chunk length; define a configurable per-file maximum and bounded abandoned-upload cleanup policy.

### P1-QA-003 — CI has build-only coverage

Current CI run #58 is green, but workflow validation only runs:

- `npm install`
- `npm run build`

There are no automated tests for the data-safety code paths that can move/delete user assets.

**Required focused tests before merge:**

- cross-volume verified transfer success/failure;
- no-overwrite behavior;
- SHA256/size mismatch handling;
- session invalidation;
- LAN candidate exclusion/selection;
- item/path traversal rejection;
- move-to-trash behavior and index record;
- server-side upload/chunk limits added by P1-DATA-002.

### P1-BUILD-004 — dependency graph is not reproducible

No `package-lock.json` is present in the PR and CI uses `npm install`.

**Required:** commit the workspace lockfile and switch CI to `npm ci`.

### P1-RUNTIME-005 — trash service is not part of the normal `start` contract

Development root `npm run dev` starts core + trash + web, so the target P1 runtime works. However `@visual-console/server` `start` launches only `dist/index-p1.js`; it does not start the temporary 4178 trash service.

**Required before merge:** either merge trash routes into the Core Asset API (preferred) or define one canonical start contract that starts every required local service.

### P1-ARCH-006 — site-neutral abstraction is only partially implemented

The application is described as site-neutral, but `/api/sites` currently hard-codes `drift-curio`, and the Site Profile `item_adapter` field is configuration-only; it is not used to validate the current SKU/item ID.

**Required before the next production workflow phase:** implement profile discovery and the DRIFT CURIO item/SKU adapter, or explicitly narrow the product claim and prevent unsupported profiles from being treated as active.

### P1-SAFE-007 — path allowlist is lexical only

`assertInside()` validates normalized path text, but RAW asset resolution uses filesystem operations that follow symlinks/junctions. A link placed inside an allowed RAW tree can potentially resolve outside the intended root.

**Required:** reject symlink/reparse-point assets or verify real paths remain under the configured root before preview/trash/destructive movement.

## Deferred / non-blocking for LAN-only P1

These are not required to preserve the already-proven local P1 behavior, but should be closed before broader exposure or long-running service use:

- QR/upload token appears in URL and may appear in request logs; move to one-time pairing + cookie or redact sensitive URLs before any non-LAN exposure;
- expired in-memory sessions and abandoned chunk directories need periodic garbage collection;
- `/api/health` exposes LAN candidate details to LAN callers;
- trash index append occurs after the file has already moved; index-write failure can produce a safe file move but a misleading API failure state;
- multi-user/multi-device capture-session policy needs a future explicit capture-lane model.

## Scope control

G4B does **not** authorize edits. No production-code repair is authorized by this review record.

Before any repair, a fresh G4A must bind the exact repository, branch, worktree, repair packet, allowed files/modules, validation plan, permissions and implementation owner/tool.

## Required next state

`G4B_BLOCKED / G4A_REBIND_REQUIRED`

After the bounded repair passes focused tests, full build, target-Windows regression and current-HEAD CI, rerun G4B. Only a clean G4B may proceed to independent risk-based G5.
