# Visual Console V2-G — Visual Copilot

Date: 2026-09-12

Status: `LOCAL_CONTEXT_ADVISOR_COMPLETE / VISIBLE_SURFACE_COMPLETE / CI_595_PASS / WINDOWS_HUMAN_VISUAL_GATE_NEXT / PR17_DRAFT_OPEN_UNMERGED / CLOUD_DISABLED / P5_UNCHANGED`

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

All outputs are presented under `authority=DRAFT_SUGGESTION_ONLY` and surface the known facts, suggestions, blockers/unknowns and explicit handoff route.

Important bounded behavior:

- `Draft Prompt Skeleton` produces a deterministic scaffold only and never writes Prompt Registry;
- `Create Scene Plan` reads actual Workflow Registry effectiveness and stays blocked when scene workflows are not effective;
- `Suggest Reference Needs` names missing reference categories but does not fabricate/download assets;
- `Compare Outputs` compares only registered derivative state and does not infer visual quality from filenames;
- `Diagnose QA Failure` only reports recorded durable-job truth and conservative next steps;
- `Create Retry Draft` does not call the retry endpoint; it only identifies the eligible failed job and hands off to `/v2/jobs/failed`.

## Route

Initial gated route:

- `/v2/copilot` — Visual Copilot Preview.

The route deliberately stays out of the shared runtime sidebar until the Human Visual Gate passes. The preview itself displays `Visual Copilot` as active in its own V2 shell so the proposed final navigation density can be reviewed without changing all existing V2 surfaces prematurely.

After Human Visual PASS, shared-sidebar and Canvas-dock integration may proceed as a bounded follow-up.

## Visible surface

New frontend:

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

## Verification

Runtime/UI exact head before this documentation sync: `657468ec5d6ee3b15aa30473246e66ca45919fca`.

CI #595: `PASS`.

CI passed:

- Windows physical self-check parsing;
- validation-page JavaScript parsing;
- `npm ci`;
- full `npm test`;
- Vue/TypeScript typecheck and full build.

No backend mutation path was added by this slice.

## Current hard gate

Target Windows Human Visual Gate is required for `/v2/copilot` before:

- PR #17 can become Ready/merge;
- Visual Copilot appears in the shared runtime Sidebar;
- the Copilot surface is docked into Creation Canvas;
- any provider-backed AI adapter work is connected to this UI.

Review must confirm:

1. page reads as a production assistant rather than an imitation chat app;
2. context selector and truth snapshot are understandable;
3. action palette / Draft Output / Authority Guard proportions are usable at target desktop viewport;
4. deterministic actions expose truthful blockers rather than hallucinated capability;
5. `DRAFT_SUGGESTION_ONLY`, `$0 provider cost`, no-job-mutation and no-Cloud semantics are visually explicit;
6. no sidebar-density or Global Monitor regression.

## Branch / PR

- base main after V2-F squash merge: `5f41e33b397aa7a96ea82e312d9dd9173cd8e5eb`;
- branch: `feat/v2-g-visual-copilot`;
- PR #17: `Draft / Open / Unmerged`;
- runtime/UI head: `657468ec5d6ee3b15aa30473246e66ca45919fca`;
- CI #595: `PASS`;
- target hard gate: Windows Human Visual Gate;
- Cloud remains disabled/fail-closed;
- active P5 PR #9 remains separate and unchanged.
