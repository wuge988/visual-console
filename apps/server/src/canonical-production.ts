import type { ProjectedWorkflow } from "./v2-registries.js";

export type CanonicalProductionMode =
  | "PRODUCT"
  | "AQUARIUM"
  | "RAINFOREST"
  | "REPTILE"
  | "COLLECTIBLE"
  | "MOTION";

export type CanonicalProductionCapability = {
  workflow_code: string;
  mode: CanonicalProductionMode;
  executable: boolean;
  execution_engine: string;
  required_source_role: string;
  submission_adapter: string | null;
  block_reason: string | null;
};

const MODE_MAP: Record<string, CanonicalProductionMode> = {
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

/**
 * Canonical read projection only.
 * Workflow registry remains configuration authority.
 * This layer intentionally owns no persistence and no execution authority.
 */
export function projectCanonicalProductionCapability(
  workflow: ProjectedWorkflow,
): CanonicalProductionCapability | null {
  const mode = MODE_MAP[workflow.code];
  if (!mode) return null;

  if (workflow.code === "SC01") {
    return {
      workflow_code: workflow.code,
      mode,
      executable: workflow.effective_executable,
      execution_engine: "COMFYUI",
      required_source_role: "RAW_SOURCE",
      submission_adapter: workflow.effective_executable ? "P2_SC01_BATCH" : null,
      block_reason: workflow.effective_executable ? null : "WORKFLOW_NOT_EFFECTIVELY_EXECUTABLE",
    };
  }

  if (["QA01", "QR01", "QP01", "QC01"].includes(workflow.code)) {
    return {
      workflow_code: workflow.code,
      mode,
      executable: false,
      execution_engine: String(workflow.execution_engine ?? "UNBOUND"),
      required_source_role: "VERIFIED_CUTOUT",
      submission_adapter: null,
      block_reason: "SCENE_SUBMISSION_ADAPTER_NOT_BOUND",
    };
  }

  return {
    workflow_code: workflow.code,
    mode,
    executable: false,
    execution_engine: String(workflow.execution_engine ?? "UNBOUND"),
    required_source_role: "VERIFIED_CUTOUT",
    submission_adapter: null,
    block_reason: "PRODUCTION_PROJECTION_NOT_BOUND",
  };
}

export function projectCanonicalProductionCapabilities(
  workflows: ProjectedWorkflow[],
): CanonicalProductionCapability[] {
  return workflows
    .map(projectCanonicalProductionCapability)
    .filter((item): item is CanonicalProductionCapability => item !== null);
}
