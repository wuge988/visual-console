# Visual Console V2-D — Asset + Prompt Library

Date: 2026-09-12

Status: `HUMAN_VISUAL_PASS / PR14_SQUASH_MERGED / MAIN_08108a10 / V2_D_COMPLETE / V2_E_NEXT / P5_UNCHANGED / CLOUD_DISABLED`

## Goal

Add a V2-native asset and prompt library without replacing existing RAW, Manifest, journal, D/E/F provenance, or archive authority.

V2-D is an additive read/projection layer first. Existing physical storage and historical provenance remain authoritative. Any later write path must be separately gated.

## Implemented first slice

### Asset Library

Visible route:

- `/v2/assets` — Piece Assets.

Read API:

- `GET /api/v2/assets?site_id=...`.

Current projection is deliberately conservative:

- source=`P2_JOB_JOURNAL_READ_ONLY`;
- completeness=`JOURNAL_REFERENCED_ASSETS_ONLY`;
- roles currently projected: `RAW_SOURCE` and `GENERATED_DERIVATIVE`;
- repeated source references are de-duplicated by site/item/source asset id;
- generated derivatives retain Job / Workflow / Generation / QA / Archive context where the durable journal proves it;
- source rows are explicitly immutable and do not receive invented QA/archive state;
- `QA_PASS` derivative remains `STAGING`;
- `QA_FAIL` derivative remains `REJECTED`.

This is **not** presented as a complete physical disk index. V2-D does not silently scan and promote unregistered files merely to fill the library.

### Prompt Library

Visible route:

- `/v2/prompts` — Prompt Library.

Read API:

- `GET /api/v2/registries/prompts?site_id=...`.

Prompt Registry seed:

- `config/prompts/registry.json`;
- schema version `1.0`;
- initial registry is intentionally empty rather than inventing unreviewed production prompts.

Prompt schema:

```text
prompt_key
version
display_name
scene_type
status
body
negative_constraints
exact_piece_constraints
compatible_workflows
compatible_models
site_scope
tags
notes
```

Prompt Library is currently read-only. Registry metadata does not make a workflow or model executable.

## Deferred within V2-D

Frozen IA still includes:

- Material Boards;
- Reference Library;
- richer lineage/detail inspection;
- prompt authoring/version mutation.

They remain hidden from runtime navigation until they have real usable routes/data semantics. This preserves the V2-A sidebar declutter rule.

## Truth boundaries

1. RAW/source remains immutable.
2. A generated derivative is not Evidence merely because it exists.
3. `QA_PASS` does not imply `ARCHIVE_READY`.
4. Material Board and Reference assets are context-only unless a later workflow explicitly consumes them.
5. Prompt Registry metadata does not make a workflow executable.
6. No prompt or asset mutation may silently rewrite Manifest/journal history.
7. No Cloud provider call is introduced in V2-D.
8. P5 PR #9 / QA01 remain unchanged.

## Verification

### Backend foundation

Exact backend/test head: `b12a19925effe11114dff7f5233d9619130c1439`.

CI #554: `PASS`.

Covered:

- Windows physical self-check parsing;
- validation-page JavaScript parsing;
- `npm ci`;
- full `npm test`;
- `npm run build`;
- V2-D focused projection tests.

### Visible surfaces

Runtime/UI head: `b576d543a4145bdf08bb89d11e9bb2ec4a9d14f4`.

CI #557: `PASS`.

Final reviewed exact head: `de143bd033d7eefe5fcc0e72a63653116f7980b9`.

CI #558: `PASS`.

Visible implementation adds:

- `V2LibraryApp.vue`;
- `v2-d-library.css`;
- V2-native `/v2/assets` and `/v2/prompts` mounting;
- shared V2 monitor semantics on the new surfaces;
- truthful empty Prompt Registry state;
- asset role / workflow / QA / archive inspection and search/filtering.

## Human Visual Gate

Target Windows browser Human Visual Gate: `PASS`.

Confirmed:

- Piece Assets preserves the V2 shell, global monitor, sidebar density and route hierarchy;
- 7 journal-referenced assets reconcile to 3 RAW Source + 4 Generated;
- RAW Source rows remain visibly immutable and carry no fabricated QA/archive state;
- generated derivatives expose QA and Archive truth independently (`QA_FAIL → Rejected`, `QA_PASS → Staging`);
- table density is readable with no visible desktop overflow or hierarchy break;
- Prompt Library correctly renders the empty registry state (`Registered 0 / Active 0 / Scene Types 0 / Schema 1.0`) rather than inventing prompts;
- V2-D search/filter controls and sidebar entries remain visually consistent with prior V2 gates.

## Merge

- PR #14: `SQUASH_MERGED`;
- final reviewed exact head: `de143bd033d7eefe5fcc0e72a63653116f7980b9`;
- merge commit: `08108a10d52ee336aa9187ec965f000c57649d38`;
- merge commit signature: verified;
- next implementation phase: `V2-E Production Composer`.

## Safety

V2-D does not:

- mutate RAW/source;
- rewrite Manifest or historical job journal;
- infer formal archive readiness from QA PASS;
- make Prompt Registry entries executable by themselves;
- enable Cloud providers;
- alter Cost Guard;
- enable P5 QA01;
- touch active P5 PR #9.
