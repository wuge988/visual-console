import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import QRCode from "qrcode";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { appendFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
import { pipeline } from "node:stream/promises";

const app = Fastify({ logger: true, bodyLimit: 1024 * 1024 * 1024 });
await app.register(cors, { origin: true });
await app.register(multipart, {
  limits: { fileSize: 1024 * 1024 * 1024, files: 100 },
});
app.addContentTypeParser("application/octet-stream", { parseAs: "buffer" }, (_req, body, done) => done(null, body));

const ROOT = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const PORT = Number(process.env.VISUAL_CONSOLE_PORT ?? 4177);
const TEMP_ROOT = process.env.VISUAL_CONSOLE_UPLOAD_TEMP ?? String.raw`D:\AI\CACHE\visual_console_uploads`;
const SESSION_TTL_MS = 30 * 60 * 1000;
const DIRECT_UPLOAD_LIMIT = 32 * 1024 * 1024;
const CHUNK_SIZE = 8 * 1024 * 1024;

type SiteProfile = {
  site_id: string;
  display_name: string;
  display_name_zh: string;
  item_adapter: string;
  raw_root: string;
  work_root: string;
  staging_root: string;
  manifest_root: string;
  enabled_workflows: string[];
};

type UploadSession = {
  id: string;
  tokenHash: string;
  siteId: string;
  itemId: string;
  sku?: string;
  expiresAt: number;
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
};

const sessions = new Map<string, UploadSession>();
const chunkUploads = new Map<string, ChunkUpload>();

function sha256Text(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function safeId(value: string) {
  if (!/^[A-Za-z0-9._-]{1,120}$/.test(value)) throw new Error("INVALID_ITEM_ID");
  return value;
}

function safeFilename(input: string) {
  const ext = extname(input).slice(0, 16);
  const base = basename(input, ext).replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120) || "mobile";
  return { base, ext };
}

function assertInside(root: string, candidate: string) {
  const rel = relative(resolve(root), resolve(candidate));
  if (rel.startsWith("..") || rel.includes(":")) throw new Error("PATH_OUTSIDE_ALLOWLIST");
}

function assertLocalRequest(req: any) {
  const ip = String(req.ip ?? "");
  if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(ip)) {
    throw new Error("LOCAL_ONLY");
  }
}

function lanIp() {
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) return entry.address;
    }
  }
  return "127.0.0.1";
}

async function loadSite(siteId: string): Promise<SiteProfile> {
  if (!/^[a-z0-9-]+$/.test(siteId)) throw new Error("INVALID_SITE_ID");
  const path = join(ROOT, "config", "sites", `${siteId}.json`);
  const profile = JSON.parse(await readFile(path, "utf8")) as SiteProfile;
  if (profile.site_id !== siteId) throw new Error("SITE_PROFILE_MISMATCH");
  return profile;
}

function validateSession(token: string) {
  const hash = sha256Text(token);
  const s = [...sessions.values()].find((x) => x.tokenHash === hash);
  if (!s || s.expiresAt < Date.now()) throw new Error("INVALID_OR_EXPIRED_SESSION");
  return s;
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
  if ([".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"].includes(ext)) return "image";
  return "file";
}

function rawAssetId(siteId: string, itemId: string, filename: string) {
  return sha256Text(`${siteId}|${itemId}|${filename}`).slice(0, 32);
}

async function listRawAssets(siteId: string, itemId: string) {
  const profile = await loadSite(siteId);
  const dir = join(profile.raw_root, safeId(itemId));
  assertInside(profile.raw_root, dir);
  if (!existsSync(dir)) return [];

  const rows: any[] = [];
  for (const filename of await readdir(dir)) {
    const full = join(dir, filename);
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
  }
  return rows.sort((a, b) => b.modified_at.localeCompare(a.modified_at));
}

async function resolveRawAsset(siteId: string, itemId: string, assetId: string) {
  const profile = await loadSite(siteId);
  const dir = join(profile.raw_root, safeId(itemId));
  assertInside(profile.raw_root, dir);
  if (!existsSync(dir)) throw new Error("ASSET_NOT_FOUND");
  const filename = (await readdir(dir)).find((name) => rawAssetId(siteId, itemId, name) === assetId);
  if (!filename) throw new Error("ASSET_NOT_FOUND");
  const full = join(dir, filename);
  assertInside(profile.raw_root, full);
  return { full, filename, mime: mimeFor(filename), kind: kindFor(filename) };
}

