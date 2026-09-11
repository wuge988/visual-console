import type { FastifyInstance } from "fastify";
import { existsSync } from "node:fs";
import { readFile, statfs } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertLoopbackComfyUrl, readBindingState } from "./p2-runtime.js";

const ROOT = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const WORKFLOW_REGISTRY_PATH = join(ROOT, "config", "workflows", "registry.json");
const MODEL_REGISTRY_PATH = join(ROOT, "config", "models", "registry.json");

export type V2RegistrySiteProfile = {
  site_id: string;
  enabled_workflows: string[];
  raw_root: string;
  work_root: string;
  staging_root: string;
  manifest_root: string;
  control_root?: string;
  asset_root?: string;
};

type Dependencies = {
  assertLocalRequest: (req: any) => void;
  loadSite: (siteId: string) => Promise<V2RegistrySiteProfile>;
};

export type WorkflowRegistryEntry = {
  code: string;
  name_en: string;
  name_zh: string;
  asset_key: string;
  scope: string;
  preset_status: string;
  workflow_status: string;
  executable: boolean;
  execution_engine?: string;
  frozen_runtime?: Record<string, unknown>;
};

export type ProjectedWorkflow = WorkflowRegistryEntry & {
  site_enabled: boolean;
  runtime_registered: boolean;
  effective_executable: boolean;
};

