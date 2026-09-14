# Visual Console — Implementation Plan

Date: 2026-09-14
Status: `ACTIVE / EXECUTION_ORDER_FROZEN`
Authority: `docs/CANONICAL_ARCHITECTURE_2026-09-14.md`

## Objective

Turn the consolidated Visual Console architecture into one practical visual-production system for Exact Pieces without creating another competing control plane.

## Master plan

| Phase | Work package | Main output | Acceptance | Status |
|---|---|---|---|---|
| P0 | Architecture consolidation | One Control Plane + authority cleanup | main/Notion agree; abandoned PRs closed; canonical docs live | DONE |
| P1 | Core Truth Consolidation | canonical Exact Piece/Capture/Job/Asset/QA/Archive contract and legacy bridge | existing production evidence remains explainable; tests/build/CI pass | IN PROGRESS |
| P2 | UX Consolidation | simple daily workflow; internals under Advanced | Select Piece → Create → Review → Archive/Publish | PLANNED |
| P3-A | Aquarium Scene MVP | first bounded Scene workflow | identity + realism + QA + cost/time gates pass | PLANNED |
| P3-B | 3D MVP | first controlled reconstruction workflow | frame/mask/reconstruction/GLB/3D QA pass | PLANNED |
| P4 | Engine/Workflow Freeze | versioned executable workflow registry | reproducible approved workflow + provenance | PLANNED |
| P5 | Production Registration | registered Product/Scene/3D pipelines | controlled production execution | PLANNED |
| P6 | PDP/Site Publish | storefront handoff | 2D standalone; 3D progressive enhancement/fallback | PLANNED |

## P1 execution sequence

1. **P1.1 Inventory — DONE** — current `apps/server`, V2 read models, archive, registry and cloud boundaries mapped in `docs/P1_CORE_TRUTH_MAPPING_2026-09-14.md`.
2. **P1.2 Contract — DONE (first slice)** — canonical Exact Piece / Capture Session / Job / Asset / QA / Archive contract added.
3. **P1.3 Adapter boundary — DONE (first slice)** — `EngineAdapter` establishes execution-only boundary; Product/Scene/3D remain business Pipelines.
4. **P1.4 Evidence bridge — DONE (first slice)** — P2 journal → canonical Asset/QA and archive record → canonical Archive projections added; no durable evidence mutation.
5. **P1.5 Thin consolidation — NEXT** — connect canonical projections to existing V2 Jobs/Library/Production read models without replacing persistence.
6. **P1.6 Contract tests — ACTIVE** — expand tests for lineage, QA separation, no-overwrite, recovery and archive invariants as P1.5 lands.
7. **P1.7 Merge gate — REQUIRED** — locked head, CI PASS where configured, squash merge, main ref verification and runtime verification where applicable.

## P1 evidence already established

- existing P2 `P2Job` remains the validated journal model;
- existing `p3-archive.ts` remains archive authority;
- `v2-jobs.ts` remains a read projection and must not become a second durable store;
- `v2-library.ts` currently projects journal-referenced source/generated assets;
- `v2-production.ts` already blocks unbound SW01/SD01/Scene submission adapters;
- cloud/provider safety remains fail-closed and is not part of P1 persistence migration.

## P2 execution sequence

1. consolidate navigation;
2. make Create the primary entry point for Product/Scene/3D/Batch;
3. make Review the single Human Visual Gate surface;
4. unify Library/Archive;
5. move activation/preflight/execution-intent/spend diagnostics into Settings → Advanced;
6. preserve backend enforcement and Cost Guard;
7. verify desktop + mobile usability.

## P3-A / P3-B parallel execution

After P2, Scene and 3D may run concurrently.

### Scene

Aquarium only. One pilot SKU. Fixed source package. Bounded Engine comparison. Protected identity/mask strategy. Human Visual Gate. No production registration before acceptance.

### 3D

One pilot SKU. Controlled matte/opaque capture. Frame QC. Wood-only segmentation/mask. Reconstruction. Mesh/texture cleanup. Scale calibration. GLB. 3D QA. No PDP blocking.

Shared: Exact Piece / Capture / Job / QA / Asset Registry / Archive.

Not shared: Scene generation algorithm vs 3D reconstruction algorithm.

## Explicit stop conditions

- no second Visual Console;
- no backend clone of a reference console;
- no open-source project as business authority;
- no Engine owning SKU/QA/Archive truth;
- no endless D0–D5 tuning without bounded benchmark;
- no 3D dependency that blocks PDP;
- no generated scene that overrides Exact Piece identity.

## Definition of Done

A phase is complete only when implementation, tests, build, CI, runtime evidence where applicable, GitHub main ref and Notion status all agree.
