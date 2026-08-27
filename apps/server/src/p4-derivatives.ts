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
import { flattenRgbaPngOnWhite } from "./png-white.js";

export const SW01_RENDERER_ID = "sw01-flat-white-rgb-v1" as const;

export type P4SiteProfile = {
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

export type DerivativeState =
  | "GENERATING"
  | "QA_PENDING"
  | "QA_PASS"
  | "QA_FAIL"
  | "FAILED_GENERATION";

export type DerivativeRecord = {
  event: "DERIVATIVE_SNAPSHOT";
  derivative_id: string;
  site_id: string;
  item_id: string;
  workflow_code: "SW01";
  renderer_id: typeof SW01_RENDERER_ID;
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
  state: DerivativeState;
  created_at: string;
  updated_at: string;
  qa_note?: string;
  error?: string;
};

export type Sw01ArchiveHistoryEntry = {
  archived_at: string;
  gate: "15";
  workflow_code: "SW01";
  asset_id: string;
  filename: string;
  destination_key: "white";
  destination_path: string;
  size_bytes: number;
  sha256: string;
  result: "VERIFIED_ARCHIVE";
};

export type Sw01ArchiveRecord = Sw01ArchiveHistoryEntry & {
  event: "ARCHIVE_SNAPSHOT";
  site_id: string;
  item_id: string;
  source_deleted: true;
};

type Dependencies = {
  assertLocalRequest: (req: any) => void;
  loadSite: (siteId: string) => Promise<P4SiteProfile>;
  validateProfileItem: (profile: P4SiteProfile, itemId: string) => string;
};

type VerifiedCutoutSource = {
  assetId: string;
  filename: string;
  path: string;
  sha256: string;
  sizeBytes: number;
  bytes: Buffer;
};

let derivativeMutationTail: Promise<void> = Promise.resolve();

function runDerivativeSerialized<T>(operation: () => Promise<T>) {
  const run = derivativeMutationTail.then(operation, operation);
  derivativeMutationTail = run.then(
    () => undefined,
    () => undefined,
  );
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

function controlRoot(profile: P4SiteProfile) {
  return profile.control_root ?? join(profile.manifest_root, "visual-console-p2", profile.site_id);
}

function derivativeJournalPath(profile: P4SiteProfile) {
  return join(controlRoot(profile), "derivatives.jsonl");
}

function archiveJournalPath(profile: P4SiteProfile) {
  return join(controlRoot(profile), "archives.jsonl");
}

function formalAssetRoot(profile: P4SiteProfile) {
  return resolve(profile.asset_root ?? dirname(profile.raw_root));
}

function manifestPath(profile: P4SiteProfile, itemId: string) {
  const path = join(profile.manifest_root, `${safeId(itemId)}.json`);
  assertInside(profile.manifest_root, path);
  return path;
}

function whiteStagingDir(profile: P4SiteProfile, itemId: string) {
  const dir = join(profile.staging_root, "visual-console", safeId(itemId), "white");
  assertInside(profile.staging_root, dir);
  return dir;
}

function whiteFilename(itemId: string, version: number) {
  return `${itemId}__white__master__wf-SW01__v${String(version).padStart(3, "0")}.png`;
}

function derivativeAssetId(siteId: string, itemId: string, filename: string) {
  return createHash("sha256")
    .update(`${siteId}|${itemId}|SW01|${filename}`)
    .digest("hex")
    .slice(0, 32);
}

function derivativeId(siteId: string, itemId: string, sourceAssetId: string, filename: string) {
  return `der_${createHash("sha256")
    .update(`${siteId}|${itemId}|${sourceAssetId}|SW01|${filename}`)
    .digest("hex")
    .slice(0, 24)}`;
}

function parseManifestJson(text: string) {
  const normalized = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  try {
    return JSON.parse(normalized);
  } catch {
    throw new Error("SW01_ARCHIVE_MANIFEST_INVALID_JSON");
  }
}

async function readManifest(profile: P4SiteProfile, itemId: string) {
  const path = manifestPath(profile, itemId);
  if (!existsSync(path)) throw new Error("SW01_ARCHIVE_MANIFEST_NOT_FOUND");
  const manifest = parseManifestJson(await readFile(path, "utf8"));
  const declaredId = String(manifest?.sku ?? manifest?.item_id ?? "");
  if (declaredId && declaredId !== itemId) throw new Error("SW01_ARCHIVE_MANIFEST_ITEM_MISMATCH");
  if (!manifest?.destinations || typeof manifest.destinations !== "object") {
    throw new Error("SW01_ARCHIVE_MANIFEST_DESTINATIONS_MISSING");
  }
  return { path, manifest };
}

function resolveWhiteDestination(profile: P4SiteProfile, manifest: any) {
  const raw = manifest?.destinations?.white;
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("SW01_ARCHIVE_DESTINATION_WHITE_MISSING");
  }
  const root = formalAssetRoot(profile);
  const destinationDir = resolve(raw);
  assertInside(root, destinationDir);
  return { root, destinationDir };
}

async function verifyFileSnapshot(path: string, expectedSize: number, expectedSha: string, prefix: string) {
  const info = await stat(path);
  if (info.size !== expectedSize) throw new Error(`${prefix}_SIZE_MISMATCH`);
  const hash = (await sha256File(path)).toLowerCase();
  if (hash !== expectedSha.toLowerCase()) throw new Error(`${prefix}_SHA256_MISMATCH`);
  return { sizeBytes: info.size, sha256: hash };
}

function verifyBufferSnapshot(bytes: Buffer, expectedSize: number, expectedSha: string, prefix: string) {
  if (bytes.length !== expectedSize) throw new Error(`${prefix}_SIZE_MISMATCH`);
  const hash = sha256Buffer(bytes).toLowerCase();
  if (hash !== expectedSha.toLowerCase()) throw new Error(`${prefix}_SHA256_MISMATCH`);
  return { sizeBytes: bytes.length, sha256: hash };
}

export async function readDerivativeJournal(path: string) {
  const records = new Map<string, DerivativeRecord>();
  if (!existsSync(path)) return records;
  const lines = (await readFile(path, "utf8")).split(/\r?\n/);
  const nonEmpty = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => Boolean(line.trim()));
  const last = nonEmpty.at(-1)?.index ?? -1;
  for (const { line, index } of nonEmpty) {
    try {
      const row = JSON.parse(line);
      if (row?.event === "DERIVATIVE_SNAPSHOT" && row?.derivative_id) {
        records.set(String(row.derivative_id), row as DerivativeRecord);
      }
    } catch {
      if (index === last) break;
      throw new Error("DERIVATIVE_JOURNAL_CORRUPT");
    }
  }
  return records;
}

