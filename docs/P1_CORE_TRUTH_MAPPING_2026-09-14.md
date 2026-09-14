# P1 — Core Truth Inventory & Mapping

Date: 2026-09-14
Status: `P1.1_COMPLETE / P1.2_INITIALIZED / P1.3_INITIALIZED`

## Purpose

Record the actual repository boundaries before deeper consolidation. This document is a map, not a rewrite plan for already-validated production algorithms.

## Current implementation inventory

| Existing module | Current responsibility | Canonical role | Action |
|---|---|---|---|
| `p2-runtime.ts` | SC01 workflow validation, Job state, journal read/write, recovery, verified copy | Product Image engine/runtime evidence + Job adapter | KEEP; wrap with canonical contract |
| `p3-archive.ts` | QA-gated archive, manifest history, SHA256/size verification, delete-last | Archive authority | KEEP; expose canonical Archive projection |
| `p4-derivatives.ts` | downstream image derivatives | Product Image Pipeline | KEEP; later bind to canonical Job/Asset |
| `p4-dark.ts` | dark product image generation | Product Image Pipeline / SD01 | KEEP; no algorithm rewrite |
| `png-white.ts` / `png-dark.ts` | deterministic image processing | Product Image Engine support | KEEP |
| `v2-jobs.ts` | read-only unified Job projection over P2 journal | Control Plane Job read model | KEEP; replace duplicated state definitions incrementally |
| `v2-library.ts` | read-only asset/prompt projections | Asset Registry / Library read model | KEEP; migrate Asset type to canonical contract |
| `v2-production.ts` | workflow registry → production capabilities | Pipeline registry projection | KEEP; later map PipelineCode/Engine Adapter |
| `v2-registries.ts` | workflow/engine/model registry projections | Engine/Pipeline registry | KEEP |
| `v2-cloud-*` | activation, adapters, spend, provider safety | Engine Adapter + Advanced safety | KEEP; UX later moves under Settings/Advanced |
| `v2-openai-image-*` | OpenAI image plan/staging/preflight/intent/submit/output | Cloud Engine Adapter | KEEP; no silent fallback / no business authority |
| `v2-canvas.ts` | Creation Canvas orchestration | Control Plane composer | KEEP; later dispatch canonical Pipeline Jobs |
| `v2-summary.ts` | dashboard projection | Control Plane Home | KEEP / UX later |

## Canonical mappings

### Exact Piece

Current source of identity is `site_id + item_id` throughout the P2 job/profile model. No second SKU authority should be introduced.

### Capture Session

Not yet represented as a first-class server domain object in the inspected V2 modules. This is a P1 follow-up, not an excuse to duplicate RAW storage. It must reference existing source assets and capture metadata.

### Job

`P2Job` is the validated persisted job model. `UnifiedJob` is a read projection. `CanonicalJob` is now the stable domain contract. The migration direction is:

```text
P2 journal → CanonicalJob → V2 read models / Pipeline dispatch
```

The journal remains durable evidence until a later migration proves an equivalent or stronger store.

### Asset

`v2-library.ts` currently derives assets from journal references. `p3-archive.ts` has stronger archive evidence fields (asset id, filename, SHA256, size, destination). The canonical Asset contract therefore keeps provenance + content evidence and must eventually consume both sources without deleting either.

### QA

Job generation success and QA are already separate in `v2-jobs.ts` / `p3-archive.ts`. Canonical QA must preserve that separation. A successful Engine call can only produce `SUCCEEDED`; it cannot create `QA_PASS` or `VERIFIED_ARCHIVE` by itself.

### Archive

`p3-archive.ts` is the current strongest archive authority: Manifest archive history, target verification, SHA256/size verification, delete-last ordering and archive journal. Canonical Archive must project this authority, not replace it.

## Pipeline mapping

| Business Pipeline | Existing evidence | Current production state |
|---|---|---|
| Product Image | SC01 + SW01 + SD01 code paths; P2 Job/journal; P3 archive | validated/active core |
| Scene Image | QA01/QR01/QP01/QC01 registry vocabulary + R&D evidence | R&D only; not registered |
| 3D Model | separate reconstruction research and PDP contract | planned MVP; non-blocking |

## Engine boundary

Current `v2-production.ts` already distinguishes workflow capability from execution engine and blocks unbound adapters for SW01/SD01 and Scene workflows. This behavior is retained. The new canonical `EngineAdapter` contract formalizes the same rule: engine output is evidence for a Job, not business authority.

## P1 next action

Add a thin canonical projection service around the existing journal/archive/library sources. It should be read-first and side-effect-free. Only after projection parity is demonstrated should any write path be migrated.

## Safety invariants

- RAW/source remains immutable;
- no-overwrite remains mandatory;
- existing Manifest/journal/archive records are not rewritten;
- QA remains independent from generation success;
- Engine adapters cannot promote assets to formal Archive;
- Scene and 3D cannot gain production authority merely by appearing in a registry;
- paid-provider safety remains fail-closed.