async function finalizedFilename(profile: SiteProfile, itemId: string, original: string) {
  const { base, ext } = safeFilename(original);
  const dir = join(profile.raw_root, safeId(itemId));
  assertInside(profile.raw_root, dir);
  await mkdir(dir, { recursive: true });
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

async function sha256File(path: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

app.get("/api/health", async () => ({
  ok: true,
  service: "visual-console",
  version: "0.1.0-p1",
  lan_ip: lanIp(),
  direct_upload_limit_bytes: DIRECT_UPLOAD_LIMIT,
  chunk_size_bytes: CHUNK_SIZE,
}));

app.get("/api/sites", async (req, reply) => {
  try {
    assertLocalRequest(req);
    const profile = await loadSite("drift-curio");
    return [{ site_id: profile.site_id, display_name: profile.display_name, display_name_zh: profile.display_name_zh }];
  } catch (e: any) {
    return reply.code(403).send({ error: e?.message ?? "FORBIDDEN" });
  }
});

app.get("/api/items/:siteId/:itemId/raw-assets", async (req, reply) => {
  try {
    assertLocalRequest(req);
    const { siteId, itemId } = req.params as any;
    return await listRawAssets(siteId, itemId);
  } catch (e: any) {
    return reply.code(400).send({ error: e?.message ?? "LIST_FAILED" });
  }
});

app.get("/api/assets/raw/:siteId/:itemId/:assetId/content", async (req, reply) => {
  try {
    assertLocalRequest(req);
    const { siteId, itemId, assetId } = req.params as any;
    const asset = await resolveRawAsset(siteId, itemId, assetId);
    const info = await stat(asset.full);
    const range = req.headers.range;
    reply.header("Accept-Ranges", "bytes");
    reply.type(asset.mime);

    if (range && asset.kind === "video") {
      const match = /^bytes=(\d+)-(\d*)$/.exec(range);
      if (!match) return reply.code(416).send();
      const start = Number(match[1]);
      const end = match[2] ? Number(match[2]) : info.size - 1;
      if (start >= info.size || end >= info.size || start > end) return reply.code(416).send();
      reply.code(206).header("Content-Range", `bytes ${start}-${end}/${info.size}`).header("Content-Length", String(end - start + 1));
      return reply.send(createReadStream(asset.full, { start, end }));
    }

    reply.header("Content-Length", String(info.size));
    return reply.send(createReadStream(asset.full));
  } catch (e: any) {
    return reply.code(404).send({ error: e?.message ?? "ASSET_NOT_FOUND" });
  }
});

app.post("/api/mobile/sessions", async (req, reply) => {
  try {
    assertLocalRequest(req);
    const body = req.body as any;
    const profile = await loadSite(String(body?.site_id ?? ""));
    const itemId = safeId(String(body?.item_id ?? body?.sku ?? ""));
    const id = "us_" + randomUUID();
    const token = randomBytes(32).toString("base64url");
    const expiresAt = Date.now() + SESSION_TTL_MS;
    sessions.set(id, { id, tokenHash: sha256Text(token), siteId: profile.site_id, itemId, sku: body?.sku, expiresAt });
    const mobileUrl = `http://${lanIp()}:${PORT}/m/${token}`;
    const qrDataUrl = await QRCode.toDataURL(mobileUrl, { margin: 1, width: 320, errorCorrectionLevel: "M" });
    return { session_id: id, mobile_url: mobileUrl, qr_data_url: qrDataUrl, expires_at: new Date(expiresAt).toISOString() };
  } catch (e: any) {
    return reply.code(400).send({ error: e?.message ?? "SESSION_FAILED" });
  }
});

app.get("/m/:token", async (req, reply) => {
  try {
    const token = String((req.params as any).token ?? "");
    const s = validateSession(token);
    const site = await loadSite(s.siteId);
    reply.type("text/html; charset=utf-8");
    return `<!doctype html><html lang="zh-CN"><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>手机采集｜Visual Console</title><style>:root{color-scheme:dark;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans SC",sans-serif}*{box-sizing:border-box}body{margin:0;background:#0a0c0d;color:#f2f0e9}main{max-width:660px;margin:auto;padding:22px 16px 40px}.kicker{font-size:11px;color:#c6a56b;letter-spacing:.08em}h1{font-size:24px;margin:6px 0 4px}.muted{color:#98a19d;font-size:13px}.card{margin-top:14px;border:1px solid #2b3133;background:#111415;border-radius:16px;padding:14px}label.action{display:block;border:1px solid #394144;background:#181c1e;border-radius:12px;padding:15px;margin:9px 0;text-align:center;font-size:16px;font-weight:650}input{display:none}.status{font-size:13px;line-height:1.65;color:#9cc2a6;white-space:pre-wrap;margin-top:12px}.bar{height:6px;background:#252b2d;border-radius:99px;overflow:hidden;margin-top:8px}.bar i{display:block;height:100%;width:0;background:#c6a56b}.recent{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:10px}.shot{aspect-ratio:1/1;border:1px solid #2d3335;border-radius:9px;background:#0c0f10;display:grid;place-items:center;overflow:hidden;font-size:10px;color:#87908c}.shot img{width:100%;height:100%;object-fit:cover}</style></head><body><main><div class="kicker">视觉生产控制台 · 手机采集</div><h1>${s.itemId}</h1><div class="muted">站点：${site.display_name} / ${site.display_name_zh} · 上传 Session 30 分钟有效</div><div class="card"><label class="action">拍摄照片<input id="photo" type="file" accept="image/*" capture="environment"></label><label class="action">拍摄视频<input id="video" type="file" accept="video/*" capture="environment"></label><label class="action">从照片 / 文件中多选<input id="multi" type="file" accept="image/*,video/*" multiple></label><div id="status" class="status">等待上传</div><div class="bar"><i id="bar"></i></div><div id="recent" class="recent"></div></div></main><script>const token=${JSON.stringify(token)};const directLimit=${DIRECT_UPLOAD_LIMIT};const chunkSize=${CHUNK_SIZE};const statusEl=document.getElementById("status"),bar=document.getElementById("bar"),recent=document.getElementById("recent");function setProgress(text,percent){statusEl.textContent=text;bar.style.width=Math.max(0,Math.min(100,percent||0))+"%"}function addRecent(file){const box=document.createElement("div");box.className="shot";if(file.type.startsWith("image/")){const img=document.createElement("img");img.src=URL.createObjectURL(file);box.appendChild(img)}else box.textContent="VIDEO\\n"+file.name;recent.prepend(box);while(recent.children.length>6)recent.lastChild.remove()}function uploadDirect(file){return new Promise((resolve,reject)=>{const xhr=new XMLHttpRequest();xhr.open("POST","/api/mobile/upload?token="+encodeURIComponent(token));xhr.upload.onprogress=e=>{if(e.lengthComputable)setProgress("上传中："+file.name,Math.round(e.loaded/e.total*100))};xhr.onerror=()=>reject(new Error("NETWORK_ERROR"));xhr.onload=()=>{let data={};try{data=JSON.parse(xhr.responseText)}catch{}if(xhr.status>=200&&xhr.status<300)resolve(data);else reject(new Error(data.error||("HTTP_"+xhr.status)))};const fd=new FormData();fd.append("file",file);xhr.send(fd)})}async function retry(fn,times=3){let last;for(let i=0;i<times;i++){try{return await fn()}catch(e){last=e;await new Promise(r=>setTimeout(r,800*(i+1)))}}throw last}async function uploadChunked(file){const init=await fetch("/api/mobile/uploads/init?token="+encodeURIComponent(token),{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({filename:file.name,mime:file.type||"application/octet-stream",size_bytes:file.size})});const meta=await init.json();if(!init.ok)throw new Error(meta.error||"INIT_FAILED");const total=meta.total_chunks;for(let i=0;i<total;i++){const start=i*meta.chunk_size,end=Math.min(file.size,start+meta.chunk_size),blob=file.slice(start,end);await retry(async()=>{const r=await fetch("/api/mobile/uploads/"+meta.upload_id+"/chunks/"+i+"?token="+encodeURIComponent(token),{method:"PUT",headers:{"content-type":"application/octet-stream"},body:blob});if(!r.ok){const j=await r.json().catch(()=>({}));throw new Error(j.error||"CHUNK_FAILED")}});setProgress("分块上传："+file.name+"\\n"+(i+1)+" / "+total,Math.round((i+1)/total*100))}const fin=await fetch("/api/mobile/uploads/"+meta.upload_id+"/finalize?token="+encodeURIComponent(token),{method:"POST"});const result=await fin.json();if(!fin.ok)throw new Error(result.error||"FINALIZE_FAILED");return result}async function uploadFiles(files){for(const file of files){try{setProgress("准备上传："+file.name,0);const result=file.size>directLimit?await uploadChunked(file):await uploadDirect(file);addRecent(file);setProgress("已完成："+file.name+"\\n已保存："+result.filename,100)}catch(e){setProgress("失败："+file.name+"\\n"+(e.message||e),0);return}}}for(const id of["photo","video","multi"]){document.getElementById(id).addEventListener("change",async e=>{await uploadFiles(e.target.files);e.target.value=""})}</script></body></html>`;
  } catch {
    return reply.code(403).type("text/plain; charset=utf-8").send("上传二维码已失效，请回到电脑重新生成。");
  }
});

app.post("/api/mobile/upload", async (req, reply) => {
  try {
    const token = String((req.query as any).token ?? "");
    const s = validateSession(token);
    const profile = await loadSite(s.siteId);
    const part = await req.file();
    if (!part) return reply.code(400).send({ error: "NO_FILE" });
    const tempDir = join(TEMP_ROOT, "direct");
    await mkdir(tempDir, { recursive: true });
    const tempPath = join(tempDir, `${randomUUID()}.part`);
    assertInside(TEMP_ROOT, tempPath);
    await pipeline(part.file, createWriteStream(tempPath, { flags: "wx" }));
    const info = await stat(tempPath);
    const target = await finalizedFilename(profile, s.itemId, part.filename);
    await rename(tempPath, target.full);
    return { ok: true, filename: target.name, size_bytes: info.size, sha256: await sha256File(target.full), item_id: s.itemId, site_id: s.siteId };
  } catch (e: any) {
    req.log.error(e);
    return reply.code(400).send({ error: e?.message ?? "UPLOAD_FAILED" });
  }
});

app.post("/api/mobile/uploads/init", async (req, reply) => {
  try {
    const token = String((req.query as any).token ?? "");
    const s = validateSession(token);
    const body = req.body as any;
    const sizeBytes = Number(body?.size_bytes ?? 0);
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) throw new Error("INVALID_SIZE");
    const id = "up_" + randomUUID();
    const tempDir = join(TEMP_ROOT, id);
    assertInside(TEMP_ROOT, tempDir);
    await mkdir(tempDir, { recursive: true });
    const upload: ChunkUpload = { id, tokenHash: sha256Text(token), siteId: s.siteId, itemId: s.itemId, originalName: String(body?.filename ?? "mobile.bin"), sizeBytes, mime: String(body?.mime ?? "application/octet-stream"), totalChunks: Math.ceil(sizeBytes / CHUNK_SIZE), tempDir };
    chunkUploads.set(id, upload);
    return { upload_id: id, chunk_size: CHUNK_SIZE, total_chunks: upload.totalChunks };
  } catch (e: any) {
    return reply.code(400).send({ error: e?.message ?? "INIT_FAILED" });
  }
});

app.put("/api/mobile/uploads/:uploadId/chunks/:index", async (req, reply) => {
  try {
    const token = String((req.query as any).token ?? "");
    validateSession(token);
    const { uploadId, index } = req.params as any;
    const upload = chunkUploads.get(uploadId);
    if (!upload || upload.tokenHash !== sha256Text(token)) throw new Error("UPLOAD_NOT_FOUND");
    const n = Number(index);
    if (!Number.isInteger(n) || n < 0 || n >= upload.totalChunks) throw new Error("INVALID_CHUNK_INDEX");
    const path = join(upload.tempDir, `${n}.chunk`);
    assertInside(TEMP_ROOT, path);
    const body = req.body as Buffer;
    if (!Buffer.isBuffer(body)) throw new Error("INVALID_CHUNK_BODY");
    await writeFile(path, body);
    return { ok: true, index: n };
  } catch (e: any) {
    return reply.code(400).send({ error: e?.message ?? "CHUNK_FAILED" });
  }
});

app.post("/api/mobile/uploads/:uploadId/finalize", async (req, reply) => {
  try {
    const token = String((req.query as any).token ?? "");
    const s = validateSession(token);
    const { uploadId } = req.params as any;
    const upload = chunkUploads.get(uploadId);
    if (!upload || upload.tokenHash !== sha256Text(token) || upload.itemId !== s.itemId) throw new Error("UPLOAD_NOT_FOUND");
    const assembled = join(upload.tempDir, "assembled.part");
    assertInside(TEMP_ROOT, assembled);
    await writeFile(assembled, Buffer.alloc(0));
    for (let i = 0; i < upload.totalChunks; i++) {
      const chunk = join(upload.tempDir, `${i}.chunk`);
      if (!existsSync(chunk)) throw new Error(`MISSING_CHUNK_${i}`);
      await appendFile(assembled, await readFile(chunk));
    }
    const info = await stat(assembled);
    if (info.size !== upload.sizeBytes) throw new Error("SIZE_MISMATCH");
    const profile = await loadSite(upload.siteId);
    const target = await finalizedFilename(profile, upload.itemId, upload.originalName);
    await rename(assembled, target.full);
    const fileHash = await sha256File(target.full);
    await rm(upload.tempDir, { recursive: true, force: true });
    chunkUploads.delete(upload.id);
    return { ok: true, filename: target.name, size_bytes: info.size, sha256: fileHash, item_id: upload.itemId, site_id: upload.siteId };
  } catch (e: any) {
    req.log.error(e);
    return reply.code(400).send({ error: e?.message ?? "FINALIZE_FAILED" });
  }
});

app.listen({ port: PORT, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
