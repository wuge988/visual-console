# Visual Console — Migration & Consolidation Record

## 2026-08-25 — Product repository migration

Formal product repository became:

`wuge988/visual-console`

Visual Console material previously held inside `wu-e-commerce/driftwood-commerce` became historical/project-integration evidence rather than product-code authority.

DRIFT CURIO remained the first Site Profile; Visual Console Core was not to be hard-coded as driftwood-only.

## 2026-09-14 — Architecture consolidation

A second consolidation was required because four partially overlapping tracks had accumulated:

1. original Visual Console production core / 8.27 line;
2. Aquarium scene-generation R&D / P5 QA01 line;
3. external/open-source workflow and reconstruction experiments;
4. V2/reference-console replication plus the separate PDP 3D workstream.

The project is now frozen to one architecture:

```text
ONE Visual Console Control Plane
  ├─ Product Image Pipeline
  ├─ Scene Image Pipeline
  └─ 3D Model Pipeline

Replaceable Engine Adapters
  ├─ deterministic local renderer
  ├─ ComfyUI
  ├─ cloud providers
  └─ 3D reconstruction engines

Shared truth
  ├─ Exact Piece / SKU
  ├─ Capture Session
  ├─ Jobs
  ├─ QA
  ├─ Asset Registry
  └─ Archive / Publish
```

### Preserved

- validated Capture/RAW behavior;
- SC01/SW01/SD01 production truth;
- Manifest/journal/D-E-F provenance;
- no-overwrite and restart recovery;
- Human Visual Gate;
- current V2 shell and service layer;
- registries, Engine health, Creation Canvas, Visual Copilot;
- Provider Adapter / Cost Guard / paid-call safety and spend audit;
- scene R&D conclusions;
- 3D capture/reconstruction lessons.

### Retired as independent architecture

- old 8.27 UI shell;
- P5/QA01 as a separate production architecture;
- external/open-source project as a control plane;
- 1:1 backend replication of the friend/reference console;
- 3D as a prerequisite for PDP/site release.

PR #9 was closed without merge and kept as R&D history.

### New active documents

- `docs/CANONICAL_ARCHITECTURE_2026-09-14.md`
- `docs/IMPLEMENTATION_STATUS.md`
- `docs/SCENE_PIPELINE_2026-09-14.md`
- `docs/THREED_PIPELINE_2026-09-14.md`
- `docs/DOCUMENT_AUTHORITY_AND_ARCHIVE_2026-09-14.md`

The 2026-09-12 V2 Final Design document is now historical/superseded. Git history preserves its original content.

### Migration rule

No documentation consolidation may rewrite or delete validated RAW, formal Archive assets, Manifest/journal evidence or previously verified production outputs.

Future migrations must distinguish:

- Control Plane changes;
- Pipeline changes;
- Engine Adapter changes;
- Asset/provenance migrations.

A change in one layer must not silently redefine authority in another.