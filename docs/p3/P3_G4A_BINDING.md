# Visual Console P3 — G4A Binding

Date: 2026-08-27
Workflow: `JZ-v0.4 / MODE_A_STANDARD_FRONTEND`
Packet: `VC-P3-APPROVED-ARCHIVE-001`
Status: `G4A_P3_REVIEW_REQUIRED`

## Exact implementation target

Repository:

`wuge988/visual-console`

Released base:

`main @ c8e9e2722dc828055f9c2fd8f8c82b537b9e652e`

Working branch:

`feat/p3-approved-archive-loop`

Implementation owner/tooling:

`GPT-5.6 Sol + connected GitHub connector`

Target environment for runtime evidence:

- Windows 11
- Visual Console local runtime
- D = compute/staging
- E = control/Manifest/journal
- F = formal assets
- DRIFT CURIO Site Profile
- existing real SC01 QA_PASS assets produced by the released P2 baseline

## Scope binding

G4A, if approved, authorizes implementation of exactly the P3 Packet:

`docs/p3/P3_IMPLEMENTATION_PACKET.md`

Primary outcome:

`QA_PASS → explicit archive action → trusted route → F verified copy → Manifest archive record → verified D staging deletion → ARCHIVED`

This is the Visual Console migration of the already-frozen DRIFT CURIO Gate 15 semantics.

## Destructive boundary

P3 contains a deliberately bounded destructive step: deletion of a generated D staging source after successful formal archive.

That deletion is authorized for implementation only under all of these invariants:

- source is a persisted `QA_PASS` generated asset;
- source identity/path is server-resolved and inside configured staging root;
- source hash matches persisted generated hash;
- destination is server-resolved from trusted workflow metadata + Manifest and inside configured F asset root;
- F destination hash is verified equal to source hash;
- Manifest archive-history record is atomically persisted and read-back verified;
- only then may the exact D source be deleted.

Implementation must fail closed and preserve D source whenever these proofs are incomplete.

## Initial production acceptance path

Only:

`SC01 / cutout_master / QA_PASS`

No other Workflow becomes executable under this G4A.

## Allowed files/modules

After exact G4A, implementation may modify only:

- `apps/web/src/**`
- `apps/server/src/**`
- `apps/server/test/**`
- `apps/server/package.json` if required
- `apps/web/package.json` if required
- additive archive/storage fields in `config/sites/drift-curio.json`
- additive archive metadata in `config/workflows/SC01.json`
- additive truthful archive metadata in `config/workflows/registry.json` if needed
- root `package.json` / `package-lock.json` only if required
- `.github/workflows/ci.yml` only for deterministic P3 validation
- `docs/p3/**`

Any other path requires a superseding G4A.

## Required implementation safety

The implementation must preserve:

- explicit human archive decision; no QA auto-archive;
- no browser-provided arbitrary filesystem paths;
- localhost-only mutation;
- F RAW untouched;
- no-overwrite / same-name different-hash conflict blocking;
- same-name same-hash idempotent recovery;
- SHA256 verification before D deletion;
- atomic/idempotent Manifest archive history;
- crash recovery across copy/Manifest/delete windows;
- archived asset visibility after staging deletion;
- P1/P2 regression behavior.

## Required validation

Automated contract remains:

`npm ci → npm test → npm run build`

The full P3 Packet test matrix is mandatory.

Target Windows runtime evidence must begin with one existing QA_PASS SC01 asset. Real F archive/D deletion is not allowed until implementation tests are green and the runtime step is explicitly reached under this bound slice.

## Explicit non-scope

This G4A does not authorize:

- Deployment;
- Merge;
- branch deletion;
- rollback;
- RAW delete/move/archive semantics changes;
- auto-archive after QA PASS;
- generated Trash/Restore/permanent-delete feature;
- SC01 model/parameter changes;
- execution of non-SC01 workflows;
- public/cloud exposure;
- destructive negative tests against production F assets;
- legacy-script destructive cleanup.

## Human authorization semantics

The earlier Human Owner message `授权全部权限，开始` is recorded as broad permission to start and prepare this next slice. It is not treated as exact G4A approval because this Packet and its destructive archive contract were created afterward.

Exact G4A approval phrase requested:

`G4A-P3通过，按 VC-P3-APPROVED-ARCHIVE-001 和 P3_G4A_BINDING 授权实施`

Until that exact approval is received:

`NO_PRODUCTION_CODE / NO_REAL_ARCHIVE / NO_D_STAGING_DELETE / NO_MERGE / NO_DEPLOYMENT`