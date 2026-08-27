# Visual Console P4 — Static Derivatives Implementation Packet

Date: 2026-08-27
Packet: `VC-P4-STATIC-DERIVATIVES-001`
Base: `main @ a3be177d602c3bbc72f22a959eb3a5273b2fa1f3`
Branch: `feat/p4-static-derivatives`
Mode: `MODE_A_STANDARD_FRONTEND`
Status: `P4A_SW01_IMPLEMENTATION_APPROVED_BY_STANDING_AUTHORIZATION / P4B_SD01_STYLE_FREEZE_LATER`

## 1. Purpose

P4 adds deterministic static derivatives after P3 has established a verified formal SC01 Cutout Master.

Frozen order:

1. `SW01` — Static White Master / 白底商品主图；
2. `SD01` — Static Dark Master / 深色商品主图；
3. scene workflows later；
4. video workflows last。

This Packet authorizes implementation of **P4A / SW01 only**. SD01 is deliberately not implemented in the same bounded slice because its premium dark-background visual treatment still needs an explicit visual-template freeze.

## 2. Authoritative semantics

Existing workflow/asset registries define:

- `SW01 = Static White Master`
- asset key: `white_master`
- destination key: `white`
- filename: `{SKU}__white__master__wf-SW01__vNNN.png`
- `SD01 = Static Dark Master`
- asset key: `dark_master`
- destination key: `dark`

Historical registry notes described SW01/SD01 as unregistered ComfyUI workflows. P4A updates the **execution engine only**, not the Workflow Code or asset semantics: once SC01 has produced and Gate15 has verified an alpha Cutout Master, a flat white derivative does not require another AI inference pass. Re-running ComfyUI/RMBG would add GPU cost and another failure surface without adding information.

Therefore SW01 v1 is frozen as a **deterministic local image compositor**. It must not invoke RMBG or generative inference.

## 3. P4A source-of-truth contract

A SW01 source is valid only when all are true:

1. source is a durable P3 `ARCHIVE_SNAPSHOT`;
2. source `workflow_code = SC01`;
3. source `destination_key = cutout`;
4. source `result = VERIFIED_ARCHIVE`;
5. source belongs to the requested Site + SKU;
6. formal F source still exists under Site Profile `asset_root`;
7. current source byte size and SHA256 still match the archive snapshot;
8. source filename matches the standardized SC01 Cutout Master pattern.

The browser may submit only a source archive asset ID. It may not submit an F path, D path, destination path, SHA, size, filename, or arbitrary input file.

## 4. SW01 deterministic transform

Input: verified 8-bit PNG Cutout Master with alpha.

Output semantics:

- same pixel width and height as the Cutout Master;
- exact opaque white background `#FFFFFF`;
- RGB output PNG; no transparency;
- source RGB is alpha-composited over white;
- no resize, crop, sharpening, denoise, relighting, generation, background hallucination, or subject geometry change;
- output is deterministic for identical source bytes and renderer version.

Fail closed on unsupported PNG forms. The v1 compositor may support only the exact formats it explicitly validates; unsupported bit depth/color type/interlace must return a stable error instead of silently converting.

## 5. Staging and versioning

Generated SW01 outputs first go to D staging:

`<staging_root>/visual-console/<SKU>/white/`

Filename:

`{SKU}__white__master__wf-SW01__vNNN.png`

Rules:

- `v001..v999` per SKU / SW01 asset family;
- allocate from existing standardized filenames in the staging folder plus durable derivative journal truth;
- never overwrite an existing filename;
- serial mutation for version allocation + generation;
- output SHA256 + byte size persisted immediately after generation.

## 6. P4 derivative journal

Use a dedicated append-only journal under existing `control_root`:

`derivatives.jsonl`

Each latest snapshot must contain at least:

- event: `DERIVATIVE_SNAPSHOT`
- derivative/job ID
- site_id / item_id
- workflow_code
- source archive asset ID
- source filename / SHA256 / size
- generated asset ID / filename / SHA256 / size
- generated staging path (internal only; never returned raw to browser)
- renderer ID/version
- state
- created_at / updated_at
- QA note when present

