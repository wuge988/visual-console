import type { FastifyInstance } from "fastify";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import {
  appendFile,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  assertExistingRealInside,
  assertInside,
  ensureSafeDirectory,
  safeId,
  sha256File,
} from "./runtime-utils.js";
import { copyVerifiedNoDelete } from "./p2-runtime.js";
import { readArchiveJournal, runArchiveSerialized } from "./p3-archive.js";
import { flattenRgbaPngOnDark, SD01_BACKGROUND_HEX, SD01_RENDERER_ID } from "./png-dark.js";

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
  asset_root?: string;
};

type Dependencies = {
  assertLocalRequest: (req: any) => void;
  loadSite: (siteId: string) => Promise<SiteProfile>;
  validateProfileItem: (profile: SiteProfile, itemId: string) => string;
};

type DarkState = "GENERATING" | "QA_PENDING" | "QA_PASS" | "QA_FAIL" | "FAILED_GENERATION";

export type DarkDerivativeRecord = {
  event: "DARK_DERIVATIVE_SNAPSHOT";
  derivative_id: string;
  site_id: string;
  item_id: string;
  workflow_code: "SD01";
  renderer_id: typeof SD01_RENDERER_ID;
  background_hex: typeof SD01_BACKGROUND_HEX;
  source_asset_id: string;
  source_filename: string;
  source_sha256: string;
  source_size_bytes: number;
  source_archive_path: string;
  generated_asset_id: string;
  generated_filename: string;
  generated_path: string;
  generated_sha256?: string;
  generated_size_bytes?: number;
  width?: number;
  height?: number;
  version: number;
  state: DarkState;
  created_at: string;
  updated_at: string;
  qa_note?: string;
  error?: string;
};

type VerifiedCutout = {
  assetId: string;
  filename: string;
  path: string;
  sha256: string;
  sizeBytes: number;
  bytes: Buffer;
};

type DarkArchiveEntry = {
  archived_at: string;
  gate: "15";
  workflow_code: "SD01";
  asset_id: string;
  filename: string;
  destination_key: "dark";
  destination_path: string;
  size_bytes: number;
  sha256: string;
  result: "VERIFIED_ARCHIVE";
};

type DarkArchiveRecord = DarkArchiveEntry & {
  event: "ARCHIVE_SNAPSHOT";
  site_id: string;
  item_id: string;
  source_deleted: true;
};

let mutationTail: Promise<void> = Promise.resolve();

function serialized<T>(operation: () => Promise<T>) {
  const run = mutationTail.then(operation, operation);
  mutationTail = run.then(() => undefined, () => undefined);
  return run;
}

