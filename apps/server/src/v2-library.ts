import type { FastifyInstance } from "fastify";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readJournal, type P2Job } from "./p2-runtime.js";
import { projectUnifiedJob, type UnifiedArchiveState, type UnifiedGenerationState, type UnifiedQaState } from "./v2-jobs.js";

const ROOT = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const PROMPT_REGISTRY_PATH = join(ROOT, "config", "prompts", "registry.json");

export type V2LibrarySiteProfile = {
  site_id: string;
  manifest_root: string;
  control_root?: string;
};

type Dependencies = {
  assertLocalRequest: (req: any) => void;
  loadSite: (siteId: string) => Promise<V2LibrarySiteProfile>;
};

export type AssetRole = "RAW_SOURCE" | "GENERATED_DERIVATIVE";

export type LibraryAsset = {
  library_id: string;
  asset_id: string;
  site_id: string;
  item_id: string;
  role: AssetRole;
  media_type: "image" | "video" | "file" | "unknown";
  filename?: string;
  immutable_source: boolean;
  provenance_source: "P2_JOB_JOURNAL_SOURCE_REFERENCE" | "P2_JOB_JOURNAL_GENERATED_REFERENCE";
  related_job_ids: string[];
  workflow_codes: string[];
  generation_state?: UnifiedGenerationState;
  qa_state?: UnifiedQaState;
  archive_state?: UnifiedArchiveState;
  first_seen_at: string;
  last_seen_at: string;
};

