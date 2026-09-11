import assert from "node:assert/strict";
import test from "node:test";
import { filterUnifiedJobs, projectUnifiedJob } from "../src/v2-jobs.js";
import type { P2Job } from "../src/p2-runtime.js";

function job(state: P2Job["state"], extras: Partial<P2Job> = {}): P2Job {
  return {
    job_id: `job-${state}`,
    site_id: "drift-curio",
    item_id: "DC-ZY-SZ-31001",
    workflow_code: "SC01",
    source_asset_id: "a".repeat(32),
    state,
    created_at: "2026-09-12T00:00:00.000Z",
    updated_at: "2026-09-12T00:01:00.000Z",
    ...extras,
  };
}

test("projects execution, QA and archive states independently", () => {
  assert.deepEqual(
    projectUnifiedJob(job("QUEUED")),
    assert.objectContaining?.({}) as never,
  );

  const queued = projectUnifiedJob(job("QUEUED"));
  assert.equal(queued.generation_state, "QUEUED");
  assert.equal(queued.qa_state, "NOT_REQUIRED");
  assert.equal(queued.archive_state, "STAGING");
  assert.equal(queued.action_required, "NONE");

  const running = projectUnifiedJob(job("GENERATED"));
  assert.equal(running.generation_state, "RUNNING");
  assert.equal(running.qa_state, "NOT_REQUIRED");

  const pending = projectUnifiedJob(job("QA_PENDING", { generated_asset_id: "asset-1" }));
  assert.equal(pending.generation_state, "SUCCEEDED");
  assert.equal(pending.qa_state, "QA_PENDING");
  assert.equal(pending.action_required, "HUMAN_REVIEW");

  const passed = projectUnifiedJob(job("QA_PASS", { generated_asset_id: "asset-1" }));
  assert.equal(passed.generation_state, "SUCCEEDED");
  assert.equal(passed.qa_state, "QA_PASS");
  assert.equal(passed.archive_state, "STAGING");

  const rejected = projectUnifiedJob(job("QA_FAIL", { generated_asset_id: "asset-1" }));
  assert.equal(rejected.generation_state, "SUCCEEDED");
  assert.equal(rejected.qa_state, "QA_FAIL");
  assert.equal(rejected.archive_state, "REJECTED");
  assert.equal(rejected.retryable, true);
  assert.equal(rejected.action_required, "RETRY_AVAILABLE");
});

test("generation failures remain distinct from QA failures", () => {
  const submit = projectUnifiedJob(job("FAILED_SUBMIT"));
  assert.equal(submit.generation_state, "FAILED");
  assert.equal(submit.qa_state, "NOT_REQUIRED");
  assert.equal(submit.retryable, true);

  const qaFailure = projectUnifiedJob(job("FAILED_QA", { generated_asset_id: "asset-1" }));
  assert.equal(qaFailure.generation_state, "SUCCEEDED");
  assert.equal(qaFailure.qa_state, "QA_FAIL");
  assert.equal(qaFailure.archive_state, "REJECTED");
});

test("filters projected jobs without mutating source truth", () => {
  const rows = [
    projectUnifiedJob(job("QUEUED")),
    projectUnifiedJob(job("QA_PENDING", { job_id: "job-review", generated_asset_id: "asset-1" })),
    projectUnifiedJob(job("FAILED_RUNTIME", { job_id: "job-failed", error: "boom" })),
  ];

  assert.equal(filterUnifiedJobs(rows, { generation_state: "failed" }).length, 1);
  assert.equal(filterUnifiedJobs(rows, { qa_state: "qa_pending" }).length, 1);
  assert.equal(filterUnifiedJobs(rows, { action_required: "human_review" })[0]?.job_id, "job-review");
  assert.equal(rows.length, 3);
});
