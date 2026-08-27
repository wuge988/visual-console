# Visual Console P3 — Approved Asset Archive Packet

Date: 2026-08-27
Workflow: `JZ-v0.4 / MODE_A_STANDARD_FRONTEND`
Packet: `VC-P3-GATE15-ARCHIVE-001`
Base: `main @ c8e9e2722dc828055f9c2fd8f8c82b537b9e652e`
Branch: `feat/p3-approved-archive`

## Authorization mode

Human Owner standing instruction:

`授权全部权限，不需要一直找我授权，我需要你加快进度`

Interpretation for this bounded slice:
- routine implementation, tests, docs, PR/CI and bounded repair may continue without repeated approval prompts;
- no arbitrary path access, no overwrite, no unverified deletion, no branch deletion, no rollback, no deployment;
- real D/F destructive archive execution is allowed only through the fail-closed Gate-15 contract implemented here; source deletion must remain the final verified step.

## Authoritative legacy contract

DRIFT CURIO project truth: `wu-e-commerce/driftwood-commerce/docs/visual-pipeline/GATE_STATUS.md`.

Gate 15 frozen semantics:
1. Read a human-approved standardized asset from D staging.
2. Resolve its final F destination through the SKU Manifest / workflow destination mapping.
3. Copy to F without overwrite.
4. Verify byte size and SHA256.
5. Update Manifest archive history.
6. Delete D staging source only after verified F copy and durable Manifest update.
7. Same-name different-content targets must fail closed.

For current P3, only `SC01` is executable. Its Registry destination key is `cutout`; therefore the final directory MUST come from `manifest.destinations.cutout`. Browser clients cannot provide a filesystem destination.

## Scope

### In scope
- SC01 `QA_PASS` → formal F archive.
- Local-only archive API on the existing `127.0.0.1:4179` control plane.
- Exact source identity from P2 `jobs.jsonl`.
- Source SHA256 revalidation before archive.
- Manifest-driven `destinations.cutout` routing.
- Asset-root/path traversal protection.
- `wx` no-overwrite copy.
- Existing-target idempotent recovery only when SHA256 + size match.
- Atomic Manifest `archive_history` update.
- D staging deletion only after F verification + Manifest persistence.
- Crash/retry recovery for copy/manifest/delete boundaries.
- Archive journal under the existing site control root.
- Archived-content preview from F.
- Batch archive endpoint processed serially.
- UI integration so Assets can archive one or all `QA_PASS` items and display `已归档` truthfully.
- Tests + build + target-Windows evidence.

### Out of scope
- non-SC01 archive routing;
- generated-asset Trash/Restore;
- changing SC01 inference parameters;
- deleting F RAW;
- arbitrary filesystem browser APIs;
- cloud/public exposure;
- deployment;
- branch deletion;
- SW01/SD01/scene/video execution.

## Archive invariants

- Only latest P2 job snapshot with `state=QA_PASS` is archivable.
- `generated_asset_id`, filename, path, size and SHA256 must be complete.
- Staging source must be inside `profile.staging_root` when it exists.
- Final destination must be inside the site's formal asset root.
- Final filename is exactly the standardized generated filename; no rename during archive.
- If F target exists with different size/hash: `ARCHIVE_TARGET_CONFLICT`; never overwrite.
- If source exists but its current size/hash differs from the P2 captured snapshot: fail closed.
- Manifest entry is idempotent by `asset_id`; conflicting prior history fails closed.
- Source deletion occurs only after destination verification and durable Manifest update.
- If a crash occurs after verified copy or Manifest write, retry finishes idempotently without duplicating history or overwriting F.
- If a crash occurs after D deletion but before archive-journal completion, retry may finalize only when the F target and Manifest history both prove the exact expected SHA/size.

## Archive history schema

Manifest `archive_history[]` entry:

```json
{
  "archived_at": "ISO-8601",
  "gate": "15",
  "workflow_code": "SC01",
  "asset_id": "generated asset id",
  "filename": "standardized filename",
  "destination_key": "cutout",
  "destination_path": "formal F path",
  "size_bytes": 123,
  "sha256": "64 hex",
  "result": "VERIFIED_ARCHIVE"
}
```

## API contract

- `GET /api/archive?site_id=...&item_id=...` — archive records/status.
- `POST /api/archive/:siteId/:itemId/:assetId` — archive one approved asset.
- `POST /api/archive/batch` — serial archive of approved asset IDs, max 20.
- `GET /api/archive/assets/:siteId/:itemId/:assetId/content` — serve archived content from verified F path.

All endpoints remain local-only.

## Required validation

Automated:
- happy-path archive;
- wrong QA state rejected;
- staging hash drift rejected;
- target conflict rejected/no overwrite;
- same-content existing target recovers idempotently;
- Manifest history deduplicates;
- source survives copy/verification or Manifest failure;
- source deleted only after verified target + Manifest;
- post-delete retry finalizes from F + Manifest evidence;
- destination traversal/outside asset root rejected;
- batch remains serial and isolates/report failures;
- P1/P2 regressions remain green;
- `npm ci → npm test → npm run build`.

Target Windows:
- use an existing `QA_PASS` SC01 Master;
- archive from D to Manifest `destinations.cutout` on F;
- verify F SHA256 and file size;
- verify D staging source is removed only after F verified;
- verify Assets shows `已归档` and preview opens from F;
- restart Visual Console and verify archive status reconstructs.

## Hard stop

A failing archive safety invariant is blocking. Do not weaken no-overwrite, SHA256 verification, Manifest durability, or delete-last semantics to make a test pass.