async function appendDerivativeSnapshot(profile: P4SiteProfile, record: DerivativeRecord) {
  const path = derivativeJournalPath(profile);
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify(record)}\n`, "utf8");
}

async function appendArchiveSnapshot(profile: P4SiteProfile, record: Sw01ArchiveRecord) {
  const path = archiveJournalPath(profile);
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify(record)}\n`, "utf8");
}

function publicDerivative(record: DerivativeRecord, archived = false) {
  const { source_archive_path: _source, generated_path: _generated, ...safe } = record;
  return { ...safe, archived };
}

function sourceManifestEntryMatches(entry: any, archive: any) {
  return (
    entry?.gate === "15" &&
    entry?.workflow_code === "SC01" &&
    entry?.asset_id === archive.asset_id &&
    entry?.filename === archive.filename &&
    entry?.destination_key === "cutout" &&
    resolve(String(entry?.destination_path ?? "")) === resolve(String(archive.destination_path ?? "")) &&
    Number(entry?.size_bytes) === Number(archive.size_bytes) &&
    String(entry?.sha256 ?? "").toLowerCase() === String(archive.sha256 ?? "").toLowerCase() &&
    entry?.result === "VERIFIED_ARCHIVE"
  );
}

async function resolveVerifiedCutoutSource(
  profile: P4SiteProfile,
  itemId: string,
  sourceAssetId: string,
): Promise<VerifiedCutoutSource> {
  if (!/^[a-f0-9]{32}$/i.test(sourceAssetId)) throw new Error("SW01_SOURCE_ASSET_ID_INVALID");
  const archives = await readArchiveJournal(archiveJournalPath(profile));
  const source = archives.get(sourceAssetId) as any;
  if (!source) throw new Error("SW01_SOURCE_ARCHIVE_NOT_FOUND");
  if (
    source.site_id !== profile.site_id ||
    source.item_id !== itemId ||
    source.workflow_code !== "SC01" ||
    source.destination_key !== "cutout" ||
    source.result !== "VERIFIED_ARCHIVE"
  ) {
    throw new Error("SW01_SOURCE_ARCHIVE_NOT_VERIFIED_CUTOUT");
  }
  if (!/^.+__cutout__master__wf-SC01__v\d{3}\.png$/i.test(String(source.filename ?? ""))) {
    throw new Error("SW01_SOURCE_FILENAME_INVALID");
  }
  if (!/^[a-f0-9]{64}$/i.test(String(source.sha256 ?? ""))) {
    throw new Error("SW01_SOURCE_SHA256_INVALID");
  }
  if (!Number.isInteger(source.size_bytes) || Number(source.size_bytes) < 0) {
    throw new Error("SW01_SOURCE_SIZE_INVALID");
  }

  const { manifest } = await readManifest(profile, itemId);
  const history = Array.isArray(manifest.archive_history) ? manifest.archive_history : [];
  const durableHistory = history.find((entry: any) => entry?.asset_id === sourceAssetId);
  if (!durableHistory) throw new Error("SW01_SOURCE_MANIFEST_HISTORY_MISSING");
  if (!sourceManifestEntryMatches(durableHistory, source)) {
    throw new Error("SW01_SOURCE_MANIFEST_HISTORY_CONFLICT");
  }

  const root = formalAssetRoot(profile);
  const path = resolve(String(source.destination_path ?? ""));
  await assertExistingRealInside(root, path);
  const bytes = await readFile(path);
  verifyBufferSnapshot(bytes, Number(source.size_bytes), String(source.sha256), "SW01_SOURCE");
  return {
    assetId: sourceAssetId,
    filename: String(source.filename),
    path,
    sha256: String(source.sha256).toLowerCase(),
    sizeBytes: Number(source.size_bytes),
    bytes,
  };
}