P4A states:

`GENERATING → QA_PENDING → QA_PASS | QA_FAIL`

Errors use stable `FAILED_*` states/codes and must never promote an invalid output to QA_PENDING.

## 7. QA

SW01 is visually deterministic but still requires operator QA before formal archive.

QA must support:

- generated White Master preview;
- original Cutout comparison;
- PASS / FAIL / NOTE;
- failed item reopen/review;
- no bulk PASS outside QA_PENDING.

P4A may use additive P4 endpoints/UI without weakening the released SC01 QA contract.

## 8. Formal archive extension

A P4A `QA_PASS` White Master may be formally archived only through the released Gate15 safety order adapted to `workflow_code=SW01` and `destination_key=white`:

1. resolve derivative identity server-side;
2. load Manifest and `destinations.white`;
3. enforce formal `asset_root` boundary;
4. verify D staging SHA256 + size against persisted derivative snapshot;
5. F create/no-overwrite;
6. verify F SHA256 + size;
7. append exactly one idempotent Manifest `archive_history` row;
8. re-verify F;
9. delete D staging source last;
10. append durable archive snapshot.

No F-only lookalike may self-promote without durable matching Manifest history. Same-name/different-content remains a conflict.

## 9. APIs — bounded target

Proposed local-only endpoints:

- `GET /api/derivatives?site_id=...&item_id=...`
- `POST /api/derivatives/SW01/batch`
- `GET /api/derivatives/assets/:siteId/:itemId/:assetId/content`
- `GET /api/derivatives/qa?site_id=...&item_id=...`
- `POST /api/derivatives/qa/:assetId/decision`
- Gate15 archive entry for approved SW01 derivative, either via a generalized archive route or a bounded SW01 archive route; browser still submits IDs only.

Batch maximum remains 20. SW01 rendering is serial even though it is CPU-only, to keep version allocation and journals deterministic.

## 10. UI target

Keep the accepted six-page structure.

- `/workspace`: archived SC01 Cutout Master can be selected as the source for SW01 generation after P4A backend is validated.
- `/jobs`: derivative state is visible without pretending it is a ComfyUI prompt job.
- `/qa`: White Master QA is distinguishable from SC01 alpha QA.
- `/assets`: White Master cards and status filters use derivative/archive truth.
- `/workflows`: SW01 becomes executable only after implementation + validation; registry status must not be pre-promoted.

No seventh permanent navigation page is introduced.

## 11. Required automated evidence

At minimum:

- only verified SC01 archive can source SW01;
- arbitrary path/source fields ignored or rejected;
- source F hash/size drift rejected;
- deterministic alpha-over-white pixel result;
- dimensions preserved;
- output fully opaque RGB;
- unsupported PNG fail closed;
- version allocation/no overwrite;
- derivative journal restart reconstruction;
- QA PASS/FAIL/NOTE transitions;
- approved-only SW01 archive;
- Manifest `destinations.white` boundary;
- F no-overwrite/hash/size;
- Manifest history idempotence;
- D delete-last;
- all P1/P2/P3/P3.1 tests/build remain green.

## 12. Target-Windows evidence required before P4A merge

Because CI cannot access the real F/D/E disks, one real archived SC01 source must prove:

- SW01 source resolves from archive truth;
- generated white image visually matches the exact piece and has pure white background;
- D staging standardized filename/version;
- QA decision persistence;
- F `destinations.white` archive hash/size;
- Manifest one matching SW01 Gate15 history row;
- D delete-last;
- restart reconstruction + F preview;
- idempotent archive retry.

## 13. Explicit non-scope

- SD01 rendering implementation;
- scene/image generation;
- video;
- SC01 retuning;
- RAW deletion;
- public/cloud exposure;
- arbitrary browser filesystem paths;
- branch deletion;
- 4179→4177 consolidation;
- generated staging Trash/Restore/GC.

## 14. Gate

P4A implementation may proceed autonomously under standing authorization. Merge remains fail-closed on green CI + bounded diff audit + the target-Windows evidence listed above.
