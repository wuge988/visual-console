# Visual Console V2-F — Creation Canvas

Date: 2026-09-12

Status: `DOMAIN_FOUNDATION_PASS / VISIBLE_SURFACE_COMPLETE / CI_582_PASS / WINDOWS_HUMAN_VISUAL_GATE_NEXT / PR16_DRAFT_OPEN_UNMERGED / P5_UNCHANGED / CLOUD_DISABLED`

## Goal

Implement the frozen V2 Creation Canvas as a Visual Production Orchestrator, not a raw ComfyUI clone.

The Canvas composes existing Visual Console domain truth — Exact Piece, assets, prompts, workflows, models, QA and archive boundaries — without creating a second execution engine or bypassing existing authoritative mutation paths.

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

## Implemented first slice

### Route

- `/v2/canvas` — Creation Canvas.

### Domain / persistence foundation

New local-only service: `apps/server/src/v2-canvas.ts`.

APIs:

- `GET /api/v2/canvas/workflows`;
- `GET /api/v2/canvas/workflows/:workflowId`;
- `POST /api/v2/canvas/workflows`;
- `POST /api/v2/canvas/workflows/:workflowId/draft`;
- `POST /api/v2/canvas/workflows/:workflowId/versions`.

Canvas storage is site-scoped beneath the existing control root:

```text
control_root/
  canvas/
    workflows/
      <canvas_workflow_id>/
        draft.json
        versions/
          v001.json
          v002.json
```

The store is deliberately separate from authoritative Manifest, P2 job journal, derivative journal and archive journal truth.

Every persisted Canvas record declares:

- `authority=CANVAS_DRAFT_ONLY`;
- `production_executable=false`.

Explicit versions are immutable (`v001.json`, `v002.json`, …) and are never interpreted as Workflow Registry registration.

### Graph safety

Server validation currently enforces:

- frozen node kind → family mapping;
- unique safe node/edge IDs;
- no dangling/self edges;
- maximum 200 nodes / 500 edges;
- bounded primitive node config only;
- bounded coordinates and zoom;
- strict `cw_<uuid>` workflow identity;
- local-only request boundary.

Malformed/corrupt drafts are not promoted into the Workflow Library.

### Visible Canvas surface

New frontend:

- `V2CanvasApp.vue`;
- `v2-f-canvas.css`;
- `/v2/canvas` mounting through `main.ts`.

Visible behaviors:

- Workflow Library selector;
- explicit `New Workflow` action;
- Node Library grouped by INPUT / CONTEXT / PROMPT / EXECUTION / REVIEW / OUTPUT;
- drag nodes;
- connect node ports;
- pan / zoom;
- undo / redo;
- fit view;
- Preview mode;
- draft autosave;
- explicit Save Draft;
- explicit immutable Save Version;
- selected-node Inspector;
- business-level node metadata rather than raw ComfyUI graph controls.

A newly created workflow receives a safe starter orchestration:

`Exact Piece + Source Photos → Prompt Template → Workflow → Generate → Human Gate → Archive Candidate`.

This starter graph is draft metadata only; creating it does not execute any generation.

### Authority boundary

Canvas workflow definitions MUST NOT by themselves:

- register a production workflow;
- enable a Site Profile capability;
- mutate Workflow Registry execution truth;
- submit a generation job;
- spend cloud budget;
- mark QA PASS;
- promote formal Evidence/Archive;
- overwrite RAW/source assets.

`Generate` / `Batch` are orchestration intent nodes until a separately approved adapter is explicitly invoked. Human Gate and Archive Candidate nodes cannot self-approve.

Execution remains delegated to approved mutation paths such as V2-E / P2 SC01.

## Verification

### Automated tests

Canvas-focused tests cover:

- valid frozen node families;
- family drift rejection;
- dangling/self-edge rejection;
- unsafe config and viewport constraints.

Current full server suite: `89/89 PASS`.

### CI history

- backend/domain foundation head `4c1eb4b2f89fe59fde0d0b80c4ca52b1bc7f2c39` — CI #578 PASS;
- initial visible-surface head `4ed698d1e4c7dabc5043ed701c1521722e3078e2` — tests PASS; web typecheck found only ES target incompatibility from two `String.replaceAll` usages;
- compatibility fix head `4c689c068c8d79bc52cbc0486f744c5a5c0bc948` — CI #582 PASS.

CI #582 passed:

- Windows physical self-check parsing;
- validation-page JavaScript parsing;
- `npm ci`;
- full `npm test`;
- full server/web build and Vue TypeScript check.

## Safety

1. Local-only API access.
2. Fail closed on malformed graph/schema/version data.
3. Browser values are never accepted as filesystem paths.
4. Existing Manifest/journal/D-E-F provenance remains authoritative.
5. Canvas autosave never changes production workflow enablement.
6. Generate / Batch nodes do not auto-run.
7. Human Gate / Archive Candidate cannot self-approve.
8. Cloud remains disabled/fail-closed.
9. Active P5 PR #9 / QA01 remain unchanged.

## Current hard gate

Target Windows Human Visual Gate is now required for `/v2/canvas` before PR #16 can become Ready or merge.

Review must confirm:

- approved V2 shell/global monitor remains coherent;
- dark Canvas workspace hierarchy is readable;
- Node Library / graph / Inspector proportions are usable at the target desktop viewport;
- starter graph is understandable without ComfyUI concepts;
- selected-node Inspector clearly communicates `CANVAS_DRAFT_ONLY`;
- save/version controls look operational without implying production execution;
- no overflow/clipping or sidebar-density regression.

## Branch / PR

- base main after V2-E squash merge: `e08d528294d885623551e36b9b06ef119a1f4333`;
- branch: `feat/v2-f-creation-canvas`;
- PR #16: `Draft / Open / Unmerged`;
- current visible-surface exact head: `4c689c068c8d79bc52cbc0486f744c5a5c0bc948`;
- CI #582: `PASS`;
- active P5 PR #9 remains separate and unchanged.

## Current Gate

`VISIBLE_SURFACE_COMPLETE / EXACT_HEAD_CI_582_PASS / WINDOWS_HUMAN_VISUAL_GATE_NEXT / PR16_DRAFT_OPEN_UNMERGED / CLOUD_DISABLED / P5_UNCHANGED`
