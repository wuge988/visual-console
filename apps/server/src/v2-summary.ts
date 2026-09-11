import type { FastifyInstance } from "fastify";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { readJournal, assertLoopbackComfyUrl, type P2Job } from "./p2-runtime.js";
import { readArchiveJournal, type ArchiveRecord } from "./p3-archive.js";

export type V2SummarySiteProfile = {
  site_id: string;
  manifest_root: string;
  control_root?: string;
};

type Dependencies = {
  assertLocalRequest: (req: any) => void;
  loadSite: (siteId: string) => Promise<V2SummarySiteProfile>;
};

function controlRoot(profile: V2SummarySiteProfile) {
  return profile.control_root ?? join(profile.manifest_root, "visual-console-p2", profile.site_id);
}

function jobsPath(profile: V2SummarySiteProfile) {
  return join(controlRoot(profile), "jobs.jsonl");
}

function archivePath(profile: V2SummarySiteProfile) {
  return join(controlRoot(profile), "archives.jsonl");
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function localDayKey(input: string | Date) {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function inLocalDay(iso: string | undefined, dayKey: string) {
  return Boolean(iso && localDayKey(iso) === dayKey);
}

function isGenerationFailed(job: P2Job) {
  return job.state.startsWith("FAILED_");
}

function hasGenerationOutput(job: P2Job) {
  return Boolean(job.generated_asset_id) || ["CAPTURED", "QA_PENDING", "QA_PASS", "QA_FAIL"].includes(job.state);
}

export function buildV2Summary(options: {
  jobs: P2Job[];
  archives: ArchiveRecord[];
  dayKey: string;
  system: {
    comfyuiOnline: boolean;
    comfyQueueRunning: number;
    comfyQueuePending: number;
  };
}) {
  const dayJobs = options.jobs.filter((job) => inLocalDay(job.created_at, options.dayKey));
  const dayArchives = options.archives.filter((record) => inLocalDay(record.archived_at, options.dayKey));
  const archivedIds = new Set(options.archives.map((record) => record.asset_id));

  const queued = dayJobs.filter((job) => ["READY", "QUEUED"].includes(job.state)).length;
  const running = dayJobs.filter((job) => ["RUNNING", "GENERATED"].includes(job.state)).length;
  const failed = dayJobs.filter(isGenerationFailed).length;
  const completed = dayJobs.filter((job) => hasGenerationOutput(job) && !isGenerationFailed(job)).length;

  const qaPending = dayJobs.filter((job) => job.state === "QA_PENDING").length;
  const qaPassed = dayJobs.filter((job) => job.state === "QA_PASS").length;
  const qaRejected = dayJobs.filter((job) => job.state === "QA_FAIL").length;
  const archiveReady = options.jobs.filter(
    (job) => job.state === "QA_PASS" && Boolean(job.generated_asset_id) && !archivedIds.has(String(job.generated_asset_id)),
  ).length;

  const appActive = options.jobs.filter((job) => ["READY", "QUEUED", "RUNNING", "GENERATED"].includes(job.state)).length;
  const nativeQueue = options.system.comfyQueueRunning + options.system.comfyQueuePending;

  return {
    window: "TODAY",
    day_key: options.dayKey,
    generation: { queued, running, completed, failed },
    qa: { pending: qaPending, passed: qaPassed, rejected: qaRejected },
    archive: { ready: archiveReady, archived: dayArchives.length },
    system: {
      comfyui: options.system.comfyuiOnline ? "ONLINE" : "OFFLINE",
      worker: appActive > 0 || nativeQueue > 0 ? "BUSY" : "IDLE",
      queue_depth: appActive,
      comfy_queue_running: options.system.comfyQueueRunning,
      comfy_queue_pending: options.system.comfyQueuePending,
    },
    cloud_cost: {
      enabled: false,
      currency: "USD",
      today: 0,
      month: 0,
      reason: "CLOUD_NOT_CONFIGURED",
    },
  };
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
    const queue = await queueResponse.json();
    return {
      comfyuiOnline: true,
      comfyQueueRunning: Array.isArray(queue?.queue_running) ? queue.queue_running.length : 0,
      comfyQueuePending: Array.isArray(queue?.queue_pending) ? queue.queue_pending.length : 0,
    };
  } catch {
    return { comfyuiOnline: false, comfyQueueRunning: 0, comfyQueuePending: 0 };
  }
}

export async function registerV2SummaryRoutes(app: FastifyInstance, deps: Dependencies) {
  app.get("/api/v2/summary", async (req, reply) => {
    try {
      deps.assertLocalRequest(req);
      const siteId = String((req.query as any)?.site_id ?? "drift-curio");
      const profile = await deps.loadSite(siteId);
      const [journal, archiveMap, system] = await Promise.all([
        readJournal(jobsPath(profile)),
        existsSync(archivePath(profile)) ? readArchiveJournal(archivePath(profile)) : Promise.resolve(new Map<string, ArchiveRecord>()),
        comfyTruth(),
      ]);
      const summary = buildV2Summary({
        jobs: [...journal.jobs.values()].filter((job) => job.site_id === siteId),
        archives: [...archiveMap.values()].filter((record) => record.site_id === siteId),
        dayKey: localDayKey(new Date()),
        system,
      });
      return { ok: true, site_id: siteId, generated_at: new Date().toISOString(), ...summary };
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });
}
