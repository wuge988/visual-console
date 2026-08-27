import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  stat,
  statfs,
  writeFile,
} from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertExistingRealInside,
  assertInside,
  ensureSafeDirectory,
  safeId,
} from "./runtime-utils.js";
import {
  allocateNextVersion,
  appendJobSnapshot,
  assertLoopbackComfyUrl,
  basenameSafe,
  copyVerifiedNoDelete,
  generatedAssetId,
  injectLoadImage,
  loadRegisteredWorkflow,
  persistSc01Binding,
  readBindingState,
  readJournal,
  selectPromptOutput,
  validateSc01Workflow,
  versionedCutoutFilename,
  type P2Job,
  type Sc01BindingState,
} from "./p2-runtime.js";

const ROOT = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const WORKFLOW_REGISTRY_PATH = join(ROOT, "config", "workflows", "registry.json");
const SC01_IMPORT_LIMIT = 512 * 1024;
const SC01_ALLOWED_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const COMFY_POLL_MS = 700;
const COMFY_TIMEOUT_MS = Number(process.env.VISUAL_CONSOLE_COMFYUI_TIMEOUT_MS ?? 5 * 60 * 1000);

type SiteProfile = {
  site_id: string;
  display_name: string;
  display_name_zh: string;
  item_adapter: string;
  raw_root: string;
  trash_root: string;
  work_root: string;
  staging_root: string;
  manifest_root: string;
  enabled_workflows: string[];
  control_root?: string;
  comfyui_input_root?: string;
  comfyui_output_root?: string;
};

type ResolvedRawAsset = {
  full: string;
  filename: string;
  mime: string;
  kind: string;
};

type Dependencies = {
  assertLocalRequest: (req: any) => void;
  loadSite: (siteId: string) => Promise<SiteProfile>;
  validateProfileItem: (profile: SiteProfile, itemId: string) => string;
  resolveRawAsset: (
    profile: SiteProfile,
    itemId: string,
    assetId: string,
  ) => Promise<ResolvedRawAsset>;
};

type RegistryEntry = {
  code: string;
  name_en: string;
  name_zh: string;
  asset_key: string;
  scope: string;
  preset_status: string;
  workflow_status: string;
  executable: boolean;
  frozen_runtime?: Record<string, unknown>;
};

function controlRoot(profile: SiteProfile) {
  return (
    profile.control_root ??
    join(profile.manifest_root, "visual-console-p2", profile.site_id)
  );
}

function workflowStatePath(profile: SiteProfile) {
  return join(controlRoot(profile), "workflow-state.json");
}

function journalPath(profile: SiteProfile) {
  return join(controlRoot(profile), "jobs.jsonl");
}

function comfyInputRoot(profile: SiteProfile) {
  return profile.comfyui_input_root ?? profile.work_root;
}

function comfyOutputRoot(profile: SiteProfile) {
  return profile.comfyui_output_root ?? profile.staging_root;
}

function nowIso() {
  return new Date().toISOString();
}

function publicJob(job: P2Job) {
  const { generated_path: _path, ...safe } = job;
  return safe;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function readRegistry(): Promise<RegistryEntry[]> {
  const parsed = JSON.parse(await readFile(WORKFLOW_REGISTRY_PATH, "utf8"));
  if (!Array.isArray(parsed?.workflows)) throw new Error("WORKFLOW_REGISTRY_INVALID");
  return parsed.workflows as RegistryEntry[];
}

function localComfyBase() {
  return assertLoopbackComfyUrl(
    String(process.env.VISUAL_CONSOLE_COMFYUI_URL ?? "http://127.0.0.1:8188"),
  );
}

async function fetchComfy(path: string, init?: RequestInit, timeoutMs = 5_000) {
  const response = await fetch(`${localComfyBase()}${path}`, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`COMFYUI_HTTP_${response.status}`);
  return response.json();
}

async function comfyStatus() {
  try {
    const [stats, queue] = await Promise.all([
      fetchComfy("/system_stats", undefined, 2_500),
      fetchComfy("/queue", undefined, 2_500),
    ]);
    return {
      online: true,
      endpoint: localComfyBase(),
      queue_running: Array.isArray(queue?.queue_running) ? queue.queue_running.length : 0,
      queue_pending: Array.isArray(queue?.queue_pending) ? queue.queue_pending.length : 0,
      devices: Array.isArray(stats?.devices)
        ? stats.devices.map((device: any) => ({
            name: device?.name ?? "GPU",
            type: device?.type ?? null,
            vram_total: device?.vram_total ?? null,
            vram_free: device?.vram_free ?? null,
            torch_vram_total: device?.torch_vram_total ?? null,
            torch_vram_free: device?.torch_vram_free ?? null,
          }))
        : [],
    };
  } catch (error) {
    return {
      online: false,
      endpoint: localComfyBase(),
      queue_running: 0,
      queue_pending: 0,
      devices: [],
      error: errorMessage(error),
    };
  }
}

async function submitPrompt(workflow: Record<string, unknown>) {
  const result = await fetchComfy(
    "/prompt",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: workflow, client_id: "visual-console-p2" }),
    },
    10_000,
  );
  const promptId = String(result?.prompt_id ?? "");
  if (!promptId) throw new Error("COMFYUI_PROMPT_ID_MISSING");
  return promptId;
}

