# Visual Console V2-G — Visual Copilot

Date: 2026-09-12

Status: `STARTED / LOCAL_CONTEXT_ADVISOR_FIRST / CLOUD_DISABLED / P5_UNCHANGED`

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

## Initial Copilot actions

The first local-rule action set mirrors the frozen V2 design while clearly identifying provider-dependent limits:

- Analyze Piece;
- Draft Prompt Skeleton;
- Create Scene Plan;
- Suggest Reference Needs;
- Compare Outputs;
- Diagnose QA Failure;
- Revise Prompt Checklist;
- Create Retry Draft.

All outputs carry:

- `authority=DRAFT_SUGGESTION_ONLY`;
- source facts used;
- blockers / unknowns;
- recommended next action;
- explicit mutation boundary.

`Create Retry Draft` does not call the retry endpoint; it only identifies the eligible failed job and provides a handoff to the existing V2-C Failed / Retry surface.

## Route

Initial gated route:

- `/v2/copilot` — Visual Copilot Preview.

The route stays out of the shared runtime sidebar until the Human Visual Gate passes. After gate, sidebar/Canvas docking can be integrated in a bounded follow-up without prematurely expanding navigation.

## Visual target

The first surface uses the approved V2 shell and presents:

- Site / Exact Piece context selector;
- local truth snapshot;
- action palette;
- structured Copilot draft output;
- Authority Guard panel;
- clear `LOCAL RULES / READ ONLY / $0 PROVIDER COST` status.

The page must look like a production assistant, not a chatbot pretending to have an unavailable model.

## Safety acceptance

V2-G first slice must not:

- call OpenAI/Seedance/other paid APIs;
- create or retry a production job;
- mutate Canvas draft automatically;
- write Prompt Registry entries;
- set QA PASS;
- set ARCHIVE_READY/VERIFIED_ARCHIVE;
- alter Model/Workflow Registry;
- touch P5 PR #9 / QA01.

## Branch / PR

- base main after V2-F merge: `5f41e33b397aa7a96ea82e312d9dd9173cd8e5eb`;
- branch: `feat/v2-g-visual-copilot`;
- Draft PR: next;
- target hard gate: Windows Human Visual Gate before shared-sidebar integration or merge.
