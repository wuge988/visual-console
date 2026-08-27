import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import {
  appendFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import {
  archiveApprovedSw01Derivative,
  generateSw01Derivative,
  readDerivativeJournal,
  type P4SiteProfile,
} from "../src/p4-derivatives.js";
import { sha256File } from "../src/runtime-utils.js";

const ITEM = "DC-ZY-SZ-31001";
const SITE = "drift-curio";
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

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

function rgbaPng() {
  const width = 2;
  const height = 1;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const scanline = Buffer.from([
    0,
    100, 50, 25, 255,
    10, 20, 30, 0,
  ]);
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(scanline)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

async function fixture(options?: { enabled?: boolean; whiteDestination?: boolean }) {
  const root = await mkdtemp(join(tmpdir(), "vc-p4-sw01-"));
  const assetRoot = join(root, "formal-assets");
  const rawRoot = join(assetRoot, "01_RAW");
  const cutoutDir = join(assetRoot, "02_MASTER_STATIC", ITEM, "cutout");
  const whiteDir = join(assetRoot, "02_MASTER_STATIC", ITEM, "white");
  const stagingRoot = join(root, "staging");
  const manifestRoot = join(root, "manifests");
  const controlRoot = join(root, "control");
  const sourceFilename = `${ITEM}__cutout__master__wf-SC01__v003.png`;
  const sourcePath = join(cutoutDir, sourceFilename);
  const sourceAssetId = "a".repeat(32);

  await Promise.all([
    mkdir(rawRoot, { recursive: true }),
    mkdir(cutoutDir, { recursive: true }),
    mkdir(manifestRoot, { recursive: true }),
    mkdir(controlRoot, { recursive: true }),
  ]);
  await writeFile(sourcePath, rgbaPng());
  const sourceSha = await sha256File(sourcePath);
  const sourceBytes = (await readFile(sourcePath)).length;

  const manifest: any = {
    sku: ITEM,
    destinations: {
      cutout: cutoutDir,
      ...(options?.whiteDestination === false ? {} : { white: whiteDir }),
    },
    archive_history: [],
  };
  await writeFile(join(manifestRoot, `${ITEM}.json`), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  await appendFile(
    join(controlRoot, "archives.jsonl"),
    `${JSON.stringify({
      event: "ARCHIVE_SNAPSHOT",
      archived_at: "2026-08-27T00:00:00.000Z",
      gate: "15",
      workflow_code: "SC01",
      asset_id: sourceAssetId,
      filename: sourceFilename,
      destination_key: "cutout",
      destination_path: sourcePath,
      size_bytes: sourceBytes,
      sha256: sourceSha,
      result: "VERIFIED_ARCHIVE",
      site_id: SITE,
      item_id: ITEM,
      source_deleted: true,
    })}\n`,
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
    enabled_workflows: options?.enabled === false ? ["SC01"] : ["SC01", "SW01"],
  };

  return {
    root,
    assetRoot,
    whiteDir,
    stagingRoot,
    manifestRoot,
    controlRoot,
    sourcePath,
    sourceAssetId,
    sourceSha,
    profile,
  };
}

async function cleanup(root: string) {
  await rm(root, { recursive: true, force: true });
}

test("SW01 generates only from verified SC01 archive truth with standardized no-overwrite versioning", async () => {
  const f = await fixture();
  try {
    const first = await generateSw01Derivative({
      profile: f.profile,
      itemId: ITEM,
      sourceAssetId: f.sourceAssetId,
      createdAt: "2026-08-27T01:00:00.000Z",
    });
    const second = await generateSw01Derivative({
      profile: f.profile,
      itemId: ITEM,
      sourceAssetId: f.sourceAssetId,
      createdAt: "2026-08-27T01:01:00.000Z",
    });

    assert.equal(first.state, "QA_PENDING");
    assert.equal(first.version, 1);
    assert.equal(first.generated_filename, `${ITEM}__white__master__wf-SW01__v001.png`);
    assert.equal(second.version, 2);
    assert.equal(second.generated_filename, `${ITEM}__white__master__wf-SW01__v002.png`);
    assert.equal(first.width, 2);
    assert.equal(first.height, 1);
    assert.match(first.generated_sha256 ?? "", /^[a-f0-9]{64}$/);
    assert.ok(Number(first.generated_size_bytes) > 0);
    assert.equal(existsSync(join(f.stagingRoot, "visual-console", ITEM, "white", first.generated_filename)), true);
    assert.equal(existsSync(join(f.stagingRoot, "visual-console", ITEM, "white", second.generated_filename)), true);

    const journal = await readDerivativeJournal(join(f.controlRoot, "derivatives.jsonl"));
    assert.equal(journal.get(first.derivative_id)?.state, "QA_PENDING");
    assert.equal(journal.get(second.derivative_id)?.state, "QA_PENDING");
  } finally {
    await cleanup(f.root);
  }
});

test("SW01 rejects formal source byte drift before creating staging output", async () => {
  const f = await fixture();
  try {
    const bytes = Buffer.from(await readFile(f.sourcePath));
    bytes[bytes.length - 1] ^= 0x01;
    await writeFile(f.sourcePath, bytes);
    await assert.rejects(
      () => generateSw01Derivative({ profile: f.profile, itemId: ITEM, sourceAssetId: f.sourceAssetId }),
      /SW01_SOURCE_SHA256_MISMATCH/,
    );
    assert.equal(existsSync(join(f.stagingRoot, "visual-console", ITEM, "white")), false);
  } finally {
    await cleanup(f.root);
  }
});

test("SW01 refuses execution when the site profile has not enabled SW01", async () => {
  const f = await fixture({ enabled: false });
  try {
    await assert.rejects(
      () => generateSw01Derivative({ profile: f.profile, itemId: ITEM, sourceAssetId: f.sourceAssetId }),
      /SW01_NOT_ENABLED/,
    );
  } finally {
    await cleanup(f.root);
  }
});

test("SW01 Gate15 archives QA_PASS to Manifest white destination and retry is idempotent", async () => {
  const f = await fixture();
  try {
    const record = await generateSw01Derivative({ profile: f.profile, itemId: ITEM, sourceAssetId: f.sourceAssetId });
    record.state = "QA_PASS";
    const first = await archiveApprovedSw01Derivative({
      profile: f.profile,
      record,
      archivedAt: "2026-08-27T02:00:00.000Z",
    });
    const target = join(f.whiteDir, record.generated_filename);

    assert.equal(first.workflow_code, "SW01");
    assert.equal(first.destination_key, "white");
    assert.equal(first.source_deleted, true);
    assert.equal(existsSync(record.generated_path), false);
    assert.equal(existsSync(target), true);
    assert.equal(await sha256File(target), record.generated_sha256);

    const manifestPath = join(f.manifestRoot, `${ITEM}.json`);
    let manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    assert.equal(manifest.archive_history.length, 1);
    assert.equal(manifest.archive_history[0].workflow_code, "SW01");
    assert.equal(manifest.archive_history[0].destination_key, "white");
    assert.equal(manifest.archive_history[0].asset_id, record.generated_asset_id);

    const retry = await archiveApprovedSw01Derivative({ profile: f.profile, record });
    assert.equal(retry.asset_id, record.generated_asset_id);
    assert.equal(await sha256File(target), record.generated_sha256);
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    assert.equal(manifest.archive_history.length, 1);
  } finally {
    await cleanup(f.root);
  }
});

test("SW01 Gate15 fails before copy/delete when Manifest destinations.white is missing", async () => {
  const f = await fixture({ whiteDestination: false });
  try {
    const record = await generateSw01Derivative({ profile: f.profile, itemId: ITEM, sourceAssetId: f.sourceAssetId });
    record.state = "QA_PASS";
    await assert.rejects(
      () => archiveApprovedSw01Derivative({ profile: f.profile, record }),
      /SW01_ARCHIVE_DESTINATION_WHITE_MISSING/,
    );
    assert.equal(existsSync(record.generated_path), true);
  } finally {
    await cleanup(f.root);
  }
});

test("SW01 Gate15 rejects same-name different-content F target and preserves D source", async () => {
  const f = await fixture();
  try {
    const record = await generateSw01Derivative({ profile: f.profile, itemId: ITEM, sourceAssetId: f.sourceAssetId });
    record.state = "QA_PASS";
    await mkdir(f.whiteDir, { recursive: true });
    const target = join(f.whiteDir, record.generated_filename);
    await writeFile(target, Buffer.from("conflicting formal asset", "utf8"));

    await assert.rejects(
      () => archiveApprovedSw01Derivative({ profile: f.profile, record }),
      /SW01_ARCHIVE_TARGET_CONFLICT/,
    );
    assert.equal(existsSync(record.generated_path), true);
    const manifest = JSON.parse(await readFile(join(f.manifestRoot, `${ITEM}.json`), "utf8"));
    assert.equal(manifest.archive_history.length, 0);
  } finally {
    await cleanup(f.root);
  }
});
