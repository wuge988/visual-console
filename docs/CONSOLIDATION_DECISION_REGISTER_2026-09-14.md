# Visual Console — Consolidation Decision Register

Date: 2026-09-14  
Status: `CANONICAL DECISION RECORD`

| Legacy / parallel line | Decision | What survives | What stops |
|---|---|---|---|
| 8.27 Visual Console | MERGE INTO CORE | Capture, RAW, Jobs, Manifest/journal, QA, Archive, SC01/SW01/SD01, restart/no-overwrite | old UI shell as current product direction |
| P5 / Aquarium scene R&D | ARCHIVE R&D + RESTART AS PIPELINE | identity lessons, masks, material references, Human Gate | independent architecture, endless D0–D5 tuning, PR #9 merge |
| Open-source / reconstruction experiments | REFERENCE ONLY | algorithms, models, nodes, implementation ideas | control-plane authority, business truth ownership |
| Friend/reference console | UX REFERENCE ONLY | navigation/task visibility/operator ergonomics | 1:1 backend clone |
| Current Visual Console V2 | KEEP AS CONTROL PLANE | shell, Jobs, Library, Canvas, Copilot, registries, provider safety | exposing every backend safety primitive as daily UX |
| PDP 3D workstream | KEEP AS PARALLEL PIPELINE | capture/reconstruction lessons, GLB/QA/PDP fallback contract | separate 3D control plane, 3D blocking PDP release |

## Final system

One Control Plane, three primary Pipelines:

1. Product Image;
2. Scene Image;
3. 3D Model.

All three share Exact Piece / Capture / Job / QA / Asset Registry / Archive truth and use replaceable Engine Adapters.

## Decision permanence

A future proposal to create another standalone visual console, separate scene backend, separate 3D manager, or to move business truth into ComfyUI/external tools requires an explicit Human architecture override and an update to `docs/CANONICAL_ARCHITECTURE_2026-09-14.md`.