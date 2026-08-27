import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { existsSync } from "node:fs";
import { appendFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import {
  archiveApprovedSd01,
  generateSd01Derivative,
  readDarkDerivativeJournal,
  registerP4DarkRoutes,
} from "../src/p4-dark.js";
import { sha256File, validateItemId } from "../src/runtime-utils.js";

const SITE = "drift-curio";
const ITEM = "DC-ZY-SZ-31001";
const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer) {
  const typeBuffer = Buffer.from(type, "ascii");
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  typeBuffer.copy(out, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);
  return out;
}

function sourcePng() {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(2, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.from([0, 130, 70, 30, 255, 5, 10, 15, 0]))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "vc-p4c-dark-routes-"));
  const assetRoot = join(root, "formal");
  const rawRoot = join(assetRoot, "01_RAW");
  const cutoutDir = join(assetRoot, "02_MASTER_STATIC", ITEM, "cutout");
  const darkDir = join(assetRoot, "02_MASTER_STATIC", ITEM, "dark");
  const stagingRoot = join(root, "staging");
  const manifestRoot = join(root, "manifests");
  const controlRoot = join(root, "control");
  const sourceAssetId = "c".repeat(32);
  const sourceFilename = `${ITEM}__cutout__master__wf-SC01__v003.png`;
  const sourcePath = join(cutoutDir, sourceFilename);

  await Promise.all([
    mkdir(rawRoot, { recursive: true }),
    mkdir(cutoutDir, { recursive: true }),
    mkdir(manifestRoot, { recursive: true }),
    mkdir(controlRoot, { recursive: true }),
  ]);
  await writeFile(sourcePath, sourcePng());
  const sourceSha = await sha256File(sourcePath);
  const sourceSize = (await readFile(sourcePath)).length;
  const sourceHistory = {
    archived_at: "2026-08-27T00:00:00.000Z",
    gate: "15",
    workflow_code: "SC01",
    asset_id: sourceAssetId,
    filename: sourceFilename,
    destination_key: "cutout",
    destination_path: sourcePath,
    size_bytes: sourceSize,
    sha256: sourceSha,
    result: "VERIFIED_ARCHIVE",
  };
  const manifestPath = join(manifestRoot, `${ITEM}.json`);
  await writeFile(
    manifestPath,
    `${JSON.stringify(
      { sku: ITEM, destinations: { cutout: cutoutDir, dark: darkDir }, archive_history: [sourceHistory] },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await appendFile(
    join(controlRoot, "archives.jsonl"),
    `${JSON.stringify({
      event: "ARCHIVE_SNAPSHOT",
      ...sourceHistory,
      site_id: SITE,
      item_id: ITEM,
      source_deleted: true,
    })}\n`,
    "utf8",
  );

  const profile = {
    site_id: SITE,
    display_name: "DRIFT CURIO",
    display_name_zh: "沉木站",
    item_adapter: "drift_curio_sku_v1",
    raw_root: rawRoot,
    trash_root: join(assetRoot, "100_Trash"),
    asset_root: assetRoot,
    work_root: join(root, "work"),
    staging_root: stagingRoot,
    manifest_root: manifestRoot,
    control_root: controlRoot,
    enabled_workflows: ["SC01", "SW01", "SD01"],
  };

  return {
    root,
    assetRoot,
    darkDir,
    stagingRoot,
    manifestPath,
    controlRoot,
    sourceAssetId,
    profile,
  };
}

async function register(app: ReturnType<typeof Fastify>, profile: Awaited<ReturnType<typeof fixture>>["profile"]) {
  await registerP4DarkRoutes(app, {
    assertLocalRequest(req: any) {
      const ip = String(req.ip ?? "");
      if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(ip)) throw new Error("LOCAL_ONLY");
    },
    async loadSite(siteId: string) {
      if (siteId !== SITE) throw new Error("SITE_NOT_FOUND");
      return profile;
    },
    validateProfileItem(siteProfile: typeof profile, itemId: string) {
      return validateItemId(siteProfile.item_adapter, itemId);
    },
  });
}

test("SD01 routes keep browser paths untrusted and close generate → QA → archive → preview", async () => {
  const f = await fixture();
  const app = Fastify();
  try {
    await register(app, f.profile);

    const remote = await app.inject({
      method: "POST",
      url: "/api/dark-derivatives/SD01/batch",
      remoteAddress: "192.168.1.20",
      payload: { site_id: SITE, item_id: ITEM, source_asset_ids: [f.sourceAssetId] },
    } as any);
    assert.equal(remote.statusCode, 400);
    assert.match(remote.body, /LOCAL_ONLY/);

    const generated = await app.inject({
      method: "POST",
      url: "/api/dark-derivatives/SD01/batch",
      payload: {
        site_id: SITE,
        item_id: ITEM,
        source_asset_ids: [f.sourceAssetId],
        source_path: "/tmp/evil-source.png",
        destination_path: "/tmp/evil-dark.png",
        generated_path: "/tmp/evil-stage.png",
        sha256: "0".repeat(64),
      },
    });
    assert.equal(generated.statusCode, 200, generated.body);
    assert.equal(generated.json().ok, true);
    const derivative = generated.json().results[0].derivative;
    assert.equal(derivative.state, "QA_PENDING");
    assert.equal(derivative.generated_filename, `${ITEM}__dark__master__wf-SD01__v001.png`);
    assert.equal(derivative.renderer_id, "sd01-flat-gallery-surface-rgb-v1");
    assert.equal(derivative.background_hex, "#171B20");
    assert.equal("generated_path" in derivative, false);
    assert.equal("source_archive_path" in derivative, false);

    const beforePass = await app.inject({
      method: "POST",
      url: `/api/dark-derivatives/archive/${SITE}/${ITEM}/${derivative.generated_asset_id}`,
      payload: {},
    });
    assert.equal(beforePass.statusCode, 400);
    assert.match(beforePass.body, /SD01_ARCHIVE_REQUIRES_QA_PASS/);

    const pass = await app.inject({
      method: "POST",
      url: `/api/dark-derivatives/qa/${derivative.generated_asset_id}/decision`,
      payload: { site_id: SITE, item_id: ITEM, decision: "PASS", note: "exact piece pass" },
    });
    assert.equal(pass.statusCode, 200, pass.body);
    assert.equal(pass.json().derivative.state, "QA_PASS");
    assert.equal(pass.json().derivative.qa_note, "exact piece pass");

    const archived = await app.inject({
      method: "POST",
      url: `/api/dark-derivatives/archive/${SITE}/${ITEM}/${derivative.generated_asset_id}`,
      payload: {},
    });
    assert.equal(archived.statusCode, 200, archived.body);
    assert.equal(archived.json().archive.workflow_code, "SD01");
    assert.equal(archived.json().archive.destination_key, "dark");
    assert.equal("destination_path" in archived.json().archive, false);

    const preview = await app.inject({
      method: "GET",
      url: `/api/dark-derivatives/assets/${SITE}/${ITEM}/${derivative.generated_asset_id}/content`,
    });
    assert.equal(preview.statusCode, 200, preview.body);
    assert.match(preview.headers["content-type"] ?? "", /image\/png/);

    const retry = await app.inject({
      method: "POST",
      url: `/api/dark-derivatives/archive/${SITE}/${ITEM}/${derivative.generated_asset_id}`,
      payload: {},
    });
    assert.equal(retry.statusCode, 200, retry.body);
    assert.equal(retry.json().archive.asset_id, derivative.generated_asset_id);

    const afterArchiveQa = await app.inject({
      method: "POST",
      url: `/api/dark-derivatives/qa/${derivative.generated_asset_id}/decision`,
      payload: { site_id: SITE, item_id: ITEM, decision: "FAIL" },
    });
    assert.equal(afterArchiveQa.statusCode, 400);
    assert.match(afterArchiveQa.body, /SD01_DERIVATIVE_ALREADY_ARCHIVED/);

    const manifest = JSON.parse(await readFile(f.manifestPath, "utf8"));
    const darkRows = manifest.archive_history.filter((entry: any) => entry.asset_id === derivative.generated_asset_id);
    assert.equal(darkRows.length, 1);
    assert.equal(darkRows[0].workflow_code, "SD01");
    assert.equal(darkRows[0].destination_key, "dark");
  } finally {
    await app.close();
    await rm(f.root, { recursive: true, force: true });
  }
});

test("SD01 QA decision fails closed when D staging bytes drift", async () => {
  const f = await fixture();
  const app = Fastify();
  try {
    await register(app, f.profile);
    const generated = await app.inject({
      method: "POST",
      url: "/api/dark-derivatives/SD01/batch",
      payload: { site_id: SITE, item_id: ITEM, source_asset_ids: [f.sourceAssetId] },
    });
    assert.equal(generated.statusCode, 200, generated.body);
    const derivative = generated.json().results[0].derivative;
    const stagingPath = join(f.stagingRoot, "visual-console", ITEM, "dark", derivative.generated_filename);
    const bytes = Buffer.from(await readFile(stagingPath));
    bytes[bytes.length - 1] ^= 0x01;
    await writeFile(stagingPath, bytes);

    const pass = await app.inject({
      method: "POST",
      url: `/api/dark-derivatives/qa/${derivative.generated_asset_id}/decision`,
      payload: { site_id: SITE, item_id: ITEM, decision: "PASS" },
    });
    assert.equal(pass.statusCode, 400);
    assert.match(pass.body, /SD01_STAGING_SHA256_MISMATCH/);

    const journal = await readDarkDerivativeJournal(join(f.controlRoot, "dark-derivatives.jsonl"));
    assert.equal(journal.get(derivative.derivative_id)?.state, "QA_PENDING");
  } finally {
    await app.close();
    await rm(f.root, { recursive: true, force: true });
  }
});

test("SD01 Gate15 rejects destinations.dark outside formal asset root and preserves D", async () => {
  const f = await fixture();
  try {
    const record = await generateSd01Derivative({ profile: f.profile, itemId: ITEM, sourceAssetId: f.sourceAssetId });
    record.state = "QA_PASS";
    const manifest = JSON.parse(await readFile(f.manifestPath, "utf8"));
    const outside = join(f.root, "outside-dark");
    manifest.destinations.dark = outside;
    await writeFile(f.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

    await assert.rejects(() => archiveApprovedSd01({ profile: f.profile, record }), /PATH_OUTSIDE_ALLOWLIST/);
    assert.equal(existsSync(record.generated_path), true);
    assert.equal(existsSync(outside), false);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("SD01 Gate15 rejects conflicting prior Manifest history before F mutation and preserves D", async () => {
  const f = await fixture();
  try {
    const record = await generateSd01Derivative({ profile: f.profile, itemId: ITEM, sourceAssetId: f.sourceAssetId });
    record.state = "QA_PASS";
    const manifest = JSON.parse(await readFile(f.manifestPath, "utf8"));
    manifest.archive_history.push({
      archived_at: "2026-08-27T01:00:00.000Z",
      gate: "15",
      workflow_code: "SD01",
      asset_id: record.generated_asset_id,
      filename: record.generated_filename,
      destination_key: "dark",
      destination_path: join(f.darkDir, record.generated_filename),
      size_bytes: record.generated_size_bytes,
      sha256: "f".repeat(64),
      result: "VERIFIED_ARCHIVE",
    });
    await writeFile(f.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

    await assert.rejects(() => archiveApprovedSd01({ profile: f.profile, record }), /SD01_ARCHIVE_HISTORY_CONFLICT/);
    assert.equal(existsSync(record.generated_path), true);
    assert.equal(existsSync(join(f.darkDir, record.generated_filename)), false);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});
