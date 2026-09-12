# Visual Console V2-G — Visual Copilot

Date: 2026-09-12

Status: `FIRST_SLICE_HUMAN_VISUAL_GATE_PASS / LOCAL_CONTEXT_ADVISOR_COMPLETE / EXACT_RUNTIME_CI_596_PASS / READY_FOR_SQUASH_MERGE / CLOUD_DISABLED / P5_UNCHANGED`

## Goal

Implement Visual Copilot as a context-aware production assistant while preserving every frozen Visual Console authority boundary.

V2-G starts **without a paid or external model provider**. The first slice is a local deterministic context advisor that reads existing V2 truth APIs and produces structured draft/suggestion output only. Provider-backed generative AI is deferred until an explicit provider adapter and Cost Guard path exists.

## First-slice principles

1. `LOCAL_CONTEXT_ADVISOR` first — zero provider cost.
2. Read existing authoritative V2 projections; do not create a second truth store.
3. Suggestions/drafts only; no production mutation.
4. No silent Cloud escalation.
5. No Human Gate substitution.
6. No formal Archive promotion.
7. No RAW/source overwrite.
8. No P5/QA01 enablement changes.

## Context sources

The V2-G frontend reads existing localhost-only V2 APIs:

- `/api/v2/summary`;
- `/api/v2/engines/health`;
- `/api/v2/assets`;
- `/api/v2/jobs`;
- `/api/v2/registries/prompts`;
- `/api/v2/registries/workflows`;
- `/api/v2/registries/models`;
- `/api/v2/canvas/workflows`.

No new authoritative backend store is introduced in the first slice.

## Implemented local Copilot actions

The provider-free action set mirrors the frozen V2 design while clearly identifying provider-dependent limits:

- Analyze Piece;
- Draft Prompt Skeleton;
- Create Scene Plan;
- Suggest Reference Needs;
- Compare Outputs;
- Diagnose QA Failure;
- Revise Prompt Checklist;
- Create Retry Draft.

All outputs are presented under `authority=DRAFT_SUGGESTION_ONLY` and surface known facts, suggestions, blockers/unknowns and an explicit handoff route.

Important bounded behavior:

- `Draft Prompt Skeleton` produces a deterministic scaffold only and never writes Prompt Registry;
- `Create Scene Plan` reads actual Workflow Registry effectiveness and stays blocked when scene workflows are not effective;
- `Suggest Reference Needs` names missing reference categories but does not fabricate/download assets;
- `Compare Outputs` compares only registered derivative state and does not infer visual quality from filenames;
- `Diagnose QA Failure` only reports recorded durable-job truth and conservative next steps;
- `Create Retry Draft` does not call the retry endpoint; it only identifies the eligible failed job and hands off to `/v2/jobs/failed`.

## Route

- `/v2/copilot` — Visual Copilot.

The first-slice preview kept the route outside the shared runtime sidebar until Human Visual Gate PASS. That gate is now satisfied. Shared-sidebar and Canvas-dock integration may proceed as the next bounded V2-G follow-up.

## Visible surface

Frontend:

- `apps/web/src/V2CopilotApp.vue`;
- `apps/web/src/v2-g-copilot.css`;
- `/v2/copilot` mounting in `apps/web/src/main.ts`.

The page presents:

- Site Profile / Exact Piece context selector;
- local truth snapshot for RAW / Generated / Jobs / effective scene workflows / Prompt Registry / Canvas Drafts;
- eight local Copilot actions;
- structured Draft Output surface;
- blocker/unknown chips;
- handoff buttons into existing authoritative V2 surfaces;
- dedicated Authority Guard panel;
- clear `LOCAL RULES / READ ONLY / $0 PROVIDER COST` status.

The surface is intentionally a production assistant, not a chatbot pretending that an unavailable generative model is connected.

## Safety acceptance

V2-G first slice does not:

- call OpenAI/Seedance/other paid APIs;
- create or retry a production job;
- mutate Canvas draft automatically;
- write Prompt Registry entries;
- set QA PASS;
- set ARCHIVE_READY/VERIFIED_ARCHIVE;
- alter Model/Workflow Registry;
- overwrite RAW/source;
- touch P5 PR #9 / QA01.

## Automated verification

Runtime/UI exact reviewed head: `60d1c5245a8789a8ddbf79d3efb8dceb5d5015f3`.

CI #596: `PASS`.

CI passed:

- Windows physical self-check parsing;
- validation-page JavaScript parsing;
- `npm ci`;
- full `npm test`;
- Vue/TypeScript typecheck and full build.

No backend mutation path was added by this slice.

## Windows Human Visual Gate

PASS.

Target Windows browser evidence confirmed both required states at the target desktop viewport.

### Analyze Piece evidence

- Visual Copilot reads as a production assistant, not a chat imitation;
- Exact Piece selector and RAW / Generated / Jobs / Scene Effective / Prompts / Canvas Drafts truth snapshot are legible;
- action palette, Draft Output and Authority Guard proportions fit the target viewport without material clipping;
- `LOCAL RULES`, `READ ONLY`, `$0 PROVIDER COST` and `DRAFT_SUGGESTION_ONLY` are visually explicit;
- Authority Guard clearly states no provider call, no job/retry mutation, RAW/source immutable, Human Gate cannot self-approve, Archive cannot promote formal state, Cloud disabled/fail-closed;
- shared shell density and Global Monitor remain readable.

### Create Scene Plan evidence

- Scene truth reports `Scene registry entries: 4`;
- `Effective scene workflows: none`;
- `Prompt Registry entries: 0`;
- engine reports `DEGRADED`;
- the Copilot correctly exposes blocker `SCENE_WORKFLOW_NOT_EFFECTIVE`;
- it provides a handoff to Scene Generation instead of pretending the blocked capability can execute;
- no Cloud fallback or hidden provider escalation is surfaced.

This satisfies the hard behavioral requirement that unavailable scene capability must be represented as a blocker rather than hallucinated executable capability.

## Next bounded V2-G follow-up

After this first-slice squash merge:

1. add Visual Copilot to the shared V2 runtime sidebar;
2. add a bounded Copilot dock/launcher inside Creation Canvas;
3. keep Copilot authority `DRAFT_SUGGESTION_ONLY`;
4. keep Canvas authority `CANVAS_DRAFT_ONLY`;
5. run regression CI;
6. perform a final target Windows integration visual gate only if the shared-shell/Canvas changes materially alter the approved viewport composition.

Provider-backed AI remains deferred to V2-H Provider Adapter + Cost Guard.

## Branch / PR

- base main after V2-F squash merge: `5f41e33b397aa7a96ea82e312d9dd9173cd8e5eb`;
- branch: `feat/v2-g-visual-copilot`;
- PR #17: `Draft / Open / Unmerged` at the time of this gate record;
- runtime/UI exact reviewed head: `60d1c5245a8789a8ddbf79d3efb8dceb5d5015f3`;
- CI #596: `PASS`;
- Windows Human Visual Gate: `PASS`;
- Cloud remains disabled/fail-closed;
- active P5 PR #9 remains separate and unchanged.

## Gate

`FIRST_SLICE_HUMAN_VISUAL_GATE_PASS / RUNTIME_EXACT_HEAD_CI_596_PASS / READY_FOR_SQUASH_MERGE / CLOUD_DISABLED / P5_UNCHANGED`