async function waitForPromptHistory(promptId: string) {
  const deadline = Date.now() + COMFY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const history = await fetchComfy(`/history/${encodeURIComponent(promptId)}`, undefined, 5_000);
      const record = history?.[promptId] ?? history;
      if (record?.status?.status_str === "error") throw new Error("COMFYUI_PROMPT_FAILED");
      if (record?.outputs && Object.keys(record.outputs).length) return history;
    } catch (error) {
      if (errorMessage(error) === "COMFYUI_PROMPT_FAILED") throw error;
      if (/COMFYUI_HTTP_4\d\d/.test(errorMessage(error))) {
        await new Promise((resolveDelay) => setTimeout(resolveDelay, COMFY_POLL_MS));
        continue;
      }
      throw error;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, COMFY_POLL_MS));
  }
  throw new Error("COMFYUI_PROMPT_TIMEOUT");
}

async function rootStatus(path: string) {
  if (!path) return { path, reachable: false };
  try {
    const fs = await statfs(path);
    return {
      path,
      reachable: true,
      total_bytes: Number(fs.blocks) * Number(fs.bsize),
      free_bytes: Number(fs.bavail) * Number(fs.bsize),
    };
  } catch {
    return { path, reachable: existsSync(path) };
  }
}

export async function registerP2Routes(app: FastifyInstance, deps: Dependencies) {
  const jobs = new Map<string, P2Job>();
  const queue: string[] = [];
  const loadedSites = new Set<string>();
  let processing = false;

  async function persist(profile: SiteProfile, job: P2Job) {
    job.updated_at = nowIso();
    jobs.set(job.job_id, job);
    await mkdir(controlRoot(profile), { recursive: true });
    await appendJobSnapshot(journalPath(profile), job);
  }

  async function repairTornJournal(profile: SiteProfile, snapshotJobs: Map<string, P2Job>) {
    const path = journalPath(profile);
    if (!existsSync(path)) return;
    const backup = `${path}.torn-${new Date().toISOString().replace(/[:.]/g, "-")}.bak`;
    await rename(path, backup);
    const body = [...snapshotJobs.values()]
      .map((job) => JSON.stringify({ event: "JOB_SNAPSHOT", at: nowIso(), job }))
      .join("\n");
    await writeFile(path, body ? `${body}\n` : "", { flag: "wx" });
    app.log.warn({ path, backup }, "Recovered valid job snapshots from torn journal tail");
  }

  async function ensureSiteLoaded(profile: SiteProfile) {
    if (loadedSites.has(profile.site_id)) return;
    await mkdir(controlRoot(profile), { recursive: true });
    const result = await readJournal(journalPath(profile));
    if (result.tornTailIgnored) await repairTornJournal(profile, result.jobs);
    for (const job of result.jobs.values()) {
      jobs.set(job.job_id, job);
      if (["READY", "QUEUED", "RUNNING", "GENERATED"].includes(job.state)) {
        queue.push(job.job_id);
      }
    }
    loadedSites.add(profile.site_id);
    void processQueue();
  }

  async function bindingFor(profile: SiteProfile) {
    return readBindingState(workflowStatePath(profile));
  }

  async function prepareInput(
    profile: SiteProfile,
    job: P2Job,
    source: ResolvedRawAsset,
  ) {
    const extension = extname(source.filename).toLowerCase();
    if (!SC01_ALLOWED_EXT.has(extension)) throw new Error("SC01_INPUT_TYPE_UNSUPPORTED");
    const inputRoot = comfyInputRoot(profile);
    await ensureSafeDirectory(inputRoot, inputRoot);
    const filename = `VC__${safeId(job.item_id)}__${job.source_asset_id.slice(0, 12)}__${randomUUID().slice(0, 8)}${extension}`;
    const target = join(inputRoot, filename);
    assertInside(inputRoot, target);
    await copyVerifiedNoDelete(source.full, target);
    return filename;
  }

  async function captureOutput(
    profile: SiteProfile,
    job: P2Job,
    promptHistory: any,
  ) {
    if (!job.prompt_id) throw new Error("PROMPT_ID_MISSING_FOR_CAPTURE");
    const output = selectPromptOutput(promptHistory, job.prompt_id);
    basenameSafe(output.filename);
    const outputRoot = comfyOutputRoot(profile);
    const source = join(outputRoot, output.subfolder, output.filename);
    assertInside(outputRoot, source);
    await assertExistingRealInside(outputRoot, source);

    const targetDir = join(profile.staging_root, "visual-console", safeId(job.item_id), "cutout");
    await ensureSafeDirectory(profile.staging_root, targetDir);
    const existing = await readdir(targetDir);
    const version = allocateNextVersion(existing, job.item_id);
    const filename = versionedCutoutFilename(job.item_id, version);
    const target = join(targetDir, filename);
    assertInside(profile.staging_root, target);
    if (resolve(source) === resolve(target)) throw new Error("SC01_CAPTURE_SOURCE_TARGET_COLLISION");
    const copied = await copyVerifiedNoDelete(source, target);
    return {
      assetId: generatedAssetId(job.site_id, job.item_id, filename),
      filename,
      path: target,
      version,
      sha256: copied.sha256,
      sizeBytes: copied.sizeBytes,
    };
  }

  async function failJob(profile: SiteProfile, job: P2Job, state: P2Job["state"], error: unknown) {
    job.state = state;
    job.error = errorMessage(error);
    await persist(profile, job);
  }

  async function processJob(job: P2Job) {
    const profile = await deps.loadSite(job.site_id);
    await ensureSiteLoaded(profile);
    const binding = await bindingFor(profile);
    if (!binding) {
      await failJob(profile, job, "FAILED_SUBMIT", new Error("SC01_NOT_REGISTERED"));
      return;
    }

    let history: any;
    try {
      if (!job.prompt_id) {
        job.state = "RUNNING";
        job.workflow_hash = binding.workflow_hash;
        await persist(profile, job);

        const source = await deps.resolveRawAsset(profile, job.item_id, job.source_asset_id);
        const inputFilename = await prepareInput(profile, job, source);
        job.input_filename = inputFilename;
        const registered = await loadRegisteredWorkflow(binding);
        const promptWorkflow = injectLoadImage(
          registered,
          binding.load_image_node_id,
          inputFilename,
        );
        try {
          job.prompt_id = await submitPrompt(promptWorkflow);
          await persist(profile, job);
        } catch (error) {
          await failJob(profile, job, "FAILED_SUBMIT", error);
          return;
        }
      }

      try {
        history = await waitForPromptHistory(String(job.prompt_id));
        job.state = "GENERATED";
        await persist(profile, job);
      } catch (error) {
        await failJob(profile, job, "FAILED_RUNTIME", error);
        return;
      }

      try {
        const captured = await captureOutput(profile, job, history);
        job.generated_asset_id = captured.assetId;
        job.generated_filename = captured.filename;
        job.generated_path = captured.path;
        job.generated_sha256 = captured.sha256;
        job.generated_size_bytes = captured.sizeBytes;
        job.version = captured.version;
        job.state = "CAPTURED";
        await persist(profile, job);
        job.state = "QA_PENDING";
        await persist(profile, job);
      } catch (error) {
        await failJob(profile, job, "FAILED_CAPTURE", error);
      }
    } catch (error) {
      await failJob(profile, job, "FAILED_RUNTIME", error);
    }
  }

  async function processQueue() {
    if (processing) return;
    processing = true;
    try {
      while (queue.length) {
        const jobId = queue.shift()!;
        const job = jobs.get(jobId);
        if (!job) continue;
        if (!["READY", "QUEUED", "RUNNING", "GENERATED"].includes(job.state)) continue;
        await processJob(job);
      }
    } finally {
      processing = false;
    }
  }

  async function createQueuedJob(
    profile: SiteProfile,
    itemId: string,
    sourceAssetId: string,
    sourceFilename?: string,
  ) {
    const job: P2Job = {
      job_id: `job_${randomUUID()}`,
      site_id: profile.site_id,
      item_id: itemId,
      workflow_code: "SC01",
      source_asset_id: sourceAssetId,
      source_filename: sourceFilename,
      state: "QUEUED",
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    await persist(profile, job);
    queue.push(job.job_id);
    return job;
  }

  app.get("/api/workflows", async (req, reply) => {
    try {
      deps.assertLocalRequest(req);
      const siteId = String((req.query as any)?.site_id ?? "drift-curio");
      const profile = await deps.loadSite(siteId);
      await ensureSiteLoaded(profile);
      const [registry, binding] = await Promise.all([readRegistry(), bindingFor(profile)]);
      return registry.map((entry) =>
        entry.code === "SC01" && binding
          ? {
              ...entry,
              workflow_status: "REGISTERED",
              executable: profile.enabled_workflows.includes("SC01"),
              workflow_hash: binding.workflow_hash,
              registered_at: binding.registered_at,
            }
          : entry,
      );
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  app.post(
    "/api/workflows/SC01/register",
    { bodyLimit: SC01_IMPORT_LIMIT },
    async (req, reply) => {
      try {
        deps.assertLocalRequest(req);
        if (!String(req.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) {
          throw new Error("SC01_IMPORT_JSON_ONLY");
        }
        const siteId = String((req.query as any)?.site_id ?? "drift-curio");
        const profile = await deps.loadSite(siteId);
        const validation = validateSc01Workflow(req.body);
        const state = await persistSc01Binding({
          controlRoot: controlRoot(profile),
          workflow: validation.workflow,
          validation,
        });
        return {
          ok: true,
          workflow_code: "SC01",
          workflow_status: state.workflow_status,
          workflow_hash: state.workflow_hash,
          registered_at: state.registered_at,
          load_image_node_id: state.load_image_node_id,
          rmbg_node_id: state.rmbg_node_id,
        };
      } catch (error: any) {
        const code = error?.code === "FST_ERR_CTP_BODY_TOO_LARGE" ? 413 : 400;
        return reply.code(code).send({ error: errorMessage(error) });
      }
    },
  );

  app.get("/api/jobs", async (req, reply) => {
    try {
      deps.assertLocalRequest(req);
      const siteId = String((req.query as any)?.site_id ?? "drift-curio");
      const itemId = String((req.query as any)?.item_id ?? "");
      const profile = await deps.loadSite(siteId);
      if (itemId) deps.validateProfileItem(profile, itemId);
      await ensureSiteLoaded(profile);
      void processQueue();
      return [...jobs.values()]
        .filter((job) => job.site_id === siteId && (!itemId || job.item_id === itemId))
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map(publicJob);
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  app.post("/api/jobs/batch", async (req, reply) => {
    try {
      deps.assertLocalRequest(req);
      const body = req.body as any;
      if (String(body?.workflow_code ?? "") !== "SC01") throw new Error("ONLY_SC01_ALLOWED");
      const profile = await deps.loadSite(String(body?.site_id ?? ""));
      const itemId = deps.validateProfileItem(profile, String(body?.item_id ?? body?.sku ?? ""));
      await ensureSiteLoaded(profile);
      const binding = await bindingFor(profile);
      if (!binding || !profile.enabled_workflows.includes("SC01")) throw new Error("SC01_NOT_REGISTERED");
      const assetIds = Array.isArray(body?.asset_ids) ? body.asset_ids.map(String) : [];
      if (!assetIds.length || assetIds.length > 20) throw new Error("INVALID_BATCH_SIZE");

      const resolved: Array<{ assetId: string; asset: ResolvedRawAsset }> = [];
      for (const assetId of assetIds) {
        const asset = await deps.resolveRawAsset(profile, itemId, assetId);
        if (!SC01_ALLOWED_EXT.has(extname(asset.filename).toLowerCase())) {
          throw new Error(`SC01_INPUT_TYPE_UNSUPPORTED:${asset.filename}`);
        }
        resolved.push({ assetId, asset });
      }

      const created: P2Job[] = [];
      for (const row of resolved) {
        created.push(await createQueuedJob(profile, itemId, row.assetId, row.asset.filename));
      }
      void processQueue();
      return { ok: true, jobs: created.map(publicJob), serial: true };
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  app.post("/api/jobs/:jobId/retry", async (req, reply) => {
    try {
      deps.assertLocalRequest(req);
      const jobId = String((req.params as any)?.jobId ?? "");
      const original = jobs.get(jobId);
      if (!original) throw new Error("JOB_NOT_FOUND");
      const profile = await deps.loadSite(original.site_id);
      await ensureSiteLoaded(profile);
      const source = await deps.resolveRawAsset(profile, original.item_id, original.source_asset_id);
      const retry = await createQueuedJob(
        profile,
        original.item_id,
        original.source_asset_id,
        source.filename,
      );
      void processQueue();
      return { ok: true, job: publicJob(retry), retry_of: original.job_id };
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  app.get("/api/qa", async (req, reply) => {
    try {
      deps.assertLocalRequest(req);
      const siteId = String((req.query as any)?.site_id ?? "drift-curio");
      const itemId = String((req.query as any)?.item_id ?? "");
      const profile = await deps.loadSite(siteId);
      if (itemId) deps.validateProfileItem(profile, itemId);
      await ensureSiteLoaded(profile);
      return [...jobs.values()]
        .filter(
          (job) =>
            job.site_id === siteId &&
            (!itemId || job.item_id === itemId) &&
            Boolean(job.generated_asset_id) &&
            ["QA_PENDING", "QA_PASS", "QA_FAIL"].includes(job.state),
        )
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
        .map(publicJob);
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  app.post("/api/qa/:assetId/decision", async (req, reply) => {
    try {
      deps.assertLocalRequest(req);
      const assetId = String((req.params as any)?.assetId ?? "");
      const job = [...jobs.values()].find((candidate) => candidate.generated_asset_id === assetId);
      if (!job) throw new Error("QA_ASSET_NOT_FOUND");
      const profile = await deps.loadSite(job.site_id);
      await ensureSiteLoaded(profile);
      const body = req.body as any;
      const decision = String(body?.decision ?? "").toUpperCase();
      if (typeof body?.note === "string") job.qa_note = body.note.slice(0, 4000);
      if (decision === "PASS") job.state = "QA_PASS";
      else if (decision === "FAIL") job.state = "QA_FAIL";
      else if (decision === "NOTE") {
        if (!["QA_PENDING", "QA_PASS", "QA_FAIL"].includes(job.state)) {
          throw new Error("QA_NOTE_STATE_INVALID");
        }
      } else throw new Error("INVALID_QA_DECISION");
      await persist(profile, job);
      return { ok: true, job: publicJob(job) };
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  app.get(
    "/api/assets/generated/:siteId/:itemId/:assetId/content",
    async (req, reply) => {
      try {
        deps.assertLocalRequest(req);
        const { siteId, itemId, assetId } = req.params as any;
        const profile = await deps.loadSite(String(siteId));
        deps.validateProfileItem(profile, String(itemId));
        await ensureSiteLoaded(profile);
        const job = [...jobs.values()].find(
          (candidate) =>
            candidate.site_id === siteId &&
            candidate.item_id === itemId &&
            candidate.generated_asset_id === assetId,
        );
        if (!job?.generated_path) throw new Error("GENERATED_ASSET_NOT_FOUND");
        await assertExistingRealInside(profile.staging_root, job.generated_path);
        const info = await stat(job.generated_path);
        reply.type("image/png").header("Content-Length", String(info.size));
        return reply.send(createReadStream(job.generated_path));
      } catch (error) {
        return reply.code(404).send({ error: errorMessage(error) });
      }
    },
  );

  app.get("/api/system/status", async (req, reply) => {
    try {
      deps.assertLocalRequest(req);
      const siteId = String((req.query as any)?.site_id ?? "drift-curio");
      const profile = await deps.loadSite(siteId);
      await ensureSiteLoaded(profile);
      const [registry, binding, comfy, rawRoot, stagingRoot, control, inputRoot, outputRoot] =
        await Promise.all([
          readRegistry(),
          bindingFor(profile),
          comfyStatus(),
          rootStatus(profile.raw_root),
          rootStatus(profile.staging_root),
          rootStatus(controlRoot(profile)),
          rootStatus(comfyInputRoot(profile)),
          rootStatus(comfyOutputRoot(profile)),
        ]);
      return {
        ok: true,
        service: "visual-console-p2",
        version: "0.2.0-p2",
        comfyui: comfy,
        app_queue_depth: queue.length + (processing ? 1 : 0),
        workflow_registry: {
          known: registry.length,
          registered: binding ? 1 : 0,
          executable: binding && profile.enabled_workflows.includes("SC01") ? 1 : 0,
          sc01: binding
            ? {
                status: "REGISTERED",
                workflow_hash: binding.workflow_hash,
                registered_at: binding.registered_at,
              }
            : { status: "NOT_REGISTERED" },
        },
        roots: {
          raw: rawRoot,
          staging: stagingRoot,
          control,
          comfyui_input: inputRoot,
          comfyui_output: outputRoot,
        },
      };
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });
}
