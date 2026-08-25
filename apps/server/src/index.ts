import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import QRCode from "qrcode";
import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import {
  appendFile,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
import { pipeline } from "node:stream/promises";
import {
  SessionStore,
  assertExistingRealInside,
  assertInside,
  ensureSafeDirectory,
  expectedChunkSize,
  moveFileToTrash,
  rankLanCandidates,
  rawAssetId,
  safeFilename,
  safeId,
  selectLanCandidate,
  sha256File,
  sha256Text,
  transferVerified,
  validateChunkLength,
  validateDeclaredUploadSize,
  validateDirectUploadSize,
  validateItemId,
  type LanNetworkMap,
} from "./runtime-utils.js";

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const DIRECT_UPLOAD_LIMIT = 32 * 1024 * 1024;
const CHUNK_SIZE = 8 * 1024 * 1024;
const DEFAULT_MAX_SOURCE_FILE = 5 * 1024 * 1024 * 1024;
const DEFAULT_ABANDONED_UPLOAD_TTL = 2 * 60 * 60 * 1000;
const GC_INTERVAL_MS = 15 * 60 * 1000;
const MAX_ACTIVE_CHUNK_UPLOADS_PER_SESSION = 2;

const MAX_SOURCE_FILE = Number(
  process.env.VISUAL_CONSOLE_MAX_SOURCE_FILE_BYTES ?? DEFAULT_MAX_SOURCE_FILE,
);
const ABANDONED_UPLOAD_TTL = Number(
  process.env.VISUAL_CONSOLE_ABANDONED_UPLOAD_TTL_MS ??
    DEFAULT_ABANDONED_UPLOAD_TTL,
);

const app = Fastify({
  logger: true,
  bodyLimit: DIRECT_UPLOAD_LIMIT + 1024 * 1024,
});
await app.register(cors, { origin: true });
await app.register(multipart, {
  limits: { fileSize: DIRECT_UPLOAD_LIMIT, files: 1 },
});
app.addContentTypeParser(
  "application/octet-stream",
  { parseAs: "buffer" },
  (_req, body, done) => done(null, body),
);

const ROOT = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const SITE_CONFIG_ROOT = join(ROOT, "config", "sites");
const PORT = Number(process.env.VISUAL_CONSOLE_PORT ?? 4177);
const TEMP_ROOT =
  process.env.VISUAL_CONSOLE_UPLOAD_TEMP ??
  String.raw`D:\AI\CACHE\visual_console_uploads`;

const sessions = new SessionStore(SESSION_TTL_MS);

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
};

type ChunkUpload = {
  id: string;
  tokenHash: string;
  siteId: string;
  itemId: string;
  originalName: string;
  sizeBytes: number;
  mime: string;
  totalChunks: number;
  tempDir: string;
  createdAt: number;
  updatedAt: number;
};

const chunkUploads = new Map<string, ChunkUpload>();
const SUPPORTED_ADAPTERS = new Set(["drift_curio_sku_v1"]);

function assertLocalRequest(req: any) {
  const ip = String(req.ip ?? "");
  if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(ip)) {
    throw new Error("LOCAL_ONLY");
  }
}

function networkMap() {
  return os.networkInterfaces() as unknown as LanNetworkMap;
}

function selectedLan() {
  return selectLanCandidate(
    networkMap(),
    String(process.env.VISUAL_CONSOLE_LAN_IP ?? ""),
  );
}

async function loadSite(siteId: string): Promise<SiteProfile> {
  if (!/^[a-z0-9-]+$/.test(siteId)) throw new Error("INVALID_SITE_ID");
  const path = join(SITE_CONFIG_ROOT, `${siteId}.json`);
  assertInside(SITE_CONFIG_ROOT, path);
  const profile = JSON.parse(await readFile(path, "utf8")) as SiteProfile;
  if (profile.site_id !== siteId) throw new Error("SITE_PROFILE_MISMATCH");
  if (!SUPPORTED_ADAPTERS.has(profile.item_adapter)) {
    throw new Error("UNSUPPORTED_ITEM_ADAPTER");
  }
  if (!profile.raw_root || !profile.trash_root) {
    throw new Error("SITE_STORAGE_NOT_CONFIGURED");
  }
  return profile;
}