async function allocateWhiteVersion(profile: P4SiteProfile, itemId: string) {
  const records = await readDerivativeJournal(derivativeJournalPath(profile));
  let max = 0;
  for (const record of records.values()) {
    if (record.site_id === profile.site_id && record.item_id === itemId && record.workflow_code === "SW01") {
      max = Math.max(max, Number(record.version) || 0);
    }
  }
  const dir = whiteStagingDir(profile, itemId);
  if (existsSync(dir)) {
    const escaped = itemId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`^${escaped}__white__master__wf-SW01__v(\\d{3})\\.png$`, "i");
    for (const filename of await readdir(dir)) {
      const match = pattern.exec(filename);
      if (match) max = Math.max(max, Number(match[1]));
    }
  }
  if (max >= 999) throw new Error("SW01_VERSION_EXHAUSTED");
  return max + 1;
}

export async function recoverGeneratingDerivatives(profile: P4SiteProfile) {
  const records = await readDerivativeJournal(derivativeJournalPath(profile));
  for (const record of records.values()) {
    if (record.state !== "GENERATING") continue;
    try {
      const source = await resolveVerifiedCutoutSource(profile, record.item_id, record.source_asset_id);
      if (
        source.filename !== record.source_filename ||
        source.sha256 !== record.source_sha256.toLowerCase() ||
        source.sizeBytes !== record.source_size_bytes ||
        resolve(source.path) !== resolve(record.source_archive_path)
      ) {
        throw new Error("SW01_RECOVERY_SOURCE_IDENTITY_MISMATCH");
      }
      if (!existsSync(record.generated_path)) throw new Error("SW01_RECOVERY_OUTPUT_MISSING");
      await assertExistingRealInside(profile.staging_root, record.generated_path);
      const targetBytes = await readFile(record.generated_path);
      const rendered = flattenRgbaPngOnWhite(source.bytes);
      if (!targetBytes.equals(rendered.png)) throw new Error("SW01_RECOVERY_OUTPUT_MISMATCH");
      record.generated_size_bytes = targetBytes.length;
      record.generated_sha256 = sha256Buffer(targetBytes);
      record.width = rendered.width;
      record.height = rendered.height;
      record.state = "QA_PENDING";
      record.error = undefined;
      record.updated_at = nowIso();
      await appendDerivativeSnapshot(profile, record);
    } catch (error) {
      record.state = "FAILED_GENERATION";
      record.error = `RECOVERY:${errorMessage(error)}`;
      record.updated_at = nowIso();
      await appendDerivativeSnapshot(profile, record);
    }
  }
  return readDerivativeJournal(derivativeJournalPath(profile));
}

