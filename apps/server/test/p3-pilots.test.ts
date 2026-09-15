import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalAssetsFromP2Jobs,
  pipelineFromLegacyWorkflow,
} from "../src/canonical-contract.js";
import { loadP3PilotRegistry, parseP3PilotRegistry } from "../src/p3-pilots.js";
import type { P2Job } from "../src/p2-runtime.js";

test("P3 workflow codes map to business pipelines without granting execution authority", () => {
  assert.equal(pipelineFromLegacyWorkflow("QA01"), "SCENE_IMAGE");
  assert.equal(pipelineFromLegacyWorkflow("QR01"), "SCENE_IMAGE");
  assert.equal(pipelineFromLegacyWorkflow("QP01"), "SCENE_IMAGE");
  assert.equal(pipelineFromLegacyWorkflow("QC01"), "SCENE_IMAGE");
  assert.equal(pipelineFromLegacyWorkflow("M3D01"), "MODEL_3D");
});

test("canonical generated asset kind follows the mapped P3 pipeline", () => {
  const base: P2Job = {
    job_id: "job-p3",
    site_id: "drift-curio",
    item_id: "DC-ZY-SZ-31001",
    workflow_code: "QA01",
    source_asset_id: "source-1",
    source_filename: "source.png",
    state: "QA_PENDING",
    created_at: "2026-09-15T00:00:00.000Z",
    updated_at: "2026-09-15T00:01:00.000Z",
    generated_asset_id: "scene-1",
    generated_filename: "scene.png",
  };
  const scene = canonicalAssetsFromP2Jobs([base]).find((asset) => asset.asset_id === "scene-1");
  assert.equal(scene?.kind, "SCENE");

  const model = canonicalAssetsFromP2Jobs([
    { ...base, workflow_code: "M3D01", generated_asset_id: "model-1", generated_filename: "model.glb" },
  ]).find((asset) => asset.asset_id === "model-1");
  assert.equal(model?.kind, "MODEL_3D");
});

test("tracked P3 pilot registry is bounded, evaluation-only and PDP non-blocking", async () => {
  const registry = await loadP3PilotRegistry();
  assert.equal(registry.schema_version, "1.0");
  assert.equal(registry.pilots.length, 2);
  const p3a = registry.pilots.find((pilot) => pilot.phase === "P3-A");
  const p3b = registry.pilots.find((pilot) => pilot.phase === "P3-B");
  assert.equal(p3a?.workflow_code, "QA01");
  assert.equal(p3a?.pipeline, "SCENE_IMAGE");
  assert.equal(p3b?.workflow_code, "M3D01");
  assert.equal(p3b?.pipeline, "MODEL_3D");
  for (const pilot of registry.pilots) {
    assert.equal(pilot.production_registration, false);
    assert.equal(pilot.pdp_blocking, false);
    assert.ok(pilot.gates.length > 0);
  }
});

test("P3 pilot parser rejects accidental production registration", () => {
  assert.throws(
    () => parseP3PilotRegistry({
      schema_version: "1.0",
      pilots: [{
        pilot_id: "unsafe",
        phase: "P3-A",
        site_id: "drift-curio",
        item_id: "DC-ZY-SZ-31001",
        pipeline: "SCENE_IMAGE",
        workflow_code: "QA01",
        title_zh: "unsafe",
        status: "unsafe",
        production_registration: true,
        pdp_blocking: false,
        strategy: {},
        gates: ["SOURCE_IDENTITY"],
      }],
    }),
    /P3_PRODUCTION_REGISTRATION_FORBIDDEN/,
  );
});

test("P3 pilot parser rejects a 3D pilot that can block PDP", () => {
  assert.throws(
    () => parseP3PilotRegistry({
      schema_version: "1.0",
      pilots: [{
        pilot_id: "unsafe-3d",
        phase: "P3-B",
        site_id: "drift-curio",
        item_id: "DC-ZY-SZ-31001",
        pipeline: "MODEL_3D",
        workflow_code: "M3D01",
        title_zh: "unsafe",
        status: "unsafe",
        production_registration: false,
        pdp_blocking: true,
        strategy: {},
        gates: ["VIDEO_SOURCE"],
      }],
    }),
    /P3_PDP_BLOCKING_FORBIDDEN/,
  );
});
