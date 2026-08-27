import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { appendFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { registerP4DerivativeRoutes, type P4SiteProfile } from "../src/p4-derivatives.js";
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
  const output = Buffer.alloc(12 + data.length);
  output.writeUInt32BE(data.length, 0);
  typeBuffer.copy(output, 4);
  data.copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);
  return output;
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
    chunk("IDAT", deflateSync(Buffer.from([0, 140, 80, 20, 255, 1, 2, 3, 0]))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "vc-p4-routes-"));
  const assetRoot = join(root, "formal");
  const rawRoot = join(assetRoot, "01_RAW");
  const cutoutDir = join(assetRoot, "02_MASTER_STATIC", ITEM, "cutout");
  const whiteDir = join(assetRoot, "02_MASTER_STATIC", ITEM, "white");
  const stagingRoot = join(root, "staging");
  const manifestRoot = join(root, "manifests");
  const controlRoot = join(root, "control");
  const sourceAssetId = "b".repeat(32);
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
  const history = {
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
  await writeFile(
    join(manifestRoot, `${ITEM}.json`),
    `${JSON.stringify({ sku: ITEM, destinations: { cutout: cutoutDir, white: whiteDir }, archive_history: [history] }, null, 2)}\n`,
    "utf8",
  );
  await appendFile(
    join(controlRoot, "archives.jsonl"),
    `${JSON.stringify({ event: "ARCHIVE_SNAPSHOT", ...history, site_id: SITE, item_id: ITEM, source_deleted: true })}\n`,
    "utf8",
  );

  const profile: P4SiteProfile = {
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
    enabled_workflows: ["SC01", "SW01"],
  };

  return { root, profile, sourceAssetId, whiteDir, manifestRoot };
}

test("P4 routes keep source identity server-side and close SW01 generate → QA → archive → preview", async () => {
  const f = await fixture();
  const app = Fastify();
  try {
    await registerP4DerivativeRoutes(app, {
      assertLocalRequest(req: any) {
        const ip = String(req.ip ?? "");
        if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(ip)) throw new Error("LOCAL_ONLY");
      },
      async loadSite(siteId: string) {
        if (siteId !== SITE) throw new Error("SITE_NOT_FOUND");
        return f.profile;
      },
      validateProfileItem(profile: P4SiteProfile, itemId: string) {
        return validateItemId(profile.item_adapter, itemId);
      },
    });

    const remote = await app.inject({
      method: "POST",
      url: "/api/derivatives/SW01/batch",
      remoteAddress: "192.168.1.20",
      payload: { site_id: SITE, item_id: ITEM, source_asset_ids: [f.sourceAssetId] },
    } as any);
    assert.equal(remote.statusCode, 400);
    assert.match(remote.body, /LOCAL_ONLY/);

    const generated = await app.inject({
      method: "POST",
      url: "/api/derivatives/SW01/batch",
      payload: {
        site_id: SITE,
        item_id: ITEM,
        source_asset_ids: [f.sourceAssetId],
        source_path: "/tmp/evil.png",
        destination_path: "/tmp/evil-output.png",
        sha256: "0".repeat(64),
      },
    });
    assert.equal(generated.statusCode, 200, generated.body);
    assert.equal(generated.json().ok, true);
    const derivative = generated.json().results[0].derivative;
    assert.equal(derivative.state, "QA_PENDING");
    assert.equal(derivative.generated_filename, `${ITEM}__white__master__wf-SW01__v001.png`);
    assert.equal("generated_path" in derivative, false);
    assert.equal("source_archive_path" in derivative, false);

    const qa = await app.inject({
      method: "GET",
      url: `/api/derivatives/qa?site_id=${SITE}&item_id=${ITEM}`,
    });
    assert.equal(qa.statusCode, 200);
    assert.equal(qa.json().length, 1);
    assert.equal(qa.json()[0].state, "QA_PENDING");

    const pass = await app.inject({
      method: "POST",
      url: `/api/derivatives/qa/${derivative.generated_asset_id}/decision`,
      payload: { site_id: SITE, item_id: ITEM, decision: "PASS", note: "visual exact-piece pass" },
    });
    assert.equal(pass.statusCode, 200, pass.body);
    assert.equal(pass.json().derivative.state, "QA_PASS");
    assert.equal(pass.json().derivative.qa_note, "visual exact-piece pass");

    const archived = await app.inject({
      method: "POST",
      url: `/api/derivatives/archive/${SITE}/${ITEM}/${derivative.generated_asset_id}`,
    });
    assert.equal(archived.statusCode, 200, archived.body);
    assert.equal(archived.json().archive.workflow_code, "SW01");
    assert.equal(archived.json().archive.destination_key, "white");
    assert.equal("destination_path" in archived.json().archive, false);

    const preview = await app.inject({
      method: "GET",
      url: `/api/derivatives/assets/${SITE}/${ITEM}/${derivative.generated_asset_id}/content`,
    });
    assert.equal(preview.statusCode, 200, preview.body);
    assert.match(preview.headers["content-type"] ?? "", /image\/png/);

    const retry = await app.inject({
      method: "POST",
      url: `/api/derivatives/archive/${SITE}/${ITEM}/${derivative.generated_asset_id}`,
    });
    assert.equal(retry.statusCode, 200, retry.body);
    assert.equal(retry.json().archive.asset_id, derivative.generated_asset_id);

    const afterArchiveQa = await app.inject({
      method: "POST",
      url: `/api/derivatives/qa/${derivative.generated_asset_id}/decision`,
      payload: { site_id: SITE, item_id: ITEM, decision: "FAIL" },
    });
    assert.equal(afterArchiveQa.statusCode, 400);
    assert.match(afterArchiveQa.body, /DERIVATIVE_ALREADY_ARCHIVED/);

    const manifest = JSON.parse(await readFile(join(f.manifestRoot, `${ITEM}.json`), "utf8"));
    assert.equal(manifest.archive_history.filter((entry: any) => entry.asset_id === derivative.generated_asset_id).length, 1);
  } finally {
    await app.close();
    await rm(f.root, { recursive: true, force: true });
  }
});
