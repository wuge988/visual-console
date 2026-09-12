# Visual Console V2-E — Production Composer

Date: 2026-09-12

Status: `CAPABILITY_FOUNDATION_PASS / VISIBLE_SURFACES_COMPLETE / CI_569_PASS / WINDOWS_HUMAN_VISUAL_GATE_NEXT / PR15_DRAFT_OPEN_UNMERGED / P5_UNCHANGED / CLOUD_DISABLED`

## Goal

Implement the frozen Generation Composer pattern for Image / Scene / Batch production using registry-driven truth while reusing existing validated write/runtime paths.

V2-E must not introduce a second queue, duplicate renderer, or hidden cloud fallback.

## Frozen composer flow

```text
Exact Piece / Reference
        ↓
Prompt / Prompt Template
        ↓
Workflow
        ↓
Model / Engine capability
        ↓
Output parameters
        ↓
Cost estimate + truth checks
        ↓
Create Job
```

## Implemented first slice

### Routes

- `/v2/production/image` — single Image Generation composer;
- `/v2/production/scene` — Scene Generation composer;
- `/v2/production/batch` — Batch Generation composer.

The new routes use the approved V2 shell, global job monitor and grouped Production / Jobs / Quality / Assets / Evidence / System navigation.

### Execution boundary

The first executable adapter is SC01 only, because it already has an authoritative P2 queue/journal mutation path:

- endpoint: `POST /api/jobs/batch`;
- source role: `RAW_SOURCE`;
- batch max: 20;
- engine: local ComfyUI;
- prompt: not required by frozen SC01 runtime;
- output: cutout master candidate;
- QA remains independent and required after generation.

V2-E calls this existing mutation; it does not reproduce it inside a new V2 job store.

SW01 / SD01 remain visible capability facts but are blocked in the first composer slice until the composer has a proven formal `VERIFIED_CUTOUT` source projection. Scene workflows remain blocked because QA01 / QR01 / QP01 / QC01 are not effectively executable and no approved scene submission adapter is bound.

### Capability projection

New localhost-only read API:

- `GET /api/v2/production/capabilities?site_id=...`.

It projects business-level composer capability from Workflow Registry + runtime binding truth:

- mode;
- workflow code;
- engine;
- effective executable state;
- required source role;
- prompt requirement;
- batch limit;
- submit adapter availability;
- explicit block reason;
- cloud/cost status.

No capability endpoint makes a workflow executable by itself.

Current adapter truth:

- `SC01` → `IMAGE / BATCH`, `RAW_SOURCE`, `COMFYUI`, existing `P2_SC01_BATCH` adapter when effective executable;
- `SW01 / SD01` → visible but blocked with `VERIFIED_CUTOUT_PROJECTION_NOT_BOUND` when otherwise executable;
- `QA01 / QR01 / QP01 / QC01` → `SCENE`, prompt required, blocked while workflow/runtime truth is unavailable;
- export workflows are omitted from Composer capability projection.

### Composer UI

`V2ProductionApp.vue` implements a business-level production composer rather than a ComfyUI graph editor.

The visible flow is:

1. Exact Piece / Source;
2. Prompt / Template;
3. Workflow;
4. Model / Engine;
5. Output Parameters;
6. Truth Checks + Cost + Create Job.

Important behavior:

- Image mode permits one RAW source for SC01;
- Batch mode permits one SKU with up to the capability batch limit;
- Scene mode renders a truthful blocked state instead of borrowing RAW/generated rows as fake verified scene inputs;
- Prompt Registry remains authoritative; no prompt is reconstructed from chat/task history;
- engine health comes from `/api/v2/engines/health`;
- model facts come from Model Registry;
- local estimated cost is `$0.00`; Cloud remains disabled/fail-closed;
- submit requires explicit user confirmation;
- if ComfyUI is offline, SC01 Create Job remains disabled and no Cloud fallback occurs.

## Safety

1. No new job store or queue.
2. No hidden Cloud escalation.
3. Unknown / disabled workflow remains blocked.
4. Scene composer may render a truthful blocked state; it must not fabricate runnable scene generation.
5. SC01 submit reuses the existing P2 mutation and preserves Human Visual Gate downstream.
6. RAW/source remains immutable.
7. Generation success does not imply QA PASS or formal archive readiness.
8. P5 PR #9 / QA01 remain unchanged.

## Verification

### First full visible-surface head

Exact head: `4fca3f156cebd655a4f939dfade4c8ae0e27f395`.

CI #568:

- Windows physical self-check parsing — PASS;
- validation-page JavaScript parsing — PASS;
- `npm ci` — PASS;
- full `npm test` — PASS (`85/85`);
- `npm run build` — FAIL on a TypeScript nullability guard in `v2-production.ts`.

The failure was code-local and was fixed without changing runtime semantics.

### Current exact head

Exact branch head: `bf541529830205c5e7b7daa379720ead870af354`.

CI #569: `PASS`.

This exact-head CI includes the V2-E capability tests, full existing server test suite and production build.

## Current Gate

Next hard gate is the target Windows Human Visual Gate for:

1. `/v2/production/image`;
2. `/v2/production/scene`;
3. `/v2/production/batch`.

Expected current-machine truth when ComfyUI is offline:

- global System may remain `DEGRADED`;
- Image/Batch may show valid SC01 capability but Create Job must remain disabled because the engine is offline;
- Scene must remain blocked because formal source/runtime/adapter truth is not yet available;
- Cloud must remain disabled and must not appear as an automatic fallback.

Do not mark PR #15 Ready or merge until these surfaces pass the target Windows visual gate and any shared-shell inconsistencies exposed by the review are resolved.

## Acceptance criteria

- Image composer can select an Exact Piece RAW source and expose only valid SC01 controls;
- Batch composer enforces one SKU per batch and maximum 20 source assets;
- Scene composer explains why current scene generation is unavailable rather than silently switching engine/provider;
- workflow/model/engine state comes from registries/health, not hard-coded UI optimism;
- local cost displays zero without implying cloud pricing support;
- SC01 submission creates jobs only through the existing authoritative endpoint;
- exact-head full CI stays green;
- target Windows Human Visual Gate is required before merge.

## Branch / PR

- base main after V2-D merge/status sync: `248f9ae31148678ac45c813be715fd1af68d6fad`;
- branch: `feat/v2-e-production-composer`;
- PR #15: `Draft / Open / Unmerged`;
- current exact head: `bf541529830205c5e7b7daa379720ead870af354`;
- CI #569: `PASS`;
- active P5 PR #9 remains separate and unchanged.
