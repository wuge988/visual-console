# Visual Console V2-E — Production Composer

Date: 2026-09-12

Status: `STARTED / BRANCH_CREATED / CAPABILITY_ADAPTER_NEXT / P5_UNCHANGED / CLOUD_DISABLED`

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

## First implementation slice

### Routes

- `/v2/production/image` — single Image Generation composer;
- `/v2/production/scene` — Scene Generation composer;
- `/v2/production/batch` — batch composer.

### Execution boundary

The first executable adapter is SC01 only, because it already has an authoritative P2 queue/journal mutation path:

- endpoint: `POST /api/jobs/batch`;
- source role: `RAW_SOURCE`;
- batch max: 20;
- engine: local ComfyUI;
- prompt: not required by frozen SC01 runtime;
- output: cutout master candidate;
- QA remains independent and required after generation.

V2-E may call this existing mutation, but must not reproduce it inside a new V2 job store.

SW01 / SD01 remain visible capability facts but are not enabled in the first composer slice until the composer has a proven formal `VERIFIED_CUTOUT` source projection. Scene workflows remain blocked because QA01 / QR01 / QP01 / QC01 are not effectively executable.

### Capability projection

Add a localhost-only read endpoint that projects business-level composer capabilities from existing registry and runtime truth:

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

No capability endpoint may make a workflow executable by itself.

## Safety

1. No new job store or queue.
2. No hidden Cloud escalation.
3. Unknown / disabled workflow remains blocked.
4. Scene composer may render a truthful blocked state; it must not fabricate runnable scene generation.
5. SC01 submit reuses the existing P2 mutation and preserves Human Visual Gate downstream.
6. RAW/source remains immutable.
7. Generation success does not imply QA PASS or formal archive readiness.
8. P5 PR #9 / QA01 remain unchanged.

## Acceptance criteria

- Image composer can select an Exact Piece RAW source and expose only valid SC01 controls;
- Batch composer enforces one SKU per batch and maximum 20 source assets;
- Scene composer explains why current scene generation is unavailable rather than silently switching engine/provider;
- workflow/model/engine state comes from registries/health, not hard-coded UI optimism;
- local cost displays zero without implying cloud pricing support;
- SC01 submission creates jobs only through the existing authoritative endpoint;
- full CI stays green;
- target Windows Human Visual Gate is required before merge.

## Branch / PR

- base main after V2-D merge/status sync: `248f9ae31148678ac45c813be715fd1af68d6fad`;
- branch: `feat/v2-e-production-composer`;
- PR: Draft to be opened;
- active P5 PR #9 remains separate and unchanged.
