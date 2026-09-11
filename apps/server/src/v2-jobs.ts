import type { FastifyInstance } from "fastify";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { readJournal, type P2Job } from "./p2-runtime.js";

export type V2JobSiteProfile = {
  site_id: string;
  manifest_root: string;
  control_root?: string;
};

type Dependencies = {
  assertLocalRequest: (req: any) => void;
  loadSite: (siteId: string) => Promise<V2JobSiteProfile>;
};

export type UnifiedGenerationState = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";
export type UnifiedQaState = "NOT_REQUIRED" | "QA_PENDING" | "QA_PASS" | "QA_FAIL";
export type UnifiedArchiveState = "STAGING" | "ARCHIVE_READY" | "VERIFIED_ARCHIVE" | "REJECTED";
export type UnifiedAction = "NONE" | "HUMAN_REVIEW" | "RETRY_AVAILABLE";

export type UnifiedJob = {
  job_id: string;
  site_id: string;
  item_id: string;
  workflow_code: string;
  source_asset_id: string;
  source_filename?: string;
  generated_asset_id?: string;
  generated_filename?: string;
  generation_state: UnifiedGenerationState;
  qa_state: UnifiedQaState;
  archive_state: UnifiedArchiveState;
  action_required: UnifiedAction;
  retryable: boolean;
  legacy_state: P2Job["state"];
  created_at: string;
  updated_at: string;
  error?: string;
  qa_note?: string;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function controlRoot(profile: V2JobSiteProfile) {
  return profile.control_root ?? join(profile.manifest_root, "visual-console-p2", profile.site_id);
}

function journalPath(profile: V2JobSiteProfile) {
  return join(controlRoot(profile), "jobs.jsonl");
}

export function projectUnifiedJob(job: P2Job): UnifiedJob {
  let generationState: UnifiedGenerationState;
  if (["READY", "QUEUED"].includes(job.state)) generationState = "QUEUED";
  else if (["RUNNING", "GENERATED"].includes(job.state)) generationState = "RUNNING";
  else if (["CAPTURED", "QA_PENDING", "QA_PASS", "QA_FAIL"].includes(job.state)) generationState = "SUCCEEDED";
  else if (job.state === "FAILED_QA" && Boolean(job.generated_asset_id)) generationState = "SUCCEEDED";
  else generationState = "FAILED";

  let qaState: UnifiedQaState = "NOT_REQUIRED";
  if (["CAPTURED", "QA_PENDING"].includes(job.state)) qaState = "QA_PENDING";
  else if (job.state === "QA_PASS") qaState = "QA_PASS";
  else if (["QA_FAIL", "FAILED_QA"].includes(job.state)) qaState = "QA_FAIL";

  const archiveState: UnifiedArchiveState = qaState === "QA_FAIL" ? "REJECTED" : "STAGING";
  const retryable = [
    "FAILED_SUBMIT",
    "FAILED_RUNTIME",
    "FAILED_CAPTURE",
    "FAILED_QA",
    "QA_FAIL",
  ].includes(job.state);

  let actionRequired: UnifiedAction = "NONE";
  if (qaState === "QA_PENDING") actionRequired = "HUMAN_REVIEW";
  else if (retryable) actionRequired = "RETRY_AVAILABLE";

  return {
    job_id: job.job_id,
    site_id: job.site_id,
    item_id: job.item_id,
    workflow_code: job.workflow_code,
    source_asset_id: job.source_asset_id,
    source_filename: job.source_filename,
    generated_asset_id: job.generated_asset_id,
    generated_filename: job.generated_filename,
    generation_state: generationState,
    qa_state: qaState,
    archive_state: archiveState,
    action_required: actionRequired,
    retryable,
    legacy_state: job.state,
    created_at: job.created_at,
    updated_at: job.updated_at,
    error: job.error,
    qa_note: job.qa_note,
  };
}

export function filterUnifiedJobs(
  jobs: UnifiedJob[],
  query: Record<string, unknown>,
): UnifiedJob[] {
  const generation = String(query.generation_state ?? "").toUpperCase();
  const qa = String(query.qa_state ?? "").toUpperCase();
  const workflow = String(query.workflow_code ?? "").toUpperCase();
  const itemId = String(query.item_id ?? "").trim();
  const action = String(query.action_required ?? "").toUpperCase();

  return jobs.filter((job) => {
    if (generation && job.generation_state !== generation) return false;
    if (qa && job.qa_state !== qa) return false;
    if (workflow && job.workflow_code.toUpperCase() !== workflow) return false;
    if (itemId && job.item_id !== itemId) return false;
    if (action && job.action_required !== action) return false;
    return true;
  });
}

export async function registerV2JobRoutes(app: FastifyInstance, deps: Dependencies) {
  app.get("/api/v2/jobs", async (req, reply) => {
    try {
      deps.assertLocalRequest(req);
      const query = (req.query as Record<string, unknown>) ?? {};
      const siteId = String(query.site_id ?? "drift-curio");
      const profile = await deps.loadSite(siteId);
      const path = journalPath(profile);
      const result = existsSync(path)
        ? await readJournal(path)
        : { jobs: new Map<string, P2Job>(), tornTailIgnored: false };

      const projected = [...result.jobs.values()]
        .filter((job) => job.site_id === siteId)
        .map(projectUnifiedJob)
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
      const filtered = filterUnifiedJobs(projected, query);
      const rawLimit = Number(query.limit ?? 100);
      const limit = Number.isFinite(rawLimit) ? Math.min(500, Math.max(1, Math.trunc(rawLimit))) : 100;

      return {
        ok: true,
        site_id: siteId,
        source: "P2_JOB_JOURNAL_READ_ONLY",
        torn_tail_ignored: result.tornTailIgnored,
        total: filtered.length,
        jobs: filtered.slice(0, limit),
      };
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });
}
