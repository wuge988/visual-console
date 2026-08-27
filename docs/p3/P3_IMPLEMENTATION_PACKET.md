# Visual Console P3 — Approved Archive Loop Implementation Packet

Date: 2026-08-27
Workflow: `JZ-v0.4 / MODE_A_STANDARD_FRONTEND`
Packet ID: `VC-P3-APPROVED-ARCHIVE-001`
Status: `S4_PACKET_READY / G4A_REVIEW_REQUIRED`

## 1. Exact baseline

Repository: `wuge988/visual-console`

Released base:

`main @ c8e9e2722dc828055f9c2fd8f8c82b537b9e652e`

Working branch:

`feat/p3-approved-archive-loop`

P2 is released and remains the runtime baseline. P3 is a new bounded slice; it does not reopen P2 SC01 generation/QA decisions.

## 2. Authority and inherited semantics

P3 migrates the already-frozen DRIFT CURIO Gate 15 semantics into Visual Console rather than inventing a new archive model.

Frozen Gate 15 requirements inherited from the DRIFT CURIO visual-pipeline technical source:

- read human-approved assets from D staging;
- route by standardized asset/workflow semantics to the F formal asset library;
- copy before deleting source;
- SHA256 verify the F copy;
- delete D staging source only after verification;
- never overwrite a same-name different-content destination;
- append/update Manifest archive history.

P2 inherited state:

- `QA_PASS` means `通过 · 待归档`, not archived;
- F RAW is preserved;
- SC01 generated Masters live in D staging;
- only SC01 is currently executable for the DRIFT CURIO Site Profile;
- P2 job/QA journals are persisted under the site control root.

## 3. Goal

Add one safe operator-visible control loop:

`QA_PASS → explicit human archive selection → preflight → copy to F → SHA256 verify → Manifest archive record → delete D staging source → ARCHIVED`

The normal operator should be able to archive one or multiple QA-approved assets without using BAT/PowerShell or manually moving files.

## 4. Non-negotiable safety invariants

### 4.1 No automatic archive

A QA PASS event must never trigger archive by itself.

Archive requires an explicit human action from the Console. Batch archive requires explicit selection followed by a confirmation step showing the number of selected assets.

### 4.2 Eligibility

Only assets backed by a persisted P2 job in `QA_PASS` may begin archive.

The server must reject archive when:

- state is not `QA_PASS`;
- source metadata is incomplete;
- source file is absent before a valid prior-copy recovery case is established;
- source filename/path/asset id no longer matches the persisted job;
- source SHA256 differs from the persisted generated SHA256;
- Manifest is absent, malformed, or has a different SKU/item id;
- archive route cannot be resolved from trusted server-side configuration/Manifest;
- destination escapes the configured F asset root.

The browser cannot submit arbitrary source or destination filesystem paths.

### 4.3 Trusted route resolution

P3 uses trusted server-side metadata only.

Initial SC01 mapping:

- workflow: `SC01`
- asset: `cutout_master`
- archive destination key: `cutout`

The exact F directory must be resolved from the SKU Manifest destination entry for that trusted destination key and must also be contained inside the configured F asset root.

P3 may add an additive Site Profile field such as `asset_root` to define the allowed F formal-asset boundary. For DRIFT CURIO it is the parent visual-pipeline asset root already containing `01_RAW` and the formal asset directories.

Do not hard-code arbitrary operator-provided Windows paths.

### 4.4 No-overwrite / idempotency

For the final destination filename:

- destination absent: copy is allowed;
- destination exists with identical SHA256: treat as an idempotent recovery candidate and continue only after all other metadata/Manifest checks pass;
- destination exists with different SHA256: fail closed with `ARCHIVE_DESTINATION_CONFLICT`; never replace it.

A repeated archive request must not create duplicate files, duplicate archive-history entries, or new asset versions.

### 4.5 Copy/verify/delete ordering

The destructive order is frozen:

1. validate source and archive eligibility;
2. calculate/confirm source SHA256;
3. resolve trusted final destination;
4. copy to F without overwriting an existing different file;
5. calculate destination SHA256;
6. require source SHA256 == destination SHA256;
7. append an idempotent Manifest archive-history entry and persist the Manifest atomically;
8. read back/confirm the persisted archive entry;
9. only then delete the D staging source;
10. persist final `ARCHIVED` state.

If any step before #9 fails, D staging must remain intact.

### 4.6 Crash-window recovery

P3 must be restart-safe across at least these windows:

A. before F copy: no destructive effect; retry normally.

B. after F copy/verification but before Manifest persistence: D and F may both exist; on recovery verify same SHA and resume without re-copy/version change.

C. after Manifest persistence but before D deletion: D and F may both exist; on recovery verify destination + archive record, then safely complete D deletion.

D. after D deletion but before final journal state: F and Manifest are authoritative; recovery may finalize `ARCHIVED` only when the exact archive record and hash prove completion.

Recovery must never regenerate SC01, allocate another `vNNN`, or silently delete an unverified file.

## 5. State/data contract

P3 extends the generated-asset/job lifecycle with archive semantics. Exact implementation names may vary, but equivalents must exist:

- `QA_PASS`
- `ARCHIVING`
- `ARCHIVED`
- `FAILED_ARCHIVE`

Persist archive metadata sufficient for reconstruction, including at minimum:

- archive operation id;
- generated asset id;
- source staging path or server-resolvable staging identity;
- destination key;
- final destination path or server-resolvable destination identity;
- source SHA256;
- verified destination SHA256;
- archive requested/completed timestamps;
- Manifest path/record id;
- error code when failed.

`FAILED_ARCHIVE` must remain retryable only through the explicit operator action after the cause is corrected. It must not trigger auto-cleanup.

## 6. Manifest contract

Manifest path remains server-resolved from:

`manifest_root + <item/SKU>.json`

P3 must preserve unknown/existing Manifest fields and legacy `capture_history`.

Add/maintain an `archive_history` array if absent.

Each archive-history entry must be uniquely identifiable/idempotent and include at minimum:

- archived_at;
- gate/producer marker identifying Visual Console P3 / Gate 15 equivalent;
- archive operation id;
- workflow_code;
- generated_asset_id;
- filename;
- version;
- source staging identity/path;
- destination key;
- final destination identity/path;
- sha256;
- size_bytes;
- QA provenance (`QA_PASS` and relevant note/job id when available).

Manifest writes must use temp-write + atomic replace/rename semantics inside `manifest_root`. A partially written JSON document must never replace the last valid Manifest.

UTF-8/BOM legacy Manifests must be read safely.

## 7. Assets / Workspace UI

### 7.1 Assets page

For generated assets:

- `QA_PASS` continues to display `通过 · 待归档`;
- add selection checkbox only for archive-eligible `QA_PASS` assets;
- add `归档到 F` action;
- batch action archives selected eligible assets serially;
- show a confirmation dialog before the mutation;
- show per-item success/failure results;
- `ARCHIVED` displays `已归档` and must remain visible after D staging is deleted;
- `FAILED_ARCHIVE` displays an explicit failure state and error summary; do not pretend the asset is archived.

Archived preview/content may resolve from F through a bounded server endpoint. Do not expose F filesystem paths as browser authority.

### 7.2 Workspace

The production-status dashboard must count:

- pending archive = `QA_PASS` only;
- archived assets separately if a compact metric fits the approved layout;
- archive failures as anomalies/failures.

No structural redesign of the already-approved Workspace is in P3.

### 7.3 QA page

No new archive action is added to Quality Review. QA remains responsible for PASS/FAIL/Retry/Note. Archive is a separate operator decision in Assets.

## 8. API boundary

P3 may add bounded equivalents of:

- `POST /api/archive/batch`
- `GET /api/archive/status` or archive metadata through existing jobs/assets responses
- `GET /api/assets/archived/:siteId/:itemId/:assetId/content`

Mutation remains localhost-only.

The archive endpoint accepts logical ids only, such as site_id/item_id/generated_asset_ids. It must not accept arbitrary source path, destination path, or hash overrides from the browser.