export async function generateSw01Derivative(options: {
  profile: P4SiteProfile;
  itemId: string;
  sourceAssetId: string;
  createdAt?: string;
}) {
  const { profile, itemId, sourceAssetId } = options;
  if (!profile.enabled_workflows.includes("SW01")) throw new Error("SW01_NOT_ENABLED");
  const source = await resolveVerifiedCutoutSource(profile, itemId, sourceAssetId);
  const version = await allocateWhiteVersion(profile, itemId);
  const filename = whiteFilename(itemId, version);
  const outputDir = whiteStagingDir(profile, itemId);
  await ensureSafeDirectory(profile.staging_root, outputDir);
  const target = join(outputDir, filename);
  assertInside(profile.staging_root, target);
  const createdAt = options.createdAt ?? nowIso();

  const record: DerivativeRecord = {
    event: "DERIVATIVE_SNAPSHOT",
    derivative_id: derivativeId(profile.site_id, itemId, sourceAssetId, filename),
    site_id: profile.site_id,
    item_id: itemId,
    workflow_code: "SW01",
    renderer_id: SW01_RENDERER_ID,
    source_asset_id: source.assetId,
    source_filename: source.filename,
    source_sha256: source.sha256,
    source_size_bytes: source.sizeBytes,
    source_archive_path: source.path,
    generated_asset_id: derivativeAssetId(profile.site_id, itemId, filename),
    generated_filename: filename,
    generated_path: target,
    version,
    state: "GENERATING",
    created_at: createdAt,
    updated_at: createdAt,
  };
  await appendDerivativeSnapshot(profile, record);

  let created = false;
  try {
    const rendered = flattenRgbaPngOnWhite(source.bytes);
    await writeFile(target, rendered.png, { flag: "wx" });
    created = true;
    const outputBytes = await readFile(target);
    if (!outputBytes.equals(rendered.png)) throw new Error("SW01_GENERATED_BYTES_MISMATCH");
    record.generated_size_bytes = outputBytes.length;
    record.generated_sha256 = sha256Buffer(outputBytes);
    record.width = rendered.width;
    record.height = rendered.height;
    record.state = "QA_PENDING";
    record.updated_at = nowIso();
    await appendDerivativeSnapshot(profile, record);
    return record;
  } catch (error) {
    if (created) await rm(target, { force: true }).catch(() => undefined);
    record.state = "FAILED_GENERATION";
    record.error = errorMessage(error);
    record.updated_at = nowIso();
    await appendDerivativeSnapshot(profile, record);
    throw error;
  }
}

async function findDerivativeByAsset(profile: P4SiteProfile, itemId: string, assetId: string) {
  const records = await readDerivativeJournal(derivativeJournalPath(profile));
  const record = [...records.values()].find(
    (candidate) =>
      candidate.site_id === profile.site_id &&
      candidate.item_id === itemId &&
      candidate.generated_asset_id === assetId,
  );
  if (!record) throw new Error("DERIVATIVE_ASSET_NOT_FOUND");
  return record;
}

async function verifyDerivativeStaging(profile: P4SiteProfile, record: DerivativeRecord) {
  if (!record.generated_sha256 || record.generated_size_bytes === undefined) {
    throw new Error("DERIVATIVE_OUTPUT_NOT_READY");
  }
  await assertExistingRealInside(profile.staging_root, record.generated_path);
  await verifyFileSnapshot(
    record.generated_path,
    record.generated_size_bytes,
    record.generated_sha256,
    "DERIVATIVE_STAGING",
  );
}

function requireSw01CapturedIdentity(record: DerivativeRecord) {
  if (record.workflow_code !== "SW01") throw new Error("SW01_ARCHIVE_WORKFLOW_INVALID");
  if (record.state !== "QA_PASS") throw new Error("SW01_ARCHIVE_REQUIRES_QA_PASS");
  if (!/^.+__white__master__wf-SW01__v\d{3}\.png$/i.test(record.generated_filename)) {
    throw new Error("SW01_ARCHIVE_FILENAME_INVALID");
  }
  if (!/^[a-f0-9]{64}$/i.test(String(record.generated_sha256 ?? ""))) {
    throw new Error("SW01_ARCHIVE_SHA256_MISSING");
  }
  if (!Number.isInteger(record.generated_size_bytes) || Number(record.generated_size_bytes) < 0) {
    throw new Error("SW01_ARCHIVE_SIZE_MISSING");
  }
  return {
    assetId: record.generated_asset_id,
    filename: record.generated_filename,
    source: record.generated_path,
    sha256: String(record.generated_sha256).toLowerCase(),
    sizeBytes: Number(record.generated_size_bytes),
  };
}

