# Visual Console V2-F — Creation Canvas

Date: 2026-09-12

Status: `DOMAIN_FOUNDATION_PASS / WINDOWS_VISUAL_REVIEW_PARTIAL / GATE_POLISH_CI_585_PASS / FINAL_HUMAN_VISUAL_GATE_NEXT / PR16_DRAFT_OPEN_UNMERGED / P5_UNCHANGED / CLOUD_DISABLED`

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

Frontend:

- `V2CanvasApp.vue`;
- `v2-f-canvas.css`;
- `v2-f-gate-polish.css`;
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
- compatibility fix head `4c689c068c8d79bc52cbc0486f744c5a5c0bc948` — CI #582 PASS;
- first Windows-review polish head `105dee86adc29795b2da5275e3a6bcf22c625850` — CI #585 PASS.

CI #585 passed:

- Windows physical self-check parsing;
- validation-page JavaScript parsing;
- `npm ci`;
- full `npm test`;
- full server/web build and Vue TypeScript check.

### Windows visual review evidence

Received target-browser captures for:

1. empty Creation Canvas;
2. saved starter workflow with `SAVED` state;
3. panned starter workflow showing Workflow → Generate → Human Gate → Archive Candidate.

The review confirmed the dark workspace, V2 shell continuity, starter-node semantics and save-state communication are directionally correct. Two bounded presentation issues were visible on the target-height viewport: the studio consumed slightly more vertical space than the available first screen, and small palette/Inspector labels were marginal. `v2-f-gate-polish.css` tightens viewport height behavior and raises small-label readability without changing Canvas authority or graph semantics.

The current screenshot set does **not** yet prove the final Inspector/version acceptance points because the Inspector remains `NONE` and no immutable `v001`/later version label is visible. Final Human Visual Gate therefore remains open.

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

Final target Windows Human Visual Gate is required for `/v2/canvas` before PR #16 can become Ready or merge.

Final evidence must confirm:

- latest gate-polish head renders without first-screen clipping at the target desktop viewport;
- Node Library / graph / Inspector remain readable;
- selecting `Human Gate` opens the business-level Inspector and clearly shows the draft-only authority boundary;
- `Save Version` creates and visibly reports an immutable version (`v001` or later);
- no production execution, QA self-approval, archive promotion or Cloud fallback occurs.

## Branch / PR

- base main after V2-E squash merge: `e08d528294d885623551e36b9b06ef119a1f4333`;
- branch: `feat/v2-f-creation-canvas`;
- PR #16: `Draft / Open / Unmerged`;
- current exact head: `105dee86adc29795b2da5275e3a6bcf22c625850`;
- CI #585: `PASS`;
- active P5 PR #9 remains separate and unchanged.

## Current Gate

`WINDOWS_VISUAL_REVIEW_PARTIAL / EXACT_HEAD_CI_585_PASS / FINAL_HUMAN_VISUAL_GATE_NEXT / PR16_DRAFT_OPEN_UNMERGED / CLOUD_DISABLED / P5_UNCHANGED`
