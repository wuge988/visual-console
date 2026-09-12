# Visual Console V2-D — Asset + Prompt Library

Date: 2026-09-12

Status: `BACKEND_FOUNDATION_PASS / VISIBLE_SURFACES_COMPLETE / CI_557_PASS / WINDOWS_HUMAN_VISUAL_GATE_NEXT / PR14_DRAFT_OPEN_UNMERGED / P5_UNCHANGED / CLOUD_DISABLED`

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

Current visible-surface exact head: `b576d543a4145bdf08bb89d11e9bb2ec4a9d14f4`.

CI #557: `PASS`.

Visible implementation adds:

- `V2LibraryApp.vue`;
- `v2-d-library.css`;
- V2-native `/v2/assets` and `/v2/prompts` mounting;
- shared V2 monitor semantics on the new surfaces;
- truthful empty Prompt Registry state;
- asset role / workflow / QA / archive inspection and search/filtering.

## Current Gate

Next hard gate is target Windows Human Visual Gate for:

1. `/v2/assets`;
2. `/v2/prompts`.

Do not mark PR #14 Ready or merge until these surfaces pass the target Windows visual gate and any resulting shared-shell consistency issues are resolved.

## Acceptance criteria

- asset rows can be traced to existing local truth;
- source and generated roles are visually distinct;
- generated rows retain Job / Workflow / QA / Archive context where proven;
- no formal archive readiness is inferred;
- Prompt Library is versioned and registry-driven;
- search/filtering does not mutate source truth;
- no new write authority is introduced in the first slice;
- all touched paths pass existing full CI;
- V2-C routes remain regression-safe;
- target Windows visual gate passes before merge.

## Branch / PR

- base main at V2-C post-merge docs head: `1513e18244196a7e6a0b9b9c912654a5a600e525`;
- branch: `feat/v2-d-asset-prompt-library`;
- PR #14: `Draft / Open / Unmerged`;
- current visible-surface exact head: `b576d543a4145bdf08bb89d11e9bb2ec4a9d14f4`;
- CI #557: `PASS`;
- active P5 PR #9 remains separate and unchanged.
