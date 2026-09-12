# Visual Console V2-D — Asset + Prompt Library

Date: 2026-09-12

Status: `STARTED / BRANCH_CREATED / BACKEND_FOUNDATION_NEXT / P5_UNCHANGED / CLOUD_DISABLED`

## Goal

Add a V2-native asset and prompt library without replacing existing RAW, Manifest, journal, D/E/F provenance, or archive authority.

V2-D is an additive read/projection layer first. Existing physical storage and historical provenance remain authoritative. Any later write path must be separately gated.

## Scope

### Asset Library

Target visible surfaces:

- Piece Assets;
- Material Boards;
- Reference Library;
- lineage/detail inspection.

Initial backend foundation will expose read-only projections over existing local truth:

- immutable RAW/source assets;
- generated derivatives already recorded by the P2 durable job journal;
- QA/archive state projected from V2-C job truth;
- asset role, parent/job/workflow linkage where existing records can prove it.

The first slice must not invent missing hashes, provenance, dimensions, archive readiness, or ownership metadata.

### Prompt Library

Prompts become versioned registry objects rather than textarea history.

Initial schema target:

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

Initial implementation is registry/read-only. Prompt mutation/version-authoring UI is deferred until read truth and validation are stable.

## Routes

Planned V2-native routes:

- `/v2/assets` — managed asset browser;
- `/v2/prompts` — Prompt Library;
- `/v2/materials` — Material Boards;
- `/v2/references` — Reference Library.

Sidebar entries become visible only when their route is actually usable, preserving the approved declutter rule from V2-A.

## Truth boundaries

1. RAW/source remains immutable.
2. A generated derivative is not Evidence merely because it exists.
3. `QA_PASS` does not imply `ARCHIVE_READY`.
4. Material Board and Reference assets are context-only unless a later workflow explicitly consumes them.
5. Prompt Registry metadata does not make a workflow executable.
6. No prompt or asset mutation may silently rewrite Manifest/journal history.
7. No Cloud provider call is introduced in V2-D.
8. P5 PR #9 / QA01 remain unchanged.

## First implementation slice

1. define V2 asset projection types and conservative role mapping;
2. expose localhost-only read APIs for asset projection;
3. add Prompt Registry schema/seed and read API;
4. add focused tests for truth boundaries;
5. run exact-head CI;
6. only then add visible V2-D library surfaces;
7. target Windows Human Visual Gate before merge.

## Acceptance criteria

- asset rows can be traced to existing local truth;
- source and generated roles are visually distinct;
- generated rows retain Job / Workflow / QA / Archive context where proven;
- no formal archive readiness is inferred;
- Prompt Library is versioned and registry-driven;
- search/filtering does not mutate source truth;
- no new write authority is introduced in the first slice;
- all touched paths pass existing full CI;
- V2-C routes and shared shell remain regression-safe.

## Branch / PR

- base main at V2-C post-merge docs head: `1513e18244196a7e6a0b9b9c912654a5a600e525`;
- branch: `feat/v2-d-asset-prompt-library`;
- PR: to be opened as Draft;
- active P5 PR #9 remains separate.
