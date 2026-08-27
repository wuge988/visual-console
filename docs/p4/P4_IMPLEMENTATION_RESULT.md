# Visual Console P4A — SW01 Implementation Result

Date: 2026-08-27
Packet: `VC-P4-STATIC-DERIVATIVES-001`
Branch: `feat/p4-static-derivatives`
Base: `main @ a3be177d602c3bbc72f22a959eb3a5273b2fa1f3`
Status: `P4A_CODE_COMPLETE / AUTONOMOUS_REPO_AUDIT_PASS / AUTOMATED_VALIDATION_PASS / TARGET_WINDOWS_PHYSICAL_EVIDENCE_REQUIRED`

## 1. Implemented scope

P4A implements `SW01 = Static White Master` as a deterministic local renderer rather than another AI/RMBG pass.

Source:

`P3 VERIFIED_ARCHIVE SC01 Cutout Master on F`

Output:

`{SKU}__white__master__wf-SW01__vNNN.png`

Transform:

- same width/height as SC01 Cutout;
- alpha composited over exact `#FFFFFF`;
- output is opaque RGB PNG;
- no resize/crop/relight/generative inference;
- deterministic output for identical source bytes and renderer version.

Renderer ID:

`sw01-flat-white-rgb-v1`

## 2. Source identity / provenance

SW01 generation accepts only an archive asset ID from the browser.

Before render the service verifies:

1. matching `archives.jsonl` P3 snapshot exists;
2. `workflow_code=SC01`;
3. `destination_key=cutout`;
4. `result=VERIFIED_ARCHIVE`;
5. Site + SKU match;
6. standardized Cutout filename;
7. matching durable Manifest `archive_history` row exists with identical destination/hash/size/result;
8. current F file remains inside formal asset root;
9. current F bytes still match persisted SHA256 + byte size.

The exact verified byte buffer is then used as the render input, closing the verify/read gap for the rendering operation.

Browser-supplied `source_path`, `destination_path`, hash, size, filename, or other arbitrary filesystem fields do not establish source identity.

## 3. PNG renderer

`apps/server/src/png-white.ts` adds a bounded dependency-free PNG path for P4A:

- PNG signature validation;
- chunk CRC validation;
- 8-bit RGBA / color type 6 only;
- non-interlaced only;
- scanline filters 0–4;
- dimension/pixel/input limits;
- unsupported critical/format cases fail closed;
- alpha-over-white compositing;
- deterministic RGB PNG encoder.

This deliberately rejects unsupported PNG forms rather than silently converting them.

## 4. Derivative state and crash recovery

Dedicated append-only journal:

`<control_root>/derivatives.jsonl`

States:

`GENERATING → QA_PENDING → QA_PASS | QA_FAIL`

Generation errors:

`FAILED_GENERATION`

Crash recovery behavior:

- a persisted `GENERATING` row is reconstructed on later derivative/QA reads;
- source archive + Manifest truth is revalidated;
- if D output exists and byte-for-byte equals a fresh deterministic render from the verified F source, metadata is reconstructed and state becomes `QA_PENDING`;
- missing or mismatching output fails closed to `FAILED_GENERATION`.

Version allocation is serial and no-reuse/no-overwrite, using both durable derivative journal versions and existing standardized D staging filenames.

## 5. QA

Local P4 endpoints support:

- listing derivative records;
- listing QA records;
- PASS / FAIL / NOTE;
- generated White Master preview;
- archived F White Master preview.

Before any QA decision, the D staging file is rechecked against its persisted SHA256 + size.

An already archived derivative cannot be subsequently reclassified through the QA endpoint.

## 6. Gate15 SW01 archive

SW01 archive is QA_PASS-only and uses Manifest `destinations.white`.

Safety order:

