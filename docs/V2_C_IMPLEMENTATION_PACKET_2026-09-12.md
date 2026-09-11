# Visual Console V2-C — Unified Jobs

Date: 2026-09-12

Status: `IMPLEMENTATION_IN_PROGRESS / READ_ONLY_PROJECTION_FIRST / P5_UNCHANGED / CLOUD_DISABLED`

## Goal

Introduce a V2-native unified job truth without rewriting or weakening the existing P2 journal/runtime semantics.

V2-C starts as a read-only projection over the durable P2 job journal. It separates generation, QA and archive state so a successful render cannot be confused with Human Visual Gate approval or formal archive readiness.

## First bounded slice

1. Add `GET /api/v2/jobs?site_id=...`.
2. Project each current P2 job into independent V2 state dimensions:
   - generation: `QUEUED / RUNNING / SUCCEEDED / FAILED`;
   - QA: `NOT_REQUIRED / QA_PENDING / QA_PASS / QA_FAIL`;
   - archive: `STAGING / ARCHIVE_READY / VERIFIED_ARCHIVE / REJECTED`.
3. Preserve `legacy_state` for auditability and transition debugging.
4. Add conservative `action_required` and `retryable` fields.
5. Support read-only filters for generation state, QA state, workflow, item and action.
6. Keep the original journal authoritative; do not create a second write path.

## Conservative truth mapping

- `READY / QUEUED` → generation `QUEUED`.
- `RUNNING / GENERATED` → generation `RUNNING`.
- `CAPTURED / QA_PENDING / QA_PASS / QA_FAIL` → generation `SUCCEEDED`.
- generation failures remain generation `FAILED`.
- `CAPTURED / QA_PENDING` → `QA_PENDING`.
- `QA_PASS` → `QA_PASS`.
- `QA_FAIL / FAILED_QA` → `QA_FAIL`.
- V2-C does **not** infer formal archive completion from QA pass; projected archive remains `STAGING` until an archive adapter reads formal archive truth.
- QA failure projects archive `REJECTED`.

## Retry boundary

The projection can mark a job retryable, but this first slice does not add a new mutation mechanism. Existing P2 retry behavior remains authoritative until V2-C mutation routing is explicitly reviewed.

Retryable projection is limited to failed submit/runtime/capture/QA and `QA_FAIL`. Normal successful jobs are not advertised as retry candidates.

## Safety

V2-C does not:

- rewrite `jobs.jsonl`;
- mutate Manifest or formal archive;
- modify P2 queue execution semantics;
- alter SC01 registration;
- enable QA01/P5;
- call Cloud providers;
- change Cost Guard;
- touch active P5 PR #9.

## Next slices

After the read-only projection passes CI:

1. V2-native `/v2/jobs` Queue / History / Failed surface;
2. bounded retry action reusing existing authoritative retry path;
3. archive adapter that reads formal archive truth before exposing `ARCHIVE_READY / VERIFIED_ARCHIVE`;
4. browser Human Visual Gate before V2-C merge.
