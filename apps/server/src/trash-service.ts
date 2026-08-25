import Fastify from "fastify";
import cors from "@fastify/cors";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { appendFile, mkdir, readFile, readdir, rm, stat } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";

const app = Fastify({ logger: true, bodyLimit: 1024 * 1024 });
await app.register(cors, { origin: false });

const ROOT = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const PORT = Number(process.env.VISUAL_CONSOLE_TRASH_PORT ?? 4178);

type SiteProfile = {
  site_id: string;
  display_name: string;
  display_name_zh: string;
  raw_root: string;
  trash_root: string;
};

function assertLocalRequest(req: any) {
  const ip = String(req.ip ?? "");
  if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(ip)) {
    throw new Error("LOCAL_ONLY");
  }
}

function safeId(value: string) {
  if (!/^[A-Za-z0-9._-]{1,120}$/.test(value)) throw new Error("INVALID_ITEM_ID");
  return value;
}

function assertInside(root: string, candidate: string) {
  const rel = relative(resolve(root), resolve(candidate));
  if (rel.startsWith("..") || rel.includes(":")) throw new Error("PATH_OUTSIDE_ALLOWLIST");
}

function rawAssetId(siteId: string, itemId: string, filename: string) {
  return createHash("sha256")
    .update(`${siteId}|${itemId}|${filename}`)
    .digest("hex")
    .slice(0, 32);
}

async function sha256File(path: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

async function transferVerified(source: string, target: string) {
  const sourceInfo = await stat(source);
  const sourceHash = await sha256File(source);
  let createdTarget = false;
  const output = createWriteStream(target, { flags: "wx" });
  output.once("open", () => { createdTarget = true; });
  try {
    await pipeline(createReadStream(source), output);
    const targetInfo = await stat(target);
    if (targetInfo.size !== sourceInfo.size) throw new Error("TRASH_SIZE_MISMATCH");
    const targetHash = await sha256File(target);
    if (targetHash !== sourceHash) throw new Error("TRASH_SHA256_MISMATCH");
    await rm(source, { force: true });
    return { sizeBytes: targetInfo.size, sha256: targetHash };
  } catch (error) {
    if (createdTarget) await rm(target, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function loadSite(siteId: string): Promise<SiteProfile> {
  if (!/^[a-z0-9-]+$/.test(siteId)) throw new Error("INVALID_SITE_ID");
  const path = join(ROOT, "config", "sites", `${siteId}.json`);
  const profile = JSON.parse(await readFile(path, "utf8")) as SiteProfile;
  if (profile.site_id !== siteId) throw new Error("SITE_PROFILE_MISMATCH");
  if (!profile.trash_root) throw new Error("TRASH_ROOT_NOT_CONFIGURED");
  return profile;
}

async function resolveRawAsset(profile: SiteProfile, itemId: string, assetId: string) {
  const dir = join(profile.raw_root, safeId(itemId));
  assertInside(profile.raw_root, dir);
  if (!existsSync(dir)) throw new Error("ASSET_NOT_FOUND");
  const filename = (await readdir(dir)).find(
    (name) => rawAssetId(profile.site_id, itemId, name) === assetId,
  );
  if (!filename) throw new Error("ASSET_NOT_FOUND");
  const full = join(dir, filename);
  assertInside(profile.raw_root, full);
  return { filename, full };
}

function dayStamp(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function fileStamp(date = new Date()) {
  return date.toISOString().replace(/[-:TZ.]/g, "");
}

async function uniqueTrashTarget(profile: SiteProfile, itemId: string, filename: string) {
  const dir = join(profile.trash_root, safeId(itemId), "RAW", dayStamp());
  assertInside(profile.trash_root, dir);
  await mkdir(dir, { recursive: true });
  const clean = basename(filename);
  let n = 0;
  while (true) {
    const suffix = n ? `_${n}` : "";
    const name = `${fileStamp()}_${randomUUID().slice(0, 8)}${suffix}__${clean}`;
    const full = join(dir, name);
    assertInside(profile.trash_root, full);
    if (!existsSync(full)) return { dir, name, full };
    n += 1;
  }
}

app.get("/trash-api/health", async (req, reply) => {
  try {
    assertLocalRequest(req);
    return { ok: true, service: "visual-console-trash", version: "0.1.0-p1.3" };
  } catch (e: any) {
    return reply.code(403).send({ error: e?.message ?? "FORBIDDEN" });
  }
});

app.post("/trash-api/assets/raw", async (req, reply) => {
  try {
    assertLocalRequest(req);
    const body = req.body as any;
    const siteId = String(body?.site_id ?? "");
    const itemId = safeId(String(body?.item_id ?? ""));
    const assetId = String(body?.asset_id ?? "");
    if (!/^[a-f0-9]{32}$/.test(assetId)) throw new Error("INVALID_ASSET_ID");

    const profile = await loadSite(siteId);
    const asset = await resolveRawAsset(profile, itemId, assetId);
    const originalHash = await sha256File(asset.full);
    const target = await uniqueTrashTarget(profile, itemId, asset.filename);
    const transfer = await transferVerified(asset.full, target.full);

    const record = {
      event: "TRASH",
      trashed_at: new Date().toISOString(),
      site_id: siteId,
      item_id: itemId,
      asset_type: "RAW",
      asset_id: assetId,
      original_filename: asset.filename,
      original_path: asset.full,
      trash_path: target.full,
      size_bytes: transfer.sizeBytes,
      sha256: transfer.sha256,
      source_sha256: originalHash,
    };
    const indexPath = join(profile.trash_root, "trash-index.jsonl");
    assertInside(profile.trash_root, indexPath);
    await appendFile(indexPath, JSON.stringify(record) + "\n", "utf8");

    return {
      ok: true,
      item_id: itemId,
      asset_id: assetId,
      filename: asset.filename,
      trash_relative_path: relative(profile.trash_root, target.full),
      sha256: transfer.sha256,
    };
  } catch (e: any) {
    req.log.error(e);
    return reply.code(400).send({ error: e?.message ?? "TRASH_FAILED" });
  }
});

app.listen({ port: PORT, host: "127.0.0.1" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
