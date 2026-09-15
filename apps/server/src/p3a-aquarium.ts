import type { FastifyInstance } from "fastify";
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readArchiveJournal, type ArchiveRecord } from "./p3-archive.js";
import { loadP3PilotRegistry } from "./p3-pilots.js";
import {
  assertExistingRealInside,
  assertInside,
  safeId,
  sha256File,
  sha256Text,
} from "./runtime-utils.js";

const ROOT = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const WORKFLOW_REGISTRY_PATH = join(ROOT, "config", "workflows", "registry.json");

export type P3AAquariumSiteProfile = {
  site_id: string;
  raw_root: string;
  manifest_root: string;
  enabled_workflows: string[];
  control_root?: string;
  asset_root?: string;
};

type Dependencies = {
  assertLocalRequest: (req: any) => void;
  loadSite: (siteId: string) => Promise<P3AAquariumSiteProfile>;
  validateProfileItem: (profile: P3AAquariumSiteProfile, itemId: string) => string;
};

type Qa01RegistryTruth = {
  present: boolean;
  workflow_status: string | null;
  executable: boolean;
};

function controlRoot(profile: P3AAquariumSiteProfile) {
  return profile.control_root ?? join(profile.manifest_root, "visual-console-p2", profile.site_id);
}

function formalAssetRoot(profile: P3AAquariumSiteProfile) {
  return resolve(profile.asset_root ?? dirname(profile.raw_root));
}

function archiveJournalPath(profile: P3AAquariumSiteProfile) {
  return join(controlRoot(profile), "archives.jsonl");
}

function manifestPath(profile: P3AAquariumSiteProfile, itemId: string) {
  const path = join(profile.manifest_root, `${safeId(itemId)}.json`);
  assertInside(profile.manifest_root, path);
  return path;
}

function parseJson(text: string) {
  const normalized = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  return JSON.parse(normalized);
}

async function qa01RegistryTruth(): Promise<Qa01RegistryTruth> {
  const parsed = parseJson(await readFile(WORKFLOW_REGISTRY_PATH, "utf8"));
  const row = Array.isArray(parsed?.workflows)
    ? parsed.workflows.find((candidate: any) => candidate?.code === "QA01")
    : null;
  return {
    present: Boolean(row),
    workflow_status: row ? String(row.workflow_status ?? "") : null,
    executable: Boolean(row?.executable),
  };
}

function latestSc01Archive(records: Iterable<ArchiveRecord>, itemId: string) {
  return [...records]
    .filter(
      (record) =>
        record.item_id === itemId &&
        record.workflow_code === "SC01" &&
        record.result === "VERIFIED_ARCHIVE" &&
        record.destination_key === "cutout",
    )
    .sort((a, b) => b.archived_at.localeCompare(a.archived_at))[0] ?? null;
}

async function proveManifestHistory(
  profile: P3AAquariumSiteProfile,
  itemId: string,
  record: ArchiveRecord,
) {
  const path = manifestPath(profile, itemId);
  if (!existsSync(path)) return { ok: false, reason: "MANIFEST_NOT_FOUND" } as const;
  const manifest = parseJson(await readFile(path, "utf8"));
  const history = Array.isArray(manifest?.archive_history) ? manifest.archive_history : [];
  const matches = history.filter(
    (entry: any) =>
      entry?.gate === "15" &&
      entry?.workflow_code === "SC01" &&
      entry?.asset_id === record.asset_id &&
      entry?.destination_key === "cutout" &&
      entry?.result === "VERIFIED_ARCHIVE" &&
      Number(entry?.size_bytes) === record.size_bytes &&
      String(entry?.sha256 ?? "").toLowerCase() === record.sha256.toLowerCase(),
  );
  if (matches.length !== 1) {
    return { ok: false, reason: matches.length ? "MANIFEST_GATE15_HISTORY_AMBIGUOUS" : "MANIFEST_GATE15_PROOF_MISSING" } as const;
  }
  return { ok: true, reason: null } as const;
}