async function discoverSites() {
  const rows: Array<{
    site_id: string;
    display_name: string;
    display_name_zh: string;
    item_adapter: string;
  }> = [];
  for (const filename of await readdir(SITE_CONFIG_ROOT)) {
    if (!filename.endsWith(".json")) continue;
    const siteId = filename.slice(0, -5);
    try {
      const profile = await loadSite(siteId);
      rows.push({
        site_id: profile.site_id,
        display_name: profile.display_name,
        display_name_zh: profile.display_name_zh,
        item_adapter: profile.item_adapter,
      });
    } catch (error) {
      app.log.warn({ siteId, error }, "Skipping invalid or unsupported Site Profile");
    }
  }
  return rows.sort((a, b) => a.site_id.localeCompare(b.site_id));
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

async function listRawAssets(siteId: string, itemId: string) {
  const profile = await loadSite(siteId);
  validateProfileItem(profile, itemId);
  const dir = join(profile.raw_root, safeId(itemId));
  assertInside(profile.raw_root, dir);
  if (!existsSync(dir)) return [];
  await assertExistingRealInside(profile.raw_root, dir);

  const rows: any[] = [];
  for (const filename of await readdir(dir)) {
    const full = join(dir, filename);
    try {
      await assertExistingRealInside(profile.raw_root, full);
      const info = await stat(full);
      if (!info.isFile()) continue;
      const assetId = rawAssetId(siteId, itemId, filename);
      rows.push({
        asset_id: assetId,
        filename,
        kind: kindFor(filename),
        mime: mimeFor(filename),
        size_bytes: info.size,
        modified_at: info.mtime.toISOString(),
        content_url: `/api/assets/raw/${encodeURIComponent(siteId)}/${encodeURIComponent(itemId)}/${assetId}/content`,
      });
    } catch (error) {
      app.log.warn({ full, error }, "Skipping unsafe RAW asset");
    }
  }
  return rows.sort((a, b) => b.modified_at.localeCompare(a.modified_at));
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

async function finalizedFilename(
  profile: SiteProfile,
  itemId: string,
  original: string,
) {
  validateProfileItem(profile, itemId);
  const { base, ext } = safeFilename(original);
  const dir = join(profile.raw_root, safeId(itemId));
  await ensureSafeDirectory(profile.raw_root, dir);
  let n = 0;
  while (true) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const suffix = n === 0 ? "" : `_${n}`;
    const name = `${base}__mobile_${stamp}${suffix}${ext}`;
    const full = join(dir, name);
    assertInside(profile.raw_root, full);
    if (!existsSync(full)) return { name, full };
    n += 1;
  }
}

async function cleanupRuntimeState() {
  sessions.cleanupExpired();
  const now = Date.now();
  for (const [id, upload] of chunkUploads.entries()) {
    const stale = now - upload.updatedAt > ABANDONED_UPLOAD_TTL;
    const invalidSession = !sessions.hasTokenHash(upload.tokenHash);
    if (!stale && !invalidSession) continue;
    await rm(upload.tempDir, { recursive: true, force: true }).catch(() => undefined);
    chunkUploads.delete(id);
  }
}

const gcTimer = setInterval(() => {
  cleanupRuntimeState().catch((error) => app.log.error(error, "runtime GC failed"));
}, GC_INTERVAL_MS);
gcTimer.unref();
app.addHook("onClose", async () => clearInterval(gcTimer));

app.get("/api/health", async () => {
  const lan = selectedLan();
  return {
    ok: true,
    service: "visual-console",
    version: "0.1.0-p1.4-repair",
    lan_ip: lan.address,
    lan_interface: lan.interface,
    lan_candidates: rankLanCandidates(networkMap()).map((candidate) => ({
      interface: candidate.interface,
      address: candidate.address,
      excluded: candidate.excluded,
    })),
    session_ttl_hours: SESSION_TTL_MS / 60 / 60 / 1000,
    direct_upload_limit_bytes: DIRECT_UPLOAD_LIMIT,
    chunk_size_bytes: CHUNK_SIZE,
    max_source_file_bytes: MAX_SOURCE_FILE,
  };
});

app.get("/api/sites", async (req, reply) => {
  try {
    assertLocalRequest(req);
    return await discoverSites();
  } catch (error: any) {
    return reply.code(403).send({ error: error?.message ?? "FORBIDDEN" });
  }
});

app.get("/api/items/:siteId/:itemId/raw-assets", async (req, reply) => {
  try {
    assertLocalRequest(req);
    const { siteId, itemId } = req.params as any;
    return await listRawAssets(siteId, itemId);
  } catch (error: any) {
    return reply.code(400).send({ error: error?.message ?? "LIST_FAILED" });
  }
});

app.get(
  "/api/assets/raw/:siteId/:itemId/:assetId/content",
  async (req, reply) => {
    try {
      assertLocalRequest(req);
      const { siteId, itemId, assetId } = req.params as any;
      const profile = await loadSite(siteId);
      const asset = await resolveRawAsset(profile, itemId, assetId);
      const info = await stat(asset.full);
      const range = req.headers.range;
      reply.header("Accept-Ranges", "bytes");
      reply.type(asset.mime);
      if (range && asset.kind === "video") {
        const match = /^bytes=(\d+)-(\d*)$/.exec(range);
        if (!match) return reply.code(416).send();
        const start = Number(match[1]);
        const end = match[2] ? Number(match[2]) : info.size - 1;
        if (start >= info.size || end >= info.size || start > end) {
          return reply.code(416).send();
        }
        reply
          .code(206)
          .header("Content-Range", `bytes ${start}-${end}/${info.size}`)
          .header("Content-Length", String(end - start + 1));
        return reply.send(createReadStream(asset.full, { start, end }));
      }
      reply.header("Content-Length", String(info.size));
      return reply.send(createReadStream(asset.full));
    } catch (error: any) {
      return reply.code(404).send({ error: error?.message ?? "ASSET_NOT_FOUND" });
    }
  },
);

app.post("/api/mobile/sessions", async (req, reply) => {
  try {
    assertLocalRequest(req);
    const body = req.body as any;
    const profile = await loadSite(String(body?.site_id ?? ""));
    const itemId = validateProfileItem(
      profile,
      String(body?.item_id ?? body?.sku ?? ""),
    );
    const { token, session } = sessions.create(
      profile.site_id,
      itemId,
      body?.sku,
    );
    const lan = selectedLan();
    const mobileUrl = `http://${lan.address}:${PORT}/m/${token}`;
    const qrDataUrl = await QRCode.toDataURL(mobileUrl, {
      margin: 1,
      width: 320,
      errorCorrectionLevel: "M",
    });
    return {
      session_id: session.id,
      mobile_url: mobileUrl,
      qr_data_url: qrDataUrl,
      expires_at: new Date(session.expiresAt).toISOString(),
      session_ttl_hours: SESSION_TTL_MS / 60 / 60 / 1000,
      lan_ip: lan.address,
      lan_interface: lan.interface,
      site_id: profile.site_id,
      item_id: itemId,
      sku: body?.sku,
    };
  } catch (error: any) {
    return reply.code(400).send({ error: error?.message ?? "SESSION_FAILED" });
  }
});

app.get("/m/:token", async (req, reply) => {
  try {
    const token = String((req.params as any).token ?? "");
    const session = sessions.validate(token);
    const site = await loadSite(session.siteId);
    reply.type("text/html; charset=utf-8");
    return `<!doctype html>
<html lang="zh-CN"><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>手机采集｜Visual Console</title>
<style>:root{color-scheme:dark;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans SC",sans-serif}*{box-sizing:border-box}body{margin:0;background:#0a0c0d;color:#f2f0e9}main{max-width:660px;margin:auto;padding:22px 16px 40px}.kicker{font-size:11px;color:#c6a56b;letter-spacing:.08em}.sku{font-size:25px;margin:6px 0 3px}.muted{color:#98a19d;font-size:13px;line-height:1.6}.bound{margin-top:12px;padding:11px 12px;border:1px solid #3b3529;border-radius:12px;background:#15130f}.bound b{display:block;font-size:13px;color:#e8d2a5}.bound span{display:block;margin-top:4px;font-size:12px;color:#b7afa0}.card{margin-top:14px;border:1px solid #2b3133;background:#111415;border-radius:16px;padding:14px}label.action{display:block;border:1px solid #394144;background:#181c1e;border-radius:12px;padding:15px;margin:9px 0;text-align:center;font-size:16px;font-weight:650}input{display:none}.expiry{display:flex;justify-content:space-between;gap:10px;margin:2px 0 12px;font-size:12px;color:#9cc2a6}.expiry.expired{color:#e28c8c}.status{font-size:13px;line-height:1.65;color:#9cc2a6;white-space:pre-wrap;margin-top:12px}.bar{height:6px;background:#252b2d;border-radius:99px;overflow:hidden;margin-top:8px}.bar i{display:block;height:100%;width:0;background:#c6a56b}.recent{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:10px}.shot{aspect-ratio:1/1;border:1px solid #2d3335;border-radius:9px;background:#0c0f10;display:grid;place-items:center;overflow:hidden;font-size:10px;color:#87908c}.shot img{width:100%;height:100%;object-fit:cover}</style></head>
<body><main><div class="kicker">视觉生产控制台 · 手机采集</div><div class="sku">${session.itemId}</div><div class="muted">站点：${site.display_name} / ${site.display_name_zh}</div><div class="bound"><b>所有照片和视频都将保存到当前 SKU</b><span>${session.itemId}</span></div><div class="card"><div id="expiry" class="expiry"><span>Session 有效期</span><b id="remaining">计算中…</b></div><label class="action">拍摄照片<input id="photo" type="file" accept="image/*" capture="environment"></label><label class="action">拍摄视频<input id="video" type="file" accept="video/*" capture="environment"></label><label class="action">从照片 / 文件中多选<input id="multi" type="file" accept="image/*,video/*" multiple></label><div id="status" class="status">等待上传</div><div class="bar"><i id="bar"></i></div><div id="recent" class="recent"></div></div></main>
<script>const token=${JSON.stringify(token)};const expiresAt=${session.expiresAt};const directLimit=${DIRECT_UPLOAD_LIMIT};const statusEl=document.getElementById("status"),bar=document.getElementById("bar"),recent=document.getElementById("recent"),remaining=document.getElementById("remaining"),expiry=document.getElementById("expiry");function updateRemaining(){const ms=expiresAt-Date.now();if(ms<=0){remaining.textContent="已过期";expiry.classList.add("expired");for(const id of["photo","video","multi"])document.getElementById(id).disabled=true;return}const h=Math.floor(ms/3600000),m=Math.floor((ms%3600000)/60000);remaining.textContent=h+" 小时 "+m+" 分钟"}updateRemaining();setInterval(updateRemaining,60000);function setProgress(text,percent){statusEl.textContent=text;bar.style.width=Math.max(0,Math.min(100,percent||0))+"%"}function addRecent(file){const box=document.createElement("div");box.className="shot";if(file.type.startsWith("image/")){const img=document.createElement("img");img.src=URL.createObjectURL(file);box.appendChild(img)}else box.textContent="VIDEO\\n"+file.name;recent.prepend(box);while(recent.children.length>6)recent.lastChild.remove()}function uploadDirect(file){return new Promise((resolve,reject)=>{const xhr=new XMLHttpRequest();xhr.open("POST","/api/mobile/upload?token="+encodeURIComponent(token));xhr.upload.onprogress=e=>{if(e.lengthComputable)setProgress("上传中："+file.name,Math.round(e.loaded/e.total*100))};xhr.onerror=()=>reject(new Error("NETWORK_ERROR"));xhr.onload=()=>{let data={};try{data=JSON.parse(xhr.responseText)}catch{}if(xhr.status>=200&&xhr.status<300)resolve(data);else reject(new Error(data.error||("HTTP_"+xhr.status)))};const fd=new FormData();fd.append("file",file);xhr.send(fd)})}async function retry(fn,times=3){let last;for(let i=0;i<times;i++){try{return await fn()}catch(e){last=e;await new Promise(r=>setTimeout(r,800*(i+1)))}}throw last}async function uploadChunked(file){const init=await fetch("/api/mobile/uploads/init?token="+encodeURIComponent(token),{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({filename:file.name,mime:file.type||"application/octet-stream",size_bytes:file.size})});const meta=await init.json();if(!init.ok)throw new Error(meta.error||"INIT_FAILED");const total=meta.total_chunks;for(let i=0;i<total;i++){const start=i*meta.chunk_size,end=Math.min(file.size,start+meta.chunk_size),blob=file.slice(start,end);await retry(async()=>{const r=await fetch("/api/mobile/uploads/"+meta.upload_id+"/chunks/"+i+"?token="+encodeURIComponent(token),{method:"PUT",headers:{"content-type":"application/octet-stream"},body:blob});if(!r.ok){const j=await r.json().catch(()=>({}));throw new Error(j.error||"CHUNK_FAILED")}});setProgress("分块上传："+file.name+"\\n"+(i+1)+" / "+total,Math.round((i+1)/total*100))}const fin=await fetch("/api/mobile/uploads/"+meta.upload_id+"/finalize?token="+encodeURIComponent(token),{method:"POST"});const result=await fin.json();if(!fin.ok)throw new Error(result.error||"FINALIZE_FAILED");return result}async function uploadFiles(files){for(const file of files){try{setProgress("准备上传："+file.name,0);const result=file.size>directLimit?await uploadChunked(file):await uploadDirect(file);addRecent(file);setProgress("已完成："+file.name+"\\n已保存："+result.filename,100)}catch(e){setProgress("失败："+file.name+"\\n"+(e.message||e),0);return}}}for(const id of["photo","video","multi"]){document.getElementById(id).addEventListener("change",async e=>{await uploadFiles(e.target.files);e.target.value=""})}</script></body></html>`;
  } catch {
    return reply
      .code(403)
      .type("text/plain; charset=utf-8")
      .send("上传二维码已失效，请回到电脑重新生成。");
  }
});

app.post("/api/mobile/upload", async (req, reply) => {
  let tempPath = "";
  try {
    const token = String((req.query as any).token ?? "");
    const session = sessions.validate(token);
    const profile = await loadSite(session.siteId);
    const part = await req.file();
    if (!part) return reply.code(400).send({ error: "NO_FILE" });
    const tempDir = join(TEMP_ROOT, "direct");
    await ensureSafeDirectory(TEMP_ROOT, tempDir);
    tempPath = join(tempDir, `${randomUUID()}.part`);
    assertInside(TEMP_ROOT, tempPath);
    await pipeline(part.file, createWriteStream(tempPath, { flags: "wx" }));
    const info = await stat(tempPath);
    validateDirectUploadSize(info.size, DIRECT_UPLOAD_LIMIT);
    const target = await finalizedFilename(profile, session.itemId, part.filename);
    const transfer = await transferVerified(tempPath, target.full);
    tempPath = "";
    return {
      ok: true,
      filename: target.name,
      size_bytes: transfer.sizeBytes,
      sha256: transfer.sha256,
      item_id: session.itemId,
      site_id: session.siteId,
    };
  } catch (error: any) {
    if (tempPath) await rm(tempPath, { force: true }).catch(() => undefined);
    req.log.error(error);
    const code = error?.code === "FST_REQ_FILE_TOO_LARGE" ? 413 : 400;
    return reply.code(code).send({
      error:
        error?.code === "FST_REQ_FILE_TOO_LARGE"
          ? "DIRECT_UPLOAD_TOO_LARGE"
          : error?.message ?? "UPLOAD_FAILED",
    });
  }
});

app.post("/api/mobile/uploads/init", async (req, reply) => {
  try {
    const token = String((req.query as any).token ?? "");
    const session = sessions.validate(token);
    const body = req.body as any;
    const sizeBytes = validateDeclaredUploadSize(
      Number(body?.size_bytes ?? 0),
      MAX_SOURCE_FILE,
    );
    const tokenHash = sha256Text(token);
    const active = [...chunkUploads.values()].filter(
      (upload) => upload.tokenHash === tokenHash,
    ).length;
    if (active >= MAX_ACTIVE_CHUNK_UPLOADS_PER_SESSION) {
      throw new Error("TOO_MANY_ACTIVE_UPLOADS");
    }
    const id = `up_${randomUUID()}`;
    const tempDir = join(TEMP_ROOT, id);
    await ensureSafeDirectory(TEMP_ROOT, tempDir);
    const now = Date.now();
    const upload: ChunkUpload = {
      id,
      tokenHash,
      siteId: session.siteId,
      itemId: session.itemId,
      originalName: String(body?.filename ?? "mobile.bin"),
      sizeBytes,
      mime: String(body?.mime ?? "application/octet-stream"),
      totalChunks: Math.ceil(sizeBytes / CHUNK_SIZE),
      tempDir,
      createdAt: now,
      updatedAt: now,
    };
    chunkUploads.set(id, upload);
    return {
      upload_id: id,
      chunk_size: CHUNK_SIZE,
      total_chunks: upload.totalChunks,
      max_source_file_bytes: MAX_SOURCE_FILE,
    };
  } catch (error: any) {
    return reply.code(error?.message === "FILE_TOO_LARGE" ? 413 : 400).send({
      error: error?.message ?? "INIT_FAILED",
    });
  }
});

app.put(
  "/api/mobile/uploads/:uploadId/chunks/:index",
  { bodyLimit: CHUNK_SIZE },
  async (req, reply) => {
    try {
      const token = String((req.query as any).token ?? "");
      sessions.validate(token);
      const { uploadId, index } = req.params as any;
      const upload = chunkUploads.get(uploadId);
      if (!upload || upload.tokenHash !== sha256Text(token)) {
        throw new Error("UPLOAD_NOT_FOUND");
      }
      const n = Number(index);
      const expected = expectedChunkSize(
        upload.sizeBytes,
        upload.totalChunks,
        n,
        CHUNK_SIZE,
      );
      const body = req.body as Buffer;
      if (!Buffer.isBuffer(body)) throw new Error("INVALID_CHUNK_BODY");
      validateChunkLength(body.length, expected);
      const path = join(upload.tempDir, `${n}.chunk`);
      assertInside(TEMP_ROOT, path);
      if (existsSync(path)) {
        await assertExistingRealInside(TEMP_ROOT, path);
        await rm(path, { force: true });
      }
      await writeFile(path, body, { flag: "wx" });
      upload.updatedAt = Date.now();
      return { ok: true, index: n, size_bytes: body.length };
    } catch (error: any) {
      return reply.code(error?.code === "FST_ERR_CTP_BODY_TOO_LARGE" ? 413 : 400).send({
        error: error?.message ?? "CHUNK_FAILED",
      });
    }
  },
);

app.post("/api/mobile/uploads/:uploadId/finalize", async (req, reply) => {
  try {
    const token = String((req.query as any).token ?? "");
    const session = sessions.validate(token);
    const { uploadId } = req.params as any;
    const upload = chunkUploads.get(uploadId);
    if (
      !upload ||
      upload.tokenHash !== sha256Text(token) ||
      upload.itemId !== session.itemId ||
      upload.siteId !== session.siteId
    ) {
      throw new Error("UPLOAD_NOT_FOUND");
    }
    const assembled = join(upload.tempDir, "assembled.part");
    assertInside(TEMP_ROOT, assembled);
    await writeFile(assembled, Buffer.alloc(0), { flag: "wx" });
    for (let i = 0; i < upload.totalChunks; i += 1) {
      const chunk = join(upload.tempDir, `${i}.chunk`);
      if (!existsSync(chunk)) throw new Error(`MISSING_CHUNK_${i}`);
      await assertExistingRealInside(TEMP_ROOT, chunk);
      const chunkInfo = await stat(chunk);
      const expected = expectedChunkSize(
        upload.sizeBytes,
        upload.totalChunks,
        i,
        CHUNK_SIZE,
      );
      validateChunkLength(chunkInfo.size, expected);
      await appendFile(assembled, await readFile(chunk));
    }
    const info = await stat(assembled);
    if (info.size !== upload.sizeBytes) throw new Error("SIZE_MISMATCH");
    const profile = await loadSite(upload.siteId);
    const target = await finalizedFilename(
      profile,
      upload.itemId,
      upload.originalName,
    );
    const transfer = await transferVerified(assembled, target.full);
    await rm(upload.tempDir, { recursive: true, force: true });
    chunkUploads.delete(upload.id);
    return {
      ok: true,
      filename: target.name,
      size_bytes: transfer.sizeBytes,
      sha256: transfer.sha256,
      item_id: upload.itemId,
      site_id: upload.siteId,
    };
  } catch (error: any) {
    req.log.error(error);
    return reply.code(400).send({ error: error?.message ?? "FINALIZE_FAILED" });
  }
});

app.post("/trash-api/assets/raw", async (req, reply) => {
  try {
    assertLocalRequest(req);
    const body = req.body as any;
    const siteId = String(body?.site_id ?? "");
    const profile = await loadSite(siteId);
    const itemId = validateProfileItem(profile, String(body?.item_id ?? ""));
    const assetId = String(body?.asset_id ?? "");
    const asset = await resolveRawAsset(profile, itemId, assetId);
    const moved = await moveFileToTrash({
      source: asset.full,
      trashRoot: profile.trash_root,
      siteId,
      itemId,
      assetId,
      assetType: "RAW",
      filename: asset.filename,
    });
    return {
      ok: true,
      item_id: itemId,
      asset_id: assetId,
      filename: asset.filename,
      trash_path: moved.target,
      sha256: moved.transfer.sha256,
    };
  } catch (error: any) {
    req.log.error(error);
    return reply.code(400).send({ error: error?.message ?? "TRASH_FAILED" });
  }
});

app.listen({ port: PORT, host: "0.0.0.0" }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
