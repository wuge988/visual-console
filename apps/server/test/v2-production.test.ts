import assert from "node:assert/strict";
import test from "node:test";
import { buildProductionCapabilities } from "../src/v2-production.js";
import type { ProjectedWorkflow } from "../src/v2-registries.js";

function workflow(code: string, options: Partial<ProjectedWorkflow> = {}): ProjectedWorkflow {
  return {
    code,
    name_en: code,
    name_zh: code,
    asset_key: code.toLowerCase(),
    scope: "global",
    preset_status: "ACTIVE",
    workflow_status: "REGISTERED",
    executable: true,
    execution_engine: code === "SC01" ? "COMFYUI" : "LOCAL_RENDERER",
    site_enabled: true,
    runtime_registered: true,
    effective_executable: true,
    ...options,
  };
}

test("SC01 exposes the existing P2 batch mutation as the only initial executable adapter", () => {
  const rows = buildProductionCapabilities([
    workflow("SC01"),
    workflow("SW01"),
    workflow("SD01"),
  ]);

  const sc01 = rows.find((row) => row.workflow_code === "SC01");
  const sw01 = rows.find((row) => row.workflow_code === "SW01");
  const sd01 = rows.find((row) => row.workflow_code === "SD01");

  assert.equal(sc01?.submission_adapter, "P2_SC01_BATCH");
  assert.equal(sc01?.submit_path, "/api/jobs/batch");
  assert.equal(sc01?.required_source_role, "RAW_SOURCE");
  assert.equal(sc01?.max_batch, 20);
  assert.equal(sc01?.prompt_required, false);
  assert.deepEqual(sc01?.surfaces, ["IMAGE", "BATCH"]);

  assert.equal(sw01?.submission_adapter, null);
  assert.equal(sw01?.block_reason, "VERIFIED_CUTOUT_PROJECTION_NOT_BOUND");
  assert.equal(sd01?.submission_adapter, null);
  assert.equal(sd01?.block_reason, "VERIFIED_CUTOUT_PROJECTION_NOT_BOUND");
});

test("disabled SC01 remains blocked even though an adapter exists in the system", () => {
  const [sc01] = buildProductionCapabilities([
    workflow("SC01", {
      effective_executable: false,
      runtime_registered: false,
      workflow_status: "NOT_REGISTERED",
    }),
  ]);

  assert.equal(sc01.submission_adapter, null);
  assert.equal(sc01.submit_path, null);
  assert.equal(sc01.block_reason, "WORKFLOW_NOT_EFFECTIVELY_EXECUTABLE");
});

test("scene workflows render truthful blocked capabilities and never inherit a cloud fallback", () => {
  const rows = buildProductionCapabilities([
    workflow("QA01", {
      effective_executable: false,
      runtime_registered: false,
      executable: false,
      workflow_status: "NOT_REGISTERED",
      execution_engine: undefined,
    }),
    workflow("QR01", {
      effective_executable: false,
      runtime_registered: false,
      executable: false,
      workflow_status: "NOT_REGISTERED",
      execution_engine: undefined,
    }),
  ]);

  assert.equal(rows.length, 2);
  for (const row of rows) {
    assert.deepEqual(row.surfaces, ["SCENE"]);
    assert.equal(row.prompt_required, true);
    assert.equal(row.submission_adapter, null);
    assert.equal(row.block_reason, "WORKFLOW_NOT_EFFECTIVELY_EXECUTABLE");
    assert.equal(row.cost.cloud, false);
    assert.equal(row.cost.estimated_amount, 0);
  }
});

test("non-composer export workflows are omitted", () => {
  const rows = buildProductionCapabilities([
    workflow("ET01"),
    workflow("EI01"),
    workflow("EP01"),
    workflow("EH01"),
  ]);
  assert.deepEqual(rows, []);
});