export async function inspectAquariumSourceReadiness(
  profile: P3AAquariumSiteProfile,
  itemId: string,
) {
  const blockers: string[] = [];
  const registry = await loadP3PilotRegistry();
  const pilot = registry.pilots.find(
    (candidate) =>
      candidate.phase === "P3-A" &&
      candidate.site_id === profile.site_id &&
      candidate.item_id === itemId &&
      candidate.workflow_code === "QA01",
  );
  if (!pilot) blockers.push("P3A_PILOT_CONTRACT_NOT_FOUND");

  const qa01 = await qa01RegistryTruth();
  const siteEnabled = profile.enabled_workflows.includes("QA01");
  if (!qa01.present) blockers.push("QA01_REGISTRY_ENTRY_NOT_FOUND");
  if (qa01.executable) blockers.push("QA01_MUST_REMAIN_NON_EXECUTABLE_DURING_P3A");
  if (siteEnabled) blockers.push("QA01_MUST_REMAIN_SITE_DISABLED_DURING_P3A");

  const records = await readArchiveJournal(archiveJournalPath(profile));
  const record = latestSc01Archive(records.values(), itemId);
  if (!record) blockers.push("VERIFIED_SC01_ARCHIVE_NOT_FOUND");

  let source: null | {
    asset_id: string;
    filename: string;
    sha256: string;
    size_bytes: number;
    archived_at: string;
    source_package_id: string;
  } = null;

  if (record) {
    const assetRoot = formalAssetRoot(profile);
    const target = resolve(record.destination_path);
    try {
      assertInside(assetRoot, target);
      await assertExistingRealInside(assetRoot, target);
      const info = await stat(target);
      if (info.size !== record.size_bytes) blockers.push("VERIFIED_SC01_SIZE_DRIFT");
      const hash = (await sha256File(target)).toLowerCase();
      if (hash !== record.sha256.toLowerCase()) blockers.push("VERIFIED_SC01_SHA256_DRIFT");
      const manifestProof = await proveManifestHistory(profile, itemId, record);
      if (!manifestProof.ok) blockers.push(manifestProof.reason);

      if (
        info.size === record.size_bytes &&
        hash === record.sha256.toLowerCase() &&
        manifestProof.ok
      ) {
        const packageFingerprint = sha256Text(
          [profile.site_id, itemId, record.asset_id, record.sha256.toLowerCase(), String(record.size_bytes)].join(":"),
        );
        source = {
          asset_id: record.asset_id,
          filename: record.filename,
          sha256: record.sha256.toLowerCase(),
          size_bytes: record.size_bytes,
          archived_at: record.archived_at,
          source_package_id: `p3a-src-${packageFingerprint.slice(0, 24)}`,
        };
      }
    } catch (error) {
      blockers.push(error instanceof Error ? error.message : String(error));
    }
  }

  const sourceReady = Boolean(source) && !blockers.some((blocker) => blocker.startsWith("VERIFIED_SC01") || blocker.startsWith("MANIFEST_"));
  const contractSafe = Boolean(pilot) && qa01.present && !qa01.executable && !siteEnabled;
  const evaluationReady = sourceReady && contractSafe;

  return {
    ok: true,
    site_id: profile.site_id,
    item_id: itemId,
    pilot_id: pilot?.pilot_id ?? null,
    pipeline: "SCENE_IMAGE" as const,
    workflow_code: "QA01" as const,
    authority: "EVALUATION_ONLY" as const,
    execution_authorized: false as const,
    production_registration: false as const,
    source_ready: sourceReady,
    contract_safe: contractSafe,
    evaluation_ready: evaluationReady,
    next_gate: evaluationReady ? "BOUNDED_ENGINE_BENCHMARK" : "FIXED_SOURCE_PACKAGE",
    source,
    qa01: {
      registry_present: qa01.present,
      workflow_status: qa01.workflow_status,
      executable: qa01.executable,
      site_enabled: siteEnabled,
    },
    candidate_routes: pilot?.candidate_routes ?? [],
    gates: pilot?.gates ?? [],
    blockers: [...new Set(blockers)],
  };
}

export async function registerP3AAquariumRoutes(app: FastifyInstance, deps: Dependencies) {
  app.get("/api/v2/p3a/aquarium/readiness", async (req, reply) => {
    try {
      deps.assertLocalRequest(req);
      const siteId = String((req.query as any)?.site_id ?? "drift-curio");
      const profile = await deps.loadSite(siteId);
      const registry = await loadP3PilotRegistry();
      const defaultPilot = registry.pilots.find(
        (candidate) => candidate.phase === "P3-A" && candidate.site_id === profile.site_id,
      );
      const itemId = deps.validateProfileItem(
        profile,
        String((req.query as any)?.item_id ?? defaultPilot?.item_id ?? ""),
      );
      return await inspectAquariumSourceReadiness(profile, itemId);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });
}