function nowIso() {
  return new Date().toISOString();
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function sha256Buffer(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function controlRoot(profile: SiteProfile) {
  return profile.control_root ?? join(profile.manifest_root, "visual-console-p2", profile.site_id);
}

function journalPath(profile: SiteProfile) {
  return join(controlRoot(profile), "dark-derivatives.jsonl");
}

function archiveJournalPath(profile: SiteProfile) {
  return join(controlRoot(profile), "archives.jsonl");
}

function formalAssetRoot(profile: SiteProfile) {
  return resolve(profile.asset_root ?? dirname(profile.raw_root));
}

function manifestPath(profile: SiteProfile, itemId: string) {
  const path = join(profile.manifest_root, `${safeId(itemId)}.json`);
  assertInside(profile.manifest_root, path);
  return path;
}

function darkStagingDir(profile: SiteProfile, itemId: string) {
  const dir = join(profile.staging_root, "visual-console", safeId(itemId), "dark");
  assertInside(profile.staging_root, dir);
  return dir;
}

function darkFilename(itemId: string, version: number) {
  return `${itemId}__dark__master__wf-SD01__v${String(version).padStart(3, "0")}.png`;
}

function assetId(siteId: string, itemId: string, filename: string) {
  return createHash("sha256")
    .update(`${siteId}|${itemId}|SD01|${filename}`)
    .digest("hex")
    .slice(0, 32);
}

function derivativeId(siteId: string, itemId: string, sourceAssetId: string, filename: string) {
  return `dark_${createHash("sha256")
    .update(`${siteId}|${itemId}|${sourceAssetId}|SD01|${filename}`)
    .digest("hex")
    .slice(0, 24)}`;
}

function publicRecord(record: DarkDerivativeRecord, archived = false) {
  const { source_archive_path: _source, generated_path: _generated, ...safe } = record;
  return { ...safe, archived };
}

function parseManifest(text: string) {
  const normalized = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  try {
    return JSON.parse(normalized);
  } catch {
    throw new Error("SD01_MANIFEST_INVALID_JSON");
  }
}

async function readManifest(profile: SiteProfile, itemId: string) {
  const path = manifestPath(profile, itemId);
  if (!existsSync(path)) throw new Error("SD01_MANIFEST_NOT_FOUND");
  const manifest = parseManifest(await readFile(path, "utf8"));
  const declaredId = String(manifest?.sku ?? manifest?.item_id ?? "");
  if (declaredId && declaredId !== itemId) throw new Error("SD01_MANIFEST_ITEM_MISMATCH");
  if (!manifest?.destinations || typeof manifest.destinations !== "object") {
    throw new Error("SD01_MANIFEST_DESTINATIONS_MISSING");
  }
  return { path, manifest };
}

function resolveDarkDestination(profile: SiteProfile, manifest: any) {
  const raw = manifest?.destinations?.dark;
  if (typeof raw !== "string" || !raw.trim()) throw new Error("SD01_DESTINATION_DARK_MISSING");
  const root = formalAssetRoot(profile);
  const destinationDir = resolve(raw);
  assertInside(root, destinationDir);
  return { root, destinationDir };
}

async function verifyFile(path: string, expectedSize: number, expectedSha: string, prefix: string) {
  const info = await stat(path);
  if (info.size !== expectedSize) throw new Error(`${prefix}_SIZE_MISMATCH`);
  const hash = (await sha256File(path)).toLowerCase();
  if (hash !== expectedSha.toLowerCase()) throw new Error(`${prefix}_SHA256_MISMATCH`);
  return { sizeBytes: info.size, sha256: hash };
}

function verifyBytes(bytes: Buffer, expectedSize: number, expectedSha: string, prefix: string) {
  if (bytes.length !== expectedSize) throw new Error(`${prefix}_SIZE_MISMATCH`);
  const hash = sha256Buffer(bytes);
  if (hash !== expectedSha.toLowerCase()) throw new Error(`${prefix}_SHA256_MISMATCH`);
}

function sourceHistoryMatches(entry: any, source: any) {
  return (
    entry?.gate === "15" &&
    entry?.workflow_code === "SC01" &&
    entry?.asset_id === source.asset_id &&
    entry?.filename === source.filename &&
    entry?.destination_key === "cutout" &&
    resolve(String(entry?.destination_path ?? "")) === resolve(String(source.destination_path ?? "")) &&
    Number(entry?.size_bytes) === Number(source.size_bytes) &&
    String(entry?.sha256 ?? "").toLowerCase() === String(source.sha256 ?? "").toLowerCase() &&
    entry?.result === "VERIFIED_ARCHIVE"
  );
}

async function resolveVerifiedCutout(profile: SiteProfile, itemId: string, sourceAssetId: string): Promise<VerifiedCutout> {
  if (!/^[a-f0-9]{32}$/i.test(sourceAssetId)) throw new Error("SD01_SOURCE_ASSET_ID_INVALID");
  const archives = await readArchiveJournal(archiveJournalPath(profile));
  const source = archives.get(sourceAssetId) as any;
  if (!source) throw new Error("SD01_SOURCE_ARCHIVE_NOT_FOUND");
  if (
    source.site_id !== profile.site_id ||
    source.item_id !== itemId ||
    source.workflow_code !== "SC01" ||
    source.destination_key !== "cutout" ||
    source.result !== "VERIFIED_ARCHIVE"
  ) {
    throw new Error("SD01_SOURCE_NOT_VERIFIED_SC01_CUTOUT");
  }
  if (!/^.+__cutout__master__wf-SC01__v\d{3}\.png$/i.test(String(source.filename ?? ""))) {
    throw new Error("SD01_SOURCE_FILENAME_INVALID");
  }
  if (!/^[a-f0-9]{64}$/i.test(String(source.sha256 ?? ""))) throw new Error("SD01_SOURCE_SHA256_INVALID");
  if (!Number.isInteger(source.size_bytes) || Number(source.size_bytes) < 0) {
    throw new Error("SD01_SOURCE_SIZE_INVALID");
  }

  const { manifest } = await readManifest(profile, itemId);
  const history = Array.isArray(manifest.archive_history) ? manifest.archive_history : [];
  const durable = history.find((entry: any) => entry?.asset_id === sourceAssetId);
  if (!durable) throw new Error("SD01_SOURCE_MANIFEST_HISTORY_MISSING");
  if (!sourceHistoryMatches(durable, source)) throw new Error("SD01_SOURCE_MANIFEST_HISTORY_CONFLICT");

  const root = formalAssetRoot(profile);
  const path = resolve(String(source.destination_path ?? ""));
  await assertExistingRealInside(root, path);
  const bytes = await readFile(path);
  verifyBytes(bytes, Number(source.size_bytes), String(source.sha256), "SD01_SOURCE");

  return {
    assetId: sourceAssetId,
    filename: String(source.filename),
    path,
    sha256: String(source.sha256).toLowerCase(),
    sizeBytes: Number(source.size_bytes),
    bytes,
  };
}

export async function readDarkDerivativeJournal(path: string) {
  const records = new Map<string, DarkDerivativeRecord>();
  if (!existsSync(path)) return records;
  const lines = (await readFile(path, "utf8")).split(/\r?\n/);
  const nonEmpty = lines.map((line, index) => ({ line, index })).filter(({ line }) => Boolean(line.trim()));
  const last = nonEmpty.at(-1)?.index ?? -1;
  for (const { line, index } of nonEmpty) {
    try {
      const row = JSON.parse(line);
      if (row?.event === "DARK_DERIVATIVE_SNAPSHOT" && row?.derivative_id) {
        records.set(String(row.derivative_id), row as DarkDerivativeRecord);
      }
    } catch {
      if (index === last) break;
      throw new Error("DARK_DERIVATIVE_JOURNAL_CORRUPT");
    }
  }
  return records;
}

async function appendSnapshot(profile: SiteProfile, record: DarkDerivativeRecord) {
  const path = journalPath(profile);
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify(record)}\n`, "utf8");
}

async function appendArchiveSnapshot(profile: SiteProfile, record: DarkArchiveRecord) {
  const path = archiveJournalPath(profile);
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify(record)}\n`, "utf8");
}