export type ModelRegistryEntry = {
  model_key: string;
  display_name: string;
  provider: string;
  media_type: string;
  capabilities: string[];
  workflow_codes: string[];
  status: string;
  cloud: boolean;
  metered_cost: boolean;
  notes?: string;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function controlRoot(profile: V2RegistrySiteProfile) {
  return profile.control_root ?? join(profile.manifest_root, "visual-console-p2", profile.site_id);
}

function workflowStatePath(profile: V2RegistrySiteProfile) {
  return join(controlRoot(profile), "workflow-state.json");
}

async function readWorkflowRegistry(): Promise<{ schema_version: string; workflows: WorkflowRegistryEntry[] }> {
  const parsed = JSON.parse(await readFile(WORKFLOW_REGISTRY_PATH, "utf8"));
  if (!Array.isArray(parsed?.workflows)) throw new Error("WORKFLOW_REGISTRY_INVALID");
  return { schema_version: String(parsed.schema_version ?? "unknown"), workflows: parsed.workflows };
}

async function readModelRegistry(): Promise<{ schema_version: string; models: ModelRegistryEntry[] }> {
  const parsed = JSON.parse(await readFile(MODEL_REGISTRY_PATH, "utf8"));
  if (!Array.isArray(parsed?.models)) throw new Error("MODEL_REGISTRY_INVALID");
  return { schema_version: String(parsed.schema_version ?? "unknown"), models: parsed.models };
}

export function projectWorkflowRegistry(
  entries: WorkflowRegistryEntry[],
  profile: Pick<V2RegistrySiteProfile, "enabled_workflows">,
  sc01Registered: boolean,
): ProjectedWorkflow[] {
  return entries.map((entry) => {
    const siteEnabled = profile.enabled_workflows.includes(entry.code);
    const runtimeRegistered = entry.code === "SC01" ? sc01Registered : entry.executable;
    const effectiveExecutable = entry.code === "SC01"
      ? siteEnabled && sc01Registered
      : siteEnabled && entry.executable;
    return {
      ...entry,
      workflow_status: entry.code === "SC01" && sc01Registered ? "REGISTERED" : entry.workflow_status,
      site_enabled: siteEnabled,
      runtime_registered: runtimeRegistered,
      effective_executable: effectiveExecutable,
    };
  });
}

export function projectModelRegistry(models: ModelRegistryEntry[], workflows: ProjectedWorkflow[]) {
  const activeCodes = new Set(workflows.filter((row) => row.effective_executable).map((row) => row.code));
  return models.map((model) => ({
    ...model,
    active_workflow_codes: model.workflow_codes.filter((code) => activeCodes.has(code)),
    effective_status: model.workflow_codes.some((code) => activeCodes.has(code)) ? "ACTIVE" : model.status,
  }));
}

async function comfyTruth() {
  const base = assertLoopbackComfyUrl(
    String(process.env.VISUAL_CONSOLE_COMFYUI_URL ?? "http://127.0.0.1:8188"),
  );
  try {
    const [statsResponse, queueResponse] = await Promise.all([
      fetch(`${base}/system_stats`, { signal: AbortSignal.timeout(2_500) }),
      fetch(`${base}/queue`, { signal: AbortSignal.timeout(2_500) }),
    ]);
    if (!statsResponse.ok || !queueResponse.ok) throw new Error("COMFYUI_STATUS_FAILED");
    const [stats, queue] = await Promise.all([statsResponse.json(), queueResponse.json()]);
    return {
      online: true,
      endpoint: base,
      queue_running: Array.isArray(queue?.queue_running) ? queue.queue_running.length : 0,
      queue_pending: Array.isArray(queue?.queue_pending) ? queue.queue_pending.length : 0,
      devices: Array.isArray(stats?.devices)
        ? stats.devices.map((device: any) => ({
            name: device?.name ?? "GPU",
            type: device?.type ?? null,
            vram_total: device?.vram_total ?? null,
            vram_free: device?.vram_free ?? null,
          }))
        : [],
    };
  } catch (error) {
    return {
      online: false,
      endpoint: base,
      queue_running: 0,
      queue_pending: 0,
      devices: [],
      error: errorMessage(error),
    };
  }
}

async function probePath(label: string, path: string) {
  if (!path) return { label, reachable: false, total_bytes: null, free_bytes: null };
  try {
    const fs = await statfs(path);
    return {
      label,
      reachable: true,
      total_bytes: Number(fs.blocks) * Number(fs.bsize),
      free_bytes: Number(fs.bavail) * Number(fs.bsize),
    };
  } catch {
    return { label, reachable: existsSync(path), total_bytes: null, free_bytes: null };
  }
}

export function buildEngineHealth(options: {
  workflows: ProjectedWorkflow[];
  comfyui: { online: boolean; queue_running: number; queue_pending: number; devices?: unknown[]; endpoint?: string; error?: string };
  storage: Array<{ label: string; reachable: boolean; total_bytes: number | null; free_bytes: number | null }>;
}) {
  const localRendererCodes = options.workflows
    .filter((row) => row.effective_executable && row.execution_engine === "LOCAL_RENDERER")
    .map((row) => row.code);
  const requiresComfy = options.workflows.some(
    (row) => row.effective_executable && (row.code === "SC01" || row.execution_engine === "COMFYUI"),
  );
  const storageReady = options.storage.every((row) => row.reachable);
  const overall = storageReady && (!requiresComfy || options.comfyui.online) ? "READY" : "DEGRADED";
  return {
    overall,
    engines: {
      core: { status: "ONLINE" },
      local_renderer: {
        status: localRendererCodes.length ? "ONLINE" : "IDLE",
        workflow_codes: localRendererCodes,
      },
      comfyui: {
        status: options.comfyui.online ? "ONLINE" : "OFFLINE",
        required_by_current_workflows: requiresComfy,
        queue_running: options.comfyui.queue_running,
        queue_pending: options.comfyui.queue_pending,
        devices: options.comfyui.devices ?? [],
        endpoint: options.comfyui.endpoint,
        error: options.comfyui.error,
      },
      cloud: {
        status: "DISABLED",
        fail_closed: true,
        reason: "V2_H_PROVIDER_ADAPTER_NOT_IMPLEMENTED",
      },
    },
    storage: options.storage,
  };
}

export async function registerV2RegistryRoutes(app: FastifyInstance, deps: Dependencies) {
  async function loadProjection(siteId: string) {
    const profile = await deps.loadSite(siteId);
    const [workflowRegistry, binding] = await Promise.all([
      readWorkflowRegistry(),
      readBindingState(workflowStatePath(profile)),
    ]);
    const workflows = projectWorkflowRegistry(workflowRegistry.workflows, profile, Boolean(binding));
    return { profile, workflowRegistry, workflows };
  }

  app.get("/api/v2/registries/workflows", async (req, reply) => {
    try {
      deps.assertLocalRequest(req);
      const siteId = String((req.query as any)?.site_id ?? "drift-curio");
      const { workflowRegistry, workflows } = await loadProjection(siteId);
      return { ok: true, site_id: siteId, schema_version: workflowRegistry.schema_version, workflows };
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  app.get("/api/v2/registries/models", async (req, reply) => {
    try {
      deps.assertLocalRequest(req);
      const siteId = String((req.query as any)?.site_id ?? "drift-curio");
      const [{ workflows }, modelRegistry] = await Promise.all([
        loadProjection(siteId),
        readModelRegistry(),
      ]);
      return {
        ok: true,
        site_id: siteId,
        schema_version: modelRegistry.schema_version,
        models: projectModelRegistry(modelRegistry.models, workflows),
      };
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  app.get("/api/v2/engines/health", async (req, reply) => {
    try {
      deps.assertLocalRequest(req);
      const siteId = String((req.query as any)?.site_id ?? "drift-curio");
      const { profile, workflows } = await loadProjection(siteId);
      const storage = await Promise.all([
        probePath("RAW", profile.raw_root),
        probePath("WORK", profile.work_root),
        probePath("STAGING", profile.staging_root),
        probePath("MANIFEST", profile.manifest_root),
        probePath("CONTROL", controlRoot(profile)),
        ...(profile.asset_root ? [probePath("ASSET", profile.asset_root)] : []),
      ]);
      const comfyui = await comfyTruth();
      return {
        ok: true,
        site_id: siteId,
        generated_at: new Date().toISOString(),
        ...buildEngineHealth({ workflows, comfyui, storage }),
      };
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });
}
