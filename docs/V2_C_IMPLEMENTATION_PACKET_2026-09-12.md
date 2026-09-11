# Visual Console V2-C — Unified Jobs

Date: 2026-09-12

Status: `VISIBLE_SURFACES_IMPLEMENTED / CI_REQUIRED / HUMAN_VISUAL_GATE_NEXT / P5_UNCHANGED / CLOUD_DISABLED`

## Goal

Introduce a V2-native unified job truth without rewriting or weakening the existing P2 journal/runtime semantics.

V2-C reads the durable P2 job journal and separates generation, QA and archive state so a successful render cannot be confused with Human Visual Gate approval or formal archive readiness.

## Implemented projection

1. `GET /api/v2/jobs?site_id=...`.
2. Each current P2 job projects into independent V2 state dimensions:
   - generation: `QUEUED / RUNNING / SUCCEEDED / FAILED`;
   - QA: `NOT_REQUIRED / QA_PENDING / QA_PASS / QA_FAIL`;
   - archive: `STAGING / ARCHIVE_READY / VERIFIED_ARCHIVE / REJECTED`.
3. `legacy_state` is preserved for auditability and transition debugging.
4. Conservative `action_required` and `retryable` fields are projected.
5. Read-only filters support generation state, QA state, workflow, item and action.
6. The original P2 journal remains authoritative; V2-C does not create a second job store.

## V2-native visible surfaces

V2-C adds a dedicated Jobs workspace mounted inside the approved V2 visual language:

- `/v2/jobs` — Queue;
- `/v2/jobs/history` — History;
- `/v2/jobs/failed` — Failed / Retry.

The workspace keeps the approved V2 sidebar density and Global Job Monitor pattern. It shows Generation / QA / Archive as independent columns and exposes the legacy state only as audit context.

## Conservative truth mapping

- `READY / QUEUED` → generation `QUEUED`.
- `RUNNING / GENERATED` → generation `RUNNING`.
- `CAPTURED / QA_PENDING / QA_PASS / QA_FAIL` → generation `SUCCEEDED`.
- generation failures remain generation `FAILED`.
- `CAPTURED / QA_PENDING` → `QA_PENDING`.
- `QA_PASS` → `QA_PASS`.
- `QA_FAIL / FAILED_QA` → `QA_FAIL`.
- V2-C does **not** infer formal archive readiness from QA pass; projected archive remains `STAGING` until a formal archive adapter can prove readiness.
- QA failure projects archive `REJECTED`.

The V2 global summary is also corrected to fail closed: QA-passed but unarchived assets are counted as `archive.staging`, while `archive.ready` remains `0` until a dedicated archive adapter exists.

## Retry boundary

V2-C reuses the existing authoritative P2 retry mutation; it does not add a second queue/write path.

Before calling the existing retry endpoint, the V2 Jobs workspace primes the P2 in-memory job map from `/api/jobs?site_id=...`. This makes retry reliable after a server restart while preserving the durable journal and existing P2 queue semantics.

Retry behavior:

- available only for failed submit/runtime/capture/QA and `QA_FAIL`;
- creates a new queued job;
- never overwrites the original job;
- requires an explicit user click and confirmation;
- does not trigger Cloud fallback.

## System truth

The Jobs workspace uses `/api/v2/engines/health` for the top-level system status. It does not equate ComfyUI offline with overall system status unless the current effective workflow set actually requires ComfyUI.

## Safety

V2-C does not:

- rewrite historical job snapshots;
- mutate Manifest or formal archive;
- create a parallel queue engine;
- alter SC01 registration;
- enable QA01/P5;
- call Cloud providers;
- change Cost Guard;
- touch active P5 PR #9.

## Gate sequence

1. backend projection CI — PASS at initial head `2f073798f592aba68ce9ad21a7a7c76d58de0309`, CI #532;
2. visible Queue / History / Failed implementation;
3. retry/system/archive-truth corrections;
4. exact-head CI;
5. target Windows browser Human Visual Gate;
6. only after PASS: PR #13 ready + squash merge.