async function allocateVersion(profile: SiteProfile, itemId: string) {
  const records = await readDarkDerivativeJournal(journalPath(profile));
  let max = 0;
  for (const record of records.values()) {
    if (record.site_id === profile.site_id && record.item_id === itemId) max = Math.max(max, Number(record.version) || 0);
  }
  const dir = darkStagingDir(profile, itemId);
  if (existsSync(dir)) {
    const escaped = itemId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`^${escaped}__dark__master__wf-SD01__v(\\d{3})\\.png$`, "i");
    for (const filename of await readdir(dir)) {
      const match = pattern.exec(filename);
      if (match) max = Math.max(max, Number(match[1]));
    }
  }
  if (max >= 999) throw new Error("SD01_VERSION_EXHAUSTED");
  return max + 1;
}

export async function recoverGeneratingDarkDerivatives(profile: SiteProfile) {
  const records = await readDarkDerivativeJournal(journalPath(profile));
  for (const record of records.values()) {
    if (record.state !== "GENERATING") continue;
    try {
      const source = await resolveVerifiedCutout(profile, record.item_id, record.source_asset_id);
      if (
        source.filename !== record.source_filename ||
        source.sha256 !== record.source_sha256.toLowerCase() ||
        source.sizeBytes !== record.source_size_bytes ||
        resolve(source.path) !== resolve(record.source_archive_path)
      ) {
        throw new Error("SD01_RECOVERY_SOURCE_IDENTITY_MISMATCH");
      }
      if (!existsSync(record.generated_path)) throw new Error("SD01_RECOVERY_OUTPUT_MISSING");
      await assertExistingRealInside(profile.staging_root, record.generated_path);
      const targetBytes = await readFile(record.generated_path);
      const rendered = flattenRgbaPngOnDark(source.bytes);
      if (!targetBytes.equals(rendered.png)) throw new Error("SD01_RECOVERY_OUTPUT_MISMATCH");
      record.generated_size_bytes = targetBytes.length;
      record.generated_sha256 = sha256Buffer(targetBytes);
      record.width = rendered.width;
      record.height = rendered.height;
      record.state = "QA_PENDING";
      record.error = undefined;
      record.updated_at = nowIso();
      await appendSnapshot(profile, record);
    } catch (error) {
      record.state = "FAILED_GENERATION";
      record.error = `RECOVERY:${errorMessage(error)}`;
      record.updated_at = nowIso();
      await appendSnapshot(profile, record);
    }
  }
  return readDarkDerivativeJournal(journalPath(profile));
}