function sw01ArchiveEntryMatches(entry: any, expected: Sw01ArchiveHistoryEntry) {
  return (
    entry?.gate === "15" &&
    entry?.workflow_code === "SW01" &&
    entry?.asset_id === expected.asset_id &&
    entry?.filename === expected.filename &&
    entry?.destination_key === "white" &&
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

async function ensureSw01ManifestHistory(
  manifestFile: string,
  manifest: any,
  expected: Sw01ArchiveHistoryEntry,
) {
  const history = Array.isArray(manifest.archive_history) ? manifest.archive_history : [];
  const existing = history.find((entry: any) => entry?.asset_id === expected.asset_id);
  if (existing) {
    if (!sw01ArchiveEntryMatches(existing, expected)) throw new Error("SW01_ARCHIVE_HISTORY_CONFLICT");
    return existing as Sw01ArchiveHistoryEntry;
  }
  manifest.archive_history = [...history, { ...expected }];
  await writeManifestAtomic(manifestFile, manifest);
  return expected;
}

export async function archiveApprovedSw01Derivative(options: {
  profile: P4SiteProfile;
  record: DerivativeRecord;
  archivedAt?: string;
}) {
  const { profile, record } = options;
  const identity = requireSw01CapturedIdentity(record);
  const source = resolve(identity.source);
  assertInside(profile.staging_root, source);

  const { path: manifestFile, manifest } = await readManifest(profile, record.item_id);
  const { root: assetRoot, destinationDir } = resolveWhiteDestination(profile, manifest);
  await ensureSafeDirectory(assetRoot, destinationDir);
  const target = join(destinationDir, identity.filename);
  assertInside(assetRoot, target);

  const history = Array.isArray(manifest.archive_history) ? manifest.archive_history : [];
  const priorHistory = history.find((entry: any) => entry?.asset_id === identity.assetId);
  const expected: Sw01ArchiveHistoryEntry = {
    archived_at: options.archivedAt ?? nowIso(),
    gate: "15",
    workflow_code: "SW01",
    asset_id: identity.assetId,
    filename: identity.filename,
    destination_key: "white",
    destination_path: target,
    size_bytes: identity.sizeBytes,
    sha256: identity.sha256,
    result: "VERIFIED_ARCHIVE",
  };
  const preflight = priorHistory
    ? { ...expected, archived_at: String(priorHistory.archived_at ?? expected.archived_at) }
    : expected;
  if (priorHistory && !sw01ArchiveEntryMatches(priorHistory, preflight)) {
    throw new Error("SW01_ARCHIVE_HISTORY_CONFLICT");
  }

  const sourceExists = existsSync(source);
  if (!sourceExists && !priorHistory) {
    throw new Error("SW01_ARCHIVE_SOURCE_MISSING_WITHOUT_DURABLE_HISTORY");
  }
  if (sourceExists) {
    await assertExistingRealInside(profile.staging_root, source);
    await verifyFileSnapshot(source, identity.sizeBytes, identity.sha256, "SW01_ARCHIVE_SOURCE");
  }

  if (existsSync(target)) {
    await assertExistingRealInside(assetRoot, target);
    try {
      await verifyFileSnapshot(target, identity.sizeBytes, identity.sha256, "SW01_ARCHIVE_TARGET");
    } catch {
      throw new Error("SW01_ARCHIVE_TARGET_CONFLICT");
    }
  } else {
    if (!sourceExists) throw new Error("SW01_ARCHIVE_TARGET_MISSING_AFTER_DURABLE_HISTORY");
    const copied = await copyVerifiedNoDelete(source, target);
    if (copied.sizeBytes !== identity.sizeBytes || copied.sha256.toLowerCase() !== identity.sha256) {
      await rm(target, { force: true }).catch(() => undefined);
      throw new Error("SW01_ARCHIVE_COPY_VERIFICATION_FAILED");
    }
  }

  await verifyFileSnapshot(target, identity.sizeBytes, identity.sha256, "SW01_ARCHIVE_TARGET");
  const durable = priorHistory
    ? await ensureSw01ManifestHistory(manifestFile, manifest, preflight)
    : await ensureSw01ManifestHistory(manifestFile, manifest, expected);
  await verifyFileSnapshot(target, identity.sizeBytes, identity.sha256, "SW01_ARCHIVE_TARGET");

  if (existsSync(source)) {
    await assertExistingRealInside(profile.staging_root, source);
    await rm(source);
  }
  if (existsSync(source)) throw new Error("SW01_ARCHIVE_SOURCE_DELETE_FAILED");

  const archive: Sw01ArchiveRecord = {
    ...durable,
    event: "ARCHIVE_SNAPSHOT",
    site_id: profile.site_id,
    item_id: record.item_id,
    source_deleted: true,
  };
  await appendArchiveSnapshot(profile, archive);
  return archive;
}

async function archivedAssetIds(profile: P4SiteProfile) {
  return new Set((await readArchiveJournal(archiveJournalPath(profile))).keys());
}

async function publicDerivativeList(profile: P4SiteProfile, records: DerivativeRecord[]) {
  const archived = await archivedAssetIds(profile);
  return records.map((record) => publicDerivative(record, archived.has(record.generated_asset_id)));
}

export async function registerP4DerivativeRoutes(app: FastifyInstance, deps: Dependencies) {
  app.get("/api/derivatives", async (req, reply) => {
    try {
      deps.assertLocalRequest(req);
      const siteId = String((req.query as any)?.site_id ?? "drift-curio");
      const itemId = String((req.query as any)?.item_id ?? "");
      const profile = await deps.loadSite(siteId);
      if (itemId) deps.validateProfileItem(profile, itemId);
      const records = await runDerivativeSerialized(() => recoverGeneratingDerivatives(profile));
      const selected = [...records.values()]
        .filter((record) => record.site_id === siteId && (!itemId || record.item_id === itemId))
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
      return publicDerivativeList(profile, selected);
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  app.post("/api/derivatives/SW01/batch", async (req, reply) => {
    try {
      deps.assertLocalRequest(req);
      const body = req.body as any;
      const profile = await deps.loadSite(String(body?.site_id ?? ""));
      const itemId = deps.validateProfileItem(profile, String(body?.item_id ?? body?.sku ?? ""));
      const sourceAssetIds = Array.isArray(body?.source_asset_ids) ? body.source_asset_ids.map(String) : [];
      if (!sourceAssetIds.length || sourceAssetIds.length > 20) throw new Error("INVALID_SW01_BATCH_SIZE");
      const results: any[] = [];
      for (const sourceAssetId of sourceAssetIds) {
        try {
          const record = await runDerivativeSerialized(() =>
            generateSw01Derivative({ profile, itemId, sourceAssetId }),
          );
          results.push({ source_asset_id: sourceAssetId, ok: true, derivative: publicDerivative(record) });
        } catch (error) {
          results.push({ source_asset_id: sourceAssetId, ok: false, error: errorMessage(error) });
        }
      }
      return { ok: results.every((row) => row.ok), serial: true, results };
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  app.get("/api/derivatives/qa", async (req, reply) => {
    try {
      deps.assertLocalRequest(req);
      const siteId = String((req.query as any)?.site_id ?? "drift-curio");
      const itemId = String((req.query as any)?.item_id ?? "");
      const profile = await deps.loadSite(siteId);
      if (itemId) deps.validateProfileItem(profile, itemId);
      const records = await runDerivativeSerialized(() => recoverGeneratingDerivatives(profile));
      const selected = [...records.values()]
        .filter(
          (record) =>
            record.site_id === siteId &&
            (!itemId || record.item_id === itemId) &&
            ["QA_PENDING", "QA_PASS", "QA_FAIL"].includes(record.state),
        )
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
      return publicDerivativeList(profile, selected);
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  app.post("/api/derivatives/qa/:assetId/decision", async (req, reply) => {
    try {
      deps.assertLocalRequest(req);
      const assetId = String((req.params as any)?.assetId ?? "");
      const body = req.body as any;
      const siteId = String(body?.site_id ?? "");
      const itemId = String(body?.item_id ?? body?.sku ?? "");
      const profile = await deps.loadSite(siteId);
      const validatedItemId = deps.validateProfileItem(profile, itemId);
      const archived = await archivedAssetIds(profile);
      if (archived.has(assetId)) throw new Error("DERIVATIVE_ALREADY_ARCHIVED");
      const record = await findDerivativeByAsset(profile, validatedItemId, assetId);
      if (!["QA_PENDING", "QA_PASS", "QA_FAIL"].includes(record.state)) {
        throw new Error("DERIVATIVE_QA_STATE_INVALID");
      }
      await verifyDerivativeStaging(profile, record);
      const decision = String(body?.decision ?? "").toUpperCase();
      if (typeof body?.note === "string") record.qa_note = body.note.slice(0, 4000);
      if (decision === "PASS") record.state = "QA_PASS";
      else if (decision === "FAIL") record.state = "QA_FAIL";
      else if (decision !== "NOTE") throw new Error("INVALID_DERIVATIVE_QA_DECISION");
      record.updated_at = nowIso();
      await appendDerivativeSnapshot(profile, record);
      return { ok: true, derivative: publicDerivative(record, false) };
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  app.post("/api/derivatives/archive/batch", async (req, reply) => {
    try {
      deps.assertLocalRequest(req);
      const body = req.body as any;
      const profile = await deps.loadSite(String(body?.site_id ?? ""));
      const itemId = deps.validateProfileItem(profile, String(body?.item_id ?? body?.sku ?? ""));
      const assetIds = Array.isArray(body?.asset_ids) ? body.asset_ids.map(String) : [];
      if (!assetIds.length || assetIds.length > 20) throw new Error("INVALID_SW01_ARCHIVE_BATCH_SIZE");
      const results: any[] = [];
      for (const assetId of assetIds) {
        try {
          const record = await findDerivativeByAsset(profile, itemId, assetId);
          const archive = await runArchiveSerialized(() => archiveApprovedSw01Derivative({ profile, record }));
          const { destination_path: _path, ...safe } = archive;
          results.push({ asset_id: assetId, ok: true, archive: safe });
        } catch (error) {
          results.push({ asset_id: assetId, ok: false, error: errorMessage(error) });
        }
      }
      return { ok: results.every((row) => row.ok), serial: true, results };
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  app.post("/api/derivatives/archive/:siteId/:itemId/:assetId", async (req, reply) => {
    try {
      deps.assertLocalRequest(req);
      const { siteId, itemId, assetId } = req.params as any;
      const profile = await deps.loadSite(String(siteId));
      deps.validateProfileItem(profile, String(itemId));
      const record = await findDerivativeByAsset(profile, String(itemId), String(assetId));
      const archive = await runArchiveSerialized(() => archiveApprovedSw01Derivative({ profile, record }));
      const { destination_path: _path, ...safe } = archive;
      return { ok: true, archive: safe };
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  app.get("/api/derivatives/assets/:siteId/:itemId/:assetId/content", async (req, reply) => {
    try {
      deps.assertLocalRequest(req);
      const { siteId, itemId, assetId } = req.params as any;
      const profile = await deps.loadSite(String(siteId));
      deps.validateProfileItem(profile, String(itemId));
      const archives = await readArchiveJournal(archiveJournalPath(profile));
      const archived = archives.get(String(assetId)) as any;
      if (
        archived &&
        archived.site_id === siteId &&
        archived.item_id === itemId &&
        archived.workflow_code === "SW01" &&
        archived.destination_key === "white" &&
        archived.result === "VERIFIED_ARCHIVE"
      ) {
        const root = formalAssetRoot(profile);
        const path = resolve(String(archived.destination_path ?? ""));
        await assertExistingRealInside(root, path);
        await verifyFileSnapshot(path, Number(archived.size_bytes), String(archived.sha256), "DERIVATIVE_ARCHIVE");
        const info = await stat(path);
        reply.type("image/png").header("Content-Length", String(info.size));
        return reply.send(createReadStream(path));
      }

      const record = await findDerivativeByAsset(profile, String(itemId), String(assetId));
      await verifyDerivativeStaging(profile, record);
      const info = await stat(record.generated_path);
      reply.type("image/png").header("Content-Length", String(info.size));
      return reply.send(createReadStream(record.generated_path));
    } catch (error) {
      return reply.code(404).send({ error: errorMessage(error) });
    }
  });
}