1. resolve persisted derivative identity;
2. verify standardized white filename/hash/size;
3. load BOM-safe Manifest;
4. require `destinations.white`;
5. enforce Site formal `asset_root` boundary;
6. verify D staging SHA256 + size;
7. F create/no-overwrite;
8. verify F hash + size;
9. persist exactly one idempotent SW01 Manifest `archive_history` row;
10. re-verify F;
11. delete D staging last;
12. append `ARCHIVE_SNAPSHOT`.

Retry after D deletion is allowed only when Manifest durable history + exact F target prove the same asset. Same-name/different-content F target fails closed.

## 7. Local physical validation surface

Temporary validation surface:

`http://127.0.0.1:5173/sw01.html`

It is not a seventh permanent Visual Console navigation page.

The page:

- reads P3 formal SC01 archives;
- automatically selects the newest verified Cutout;
- allows one-click SW01 generation;
- shows Cutout and White Master side-by-side;
- allows human PASS/FAIL/NOTE;
- `通过并归档到 F` performs QA PASS + Gate15 archive;
- immediately performs an idempotent archive retry check after successful first archive.

The accepted six-page Visual Console integration remains after physical backend validation and before final P4 release.

## 8. Consolidated Windows evidence collector

Added:

`tools/P4_SW01_FINAL_SELF_CHECK.ps1`

After one human-approved physical SW01 archive it validates in one run:

- service health;
- SW01 feature flag;
- Manifest white destination;
- API SW01 archive truth;
- derivative QA/archived state;
- renderer identity;
- exactly one SW01 Manifest history row;
- destination route;
- F White hash/size;
- D staging absent after delete-last;
- source SC01 Manifest identity;
- source F hash/size;
- derivative journal reconstruction truth;
- archive journal snapshot;
- archived F preview endpoint hash/size;
- idempotent retry API + unchanged F hash + no duplicate Manifest history.

No RAW deletion, broad cleanup, overwrite, or arbitrary-drive operation is performed by the self-check.

## 9. Automated evidence

CI #182 at code head `9c871fdaeded8d80933c8b00ce26fbe14b126c17`: **PASS**.

Contract:

`Parse P3/P4 Windows physical self-checks → Parse archive/sw01 validation JavaScript → npm ci → npm test → npm run build`

Test result before this result-document-only commit:

- total: 49;
- pass: 49;
- fail: 0.

Coverage includes:

- P1/P2/P3/P3.1 regressions;
- verified P3 source + Manifest provenance;
- source drift rejection;
- deterministic PNG pixel result;
- PNG format/CRC fail-closed cases;
- SW01 no-overwrite versioning;
- restart recovery exact-output and missing-output cases;
- Gate15 white archive/idempotence/conflict/missing-destination;
- route-level local-only source isolation and full generate → QA → archive → preview lifecycle.

## 10. Autonomous bounded diff audit

Result: `PASS / NO_P0_P1_REPOSITORY_FINDING`.

Confirmed non-regressions:

- P3 SC01 Gate15 code is not weakened;
- original archive serialization is reused;
- browser still cannot choose physical source/destination paths;
- P4 source requires both archive journal and Manifest durable history;
- formal F output is no-overwrite and hash/size verified;
- D delete remains last;
- SD01/scenes/video remain disabled;
- SW01 workflow registry remains `IMPLEMENTED_VALIDATION_PENDING / executable=false` until real target-Windows evidence passes, avoiding premature production promotion.

## 11. Remaining hard gate

P4A is **not merge-ready yet** because CI cannot verify the actual Windows D/E/F storage.

Required next evidence:

1. sync exact P4 head to target Windows;
2. start the local Visual Console runtime;
3. open `/sw01.html`;
4. generate from one real P3 archived SC01 Cutout;
5. human inspect White Master versus source;
6. approve/archive only if visually correct;
7. run `P4_SW01_FINAL_SELF_CHECK.ps1`;
8. restart runtime and re-check reconstruction/preview;
9. only after all PASS: integrate SW01 into the accepted six-page UI, promote registry truth, final CI/audit, Ready/Merge.

Until that evidence exists, PR #6 must remain Draft/Open/Unmerged.