export async function generateSd01Derivative(options: {
  profile: SiteProfile;
  itemId: string;
  sourceAssetId: string;
  createdAt?: string;
}) {
  const { profile, itemId, sourceAssetId } = options;
  if (!profile.enabled_workflows.includes("SD01")) throw new Error("SD01_NOT_ENABLED");
  const source = await resolveVerifiedCutout(profile, itemId, sourceAssetId);
  const version = await allocateVersion(profile, itemId);
  const filename = darkFilename(itemId, version);
  const outputDir = darkStagingDir(profile, itemId);
  await ensureSafeDirectory(profile.staging_root, outputDir);
  const target = join(outputDir, filename);
  assertInside(profile.staging_root, target);
  const createdAt = options.createdAt ?? nowIso();

  const record: DarkDerivativeRecord = {
    event: "DARK_DERIVATIVE_SNAPSHOT",
    derivative_id: derivativeId(profile.site_id, itemId, sourceAssetId, filename),
    site_id: profile.site_id,
    item_id: itemId,
    workflow_code: "SD01",
    renderer_id: SD01_RENDERER_ID,
    background_hex: SD01_BACKGROUND_HEX,
    source_asset_id: source.assetId,
    source_filename: source.filename,
    source_sha256: source.sha256,
    source_size_bytes: source.sizeBytes,
    source_archive_path: source.path,
    generated_asset_id: assetId(profile.site_id, itemId, filename),
    generated_filename: filename,
    generated_path: target,
    version,
    state: "GENERATING",
    created_at: createdAt,
    updated_at: createdAt,
  };
  await appendSnapshot(profile, record);

  let created = false;
  try {
    const rendered = flattenRgbaPngOnDark(source.bytes);
    await writeFile(target, rendered.png, { flag: "wx" });
    created = true;
    const outputBytes = await readFile(target);
    if (!outputBytes.equals(rendered.png)) throw new Error("SD01_GENERATED_BYTES_MISMATCH");
    record.generated_size_bytes = outputBytes.length;
    record.generated_sha256 = sha256Buffer(outputBytes);
    record.width = rendered.width;
    record.height = rendered.height;
    record.state = "QA_PENDING";
    record.updated_at = nowIso();
    await appendSnapshot(profile, record);
    return record;
  } catch (error) {
    if (created) await rm(target, { force: true }).catch(() => undefined);
    record.state = "FAILED_GENERATION";
    record.error = errorMessage(error);
    record.updated_at = nowIso();
    await appendSnapshot(profile, record);
    throw error;
  }
}

async function findByAsset(profile: SiteProfile, itemId: string, generatedAssetId: string) {
  const records = await readDarkDerivativeJournal(journalPath(profile));
  const record = [...records.values()].find(
    (candidate) =>
      candidate.site_id === profile.site_id &&
      candidate.item_id === itemId &&
      candidate.generated_asset_id === generatedAssetId,
  );
  if (!record) throw new Error("SD01_DERIVATIVE_ASSET_NOT_FOUND");
  return record;
}

async function verifyStaging(profile: SiteProfile, record: DarkDerivativeRecord) {
  if (!record.generated_sha256 || record.generated_size_bytes === undefined) {
    throw new Error("SD01_OUTPUT_NOT_READY");
  }
  await assertExistingRealInside(profile.staging_root, record.generated_path);
  await verifyFile(record.generated_path, record.generated_size_bytes, record.generated_sha256, "SD01_STAGING");
}

