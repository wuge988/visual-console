# Visual Console V2-G — Shared Shell + Canvas Copilot Integration

Date: 2026-09-12

Status: `WINDOWS_INTEGRATION_VISUAL_GATE_PASS / CI_600_PASS / CI_601_PASS / READY_FOR_SQUASH_MERGE / CLOUD_DISABLED / P5_UNCHANGED`

## Purpose

Complete the bounded follow-up allowed after the V2-G first-slice Human Visual Gate PASS.

The first Visual Copilot slice was squash-merged to `main` as commit `42e811f8091d3b224765c2f7a361f5377a6cf1b0`. This follow-up does not add a model provider or any new mutation authority. It integrates the approved local Copilot surface into the shared V2 navigation and adds a compact Creation Canvas handoff dock.

## Scope

### Shared V2 navigation

All `/v2*` surfaces receive an idempotent Visual Copilot entry under the existing Production navigation group.

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

The dock does not execute any Copilot action itself. It performs a route handoff to the approved `/v2/copilot` surface with an action deep-link.

### Copilot action deep-link

The integration reads the optional `action` query parameter on `/v2/copilot` and activates the matching existing local action after the Copilot UI mounts.

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

The runtime code also guards Canvas dock context synchronization so the MutationObserver does not churn on redundant same-value text updates.

## Authority boundaries

The follow-up preserves both distinct authorities:

- Visual Copilot: `DRAFT_SUGGESTION_ONLY`;
- Creation Canvas: `CANVAS_DRAFT_ONLY`.

It does not:

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

Runtime exact head: `a98d1306d0e5a225d05f09b1ec3642774a21e2d7` — CI #600 `PASS`.

Branch/documentation head before this gate record: `a26ac5603719f98a62891ea8ea1b1e15cb082ad8` — CI #601 `PASS`.

CI passed:

- Windows physical self-check parsing;
- validation-page JavaScript parsing;
- `npm ci`;
- full `npm test`;
- Vue/TypeScript typecheck;
- full web/server build.

No backend mutation path and no provider dependency were added.

## Windows integration visual gate

Result: `PASS`.

Target Windows screenshots confirm:

1. `/v2/system` shows exactly one `Visual Copilot · LOCAL` Production-nav entry and the sidebar remains readable;
2. `/v2/canvas` retains the approved composition and exposes a bounded Copilot launcher;
3. the opened Canvas Copilot dock is readable and explicitly displays `DRAFT ONLY`, `$0 PROVIDER`, `NO MUTATION`, `DRAFT_SUGGESTION_ONLY`, and Canvas draft-only authority;
4. `Scene Plan` handoff opens Visual Copilot with `Create Scene Plan` selected;
5. scene truth remains blocked and visibly reports `SCENE_WORKFLOW_NOT_EFFECTIVE`;
6. no provider/cost/job/QA/archive mutation is exposed by the integration surface.

The screenshots also confirm the shared shell and Global Monitor remain visually stable.

## Branch / PR

- base main: `42e811f8091d3b224765c2f7a361f5377a6cf1b0`;
- branch: `feat/v2-g-shell-canvas-integration`;
- PR #18: `Draft / Open / Unmerged` at gate-record time;
- runtime exact head: `a98d1306d0e5a225d05f09b1ec3642774a21e2d7`;
- CI #600: `PASS`;
- CI #601: `PASS`;
- Cloud remains disabled/fail-closed;
- P5 PR #9 / QA01 remain unchanged.

## Gate

`SHELL_NAV_INTEGRATED / CANVAS_DOCK_INTEGRATED / WINDOWS_INTEGRATION_VISUAL_GATE_PASS / CI_600_PASS / CI_601_PASS / READY_FOR_SQUASH_MERGE / CLOUD_DISABLED / P5_UNCHANGED`
