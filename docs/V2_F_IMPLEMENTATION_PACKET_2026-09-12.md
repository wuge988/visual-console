# Visual Console V2-F — Creation Canvas

Date: 2026-09-12

Status: `STARTED / BRANCH_CREATED / CANVAS_DOMAIN_FOUNDATION_NEXT / P5_UNCHANGED / CLOUD_DISABLED`

## Goal

Implement the frozen V2 Creation Canvas as a Visual Production Orchestrator, not a raw ComfyUI clone.

The Canvas must compose existing Visual Console domain truth — Exact Piece, assets, prompts, workflows, models, QA and archive boundaries — without creating a second execution engine or bypassing existing authoritative mutation paths.

## Frozen node families

```text
INPUT
  Exact Piece
  Source Photos
  Cutout
  Reference

CONTEXT
  Manifest
  Measurements
  Material Board

PROMPT
  Prompt Template
  Prompt Draft

EXECUTION
  Workflow
  Model
  Generate
  Batch

REVIEW
  Compare
  Automated QA
  Human Gate

OUTPUT
  Evidence
  Archive Candidate
```

## First implementation slice

### Route

- `/v2/canvas` — Creation Canvas.

### Canvas behavior

The first slice must establish:

- node / edge schema;
- local draft workflow creation;
- drag / connect / pan / zoom interaction through a Vue-native canvas adapter;
- selected-node inspector;
- explicit save / version semantics;
- workflow library list;
- autosave of draft UI state only;
- preview/read-only production truth from existing registries/assets;
- no automatic execution.

### Authority boundary

Canvas workflow definitions are design/draft metadata only.

They MUST NOT by themselves:

- register a production workflow;
- enable a Site Profile capability;
- mutate Workflow Registry execution truth;
- submit a generation job;
- spend cloud budget;
- mark QA PASS;
- promote formal Evidence/Archive;
- overwrite RAW/source assets.

Execution remains delegated to approved adapters such as the existing V2-E / P2 SC01 path.

## Storage target

Use a site-scoped, local-only Canvas draft store under the existing control root. It must remain separate from authoritative Manifest, job journal, derivative journal and archive journal truth.

Recommended durable shape:

```text
control_root/
  canvas/
    index.json
    workflows/
      <canvas_workflow_id>/
        draft.json
        versions/
          v001.json
          v002.json
```

The store must be rebuildable/isolated and must never be interpreted as production workflow registration.

## Safety

1. Local-only API access.
2. Fail closed on malformed graph/schema/version data.
3. No path supplied by the browser is trusted as a filesystem path.
4. Existing Manifest/journal/D-E-F provenance remains authoritative.
5. Canvas autosave never changes production workflow enablement.
6. `Generate` / `Batch` nodes are orchestration intent until an approved adapter is explicitly invoked.
7. Human Gate and Archive Candidate nodes cannot self-approve.
8. Cloud remains disabled/fail-closed.
9. Active P5 PR #9 / QA01 remain unchanged.

## Acceptance criteria for first gate

- `/v2/canvas` uses the approved V2 shell;
- empty/new canvas is understandable without raw ComfyUI concepts;
- user can add nodes from the frozen families;
- edges can connect nodes without changing production truth;
- selected node opens a business-level inspector;
- draft graph can autosave locally and explicit Save Version creates immutable version metadata;
- Workflow Library can reopen saved Canvas workflows;
- no Canvas action silently executes a production job;
- full CI remains green;
- target Windows Human Visual Gate is required before merge.

## Branch / PR

- base main after V2-E squash merge: `e08d528294d885623551e36b9b06ef119a1f4333`;
- branch: `feat/v2-f-creation-canvas`;
- PR: Draft to be opened;
- active P5 PR #9 remains separate and unchanged.

## Current Gate

`CANVAS_DOMAIN_FOUNDATION_NEXT / DRAFT_BRANCH / CLOUD_DISABLED / P5_UNCHANGED`
