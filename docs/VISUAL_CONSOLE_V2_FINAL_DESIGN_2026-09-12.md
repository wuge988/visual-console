# Visual Console V2 — 2026-09-12 Design Freeze

Status: `HISTORICAL / SUPERSEDED`

This document was the authoritative V2 design freeze on 2026-09-12. It is no longer the current architecture authority.

The project was consolidated on 2026-09-14 after reviewing:

- the original 8.27 Visual Console production core;
- the separate Aquarium/scene-generation R&D line;
- open-source/reconstruction experiments;
- the reference/friend-console replication work;
- the PDP 3D track;
- the V2 implementation completed through the Execution Intent Operator Gate.

The current authority is:

- `docs/CANONICAL_ARCHITECTURE_2026-09-14.md`;
- `docs/IMPLEMENTATION_STATUS.md`;
- `docs/SCENE_PIPELINE_2026-09-14.md`;
- `docs/THREED_PIPELINE_2026-09-14.md`;
- `docs/DOCUMENT_AUTHORITY_AND_ARCHIVE_2026-09-14.md`.

## What remains valid from this historical design

The following concepts were retained in the consolidated architecture:

- Visual Console as a site-neutral Control Plane;
- Exact Piece identity before aesthetics;
- RAW/source immutable;
- generation/QA/archive state separation;
- Registry-driven Engines/Workflows/Models;
- local-first execution;
- explicit cloud escalation;
- Cost Guard;
- Creation Canvas as an orchestrator rather than a raw ComfyUI graph clone;
- Visual Copilot as draft/suggestion authority only;
- Manifest/journal/D-E-F provenance;
- Human Visual Gate;
- server-side provider secrets.

## What was superseded

The 2026-09-12 information architecture exposed too much internal provider/safety detail as first-class operator UI and treated the P5/QA01 branch as an active parallel architecture.

The 2026-09-14 consolidation changes that:

- there is one Control Plane;
- Product Image, Scene Image and 3D Model are Pipelines inside it;
- ComfyUI/cloud/3D tools are replaceable Engine Adapters;
- old P5 PR #9 is closed without merge and remains R&D evidence only;
- the friend/reference console is a UX reference, not a backend to clone;
- provider safety primitives move toward `Settings → Advanced` rather than the primary daily workflow;
- Scene and 3D may proceed in parallel on the same SKU/Capture/Job/QA/Archive model;
- 3D remains non-blocking for PDP/site release.

The original 2026-09-12 content remains available in Git history for audit.