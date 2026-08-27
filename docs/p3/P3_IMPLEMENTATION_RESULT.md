# Visual Console P3 — Gate15 Archive Implementation Result

Date: 2026-08-27
Packet: `VC-P3-GATE15-ARCHIVE-001`
Base: `main @ c8e9e2722dc828055f9c2fd8f8c82b537b9e652e`
Branch: `feat/p3-approved-archive`
PR: `#4`
Status: `P3_RELEASE_READY / AUTONOMOUS_REPO_AUDIT_PASS / AUTOMATED_VALIDATION_PASS / TARGET_WINDOWS_ARCHIVE_EVIDENCE_PASS / VISUAL_ALPHA_REVIEW_PASS / FINAL_IDEMPOTENCE_PASS`

## Implemented

### Archive service
- Added `apps/server/src/p3-archive.ts` on the existing localhost-only control service.
- Only `SC01` + `QA_PASS` jobs are accepted.
- Source identity is loaded from persisted P2 job snapshots; browser cannot supply a source path.
- Final directory is loaded from SKU Manifest `destinations.cutout`; browser cannot supply an F destination.
- Formal destination is constrained to Site Profile `asset_root`.
- Staging source is constrained to `staging_root`.
- Standardized SC01 filename is revalidated before any archive action.
- Legacy UTF-8 BOM-prefixed Manifest JSON is accepted by stripping only one leading `U+FEFF`; malformed JSON remains fail-closed as `ARCHIVE_MANIFEST_INVALID_JSON`.

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
- Crash after F copy but before Manifest: source remains; retry validates exact F and completes Manifest/delete.
- Crash after Manifest but before D deletion: retry validates Manifest + F and completes delete.
- Crash after D deletion but before archive journal: retry is accepted only when durable Gate15 Manifest history and exact F SHA/size prove identity.
- F-only lookalikes cannot self-promote into Manifest history.
- Same filename with different F content returns `ARCHIVE_TARGET_CONFLICT` and never overwrites.
- Conflicting prior Manifest history returns `ARCHIVE_HISTORY_CONFLICT`.
- Archive mutations are serialized in-process for one-off and batch requests.

### API
- `GET /api/archive?site_id=...&item_id=...`
- `POST /api/archive/:siteId/:itemId/:assetId`
- `POST /api/archive/batch` (max 20, serial)
- `GET /api/archive/assets/:siteId/:itemId/:assetId/content`

### UI
- `/assets` exposes `正式归档` without restructuring the accepted six-page UI.
- `/archive.html` supports single and batch archive, status counts, and F preview.
- Main `/assets` reads archive truth and separates pending vs archived assets.
- Added `已归档` filter and `已归档 · F 正式资产` state.
- Archived thumbnails and previews are served from verified F rather than deleted D staging.
- Workspace `待归档` excludes already archived assets.
- Full-size image preview uses a checkerboard alpha cue.
- Single-item archive POST sends `Content-Type: application/json` with `{}` to satisfy Fastify 5.

## Automated evidence

Green CI history includes `#135`, `#141`, `#143`, `#147`, `#149`, `#151`, `#152`, `#153`, `#154`, `#155`, `#157`, `#158`, `#159`, `#161`, and `#162`.

Release-candidate documentation successor HEAD `398edb8ee72fccdfac2a993139fe365dd85b75e8` also completed GitHub Actions successfully after recording final target-Windows evidence. This successor changed only this result document after the physically validated implementation HEAD `5860ad2b0909bb4a7f594034ec0af0ccfc0cc7bb`; no production, test, config, CI, or self-check logic changed between those two heads.

Current CI contract:

`Parse Windows Gate15 self-check → Parse archive page JavaScript → npm ci → npm test → npm run build`

Covered invariants include:
- QA_PASS happy path;
- exact F copy + SHA256/size verification;
- Manifest archive history;
- D source delete-last;
- idempotent post-delete retry;
- non-QA_PASS rejection;
- staging SHA/size drift rejection;
- same-name different-content F conflict/no overwrite;
- destination outside formal asset root rejection;
- conflicting prior Manifest history rejection;
- missing D source cannot be promoted from F without prior durable Gate15 history;
- global archive mutation serialization;
- legacy UTF-8 BOM Manifest compatibility;
- preservation of pre-existing legacy `archive_history` rows;
- malformed Manifest JSON fail-closed before copy/delete;
- all P1/P2 regressions remain green.

## Target-Windows final evidence — PASS

Physical Windows self-check executed against exact implementation HEAD `5860ad2b0909bb4a7f594034ec0af0ccfc0cc7bb` and real D/E/F state for `DC-ZY-SZ-31001`.

Observed final output:
- `ARCHIVED_ASSETS = 3`
- three `PHYSICAL_PASS` records for SC01 `v001`, `v002`, `v003`
- `LEGACY_HISTORY_PRESERVED = 1`
- `RESTART = PASS`
- `RESTART_API_ARCHIVES = 3`
- `RESTART_RECONSTRUCTION = PASS`
- `F_PREVIEW_ENDPOINT = PASS`
- `IDEMPOTENT_RETRY = PASS`
- `GATE15_FINAL_PHYSICAL_SELF_CHECK = PASS`

This proves on the real target machine:
1. all three F targets are under Manifest `destinations.cutout` with standardized SC01 filenames;
2. F SHA256 and byte size match persisted P2 capture snapshots;
3. each asset has exactly one Gate15 `VERIFIED_ARCHIVE` Manifest history row;
4. one pre-existing legacy non-Gate15 archive-history row remains preserved;
5. D staging sources are absent in the final archived state;
6. Visual Console restart reconstructs the same three archive records;
7. F content endpoints return bytes matching verified F SHA256;
8. retry of an already archived asset is idempotent: F SHA/size/mtime, Manifest hash/history cardinality, archive cardinality, and D source absence remain unchanged;
9. human visual review confirmed `SC01 v003` full-size transparency/checkerboard presentation is correct.

## Bounded repairs from physical evidence

The target-Windows run surfaced compatibility/client issues that were repaired without weakening Gate15 semantics:
1. legacy UTF-8 BOM Manifest parsing;
2. main `/assets` archive truth and F preview routing;
3. transparent full-size preview truth;
4. Windows PowerShell 5.1 script-source encoding compatibility;
5. Windows PowerShell 5.1 REST-array shaping;
6. idempotence probe POST media type;
7. single-item archive UI POST media type;
8. CI syntax checks for the Windows self-check and standalone archive-page JavaScript.

## Scope audit

PR #4 remains bounded to:
- P3 archive server module + P2 server registration;
- P3 archive safety/recovery/compatibility tests;
- DRIFT CURIO Site Profile formal asset root;
- additive archive validation UI / Assets integration;
- Windows physical self-check tooling;
- P3 docs and CI validation for new standalone tooling.

No ComfyUI inference parameter change, RAW deletion, non-SC01 execution, deployment, branch deletion, rollback, public/cloud exposure, or arbitrary filesystem API was added.

## Release decision

All P3 Gate15 code, automated validation, physical D/E/F evidence, restart reconstruction, F preview verification, retry idempotence, and visual alpha review have passed.

**Release decision: PASS. PR #4 is eligible to move from Draft to Ready and be squash-merged after an exact head/CI/mergeability re-check.**
