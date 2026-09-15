import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  canonicalAssetsFromP2Jobs,
  pipelineFromLegacyWorkflow,
} from "../src/canonical-contract.js";
import { loadP3PilotRegistry, parseP3PilotRegistry } from "../src/p3-pilots.js";
import type { P2Job } from "../src/p2-runtime.js";

const ROOT = resolve(fileURLToPath(new URL("../../../", import.meta.url)));

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

test("tracked P3 pilot registry is bounded, evaluation-only and harness-ready", async () => {
  const registry = await loadP3PilotRegistry();
  assert.equal(registry.schema_version, "1.1");
  assert.equal(registry.pilots.length, 2);
  const p3a = registry.pilots.find((pilot) => pilot.phase === "P3-A");
  const p3b = registry.pilots.find((pilot) => pilot.phase === "P3-B");
  assert.equal(p3a?.workflow_code, "QA01");
  assert.equal(p3a?.pipeline, "SCENE_IMAGE");
  assert.match(String(p3a?.status), /HARNESS_READY/);
  assert.equal((p3a?.source_contract as any)?.harness, "tools/P3A_AQUARIUM_LOCAL_GATE.ps1");
  assert.equal(p3b?.workflow_code, "M3D01");
  assert.equal(p3b?.pipeline, "MODEL_3D");
  assert.match(String(p3b?.status), /FRAME_QC_LOCAL_PASS_MASK_HARNESS_READY/);
  assert.equal((p3b?.capture_contract as any)?.windows_gate, "tools/P3B_3D_WINDOWS_GATE.ps1");
  assert.equal((p3b?.capture_contract as any)?.mask_windows_gate, "tools/P3B_MASK_WINDOWS_GATE.ps1");
  assert.equal((p3b?.capture_contract as any)?.mask_harness, "tools/p3b_wood_only_mask.py");
  assert.equal((p3b?.capture_contract as any)?.frame_qc_profile?.sample_fps, 8);
  assert.equal((p3b?.capture_contract as any)?.frame_qc_profile?.local_selected_frames, 19);
  for (const pilot of registry.pilots) {
    assert.equal(pilot.production_registration, false);
    assert.equal(pilot.pdp_blocking, false);
    assert.ok(pilot.gates.length > 0);
  }
});

test("P3 harnesses remain evaluation-only and fail closed at physical gates", async () => {
  const [p3aPy, p3aPs, p3bPy, p3bPs, maskPy, maskPs] = await Promise.all([
    readFile(join(ROOT, "tools", "p3a_aquarium_identity_baseline.py"), "utf8"),
    readFile(join(ROOT, "tools", "P3A_AQUARIUM_LOCAL_GATE.ps1"), "utf8"),
    readFile(join(ROOT, "tools", "p3b_video_frame_qc.py"), "utf8"),
    readFile(join(ROOT, "tools", "P3B_3D_WINDOWS_GATE.ps1"), "utf8"),
    readFile(join(ROOT, "tools", "p3b_wood_only_mask.py"), "utf8"),
    readFile(join(ROOT, "tools", "P3B_MASK_WINDOWS_GATE.ps1"), "utf8"),
  ]);
  assert.match(p3aPy, /EVALUATION_ONLY/);
  assert.match(p3aPy, /production_registration.*False/);
  assert.match(p3aPy, /P3A_OPAQUE_IDENTITY_PIXEL_DRIFT/);
  assert.match(p3aPs, /PieceSha256/);
  assert.match(p3aPs, /AquariumSha256/);
  assert.doesNotMatch(p3aPs, /enabled_workflows/);

  assert.match(p3bPy, /P3B_SOURCE_VIDEO_MUTATED/);
  assert.match(p3bPy, /WOOD_ONLY_MASK.*PENDING_WINDOWS_PHYSICAL_GATE/);
  assert.match(p3bPy, /RECONSTRUCTION.*BLOCKED_UNTIL_MASK_PASS/);
  assert.match(p3bPs, /VideoSha256/);
  assert.match(p3bPs, /FrameQcSampleFps = 8\.0/);
  assert.match(p3bPs, /venv-py310/);
  assert.match(p3bPs, /SAM2/);
  assert.match(p3bPs, /GSPLAT/);
  assert.doesNotMatch(p3bPs, /pip install|uv pip install|enabled_workflows/);

  assert.match(maskPy, /SAM2_AUTOMATIC_MASK_GENERATOR_FAIL_CLOSED/);
  assert.match(maskPy, /AUTO_CANDIDATE_READY_HUMAN_GATE_REQUIRED/);
  assert.match(maskPy, /BLOCKED_UNTIL_MASK_HUMAN_GATE_PASS/);
  assert.match(maskPy, /P3B_SOURCE_FRAME_MUTATED/);
  assert.match(maskPy, /MIN_USABLE_FRAMES = 16/);
  assert.match(maskPs, /FRAME_QC_EVIDENCE=PASS/);
  assert.match(maskPs, /MASK_RUNTIME=PASS/);
  assert.match(maskPs, /WOOD_ONLY_MASK_HUMAN_VISUAL_GATE/);
  assert.doesNotMatch(maskPs, /pip install|uv pip install|enabled_workflows/);
});

test("P3 pilot parser rejects accidental production registration", () => {
  assert.throws(
    () => parseP3PilotRegistry({
      schema_version: "1.1",
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
      schema_version: "1.1",
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
