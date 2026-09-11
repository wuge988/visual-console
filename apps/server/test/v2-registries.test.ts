import test from "node:test";
import assert from "node:assert/strict";
import {
  buildEngineHealth,
  projectModelRegistry,
  projectWorkflowRegistry,
  type ModelRegistryEntry,
  type WorkflowRegistryEntry,
} from "../src/v2-registries.js";

const workflows: WorkflowRegistryEntry[] = [
  {
    code: "SW01",
    name_en: "Static White Master",
    name_zh: "白底商品主图工作流",
    asset_key: "white_master",
    scope: "global",
    preset_status: "ACTIVE",
    workflow_status: "VALIDATED_LOCAL_RENDERER",
    executable: true,
    execution_engine: "LOCAL_RENDERER",
  },
  {
    code: "SC01",
    name_en: "Static Cutout Master",
    name_zh: "透明底抠图主图工作流",
    asset_key: "cutout_master",
    scope: "global",
    preset_status: "ACTIVE",
    workflow_status: "NOT_REGISTERED",
    executable: false,
  },
  {
    code: "QA01",
    name_en: "Scene Aquarium",
    name_zh: "水族 / 鱼缸场景工作流",
    asset_key: "scene_aquarium",
    scope: "site",
    preset_status: "ACTIVE",
    workflow_status: "NOT_REGISTERED",
    executable: false,
  },
];

test("workflow projection keeps site enablement separate from runtime registration", () => {
  const projected = projectWorkflowRegistry(
    workflows,
    { enabled_workflows: ["SW01", "SC01"] },
    true,
  );
  const sw01 = projected.find((row) => row.code === "SW01")!;
  const sc01 = projected.find((row) => row.code === "SC01")!;
  const qa01 = projected.find((row) => row.code === "QA01")!;

  assert.equal(sw01.site_enabled, true);
  assert.equal(sw01.effective_executable, true);
  assert.equal(sc01.workflow_status, "REGISTERED");
  assert.equal(sc01.runtime_registered, true);
  assert.equal(sc01.effective_executable, true);
  assert.equal(qa01.site_enabled, false);
  assert.equal(qa01.effective_executable, false);
});

test("SC01 fails closed when the binding is absent even if the site enables it", () => {
  const projected = projectWorkflowRegistry(
    workflows,
    { enabled_workflows: ["SC01"] },
    false,
  );
  const sc01 = projected.find((row) => row.code === "SC01")!;
  assert.equal(sc01.site_enabled, true);
  assert.equal(sc01.runtime_registered, false);
  assert.equal(sc01.effective_executable, false);
  assert.equal(sc01.workflow_status, "NOT_REGISTERED");
});

test("model registry becomes active only through an executable workflow", () => {
  const models: ModelRegistryEntry[] = [
    {
      model_key: "rmbg-2.0",
      display_name: "RMBG-2.0",
      provider: "LOCAL_COMFYUI",
      media_type: "image",
      capabilities: ["segmentation", "cutout"],
      workflow_codes: ["SC01"],
      status: "DECLARED",
      cloud: false,
      metered_cost: false,
    },
  ];
  const inactive = projectModelRegistry(
    models,
    projectWorkflowRegistry(workflows, { enabled_workflows: ["SC01"] }, false),
  );
  assert.equal(inactive[0].effective_status, "DECLARED");
  assert.deepEqual(inactive[0].active_workflow_codes, []);

  const active = projectModelRegistry(
    models,
    projectWorkflowRegistry(workflows, { enabled_workflows: ["SC01"] }, true),
  );
  assert.equal(active[0].effective_status, "ACTIVE");
  assert.deepEqual(active[0].active_workflow_codes, ["SC01"]);
});

test("engine health is degraded when an executable ComfyUI workflow requires an offline engine", () => {
  const projected = projectWorkflowRegistry(
    workflows,
    { enabled_workflows: ["SW01", "SC01"] },
    true,
  );
  const health = buildEngineHealth({
    workflows: projected,
    comfyui: { online: false, queue_running: 0, queue_pending: 0 },
    storage: [{ label: "RAW", reachable: true, total_bytes: null, free_bytes: null }],
  });
  assert.equal(health.overall, "DEGRADED");
  assert.equal(health.engines.comfyui.status, "OFFLINE");
  assert.equal(health.engines.comfyui.required_by_current_workflows, true);
  assert.deepEqual(health.engines.local_renderer.workflow_codes, ["SW01"]);
  assert.equal(health.engines.cloud.status, "DISABLED");
  assert.equal(health.engines.cloud.fail_closed, true);
});

test("engine health remains ready without ComfyUI when only deterministic local renderers are executable", () => {
  const projected = projectWorkflowRegistry(
    workflows,
    { enabled_workflows: ["SW01"] },
    false,
  );
  const health = buildEngineHealth({
    workflows: projected,
    comfyui: { online: false, queue_running: 0, queue_pending: 0 },
    storage: [
      { label: "RAW", reachable: true, total_bytes: null, free_bytes: null },
      { label: "STAGING", reachable: true, total_bytes: null, free_bytes: null },
    ],
  });
  assert.equal(health.overall, "READY");
  assert.equal(health.engines.comfyui.required_by_current_workflows, false);
});
