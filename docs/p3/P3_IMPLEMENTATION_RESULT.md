# Visual Console P3 — Gate15 Archive Implementation Result

Date: 2026-08-27
Packet: `VC-P3-GATE15-ARCHIVE-001`
Base: `main @ c8e9e2722dc828055f9c2fd8f8c82b537b9e652e`
Branch: `feat/p3-approved-archive`
PR: `#4`
Status: `CODE_COMPLETE / AUTOMATED_VALIDATION_PASS / TARGET_WINDOWS_ARCHIVE_EVIDENCE_REQUIRED`

## Implemented

### Archive service
- Added `apps/server/src/p3-archive.ts` on the existing localhost-only control service.
- Only `SC01` + `QA_PASS` jobs are accepted.
- Source identity is loaded from persisted P2 job snapshots; browser cannot supply a source path.
- Final directory is loaded from SKU Manifest `destinations.cutout`; browser cannot supply an F destination.
- Formal destination is constrained to Site Profile `asset_root`.
- Staging source is constrained to `staging_root`.
- Standardized SC01 filename is revalidated before any archive action.

### Gate15 safety order
1. Validate job state/identity.
2. Validate Manifest and destination boundary.
3. Preflight existing Manifest archive history for conflicts.
4. Re-hash current D staging source against captured P2 SHA256/size.
5. Create F target with no-overwrite semantics, or accept an existing target only when exact SHA256/size match.
6. Re-verify F target.
7. Atomically and idempotently persist Manifest `archive_history`.
8. Re-verify F target after Manifest persistence.
9. Delete D staging source last.
10. Append final `ARCHIVE_SNAPSHOT` journal record.

### Recovery behavior
- Crash after F copy but before Manifest: source still exists; retry validates same F target and completes Manifest/delete.
- Crash after Manifest but before D deletion: retry validates Manifest + F and completes delete.
- Crash after D deletion but before archive journal: retry is accepted only when prior durable Manifest history AND exact F SHA/size prove the archive. F-only lookalikes cannot self-promote into Manifest history.
- Same filename with different F content returns `ARCHIVE_TARGET_CONFLICT` and never overwrites.
- Conflicting prior Manifest history returns `ARCHIVE_HISTORY_CONFLICT` before a new archive copy is attempted.
- All archive mutations are serialized in-process, including one-off and batch requests, to prevent concurrent Manifest lost updates.

### API
- `GET /api/archive?site_id=...&item_id=...`
- `POST /api/archive/:siteId/:itemId/:assetId`
- `POST /api/archive/batch` (max 20, serial)
- `GET /api/archive/assets/:siteId/:itemId/:assetId/content`

### UI
- Added a small `正式归档` entry on the existing `/assets` page without restructuring the accepted six-page Vue UI.
- Added local validation/operation page `/archive.html`.
- Page shows QA-approved count, pending archive count, archived count, selection count, single archive and batch archive.
- Archived previews are served from F through the verified archive-content endpoint.

## Automated evidence

CI history during implementation:
- `#135 success` — initial backend + safety tests.
- `#141 success` — archive page entry integration.
- `#143 success` — hardened delete-recovery proof + serialized archive mutations + recovery tests.

Contract in each green run:

`npm ci → npm test → npm run build`

Covered archive invariants include:
- QA_PASS happy path;
- exact F copy + SHA256/size verification;
- Manifest archive history;
- D source delete-last;
- idempotent post-delete retry with durable evidence;
- non-QA_PASS rejection;
- staging SHA/size drift rejection;
- same-name different-content F conflict/no overwrite;
- Manifest destination outside formal asset root rejection;
- conflicting prior Manifest history rejection;
- missing D source cannot be promoted from F without prior durable Gate15 history;
- global archive mutation serialization;
- all existing P1/P2 tests and builds remain green.

## Scope audit

PR #4 changed files are limited to:
- P3 archive server module + P2 server registration;
- P3 tests;
- DRIFT CURIO Site Profile formal asset root;
- additive archive validation UI / Assets entry;
- P3 docs.

No ComfyUI inference parameter change, RAW deletion, non-SC01 execution, deployment, branch deletion, rollback, public/cloud exposure, or arbitrary filesystem API was added.

## Remaining evidence

Target Windows + real D/E/F runtime must validate one real approved asset because GitHub CI cannot access the user's physical drives.

Required real evidence:
1. Existing SC01 `QA_PASS` Master appears as `通过 · 待归档`.
2. `/assets` exposes `正式归档`; `/archive.html` loads current approved assets.
3. Archive one existing QA_PASS asset.
4. F target is exactly the Manifest `destinations.cutout` path + standardized filename.
5. F SHA256 and byte size equal the P2 captured snapshot.
6. Manifest contains exactly one matching `archive_history` entry.
7. D staging source is absent only after the prior checks succeed.
8. UI changes the asset to `已归档 · F 正式资产` and preview loads from F.
9. Restart Visual Console; archive status reconstructs and preview still loads.
10. Re-running archive is idempotent and does not create another Manifest history row or overwrite F.

No Merge should occur until this target-Windows archive evidence passes.