function capturedIdentity(record: DarkDerivativeRecord) {
  if (record.workflow_code !== "SD01") throw new Error("SD01_ARCHIVE_WORKFLOW_INVALID");
  if (record.state !== "QA_PASS") throw new Error("SD01_ARCHIVE_REQUIRES_QA_PASS");
  if (!/^.+__dark__master__wf-SD01__v\d{3}\.png$/i.test(record.generated_filename)) {
    throw new Error("SD01_ARCHIVE_FILENAME_INVALID");
  }
  if (!/^[a-f0-9]{64}$/i.test(String(record.generated_sha256 ?? ""))) throw new Error("SD01_ARCHIVE_SHA256_MISSING");
  if (!Number.isInteger(record.generated_size_bytes) || Number(record.generated_size_bytes) < 0) {
    throw new Error("SD01_ARCHIVE_SIZE_MISSING");
  }
  return {
    assetId: record.generated_asset_id,
    filename: record.generated_filename,
    source: record.generated_path,
    sha256: String(record.generated_sha256).toLowerCase(),
    sizeBytes: Number(record.generated_size_bytes),
  };
}

function archiveEntryMatches(entry: any, expected: DarkArchiveEntry) {
  return (
    entry?.gate === "15" &&
    entry?.workflow_code === "SD01" &&
    entry?.asset_id === expected.asset_id &&
    entry?.filename === expected.filename &&
    entry?.destination_key === "dark" &&
    resolve(String(entry?.destination_path ?? "")) === resolve(expected.destination_path) &&
    Number(entry?.size_bytes) === expected.size_bytes &&
    String(entry?.sha256 ?? "").toLowerCase() === expected.sha256 &&
    entry?.result === "VERIFIED_ARCHIVE"
  );
}

