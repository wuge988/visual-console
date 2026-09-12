# Visual Console V2-G — Shared Shell + Canvas Copilot Integration

Date: 2026-09-12

Status: `IMPLEMENTED / RUNTIME_EXACT_HEAD_CI_600_PASS / WINDOWS_INTEGRATION_VISUAL_GATE_NEXT / PR18_DRAFT_OPEN_UNMERGED / CLOUD_DISABLED / P5_UNCHANGED`

## Purpose

Complete the bounded follow-up allowed after the V2-G first-slice Human Visual Gate PASS.

The first Visual Copilot slice was squash-merged to `main` as commit `42e811f8091d3b224765c2f7a361f5377a6cf1b0`. This follow-up does not add a model provider or any new mutation authority. It integrates the already-approved local Copilot surface into the shared V2 navigation and adds a compact Creation Canvas handoff dock.

## Scope

### Shared V2 navigation

All `/v2*` surfaces now receive an idempotent Visual Copilot entry under the existing Production navigation group.

The integration:

- reuses `.v2-nav-item` shell styling;
- places Visual Copilot after Creation Canvas when that item exists;
- shows the `LOCAL` badge;
- marks the entry active on `/v2/copilot`;
- avoids duplicate entries on the native Copilot page;
- does not change Jobs / QA / Assets / Evidence / System truth.

### Creation Canvas dock

`/v2/canvas` receives a bounded `Copilot` launcher in the existing command bar.

The dock is closed by default and therefore does not change the approved first-screen Canvas composition until the operator opens it.

When opened it displays:

- `VISUAL COPILOT · CANVAS DOCK`;
- `DRAFT ONLY`;
- `$0 PROVIDER`;
- `NO MUTATION`;
- `Authority: DRAFT_SUGGESTION_ONLY`;
- explicit statement that the Canvas remains `CANVAS_DRAFT_ONLY`;
- the currently selected Canvas workflow label;
- handoffs for Analyze Piece / Draft Prompt / Scene Plan / full Visual Copilot.

The dock does not execute any Copilot action itself. It performs a route handoff to the already-approved `/v2/copilot` surface with an action deep-link.

### Copilot action deep-link

The integration reads the optional `action` query parameter on `/v2/copilot` and activates the matching existing local action after the approved Copilot UI mounts.

Supported values:

- `ANALYZE_PIECE`;
- `DRAFT_PROMPT`;
- `SCENE_PLAN`;
- `REFERENCE_NEEDS`;
- `COMPARE_OUTPUTS`;
- `DIAGNOSE_QA`;
- `REVISE_PROMPT`;
- `RETRY_DRAFT`.

This is UI state only. It does not create a job, retry, mutate Prompt Registry, mutate Canvas, call Cloud, mark QA, or archive.

## Implementation

New files:

- `apps/web/src/v2-g-shell-canvas-integration.ts`;
- `apps/web/src/v2-g-shell-canvas-integration.css`.

Updated:

- `apps/web/src/main.ts`.

The integration is installed only for `/v2*` routes after the selected Vue app is mounted.

The final runtime code also guards Canvas dock context synchronization so the MutationObserver does not churn on redundant same-value text updates.

## Authority boundaries

The follow-up preserves both distinct authorities:

- Visual Copilot: `DRAFT_SUGGESTION_ONLY`;
- Creation Canvas: `CANVAS_DRAFT_ONLY`.

It must not:

- call OpenAI / Seedance / any paid provider;
- submit or retry a job;
- mutate Prompt Registry;
- mutate Workflow / Model Registry;
- approve Human Visual Gate;
- set `ARCHIVE_READY` / `VERIFIED_ARCHIVE`;
- overwrite RAW/source;
- silently fall back to Cloud;
- touch P5 PR #9 / QA01.

## Automated verification

Runtime exact head: `a98d1306d0e5a225d05f09b1ec3642774a21e2d7`.

CI #600: `PASS`.

CI passed:

- Windows physical self-check parsing;
- validation-page JavaScript parsing;
- `npm ci`;
- full `npm test`;
- Vue/TypeScript typecheck;
- full web/server build.

The implementation adds no backend mutation path and no provider dependency.

## Required Windows integration verification

1. target Windows `/v2` or `/v2/system` must show a single Visual Copilot Production nav entry without density breakage;
2. `/v2/canvas` closed state must retain approved composition apart from the bounded Copilot launcher;
3. opening the Canvas Copilot dock must remain readable at target viewport;
4. dock authority text must be explicit;
5. clicking `Scene Plan` must hand off to `/v2/copilot?action=SCENE_PLAN...` and activate the existing Create Scene Plan action;
6. blocked scene capability must still display `SCENE_WORKFLOW_NOT_EFFECTIVE` rather than becoming executable;
7. no provider/cost/job/QA/archive mutation may occur.

## Branch / PR

- base main: `42e811f8091d3b224765c2f7a361f5377a6cf1b0`;
- branch: `feat/v2-g-shell-canvas-integration`;
- PR #18: `Draft / Open / Unmerged`;
- runtime exact head: `a98d1306d0e5a225d05f09b1ec3642774a21e2d7`;
- CI #600: `PASS`;
- Cloud remains disabled/fail-closed;
- P5 PR #9 / QA01 remain unchanged.

## Gate

`SHELL_NAV_INTEGRATED / CANVAS_DOCK_INTEGRATED / RUNTIME_EXACT_HEAD_CI_600_PASS / WINDOWS_INTEGRATION_VISUAL_GATE_NEXT / PR18_DRAFT_OPEN_UNMERGED / CLOUD_DISABLED / P5_UNCHANGED`
