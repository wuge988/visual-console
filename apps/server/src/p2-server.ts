import Fastify from "fastify";
import cors from "@fastify/cors";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertExistingRealInside,
  assertInside,
  rawAssetId,
  safeId,
  validateItemId,
} from "./runtime-utils.js";
import { registerP2Routes } from "./p2-routes.js";
import { registerP3ArchiveRoutes } from "./p3-archive.js";

const ROOT = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const SITE_CONFIG_ROOT = join(ROOT, "config", "sites");
const PORT = Number(process.env.VISUAL_CONSOLE_P2_PORT ?? 4179);

const app = Fastify({ logger: true, bodyLimit: 1024 * 1024 });
await app.register(cors, {
  origin: /^http:\/\/(127\.0\.0\.1|localhost):5173$/,
  methods: ["GET", "POST", "OPTIONS"],
});

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
  comfyui_input_root?: string;
  comfyui_output_root?: string;
};

function assertLocalRequest(req: any) {
  const ip = String(req.ip ?? "");
  if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(ip)) {
    throw new Error("LOCAL_ONLY");
  }
}

async function loadSite(siteId: string): Promise<SiteProfile> {
  if (!/^[a-z0-9-]+$/.test(siteId)) throw new Error("INVALID_SITE_ID");
  const path = join(SITE_CONFIG_ROOT, `${siteId}.json`);
  assertInside(SITE_CONFIG_ROOT, path);
  const profile = JSON.parse(await readFile(path, "utf8")) as SiteProfile;
  if (profile.site_id !== siteId) throw new Error("SITE_PROFILE_MISMATCH");
  if (!profile.raw_root || !profile.staging_root || !profile.manifest_root) {
    throw new Error("SITE_STORAGE_NOT_CONFIGURED");
  }
  return profile;
}

function validateProfileItem(profile: SiteProfile, itemId: string) {
  return validateItemId(profile.item_adapter, itemId);
}

function mimeFor(path: string) {
  const ext = extname(path).toLowerCase();
  const map: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".heic": "image/heic",
    ".heif": "image/heif",
    ".mov": "video/quicktime",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
  };
  return map[ext] ?? "application/octet-stream";
}

function kindFor(path: string) {
  const ext = extname(path).toLowerCase();
  if ([".mov", ".mp4", ".webm"].includes(ext)) return "video";
  if ([".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"].includes(ext)) {
    return "image";
  }
  return "file";
}

async function resolveRawAsset(profile: SiteProfile, itemId: string, assetId: string) {
  validateProfileItem(profile, itemId);
  if (!/^[a-f0-9]{32}$/.test(assetId)) throw new Error("INVALID_ASSET_ID");
  const dir = join(profile.raw_root, safeId(itemId));
  assertInside(profile.raw_root, dir);
  if (!existsSync(dir)) throw new Error("ASSET_NOT_FOUND");
  await assertExistingRealInside(profile.raw_root, dir);
  const filename = (await readdir(dir)).find(
    (name) => rawAssetId(profile.site_id, itemId, name) === assetId,
  );
  if (!filename) throw new Error("ASSET_NOT_FOUND");
  const full = join(dir, filename);
  await assertExistingRealInside(profile.raw_root, full);
  return { full, filename, mime: mimeFor(filename), kind: kindFor(filename) };
}

const sharedDeps = {
  assertLocalRequest,
  loadSite,
  validateProfileItem,
};

await registerP2Routes(app, {
  ...sharedDeps,
  resolveRawAsset,
});
await registerP3ArchiveRoutes(app, sharedDeps);

app.get("/health", async () => ({ ok: true, service: "visual-console-p2", version: "0.3.0-p3" }));

app.listen({ port: PORT, host: "127.0.0.1" }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
