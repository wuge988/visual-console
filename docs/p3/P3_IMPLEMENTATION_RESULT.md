# Visual Console P3 — Gate15 Archive Implementation Result

Date: 2026-08-27
Packet: `VC-P3-GATE15-ARCHIVE-001`
Base: `main @ c8e9e2722dc828055f9c2fd8f8c82b537b9e652e`
Branch: `feat/p3-approved-archive`
PR: `#4`
Status: `CODE_COMPLETE / AUTONOMOUS_REPO_AUDIT_PASS / AUTOMATED_VALIDATION_PASS / TARGET_WINDOWS_ARCHIVE_EVIDENCE_STRONG / VISUAL_ALPHA_REVIEW_PASS / FINAL_TARGET_WINDOWS_IDEMPOTENCE_PROBE_ONLY`

## Implemented

### Archive service
- Added `apps/server/src/p3-archive.ts` on the existing localhost-only control service.
- Only `SC01` + `QA_PASS` jobs are accepted.
- Source identity is loaded from persisted P2 job snapshots; browser cannot supply a source path.
- Final directory is loaded from SKU Manifest `destinations.cutout`; browser cannot supply an F destination.
- Formal destination is constrained to Site Profile `asset_root`.
- Staging source is constrained to `staging_root`.
- Standardized SC01 filename is revalidated before any archive action.
- Legacy UTF-8 BOM-prefixed Manifest JSON is accepted by stripping only a single leading `U+FEFF`; malformed JSON still fails closed as `ARCHIVE_MANIFEST_INVALID_JSON`.

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
- Crash after F copy but before Manifest: source still exists; retry validates the same F target and completes Manifest/delete.
- Crash after Manifest but before D deletion: retry validates Manifest + F and completes delete.
- Crash after D deletion but before archive journal: retry is accepted only when prior durable Manifest history and exact F SHA/size prove the archive.
- F-only lookalikes cannot self-promote into Manifest history.
- Same filename with different F content returns `ARCHIVE_TARGET_CONFLICT` and never overwrites.
- Conflicting prior Manifest history returns `ARCHIVE_HISTORY_CONFLICT` before a new archive copy is attempted.
- All archive mutations are serialized in-process, including one-off and batch requests.

### API
- `GET /api/archive?site_id=...&item_id=...`
- `POST /api/archive/:siteId/:itemId/:assetId`
- `POST /api/archive/batch` (max 20, serial)
- `GET /api/archive/assets/:siteId/:itemId/:assetId/content`

### UI
- Added a small `正式归档` entry on the existing `/assets` page without restructuring the accepted six-page Vue UI.
- Added local validation/operation page `/archive.html`.
- Archive page shows QA-approved count, pending archive count, archived count, selection count, single archive and batch archive.
- Main Vue `/assets` reads P3 archive truth together with P2 jobs.
- `QA_PASS / 通过 · 待归档` excludes assets that already have verified archive records.
- Added `已归档` filter for verified F assets.
- Archived cards display `已归档 · F 正式资产` and thumbnail/preview is served from the verified F archive-content endpoint rather than deleted D staging.
- Workspace `待归档` count excludes already archived assets.
- Full-size image preview uses a checkerboard alpha cue so transparent SC01 cutouts remain visually truthful.
- Final repository audit found the single-item archive button sent a bodyless POST while Fastify rejects that request shape with `415 FST_ERR_CTP_INVALID_MEDIA_TYPE`; the single-item client now sends `Content-Type: application/json` with `{}`. Batch archive already used JSON correctly.

## Automated evidence

Green CI history includes:
- `#135 success` — initial backend + safety tests.
- `#141 success` — archive page entry integration.
- `#143 success` — delete-recovery proof + serialized mutations.
- `#147 success` — pre-target-Windows handoff head.
- `#149 success` — Manifest BOM compatibility repair.
- `#151 success` — main Assets archive-truth integration.
- `#152 success` — real legacy-history compatibility fixture.
- `#153 success` — audited P3 candidate.
- `#154 success` — transparent full-size preview truth.
- `#155/#157 success` — Windows PowerShell 5.1 self-check compatibility.
- `#158 success` — REST-array counting repair.
- `#159 success` — idempotence probe media-type repair.
- `#161 success` — final repository audit: standalone archive-page JS syntax check + single-item archive JSON request fix.

Current CI contract:

`Parse Windows Gate15 self-check → Parse archive page JavaScript → npm ci → npm test → npm run build`

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
- legacy UTF-8 BOM Manifest compatibility;
- preservation of existing legacy `archive_history` rows while appending the new Gate15 row;
- malformed Manifest JSON remains fail-closed before copy/delete;
- all existing P1/P2 tests and builds remain green.

## Target-Windows evidence already proven

Physical Windows evidence for `DC-ZY-SZ-31001` has established:

- archive UI reached `QA通过=3 / 待正式归档=0 / 已归档=3`;
- main Assets page reflected `已归档` truth;
- direct self-check found `ARCHIVED_ASSETS = 3`;
- all three standardized F cutout files are under Manifest `destinations.cutout`;
- all three F files passed exact SHA256 and byte-size comparison against persisted P2 capture snapshots;
- all three corresponding D staging sources were absent in the final state;
- each asset has exactly one Gate15 `VERIFIED_ARCHIVE` Manifest history row;
- one pre-existing legacy non-Gate15 archive-history row remains preserved;
- Visual Console restart completed successfully;
- restart reconstruction returned exactly 3 archive records;
- every F archive-content endpoint returned bytes matching the verified F SHA256;
- human visual review confirmed `SC01 v003` full-size preview shows correct transparency/checkerboard presentation with no visual issue.

## Target-Windows triage and bounded repairs

The physical run surfaced several environment/client compatibility defects. Each was repaired without weakening Gate15 safety semantics:

1. Legacy Manifest BOM compatibility: strip only one leading `U+FEFF`, then strict JSON parse.
2. Main `/assets` archive truth: pending-vs-archived status and F preview are derived from `/api/archive`.
3. Transparent preview truth: full-size image modal exposes alpha with checkerboard presentation.
4. Windows PowerShell 5.1 script encoding: self-check source is ASCII-only while data files are read explicitly as strict UTF-8.
5. Windows PowerShell 5.1 REST-array shaping: self-check reads raw JSON and explicitly enumerates array elements.
6. Idempotence probe POST media type: probe sends `application/json` + `{}`.
7. Final repository audit found the same request-shape risk in the archive page's single-item button; that client now also sends JSON, and CI syntax-checks the standalone public JavaScript.

## Scope audit

PR #4 remains bounded to:
- P3 archive server module + P2 server registration;
- P3 archive safety/recovery/compatibility tests;
- DRIFT CURIO Site Profile formal asset root;
- additive archive validation UI / Assets integration;
- Windows physical self-check tooling;
- P3 docs and CI validation for the new standalone client/tooling.

No ComfyUI inference parameter change, RAW deletion, non-SC01 execution, deployment, branch deletion, rollback, public/cloud exposure, or arbitrary filesystem API was added.

## Remaining hard stop before Merge

One target-machine-only proof remains. The corrected final idempotence retry must run once against the real F/Manifest state and prove:

1. retry returns success;
2. F SHA256, byte size and mtime remain unchanged;
3. Manifest file remains unchanged and Gate15 history count remains exactly one for the retried asset;
4. archive cardinality remains unchanged;
5. D staging does not reappear.

The server-side retry-after-D-deletion idempotence path is already covered by automated tests; this final probe is retained because the frozen Gate15 release contract requires real target-Windows evidence before Merge.

**Do not Merge PR #4 until this final physical idempotence evidence passes.**