## 9. Multi-site boundary

The implementation should remain Site Profile driven, but P3 runtime acceptance is bounded to DRIFT CURIO.

Do not assume every future site uses identical subdirectory names. Trusted Manifest destination entries + an allowed `asset_root` boundary are the routing authority.

## 10. Initial production scope

P3 may implement archive plumbing generically enough for future registered workflows, but the only production archive path required and authorized for target-Windows evidence is:

`SC01 / cutout_master / QA_PASS`

P3 does not enable any currently non-executable Workflow.

## 11. Explicit non-scope

P3 must not implement or perform:

- auto-archive immediately after QA PASS;
- archive of QA_PENDING/QA_FAIL assets;
- RAW move/delete/archive changes;
- permanent generated-asset delete or Trash/Restore;
- changing SC01 model/parameters;
- executing SW01/SD01/scenes/video/export workflows;
- new HEIC normalization;
- cloud/public exposure;
- auth/multi-user roles;
- branch deletion;
- Deployment;
- destructive cleanup of legacy scripts;
- merge without the normal G4B/G5/S8/G6/S9 release chain.

## 12. Allowed implementation areas after exact G4A

Production implementation may edit only:

- `apps/web/src/**`
- `apps/server/src/**`
- `apps/server/test/**`
- `apps/server/package.json` only if required
- `apps/web/package.json` only if required
- `config/sites/drift-curio.json` additive storage-boundary fields only
- `config/workflows/SC01.json` additive archive-route metadata only
- `config/workflows/registry.json` additive archive metadata only if needed for truthful registry output
- root `package.json` / `package-lock.json` only if required
- `.github/workflows/ci.yml` only for deterministic validation coverage
- `docs/p3/**`

No other path is authorized without a superseding G4A.

## 13. Automated validation contract

CI remains:

`npm ci → npm test → npm run build`

Add focused tests covering at minimum:

1. QA_PASS-only eligibility;
2. browser cannot inject arbitrary filesystem paths;
3. route key resolves only from trusted config/Manifest;
4. destination must remain inside F asset_root;
5. staging source must remain inside configured D staging root;
6. source hash mismatch fails closed;
7. destination absent → verified copy success;
8. same-name same-hash destination is idempotent;
9. same-name different-hash destination blocks without overwrite;
10. destination SHA mismatch leaves D source intact;
11. Manifest write failure leaves D source intact;
12. Manifest archive-history idempotency;
13. D source deletion occurs only after destination + Manifest verification;
14. crash recovery window B;
15. crash recovery window C;
16. crash recovery window D;
17. archived asset remains represented after D source deletion;
18. archive content endpoint cannot traverse F asset root;
19. localhost-only archive mutation;
20. P1/P2 upload/Trash/SC01/Queue/QA/restart tests remain passing.

## 14. Target Windows evidence plan

After code/CI and before G4B, perform bounded real-device evidence using one existing `QA_PASS` SC01 Master first.

Required evidence:

1. preflight displays the correct selected asset and archive destination semantics;
2. explicit human confirmation is required;
3. file appears in the intended F final destination;
4. F SHA256 equals the previously persisted D generated SHA256;
5. Manifest gains one archive-history entry;
6. D staging source is removed only after #3–#5;
7. Assets still shows the item as `已归档` and preview works from F;
8. restart preserves ARCHIVED state;
9. a second archive attempt is idempotent and does not duplicate history/files;
10. a controlled conflict test using test fixtures (not the production asset) proves same-name different-content fails closed.

Only after the first single-asset evidence passes may a small selected batch be tested.

Do not use the production F library for destructive negative tests.

## 15. Gate boundary

This Packet is preparation only.

Current hard stop:

`G4A_P3_REVIEW_REQUIRED`

The Human Owner's prior broad `授权全部权限，开始` authorizes preparation and progress, but does not substitute for an exact G4A bound to this Packet because the exact destructive archive contract did not yet exist when that broad authorization was given.

No real F archive or D staging deletion may occur before exact G4A and subsequent implementation/runtime-validation gates.