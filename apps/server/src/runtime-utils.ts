import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import {
  appendFile,
  lstat,
  mkdir,
  realpath,
  rm,
  stat,
} from "node:fs/promises";
import { basename, extname, join, relative, resolve } from "node:path";
import { pipeline } from "node:stream/promises";

export type LanNetworkMap = Record<
  string,
  Array<{ family: string | number; internal: boolean; address: string }> | undefined
>;

export type LanCandidate = {
  interface: string;
  address: string;
  score: number;
  excluded: boolean;
};

export type UploadSession = {
  id: string;
  tokenHash: string;
  siteId: string;
  itemId: string;
  sku?: string;
  expiresAt: number;
};

const VIRTUAL_INTERFACE_RE =
  /(karing|tun|tap|vpn|wintun|tailscale|zerotier|wireguard|vmware|virtualbox|hyper-v|docker|wsl|loopback|bluetooth)/i;
const WIFI_INTERFACE_RE = /(wi-?fi|wlan|wireless)/i;
const ETHERNET_INTERFACE_RE = /(ethernet|以太网)/i;

export function sha256Text(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export async function sha256File(path: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

export function safeId(value: string) {
  if (!/^[A-Za-z0-9._-]{1,120}$/.test(value)) {
    throw new Error("INVALID_ITEM_ID");
  }
  return value;
}

export function safeFilename(input: string) {
  const ext = extname(input).slice(0, 16);
  const base =
    basename(input, ext)
      .replace(/[^A-Za-z0-9._-]/g, "_")
      .slice(0, 120) || "mobile";
  return { base, ext };
}

export function assertInside(root: string, candidate: string) {
  const rel = relative(resolve(root), resolve(candidate));
  if (rel === "") return;
  if (rel.startsWith("..") || resolve(root, rel) !== resolve(candidate)) {
    throw new Error("PATH_OUTSIDE_ALLOWLIST");
  }
}

export async function assertExistingRealInside(root: string, candidate: string) {
  assertInside(root, candidate);
  const [rootReal, candidateReal, info] = await Promise.all([
    realpath(root),
    realpath(candidate),
    lstat(candidate),
  ]);
  if (info.isSymbolicLink()) throw new Error("SYMLINK_OR_REPARSE_NOT_ALLOWED");
  assertInside(rootReal, candidateReal);
  return candidateReal;
}

export async function ensureSafeDirectory(root: string, dir: string) {
  assertInside(root, dir);
  await mkdir(root, { recursive: true });
  await mkdir(dir, { recursive: true });
  await assertExistingRealInside(root, dir);
}

export function validateItemId(adapter: string, itemId: string) {
  safeId(itemId);
  if (adapter === "drift_curio_sku_v1") {
    if (!/^DC-(ZY|TL|YT|XX)-(DZ|GQ|KD|SZ|YY)-\d{5}$/.test(itemId)) {
      throw new Error("INVALID_DRIFT_CURIO_SKU");
    }
    return itemId;
  }
  throw new Error("UNSUPPORTED_ITEM_ADAPTER");
}

function isPrivateIpv4(address: string) {
  if (/^192\.168\./.test(address) || /^10\./.test(address)) return true;
  const match = /^172\.(\d+)\./.exec(address);
  return Boolean(match && Number(match[1]) >= 16 && Number(match[1]) <= 31);
}

export function rankLanCandidates(networks: LanNetworkMap): LanCandidate[] {
  const rows: LanCandidate[] = [];
  for (const [name, entries] of Object.entries(networks)) {
    for (const entry of entries ?? []) {
      if (String(entry.family) !== "IPv4" && String(entry.family) !== "4") continue;
      if (entry.internal) continue;
      const excluded =
        VIRTUAL_INTERFACE_RE.test(name) ||
        /^169\.254\./.test(entry.address) ||
        entry.address === "0.0.0.0";
      let score = 0;
      if (WIFI_INTERFACE_RE.test(name)) score += 200;
      else if (ETHERNET_INTERFACE_RE.test(name)) score += 150;
      if (isPrivateIpv4(entry.address)) score += 50;
      if (/^192\.168\./.test(entry.address)) score += 20;
      else if (/^172\./.test(entry.address)) score += 10;
      if (excluded) score -= 1000;
      rows.push({ interface: name, address: entry.address, score, excluded });
    }
  }
  return rows.sort((a, b) => b.score - a.score);
}

export function selectLanCandidate(networks: LanNetworkMap, override = "") {
  if (override.trim()) {
    return {
      interface: "ENV_OVERRIDE",
      address: override.trim(),
      score: 9999,
      excluded: false,
    } satisfies LanCandidate;
  }
  return (
    rankLanCandidates(networks).find((candidate) => !candidate.excluded) ?? {
      interface: "loopback",
      address: "127.0.0.1",
      score: -9999,
      excluded: false,
    }
  );
}

export class SessionStore {
  private readonly sessions = new Map<string, UploadSession>();

  constructor(
    private readonly ttlMs: number,
    private readonly now: () => number = () => Date.now(),
  ) {}

  create(siteId: string, itemId: string, sku?: string) {
    this.invalidateItem(siteId, itemId);
    const id = `us_${randomUUID()}`;
    const token = randomBytes(32).toString("base64url");
    const session: UploadSession = {
      id,
      tokenHash: sha256Text(token),
      siteId,
      itemId,
      sku,
      expiresAt: this.now() + this.ttlMs,
    };
    this.sessions.set(id, session);
    return { token, session };
  }

  validate(token: string) {
    const hash = sha256Text(token);
    const session = [...this.sessions.values()].find((entry) => entry.tokenHash === hash);
    if (!session || session.expiresAt < this.now()) {
      throw new Error("INVALID_OR_EXPIRED_SESSION");
    }
    return session;
  }

  invalidateItem(siteId: string, itemId: string) {
    for (const [id, session] of this.sessions.entries()) {
      if (session.siteId === siteId && session.itemId === itemId) this.sessions.delete(id);
    }
  }

  hasTokenHash(hash: string) {
    const session = [...this.sessions.values()].find((entry) => entry.tokenHash === hash);
    return Boolean(session && session.expiresAt >= this.now());
  }

  cleanupExpired() {
    for (const [id, session] of this.sessions.entries()) {
      if (session.expiresAt < this.now()) this.sessions.delete(id);
    }
  }
}

export function validateDeclaredUploadSize(sizeBytes: number, maximum: number) {
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) throw new Error("INVALID_SIZE");
  if (sizeBytes > maximum) throw new Error("FILE_TOO_LARGE");
  return sizeBytes;
}

export function validateDirectUploadSize(sizeBytes: number, maximum: number) {
  if (sizeBytes <= 0) throw new Error("INVALID_SIZE");
  if (sizeBytes > maximum) throw new Error("DIRECT_UPLOAD_TOO_LARGE");
  return sizeBytes;
}

export function expectedChunkSize(
  fileSize: number,
  totalChunks: number,
  index: number,
  chunkSize: number,
) {
  if (!Number.isInteger(index) || index < 0 || index >= totalChunks) {
    throw new Error("INVALID_CHUNK_INDEX");
  }
  const expectedTotal = Math.ceil(fileSize / chunkSize);
  if (totalChunks !== expectedTotal) throw new Error("INVALID_CHUNK_COUNT");
  const remaining = fileSize - index * chunkSize;
  return Math.min(chunkSize, remaining);
}

export function validateChunkLength(actual: number, expected: number) {
  if (actual !== expected) throw new Error("INVALID_CHUNK_LENGTH");
}

export type TransferVerifier = (
  sourceSize: number,
  sourceHash: string,
  target: string,
) => Promise<{ sizeBytes: number; sha256: string }>;

export async function verifyTargetSnapshot(
  sourceSize: number,
  sourceHash: string,
  target: string,
) {
  const targetInfo = await stat(target);
  if (targetInfo.size !== sourceSize) throw new Error("TRANSFER_SIZE_MISMATCH");
  const targetHash = await sha256File(target);
  if (targetHash !== sourceHash) throw new Error("TRANSFER_SHA256_MISMATCH");
  return { sizeBytes: targetInfo.size, sha256: targetHash };
}

export async function transferVerified(
  source: string,
  target: string,
  verifier: TransferVerifier = verifyTargetSnapshot,
) {
  const sourceInfo = await stat(source);
  const sourceHash = await sha256File(source);
  let createdTarget = false;
  const output = createWriteStream(target, { flags: "wx" });
  output.once("open", () => {
    createdTarget = true;
  });
  try {
    await pipeline(createReadStream(source), output);
    const verified = await verifier(sourceInfo.size, sourceHash, target);
    await rm(source, { force: true });
    return verified;
  } catch (error) {
    if (createdTarget) await rm(target, { force: true }).catch(() => undefined);
    throw error;
  }
}

export function rawAssetId(siteId: string, itemId: string, filename: string) {
  return sha256Text(`${siteId}|${itemId}|${filename}`).slice(0, 32);
}

function trashStamp(date = new Date()) {
  return date.toISOString().replace(/[-:TZ.]/g, "");
}

export async function moveFileToTrash(options: {
  source: string;
  trashRoot: string;
  siteId: string;
  itemId: string;
  assetId: string;
  assetType: string;
  filename: string;
}) {
  const { source, trashRoot, siteId, itemId, assetId, assetType, filename } = options;
  const dir = join(trashRoot, safeId(itemId));
  await ensureSafeDirectory(trashRoot, dir);

  let target = "";
  while (!target) {
    const candidate = join(
      dir,
      `${trashStamp()}_${randomUUID().slice(0, 8)}__${basename(filename)}`,
    );
    assertInside(trashRoot, candidate);
    if (!existsSync(candidate)) target = candidate;
  }

  const transfer = await transferVerified(source, target);
  const record = {
    event: "TRASH",
    trashed_at: new Date().toISOString(),
    site_id: siteId,
    item_id: itemId,
    asset_type: assetType,
    asset_id: assetId,
    original_filename: filename,
    original_path: source,
    trash_path: target,
    size_bytes: transfer.sizeBytes,
    sha256: transfer.sha256,
  };
  const indexPath = join(trashRoot, "trash-index.jsonl");
  assertInside(trashRoot, indexPath);
  await appendFile(indexPath, `${JSON.stringify(record)}\n`, "utf8");
  return { target, transfer, record };
}