async function writeManifestAtomic(path: string, manifest: any) {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${randomUUID()}.tmp`;
  await writeFile(temp, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
  try {
    await rename(temp, path);
  } catch (error) {
    await rm(temp, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function ensureManifestHistory(manifestFile: string, manifest: any, expected: DarkArchiveEntry) {
  const history = Array.isArray(manifest.archive_history) ? manifest.archive_history : [];
  const existing = history.find((entry: any) => entry?.asset_id === expected.asset_id);
  if (existing) {
    if (!archiveEntryMatches(existing, expected)) throw new Error("SD01_ARCHIVE_HISTORY_CONFLICT");
    return existing as DarkArchiveEntry;
  }
  manifest.archive_history = [...history, { ...expected }];
  await writeManifestAtomic(manifestFile, manifest);
  return expected;
}

export async function archiveApprovedSd01(options: {
  profile: SiteProfile;
  record: DarkDerivativeRecord;
  archivedAt?: string;
}) {
  const { profile, record } = options;
  const identity = capturedIdentity(record);
  const source = resolve(identity.source);
  assertInside(profile.staging_root, source);

  const { path: manifestFile, manifest } = await readManifest(profile, record.item_id);
  const { root: assetRoot, destinationDir } = resolveDarkDestination(profile, manifest);
  await ensureSafeDirectory(assetRoot, destinationDir);
  const target = join(destinationDir, identity.filename);
  assertInside(assetRoot, target);

  const history = Array.isArray(manifest.archive_history) ? manifest.archive_history : [];
  const prior = history.find((entry: any) => entry?.asset_id === identity.assetId);
  const expected: DarkArchiveEntry = {
    archived_at: options.archivedAt ?? nowIso(),
    gate: "15",
    workflow_code: "SD01",
    asset_id: identity.assetId,
    filename: identity.filename,
    destination_key: "dark",
    destination_path: target,
    size_bytes: identity.sizeBytes,
    sha256: identity.sha256,
    result: "VERIFIED_ARCHIVE",
  };
  const durableExpected = prior
    ? { ...expected, archived_at: String(prior.archived_at ?? expected.archived_at) }
    : expected;
  if (prior && !archiveEntryMatches(prior, durableExpected)) throw new Error("SD01_ARCHIVE_HISTORY_CONFLICT");

  const sourceExists = existsSync(source);
  if (!sourceExists && !prior) throw new Error("SD01_ARCHIVE_SOURCE_MISSING_WITHOUT_DURABLE_HISTORY");
  if (sourceExists) {
    await assertExistingRealInside(profile.staging_root, source);
    await verifyFile(source, identity.sizeBytes, identity.sha256, "SD01_ARCHIVE_SOURCE");
  }

  if (existsSync(target)) {
    await assertExistingRealInside(assetRoot, target);
    try {
      await verifyFile(target, identity.sizeBytes, identity.sha256, "SD01_ARCHIVE_TARGET");
    } catch {
      throw new Error("SD01_ARCHIVE_TARGET_CONFLICT");
    }
  } else {
    if (!sourceExists) throw new Error("SD01_ARCHIVE_TARGET_MISSING_AFTER_DURABLE_HISTORY");
    const copied = await copyVerifiedNoDelete(source, target);
    if (copied.sizeBytes !== identity.sizeBytes || copied.sha256.toLowerCase() !== identity.sha256) {
      await rm(target, { force: true }).catch(() => undefined);
      throw new Error("SD01_ARCHIVE_COPY_VERIFICATION_FAILED");
    }
  }

  await verifyFile(target, identity.sizeBytes, identity.sha256, "SD01_ARCHIVE_TARGET");
  const durable = await ensureManifestHistory(manifestFile, manifest, durableExpected);
  await verifyFile(target, identity.sizeBytes, identity.sha256, "SD01_ARCHIVE_TARGET");

  if (existsSync(source)) {
    await assertExistingRealInside(profile.staging_root, source);
    await rm(source);
  }
  if (existsSync(source)) throw new Error("SD01_ARCHIVE_SOURCE_DELETE_FAILED");

  const archive: DarkArchiveRecord = {
    ...durable,
    event: "ARCHIVE_SNAPSHOT",
    site_id: profile.site_id,
    item_id: record.item_id,
    source_deleted: true,
  };
  await appendArchiveSnapshot(profile, archive);
  return archive;
}

async function archivedIds(profile: SiteProfile) {
  return new Set((await readArchiveJournal(archiveJournalPath(profile))).keys());
}

async function publicList(profile: SiteProfile, records: DarkDerivativeRecord[]) {
  const archived = await archivedIds(profile);
  return records.map((record) => publicRecord(record, archived.has(record.generated_asset_id)));
}

export async function registerP4DarkRoutes(app: FastifyInstance, deps: Dependencies) {
  app.get("/api/dark-derivatives", async (req, reply) => {
    try {
      deps.assertLocalRequest(req);
      const siteId = String((req.query as any)?.site_id ?? "drift-curio");
      const itemId = String((req.query as any)?.item_id ?? "");
      const profile = await deps.loadSite(siteId);
      if (itemId) deps.validateProfileItem(profile, itemId);
      const records = await serialized(() => recoverGeneratingDarkDerivatives(profile));
      const selected = [...records.values()]
        .filter((record) => record.site_id === siteId && (!itemId || record.item_id === itemId))
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
      return publicList(profile, selected);
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  app.post("/api/dark-derivatives/SD01/batch", async (req, reply) => {
    try {
      deps.assertLocalRequest(req);
      const body = req.body as any;
      const profile = await deps.loadSite(String(body?.site_id ?? ""));
      const itemId = deps.validateProfileItem(profile, String(body?.item_id ?? body?.sku ?? ""));
      const sourceAssetIds = Array.isArray(body?.source_asset_ids) ? body.source_asset_ids.map(String) : [];
      if (!sourceAssetIds.length || sourceAssetIds.length > 20) throw new Error("INVALID_SD01_BATCH_SIZE");
      const results: any[] = [];
      for (const sourceAssetId of sourceAssetIds) {
        try {
          const record = await serialized(() => generateSd01Derivative({ profile, itemId, sourceAssetId }));
          results.push({ source_asset_id: sourceAssetId, ok: true, derivative: publicRecord(record) });
        } catch (error) {
          results.push({ source_asset_id: sourceAssetId, ok: false, error: errorMessage(error) });
        }
      }
      return { ok: results.every((row) => row.ok), serial: true, results };
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  app.get("/api/dark-derivatives/qa", async (req, reply) => {
    try {
      deps.assertLocalRequest(req);
      const siteId = String((req.query as any)?.site_id ?? "drift-curio");
      const itemId = String((req.query as any)?.item_id ?? "");
      const profile = await deps.loadSite(siteId);
      if (itemId) deps.validateProfileItem(profile, itemId);
      const records = await serialized(() => recoverGeneratingDarkDerivatives(profile));
      const selected = [...records.values()]
        .filter(
          (record) =>
            record.site_id === siteId &&
            (!itemId || record.item_id === itemId) &&
            ["QA_PENDING", "QA_PASS", "QA_FAIL"].includes(record.state),
        )
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
      return publicList(profile, selected);
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  app.post("/api/dark-derivatives/qa/:assetId/decision", async (req, reply) => {
    try {
      deps.assertLocalRequest(req);
      const asset = String((req.params as any)?.assetId ?? "");
      const body = req.body as any;
      const profile = await deps.loadSite(String(body?.site_id ?? ""));
      const itemId = deps.validateProfileItem(profile, String(body?.item_id ?? body?.sku ?? ""));
      const archived = await archivedIds(profile);
      if (archived.has(asset)) throw new Error("SD01_DERIVATIVE_ALREADY_ARCHIVED");
      const record = await findByAsset(profile, itemId, asset);
      if (!["QA_PENDING", "QA_PASS", "QA_FAIL"].includes(record.state)) {
        throw new Error("SD01_QA_STATE_INVALID");
      }
      await verifyStaging(profile, record);
      const decision = String(body?.decision ?? "").toUpperCase();
      if (typeof body?.note === "string") record.qa_note = body.note.slice(0, 4000);
      if (decision === "PASS") record.state = "QA_PASS";
      else if (decision === "FAIL") record.state = "QA_FAIL";
      else if (decision !== "NOTE") throw new Error("INVALID_SD01_QA_DECISION");
      record.updated_at = nowIso();
      await appendSnapshot(profile, record);
      return { ok: true, derivative: publicRecord(record, false) };
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  app.post("/api/dark-derivatives/archive/:siteId/:itemId/:assetId", async (req, reply) => {
    try {
      deps.assertLocalRequest(req);
      const { siteId, itemId, assetId: generatedAssetId } = req.params as any;
      const profile = await deps.loadSite(String(siteId));
      deps.validateProfileItem(profile, String(itemId));
      const record = await findByAsset(profile, String(itemId), String(generatedAssetId));
      const archive = await runArchiveSerialized(() => archiveApprovedSd01({ profile, record }));
      const { destination_path: _path, ...safe } = archive;
      return { ok: true, archive: safe };
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  app.get("/api/dark-derivatives/assets/:siteId/:itemId/:assetId/content", async (req, reply) => {
    try {
      deps.assertLocalRequest(req);
      const { siteId, itemId, assetId: generatedAssetId } = req.params as any;
      const profile = await deps.loadSite(String(siteId));
      deps.validateProfileItem(profile, String(itemId));
      const archives = await readArchiveJournal(archiveJournalPath(profile));
      const archived = archives.get(String(generatedAssetId)) as any;
      if (
        archived &&
        archived.site_id === siteId &&
        archived.item_id === itemId &&
        archived.workflow_code === "SD01" &&
        archived.destination_key === "dark" &&
        archived.result === "VERIFIED_ARCHIVE"
      ) {
        const root = formalAssetRoot(profile);
        const path = resolve(String(archived.destination_path ?? ""));
        await assertExistingRealInside(root, path);
        await verifyFile(path, Number(archived.size_bytes), String(archived.sha256), "SD01_ARCHIVE_CONTENT");
        const info = await stat(path);
        reply.type("image/png").header("Content-Length", String(info.size));
        return reply.send(createReadStream(path));
      }

      const record = await findByAsset(profile, String(itemId), String(generatedAssetId));
      await verifyStaging(profile, record);
      const info = await stat(record.generated_path);
      reply.type("image/png").header("Content-Length", String(info.size));
      return reply.send(createReadStream(record.generated_path));
    } catch (error) {
      return reply.code(404).send({ error: errorMessage(error) });
    }
  });
}
