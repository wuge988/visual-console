# Visual Console — Document Authority & Archive Policy

Date: 2026-09-14  
Status: `CANONICAL`

## Purpose

The repository accumulated many Gate reports, implementation packets and superseded architecture notes while Visual Console was being built incrementally. This policy prevents historical evidence from being mistaken for current execution authority.

## Authority order

Use this order whenever documents disagree:

1. live `main` code + current runtime evidence;
2. `docs/CANONICAL_ARCHITECTURE_2026-09-14.md`;
3. `docs/IMPLEMENTATION_STATUS.md`;
4. active Pipeline documents:
   - `docs/SCENE_PIPELINE_2026-09-14.md`;
   - `docs/THREED_PIPELINE_2026-09-14.md`;
5. current explicit Human decisions;
6. historical Gate reports, implementation packets, old PR descriptions, old handoff docs and old conversations.

## Current authoritative documents

- `README.md`
- `docs/CANONICAL_ARCHITECTURE_2026-09-14.md`
- `docs/IMPLEMENTATION_STATUS.md`
- `docs/SCENE_PIPELINE_2026-09-14.md`
- `docs/THREED_PIPELINE_2026-09-14.md`
- `docs/MIGRATION.md`

## Historical evidence classes

The following document classes remain useful for audit/history but are **not current architecture authority** unless explicitly promoted again:

- `G4*`, `G5*`, `S7*`, `S8*` Gate/repair records;
- `P1_*` historical operational records;
- `V2_A/B/C/D/E/F/G/H_*_IMPLEMENTATION_PACKET_*` and slice-specific implementation packets;
- dated V2-H provider/activation/preflight/cost implementation notes;
- the 2026-09-12 “Final Design Freeze” document, which is superseded by the 2026-09-14 canonical architecture;
- closed PR #9 P5/QA01 scene R&D history.

These records can be cited to explain why a decision was made, but they must not override the current architecture.

## What was intentionally retired

### Independent P5 scene architecture

Closed without merge. Research retained; production authority none.

### Open-source/reference project as control plane

Retired. External projects may be Engine/R&D references only.

### Friend/reference console backend replication

Retired as an architecture goal. UI/UX patterns may be borrowed; Visual Console keeps its own domain truth and backend.

### “V2 final design = current final architecture”

Retired. V2 implementation remains valuable, but the 2026-09-14 consolidation supersedes its earlier information architecture where they differ.

## Deletion policy

Delete a historical file only when it is both:

1. factually wrong or harmful if retained; and
2. not required as audit/evidence or referenced by a current artifact.

Otherwise prefer one of:

- explicit superseded notice;
- historical classification in this index;
- Git history as the durable record after canonical replacement.

Do not delete source RAW, formal archive assets, Manifest/journal evidence or validated production outputs as part of documentation cleanup.

## New-document rule

Any future architecture/workflow document must declare one of:

- `CANONICAL`;
- `ACTIVE_PIPELINE`;
- `IMPLEMENTATION_EVIDENCE`;
- `R&D`;
- `HISTORICAL / SUPERSEDED`.

A document without an explicit status must not silently become production authority.