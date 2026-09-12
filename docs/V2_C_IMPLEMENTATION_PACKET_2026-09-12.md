# Visual Console V2-C — Unified Jobs

Date: 2026-09-12

Status: `HUMAN_VISUAL_PASS / PR13_SQUASH_MERGED / MAIN_1e674854 / V2_C_COMPLETE / V2_D_NEXT / P5_UNCHANGED / CLOUD_DISABLED`

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

A Windows review of the existing V2-B System / Model Registry / Workflow Registry surfaces exposed one integration inconsistency before the V2-C gate: those pages were still showing the pre-V2-C Jobs navigation and the older Archive monitor that omitted `Staging`. V2-C now aligns the shared V2 shell on those pages with the new Jobs routes and archive semantics:

- `任务队列` → `/v2/jobs`;
- `任务历史` → `/v2/jobs/history`;
- `失败 / 重试` → `/v2/jobs/failed`;
- top monitor shows `Staging / 待归档 / 今日归档` consistently;
- V2 dashboard/job search handoffs route to V2-native Jobs surfaces instead of legacy `/jobs`.

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

The V2 global summary is corrected to fail closed: QA-passed but unarchived assets count as `archive.staging`, while `archive.ready` remains `0` until a dedicated archive adapter exists. The V2-C top monitor exposes both Staging and Ready so this distinction remains visible.

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

## Verification

- Initial backend projection head: `2f073798f592aba68ce9ad21a7a7c76d58de0309`; CI #532 `PASS`.
- Final runtime/UI implementation head before shell alignment: `24ee418c28364e253ae0292196fb8b0f02d45bb1`; CI #540 `PASS`.
- Shell consistency fix head: `ce2d530d92136fa5eaf1fe24904ad5f1daa38120`; CI #545 `PASS`.
- Final reviewed Human Gate subject exact head: `418907be82076d9593a450235ac4e99b77390fe5`; CI #547 `PASS`.
- Target Windows Human Visual Gate: `PASS` for `/v2/system`, `/v2/jobs`, `/v2/jobs/history`, and `/v2/jobs/failed`.
- PR #13: `SQUASH_MERGED` into `main`; merge commit `1e6748541f55e2234f9ea8b5161bc9c7af07e6bd`.
- Verified CI path includes Windows physical self-check parsing, validation-page JavaScript parsing, `npm ci`, full `npm test`, and `npm run build`.

## Human Visual Gate result

`PASS`.

Observed on the target Windows browser:

- shared V2 shell exposes Queue / History / Failed consistently;
- global archive monitor exposes `Staging / 待归档 / 今日归档` consistently;
- Queue empty state remains clean and readable;
- History presents Generation / QA / Archive / Action as independent dimensions without visible overflow;
- Failed / Retry isolates the rejected item and exposes explicit retry creation without rewriting history;
- no visible desktop overflow, density regression, or hierarchy break.

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

1. backend projection CI — PASS;
2. visible Queue / History / Failed implementation — COMPLETE;
3. retry/system/archive-truth corrections — COMPLETE;
4. shared V2 shell alignment after Windows screenshot review — COMPLETE;
5. shell-fix CI #545 — PASS;
6. final exact Human Gate subject CI #547 — PASS;
7. target Windows browser Human Visual Gate — PASS;
8. PR #13 Ready → squash merge — COMPLETE;
9. main merge commit `1e6748541f55e2234f9ea8b5161bc9c7af07e6bd` — COMPLETE;
10. next implementation phase — `V2-D Asset + Prompt Library`.
