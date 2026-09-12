import type { FastifyInstance } from "fastify";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readBindingState } from "./p2-runtime.js";
import { projectWorkflowRegistry, type ProjectedWorkflow, type WorkflowRegistryEntry } from "./v2-registries.js";

const ROOT = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const WORKFLOW_REGISTRY_PATH = join(ROOT, "config", "workflows", "registry.json");

export type V2ProductionSiteProfile = {
  site_id: string;
  enabled_workflows: string[];
  manifest_root: string;
  control_root?: string;
};

type Dependencies = {
  assertLocalRequest: (req: any) => void;
  loadSite: (siteId: string) => Promise<V2ProductionSiteProfile>;
};

export type ComposerSurface = "IMAGE" | "SCENE" | "BATCH";
export type ProductionMode =
  | "PRODUCT"
  | "AQUARIUM"
  | "RAINFOREST"
  | "REPTILE"
  | "COLLECTIBLE"
  | "DETAIL"
  | "MOTION";

export type ProductionCapability = {
  workflow_code: string;
  display_name: string;
  mode: ProductionMode;
  surfaces: ComposerSurface[];
  execution_engine: string;
  required_source_role: string;
  prompt_required: boolean;
  max_batch: number;
  effective_executable: boolean;
  submission_adapter: string | null;
  submit_path: string | null;
  source_projection: string;
  block_reason: string | null;
  cost: {
    cloud: false;
    currency: "USD";
    estimated_amount: 0;
    basis: "LOCAL_NO_METERED_PROVIDER";
  };
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function controlRoot(profile: V2ProductionSiteProfile) {
  return profile.control_root ?? join(profile.manifest_root, "visual-console-p2", profile.site_id);
}

function workflowStatePath(profile: V2ProductionSiteProfile) {
  return join(controlRoot(profile), "workflow-state.json");
}

async function readWorkflowRegistry(): Promise<{ schema_version: string; workflows: WorkflowRegistryEntry[] }> {
  const parsed = JSON.parse(await readFile(WORKFLOW_REGISTRY_PATH, "utf8"));
  if (!Array.isArray(parsed?.workflows)) throw new Error("WORKFLOW_REGISTRY_INVALID");
  return {
    schema_version: String(parsed.schema_version ?? "unknown"),
    workflows: parsed.workflows as WorkflowRegistryEntry[],
  };
}

const MODE_BY_WORKFLOW: Record<string, ProductionMode> = {
  SC01: "PRODUCT",
  SW01: "PRODUCT",
  SD01: "PRODUCT",
  QA01: "AQUARIUM",
  QR01: "RAINFOREST",
  QP01: "REPTILE",
  QC01: "COLLECTIBLE",
  VP01: "MOTION",
  VS01: "MOTION",
};

function baseCapability(workflow: ProjectedWorkflow): ProductionCapability | null {
  const mode = MODE_BY_WORKFLOW[workflow.code];
  if (!mode) return null;

  const executionEngine = String(workflow.execution_engine ?? "UNBOUND");
  const capability: ProductionCapability = {
    workflow_code: workflow.code,
    display_name: workflow.name_zh || workflow.name_en || workflow.code,
    mode,
    surfaces: mode === "PRODUCT" ? ["IMAGE", "BATCH"] : mode === "MOTION" ? [] : ["SCENE"],
    execution_engine: executionEngine,
    required_source_role: "UNBOUND",
    prompt_required: false,
    max_batch: 1,
    effective_executable: workflow.effective_executable,
    submission_adapter: null,
    submit_path: null,
    source_projection: "NOT_AVAILABLE",
    block_reason: null,
    cost: {
      cloud: false,
      currency: "USD",
      estimated_amount: 0,
      basis: "LOCAL_NO_METERED_PROVIDER",
    },
  };

  if (workflow.code === "SC01") {
    capability.required_source_role = "RAW_SOURCE";
    capability.prompt_required = false;
    capability.max_batch = 20;
    capability.source_projection = "V2_ASSET_RAW_SOURCE";
    if (workflow.effective_executable) {
      capability.submission_adapter = "P2_SC01_BATCH";
      capability.submit_path = "/api/jobs/batch";
    } else {
      capability.block_reason = "WORKFLOW_NOT_EFFECTIVELY_EXECUTABLE";
    }
    return capability;
  }

  if (["SW01", "SD01"].includes(workflow.code)) {
    capability.required_source_role = "VERIFIED_CUTOUT";
    capability.prompt_required = false;
    capability.max_batch = 20;
    capability.source_projection = "FORMAL_VERIFIED_CUTOUT_REQUIRED";
    capability.block_reason = workflow.effective_executable
      ? "VERIFIED_CUTOUT_PROJECTION_NOT_BOUND"
      : "WORKFLOW_NOT_EFFECTIVELY_EXECUTABLE";
    return capability;
  }

  if (["QA01", "QR01", "QP01", "QC01"].includes(workflow.code)) {
    capability.required_source_role = "VERIFIED_CUTOUT";
    capability.prompt_required = true;
    capability.max_batch = 1;
    capability.source_projection = "FORMAL_VERIFIED_CUTOUT_REQUIRED";
    capability.block_reason = workflow.effective_executable
      ? "SCENE_SUBMISSION_ADAPTER_NOT_BOUND"
      : "WORKFLOW_NOT_EFFECTIVELY_EXECUTABLE";
    return capability;
  }

  capability.block_reason = "COMPOSER_ADAPTER_NOT_IMPLEMENTED";
  return capability;
}

export function buildProductionCapabilities(workflows: ProjectedWorkflow[]): ProductionCapability[] {
  return workflows
    .map(baseCapability)
    .filter((row): row is ProductionCapability => Boolean(row) && row.surfaces.length > 0);
}

export async function registerV2ProductionRoutes(app: FastifyInstance, deps: Dependencies) {
  app.get("/api/v2/production/capabilities", async (req, reply) => {
    try {
      deps.assertLocalRequest(req);
      const siteId = String((req.query as any)?.site_id ?? "drift-curio");
      const profile = await deps.loadSite(siteId);
      const [registry, binding] = await Promise.all([
        readWorkflowRegistry(),
        readBindingState(workflowStatePath(profile)),
      ]);
      const workflows = projectWorkflowRegistry(registry.workflows, profile, Boolean(binding));
      const capabilities = buildProductionCapabilities(workflows);
      return {
        ok: true,
        site_id: siteId,
        schema_version: "1.0",
        source: "WORKFLOW_REGISTRY_PLUS_RUNTIME_BINDING",
        cloud_enabled: false,
        cloud_fail_closed: true,
        capabilities,
      };
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });
}
