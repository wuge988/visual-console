import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import {
  appendFile,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import {
  assertExistingRealInside,
  assertInside,
  ensureSafeDirectory,
  safeId,
  sha256File,
} from "./runtime-utils.js";
import {
  copyVerifiedNoDelete,
  readJournal,
  type P2Job,
} from "./p2-runtime.js";

export type P3SiteProfile = {
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
  asset_root?: string;
  comfyui_input_root?: string;
  comfyui_output_root?: string;
};

export type ArchiveHistoryEntry = {
  archived_at: string;
  gate: "15";
  workflow_code: "SC01";
  asset_id: string;
  filename: string;
  destination_key: "cutout";
  destination_path: string;
  size_bytes: number;
  sha256: string;
  result: "VERIFIED_ARCHIVE";
};

export type ArchiveRecord = ArchiveHistoryEntry & {
  event: "ARCHIVE_SNAPSHOT";
  site_id: string;
  item_id: string;
  source_deleted: true;
};

type Dependencies = {
  assertLocalRequest: (req: any) => void;
  loadSite: (siteId: string) => Promise<P3SiteProfile>;
  validateProfileItem: (profile: P3SiteProfile, itemId: string) => string;
};

let archiveMutationTail: Promise<void> = Promise.resolve();

export function runArchiveSerialized<T>(operation: () => Promise<T>): Promise<T> {
  const run = archiveMutationTail.then(operation, operation);
  archiveMutationTail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function controlRoot(profile: P3SiteProfile) {
  return (
    profile.control_root ??
    join(profile.manifest_root, "visual-console-p2", profile.site_id)
  );
}

function jobsJournalPath(profile: P3SiteProfile) {
  return join(controlRoot(profile), "jobs.jsonl");
}

function archiveJournalPath(profile: P3SiteProfile) {
  return join(controlRoot(profile), "archives.jsonl");
}

function formalAssetRoot(profile: P3SiteProfile) {
  return resolve(profile.asset_root ?? dirname(profile.raw_root));
}

function manifestPath(profile: P3SiteProfile, itemId: string) {
  const path = join(profile.manifest_root, `${safeId(itemId)}.json`);
  assertInside(profile.manifest_root, path);
  return path;
}

function nowIso() {
  return new Date().toISOString();
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function requireCapturedIdentity(job: P2Job) {
  if (job.workflow_code !== "SC01") throw new Error("ARCHIVE_ONLY_SC01_SUPPORTED");
  if (job.state !== "QA_PASS") throw new Error("ARCHIVE_REQUIRES_QA_PASS");
  if (!job.generated_asset_id) throw new Error("ARCHIVE_ASSET_ID_MISSING");
  if (!job.generated_filename) throw new Error("ARCHIVE_FILENAME_MISSING");
  if (!job.generated_path) throw new Error("ARCHIVE_SOURCE_PATH_MISSING");
  if (!/^[a-f0-9]{64}$/i.test(String(job.generated_sha256 ?? ""))) {
    throw new Error("ARCHIVE_SHA256_MISSING");
  }
  if (!Number.isInteger(job.generated_size_bytes) || Number(job.generated_size_bytes) < 0) {
    throw new Error("ARCHIVE_SIZE_MISSING");
  }
  if (!/^.+__cutout__master__wf-SC01__v\d{3}\.png$/i.test(job.generated_filename)) {
    throw new Error("ARCHIVE_FILENAME_NOT_SC01_STANDARD");
  }
  return {
    assetId: job.generated_asset_id,
    filename: job.generated_filename,
    source: job.generated_path,
    sha256: String(job.generated_sha256).toLowerCase(),
    sizeBytes: Number(job.generated_size_bytes),
  };
}

async function readManifest(profile: P3SiteProfile, itemId: string) {
  const path = manifestPath(profile, itemId);
  if (!existsSync(path)) throw new Error("ARCHIVE_MANIFEST_NOT_FOUND");
  const manifest = JSON.parse(await readFile(path, "utf8"));
  const declaredId = String(manifest?.sku ?? manifest?.item_id ?? "");
  if (declaredId && declaredId !== itemId) throw new Error("ARCHIVE_MANIFEST_ITEM_MISMATCH");
  if (!manifest?.destinations || typeof manifest.destinations !== "object") {
    throw new Error("ARCHIVE_MANIFEST_DESTINATIONS_MISSING");
  }
  return { path, manifest };
}

function resolveCutoutDestination(profile: P3SiteProfile, manifest: any) {
  const raw = manifest?.destinations?.cutout;
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("ARCHIVE_DESTINATION_CUTOUT_MISSING");
  }
  const root = formalAssetRoot(profile);
  const destinationDir = resolve(raw);
  assertInside(root, destinationDir);
  return { root, destinationDir };
}

function archiveEntryMatches(entry: any, expected: ArchiveHistoryEntry) {
  return (
    entry?.gate === "15" &&
    entry?.workflow_code === "SC01" &&
    entry?.asset_id === expected.asset_id &&
    entry?.filename === expected.filename &&
    entry?.destination_key === "cutout" &&
    resolve(String(entry?.destination_path ?? "")) === resolve(expected.destination_path) &&
    Number(entry?.size_bytes) === expected.size_bytes &&
    String(entry?.sha256 ?? "").toLowerCase() === expected.sha256 &&
    entry?.result === "VERIFIED_ARCHIVE"
  );
}

async function writeManifestAtomic(path: string, manifest: any) {
  const dir = dirname(path);
  await mkdir(dir, { recursive: true });
  const temp = `${path}.${randomUUID()}.tmp`;
  await writeFile(temp, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
  try {
    await rename(temp, path);
  } catch (error) {
    await rm(temp, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function ensureManifestArchiveHistory(
  manifestFile: string,
  manifest: any,
  expected: ArchiveHistoryEntry,
) {
  const history = Array.isArray(manifest.archive_history) ? manifest.archive_history : [];
  const existing = history.find((entry: any) => entry?.asset_id === expected.asset_id);
  if (existing) {
    if (!archiveEntryMatches(existing, expected)) throw new Error("ARCHIVE_HISTORY_CONFLICT");
    return existing as ArchiveHistoryEntry;
  }
  const entry = { ...expected };
  manifest.archive_history = [...history, entry];
  await writeManifestAtomic(manifestFile, manifest);
  return entry;
}

async function verifyFileSnapshot(path: string, expectedSize: number, expectedSha: string) {
  const info = await stat(path);
  if (info.size !== expectedSize) throw new Error("ARCHIVE_SIZE_MISMATCH");
  const hash = (await sha256File(path)).toLowerCase();
  if (hash !== expectedSha) throw new Error("ARCHIVE_SHA256_MISMATCH");
  return { sizeBytes: info.size, sha256: hash };
}

export async function readArchiveJournal(path: string) {
  const records = new Map<string, ArchiveRecord>();
  if (!existsSync(path)) return records;
  const lines = (await readFile(path, "utf8")).split(/\r?\n/).filter((line) => line.trim());
  for (let index = 0; index < lines.length; index++) {
    try {
      const row = JSON.parse(lines[index]);
      if (row?.event === "ARCHIVE_SNAPSHOT" && row?.asset_id) {
        records.set(String(row.asset_id), row as ArchiveRecord);
      }
    } catch {
      if (index === lines.length - 1) break;
      throw new Error("ARCHIVE_JOURNAL_CORRUPT");
    }
  }
  return records;
}

async function appendArchiveSnapshot(profile: P3SiteProfile, record: ArchiveRecord) {
  const path = archiveJournalPath(profile);
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify(record)}\n`, "utf8");
}

export async function archiveApprovedAsset(options: {
  profile: P3SiteProfile;
  job: P2Job;
  archivedAt?: string;
}) {
  const { profile, job } = options;
  const identity = requireCapturedIdentity(job);
  const source = resolve(identity.source);
  assertInside(profile.staging_root, source);

  const { path: manifestFile, manifest } = await readManifest(profile, job.item_id);
  const { root: assetRoot, destinationDir } = resolveCutoutDestination(profile, manifest);
  await ensureSafeDirectory(assetRoot, destinationDir);

  const target = join(destinationDir, identity.filename);
  assertInside(assetRoot, target);

  const history = Array.isArray(manifest.archive_history) ? manifest.archive_history : [];
  const priorHistory = history.find((entry: any) => entry?.asset_id === identity.assetId);
  const expectedEntry: ArchiveHistoryEntry = {
    archived_at: options.archivedAt ?? nowIso(),
    gate: "15",
    workflow_code: "SC01",
    asset_id: identity.assetId,
    filename: identity.filename,
    destination_key: "cutout",
    destination_path: target,
    size_bytes: identity.sizeBytes,
    sha256: identity.sha256,
    result: "VERIFIED_ARCHIVE",
  };
  const preflightEntry = priorHistory
    ? { ...expectedEntry, archived_at: String(priorHistory.archived_at ?? expectedEntry.archived_at) }
    : expectedEntry;
  if (priorHistory && !archiveEntryMatches(priorHistory, preflightEntry)) {
    throw new Error("ARCHIVE_HISTORY_CONFLICT");
  }

  const sourceExists = existsSync(source);
  if (!sourceExists && !priorHistory) {
    throw new Error("ARCHIVE_SOURCE_MISSING_WITHOUT_DURABLE_HISTORY");
  }

  if (sourceExists) {
    await assertExistingRealInside(profile.staging_root, source);
    await verifyFileSnapshot(source, identity.sizeBytes, identity.sha256);
  }

  if (existsSync(target)) {
    await assertExistingRealInside(assetRoot, target);
    try {
      await verifyFileSnapshot(target, identity.sizeBytes, identity.sha256);
    } catch {
      throw new Error("ARCHIVE_TARGET_CONFLICT");
    }
  } else {
    if (!sourceExists) throw new Error("ARCHIVE_TARGET_MISSING_AFTER_DURABLE_HISTORY");
    const copied = await copyVerifiedNoDelete(source, target);
    if (copied.sizeBytes !== identity.sizeBytes || copied.sha256.toLowerCase() !== identity.sha256) {
      await rm(target, { force: true }).catch(() => undefined);
      throw new Error("ARCHIVE_COPY_VERIFICATION_FAILED");
    }
  }

  // Verify the formal target again immediately before committing history.
  await verifyFileSnapshot(target, identity.sizeBytes, identity.sha256);

  const durableEntry = priorHistory
    ? await ensureManifestArchiveHistory(manifestFile, manifest, preflightEntry)
    : await ensureManifestArchiveHistory(manifestFile, manifest, expectedEntry);

  // Delete-last invariant: re-verify F after durable Manifest persistence.
  await verifyFileSnapshot(target, identity.sizeBytes, identity.sha256);
  if (existsSync(source)) {
    await assertExistingRealInside(profile.staging_root, source);
    await rm(source);
  }

  if (existsSync(source)) throw new Error("ARCHIVE_SOURCE_DELETE_FAILED");

  const record: ArchiveRecord = {
    ...durableEntry,
    event: "ARCHIVE_SNAPSHOT",
    site_id: profile.site_id,
    item_id: job.item_id,
    source_deleted: true,
  };
  await appendArchiveSnapshot(profile, record);
  return record;
}

async function latestJobs(profile: P3SiteProfile) {
  return (await readJournal(jobsJournalPath(profile))).jobs;
}

async function findJobByAsset(profile: P3SiteProfile, itemId: string, assetId: string) {
  const jobs = await latestJobs(profile);
  const job = [...jobs.values()].find(
    (candidate) =>
      candidate.site_id === profile.site_id &&
      candidate.item_id === itemId &&
      candidate.generated_asset_id === assetId,
  );
  if (!job) throw new Error("ARCHIVE_ASSET_NOT_FOUND");
  return job;
}

function publicArchive(record: ArchiveRecord) {
  const { destination_path: _path, ...safe } = record;
  return safe;
}

function mimeFor(filename: string) {
  const ext = extname(filename).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  return "application/octet-stream";
}

export async function registerP3ArchiveRoutes(app: FastifyInstance, deps: Dependencies) {
  app.get("/api/archive", async (req, reply) => {
    try {
      deps.assertLocalRequest(req);
      const siteId = String((req.query as any)?.site_id ?? "drift-curio");
      const itemId = String((req.query as any)?.item_id ?? "");
      const profile = await deps.loadSite(siteId);
      if (itemId) deps.validateProfileItem(profile, itemId);
      const records = await readArchiveJournal(archiveJournalPath(profile));
      return [...records.values()]
        .filter((record) => !itemId || record.item_id === itemId)
        .sort((a, b) => b.archived_at.localeCompare(a.archived_at))
        .map(publicArchive);
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  app.post("/api/archive/batch", async (req, reply) => {
    try {
      deps.assertLocalRequest(req);
      const body = req.body as any;
      const profile = await deps.loadSite(String(body?.site_id ?? ""));
      const itemId = deps.validateProfileItem(profile, String(body?.item_id ?? body?.sku ?? ""));
      const assetIds = Array.isArray(body?.asset_ids) ? body.asset_ids.map(String) : [];
      if (!assetIds.length || assetIds.length > 20) throw new Error("INVALID_ARCHIVE_BATCH_SIZE");
      const results: any[] = [];
      for (const assetId of assetIds) {
        try {
          const job = await findJobByAsset(profile, itemId, assetId);
          const record = await runArchiveSerialized(() => archiveApprovedAsset({ profile, job }));
          results.push({ asset_id: assetId, ok: true, archive: publicArchive(record) });
        } catch (error) {
          results.push({ asset_id: assetId, ok: false, error: errorMessage(error) });
        }
      }
      return {
        ok: results.every((row) => row.ok),
        serial: true,
        results,
      };
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  app.post("/api/archive/:siteId/:itemId/:assetId", async (req, reply) => {
    try {
      deps.assertLocalRequest(req);
      const { siteId, itemId, assetId } = req.params as any;
      const profile = await deps.loadSite(String(siteId));
      deps.validateProfileItem(profile, String(itemId));
      const job = await findJobByAsset(profile, String(itemId), String(assetId));
      const record = await runArchiveSerialized(() => archiveApprovedAsset({ profile, job }));
      return { ok: true, archive: publicArchive(record) };
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  app.get("/api/archive/assets/:siteId/:itemId/:assetId/content", async (req, reply) => {
    try {
      deps.assertLocalRequest(req);
      const { siteId, itemId, assetId } = req.params as any;
      const profile = await deps.loadSite(String(siteId));
      deps.validateProfileItem(profile, String(itemId));
      const records = await readArchiveJournal(archiveJournalPath(profile));
      const record = records.get(String(assetId));
      if (!record || record.item_id !== itemId || record.site_id !== siteId) {
        throw new Error("ARCHIVE_ASSET_NOT_FOUND");
      }
      const root = formalAssetRoot(profile);
      const target = resolve(record.destination_path);
      await assertExistingRealInside(root, target);
      await verifyFileSnapshot(target, record.size_bytes, record.sha256);
      const info = await stat(target);
      reply.type(mimeFor(record.filename)).header("Content-Length", String(info.size));
      return reply.send(createReadStream(target));
    } catch (error) {
      return reply.code(404).send({ error: errorMessage(error) });
    }
  });
}
