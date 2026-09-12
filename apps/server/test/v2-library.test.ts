import assert from "node:assert/strict";
import test from "node:test";
import {
  filterLibraryAssets,
  filterPrompts,
  projectJournalAssets,
  projectPromptRegistry,
  type PromptRegistryEntry,
} from "../src/v2-library.js";
import type { P2Job } from "../src/p2-runtime.js";

function job(state: P2Job["state"], extras: Partial<P2Job> = {}): P2Job {
  return {
    job_id: `job-${state}`,
    site_id: "drift-curio",
    item_id: "DC-ZY-SZ-31001",
    workflow_code: "SC01",
    source_asset_id: "a".repeat(32),
    source_filename: "source.png",
    state,
    created_at: "2026-09-12T00:00:00.000Z",
    updated_at: "2026-09-12T00:01:00.000Z",
    ...extras,
  };
}

test("projects journal-referenced source and generated assets without inventing archive readiness", () => {
  const rows = projectJournalAssets([
    job("QA_PASS", {
      job_id: "job-pass",
      generated_asset_id: "generated-pass",
      generated_filename: "white.jpg",
    }),
    job("QA_FAIL", {
      job_id: "job-fail",
      generated_asset_id: "generated-fail",
      generated_filename: "scene.png",
      updated_at: "2026-09-12T00:02:00.000Z",
    }),
  ]);

  const sources = rows.filter((row) => row.role === "RAW_SOURCE");
  const derivatives = rows.filter((row) => row.role === "GENERATED_DERIVATIVE");

  assert.equal(sources.length, 1);
  assert.equal(sources[0]?.immutable_source, true);
  assert.deepEqual(sources[0]?.related_job_ids.sort(), ["job-fail", "job-pass"]);
  assert.equal(sources[0]?.qa_state, undefined);
  assert.equal(sources[0]?.archive_state, undefined);

  assert.equal(derivatives.length, 2);
  const passed = derivatives.find((row) => row.asset_id === "generated-pass");
  const failed = derivatives.find((row) => row.asset_id === "generated-fail");
  assert.equal(passed?.qa_state, "QA_PASS");
  assert.equal(passed?.archive_state, "STAGING");
  assert.equal(failed?.qa_state, "QA_FAIL");
  assert.equal(failed?.archive_state, "REJECTED");
});

test("asset filters preserve source rows and operate on projected metadata", () => {
  const rows = projectJournalAssets([
    job("QA_PASS", {
      job_id: "job-pass",
      generated_asset_id: "generated-pass",
      generated_filename: "white.jpg",
    }),
  ]);

  assert.equal(filterLibraryAssets(rows, { role: "raw_source" }).length, 1);
  assert.equal(filterLibraryAssets(rows, { qa_state: "qa_pass" }).length, 1);
  assert.equal(filterLibraryAssets(rows, { q: "white" })[0]?.asset_id, "generated-pass");
  assert.equal(rows.length, 2);
});

function prompt(promptKey: string, siteScope: string[], extras: Partial<PromptRegistryEntry> = {}): PromptRegistryEntry {
  return {
    prompt_key: promptKey,
    version: "1.0",
    display_name: promptKey,
    scene_type: "aquarium",
    status: "DRAFT",
    body: "Preserve exact piece identity.",
    negative_constraints: [],
    exact_piece_constraints: ["no geometry drift"],
    compatible_workflows: [],
    compatible_models: [],
    site_scope: siteScope,
    tags: ["exact-piece"],
    ...extras,
  };
}

test("prompt registry respects site scope without enabling execution", () => {
  const entries = [
    prompt("global", ["*"]),
    prompt("drift", ["drift-curio"]),
    prompt("other", ["other-site"]),
  ];

  const projected = projectPromptRegistry(entries, "drift-curio");
  assert.deepEqual(projected.map((entry) => entry.prompt_key), ["global", "drift"]);
  assert.equal(filterPrompts(projected, { tag: "exact-piece" }).length, 2);
  assert.equal(filterPrompts(projected, { q: "drift" })[0]?.prompt_key, "drift");
});