export type PromptRegistryEntry = {
  prompt_key: string;
  version: string;
  display_name: string;
  scene_type: string;
  status: string;
  body: string;
  negative_constraints: string[];
  exact_piece_constraints: string[];
  compatible_workflows: string[];
  compatible_models: string[];
  site_scope: string[];
  tags: string[];
  notes?: string;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function controlRoot(profile: V2LibrarySiteProfile) {
  return profile.control_root ?? join(profile.manifest_root, "visual-console-p2", profile.site_id);
}

function journalPath(profile: V2LibrarySiteProfile) {
  return join(controlRoot(profile), "jobs.jsonl");
}

function mediaType(filename?: string): LibraryAsset["media_type"] {
  if (!filename) return "unknown";
  const ext = extname(filename).toLowerCase();
  if ([".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"].includes(ext)) return "image";
  if ([".mov", ".mp4", ".webm"].includes(ext)) return "video";
  return "file";
}

function addUnique(rows: string[], value: string) {
  if (!rows.includes(value)) rows.push(value);
}

export function projectJournalAssets(jobs: P2Job[]): LibraryAsset[] {
  const sources = new Map<string, LibraryAsset>();
  const derivatives: LibraryAsset[] = [];

  for (const job of jobs) {
    const sourceKey = `${job.site_id}:${job.item_id}:${job.source_asset_id}`;
    const existing = sources.get(sourceKey);
    if (existing) {
      addUnique(existing.related_job_ids, job.job_id);
      addUnique(existing.workflow_codes, job.workflow_code);
      if (!existing.filename && job.source_filename) {
        existing.filename = job.source_filename;
        existing.media_type = mediaType(job.source_filename);
      }
      if (job.created_at < existing.first_seen_at) existing.first_seen_at = job.created_at;
      if (job.updated_at > existing.last_seen_at) existing.last_seen_at = job.updated_at;
    } else {
      sources.set(sourceKey, {
        library_id: `source:${sourceKey}`,
        asset_id: job.source_asset_id,
        site_id: job.site_id,
        item_id: job.item_id,
        role: "RAW_SOURCE",
        media_type: mediaType(job.source_filename),
        filename: job.source_filename,
        immutable_source: true,
        provenance_source: "P2_JOB_JOURNAL_SOURCE_REFERENCE",
        related_job_ids: [job.job_id],
        workflow_codes: [job.workflow_code],
        first_seen_at: job.created_at,
        last_seen_at: job.updated_at,
      });
    }

    if (!job.generated_asset_id) continue;
    const unified = projectUnifiedJob(job);
    derivatives.push({
      library_id: `generated:${job.job_id}:${job.generated_asset_id}`,
      asset_id: job.generated_asset_id,
      site_id: job.site_id,
      item_id: job.item_id,
      role: "GENERATED_DERIVATIVE",
      media_type: mediaType(job.generated_filename),
      filename: job.generated_filename,
      immutable_source: false,
      provenance_source: "P2_JOB_JOURNAL_GENERATED_REFERENCE",
      related_job_ids: [job.job_id],
      workflow_codes: [job.workflow_code],
      generation_state: unified.generation_state,
      qa_state: unified.qa_state,
      archive_state: unified.archive_state,
      first_seen_at: job.created_at,
      last_seen_at: job.updated_at,
    });
  }

  return [...sources.values(), ...derivatives].sort((a, b) => b.last_seen_at.localeCompare(a.last_seen_at));
}

export function filterLibraryAssets(assets: LibraryAsset[], query: Record<string, unknown>) {
  const role = String(query.role ?? "").toUpperCase();
  const itemId = String(query.item_id ?? "").trim();
  const workflow = String(query.workflow_code ?? "").toUpperCase();
  const qa = String(query.qa_state ?? "").toUpperCase();
  const archive = String(query.archive_state ?? "").toUpperCase();
  const search = String(query.q ?? "").trim().toLowerCase();

  return assets.filter((asset) => {
    if (role && asset.role !== role) return false;
    if (itemId && asset.item_id !== itemId) return false;
    if (workflow && !asset.workflow_codes.some((code) => code.toUpperCase() === workflow)) return false;
    if (qa && asset.qa_state !== qa) return false;
    if (archive && asset.archive_state !== archive) return false;
    if (search) {
      const haystack = [asset.asset_id, asset.item_id, asset.filename ?? "", ...asset.workflow_codes]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
}

export function projectPromptRegistry(entries: PromptRegistryEntry[], siteId: string) {
  return entries.filter((entry) => {
    if (!Array.isArray(entry.site_scope) || entry.site_scope.length === 0) return true;
    return entry.site_scope.includes("*") || entry.site_scope.includes(siteId);
  });
}

export function filterPrompts(entries: PromptRegistryEntry[], query: Record<string, unknown>) {
  const sceneType = String(query.scene_type ?? "").trim().toLowerCase();
  const status = String(query.status ?? "").trim().toLowerCase();
  const tag = String(query.tag ?? "").trim().toLowerCase();
  const search = String(query.q ?? "").trim().toLowerCase();

  return entries.filter((entry) => {
    if (sceneType && entry.scene_type.toLowerCase() !== sceneType) return false;
    if (status && entry.status.toLowerCase() !== status) return false;
    if (tag && !entry.tags.some((value) => value.toLowerCase() === tag)) return false;
    if (search) {
      const haystack = [
        entry.prompt_key,
        entry.version,
        entry.display_name,
        entry.scene_type,
        entry.status,
        entry.body,
        ...entry.tags,
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
}

async function readPromptRegistry(): Promise<{ schema_version: string; prompts: PromptRegistryEntry[] }> {
  const parsed = JSON.parse(await readFile(PROMPT_REGISTRY_PATH, "utf8"));
  if (!Array.isArray(parsed?.prompts)) throw new Error("PROMPT_REGISTRY_INVALID");
  return {
    schema_version: String(parsed.schema_version ?? "unknown"),
    prompts: parsed.prompts as PromptRegistryEntry[],
  };
}

export async function registerV2LibraryRoutes(app: FastifyInstance, deps: Dependencies) {
  app.get("/api/v2/assets", async (req, reply) => {
    try {
      deps.assertLocalRequest(req);
      const query = (req.query as Record<string, unknown>) ?? {};
      const siteId = String(query.site_id ?? "drift-curio");
      const profile = await deps.loadSite(siteId);
      const path = journalPath(profile);
      const journal = existsSync(path)
        ? await readJournal(path)
        : { jobs: new Map<string, P2Job>(), tornTailIgnored: false };
      const projected = projectJournalAssets(
        [...journal.jobs.values()].filter((job) => job.site_id === siteId),
      );
      const filtered = filterLibraryAssets(projected, query);
      const rawLimit = Number(query.limit ?? 250);
      const limit = Number.isFinite(rawLimit) ? Math.min(1000, Math.max(1, Math.trunc(rawLimit))) : 250;

      return {
        ok: true,
        site_id: siteId,
        source: "P2_JOB_JOURNAL_READ_ONLY",
        completeness: "JOURNAL_REFERENCED_ASSETS_ONLY",
        torn_tail_ignored: journal.tornTailIgnored,
        total: filtered.length,
        assets: filtered.slice(0, limit),
      };
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  app.get("/api/v2/registries/prompts", async (req, reply) => {
    try {
      deps.assertLocalRequest(req);
      const query = (req.query as Record<string, unknown>) ?? {};
      const siteId = String(query.site_id ?? "drift-curio");
      await deps.loadSite(siteId);
      const registry = await readPromptRegistry();
      const projected = projectPromptRegistry(registry.prompts, siteId);
      const filtered = filterPrompts(projected, query);

      return {
        ok: true,
        site_id: siteId,
        schema_version: registry.schema_version,
        source: "PROMPT_REGISTRY_READ_ONLY",
        total: filtered.length,
        prompts: filtered,
      };
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });
}
