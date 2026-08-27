import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { appendFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import {
  archiveApprovedSd01,
  generateSd01Derivative,
  readDarkDerivativeJournal,
  recoverGeneratingDarkDerivatives,
} from "../src/p4-dark.js";
import { sha256File } from "../src/runtime-utils.js";
import { SD01_BACKGROUND_HEX, SD01_RENDERER_ID } from "../src/png-dark.js";

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
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(2, 0);
  ihdr.writeUInt32BE(1, 4);
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

async function fixture(options?: {
  enabled?: boolean;
  darkDestination?: boolean;
  sourceHistory?: boolean;
}) {
  const root = await mkdtemp(join(tmpdir(), "vc-p4-sd01-"));
  const assetRoot = join(root, "formal-assets");
  const rawRoot = join(assetRoot, "01_RAW");
  const cutoutDir = join(assetRoot, "02_MASTER_STATIC", ITEM, "cutout");
  const darkDir = join(assetRoot, "02_MASTER_STATIC", ITEM, "dark");
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
  const sourceHistory = {
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
  };

  const manifest: any = {
    sku: ITEM,
    destinations: {
      cutout: cutoutDir,
      ...(options?.darkDestination === false ? {} : { dark: darkDir }),
    },
    archive_history: options?.sourceHistory === false ? [] : [sourceHistory],
  };
  await writeFile(join(manifestRoot, `${ITEM}.json`), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
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
    enabled_workflows: options?.enabled === false ? ["SC01", "SW01"] : ["SC01", "SW01", "SD01"],
  };

  return {
    root,
    darkDir,
    stagingRoot,
    manifestRoot,
    controlRoot,
    sourcePath,
    sourceAssetId,
    profile,
  };
}

async function cleanup(root: string) {
  await rm(root, { recursive: true, force: true });
}

test("SD01 generates deterministic versioned Dark Master only from VERIFIED SC01 archive truth", async () => {
  const f = await fixture();
  try {
    const first = await generateSd01Derivative({ profile: f.profile, itemId: ITEM, sourceAssetId: f.sourceAssetId });
    const second = await generateSd01Derivative({ profile: f.profile, itemId: ITEM, sourceAssetId: f.sourceAssetId });

    assert.equal(first.state, "QA_PENDING");
    assert.equal(first.version, 1);
    assert.equal(first.generated_filename, `${ITEM}__dark__master__wf-SD01__v001.png`);
    assert.equal(second.version, 2);
    assert.equal(first.renderer_id, SD01_RENDERER_ID);
    assert.equal(first.background_hex, SD01_BACKGROUND_HEX);
    assert.equal(first.width, 2);
    assert.equal(first.height, 1);
    assert.match(first.generated_sha256 ?? "", /^[a-f0-9]{64}$/);
    assert.equal(existsSync(join(f.stagingRoot, "visual-console", ITEM, "dark", first.generated_filename)), true);

    const journal = await readDarkDerivativeJournal(join(f.controlRoot, "dark-derivatives.jsonl"));
    assert.equal(journal.get(first.derivative_id)?.state, "QA_PENDING");
    assert.equal(journal.get(second.derivative_id)?.state, "QA_PENDING");
  } finally {
    await cleanup(f.root);
  }
});

test("SD01 rejects archive journal source without matching Manifest Gate15 history", async () => {
  const f = await fixture({ sourceHistory: false });
  try {
    await assert.rejects(
      () => generateSd01Derivative({ profile: f.profile, itemId: ITEM, sourceAssetId: f.sourceAssetId }),
      /SD01_SOURCE_MANIFEST_HISTORY_MISSING/,
    );
    assert.equal(existsSync(join(f.stagingRoot, "visual-console", ITEM, "dark")), false);
  } finally {
    await cleanup(f.root);
  }
});

test("SD01 rejects F source byte drift before D output creation", async () => {
  const f = await fixture();
  try {
    const bytes = Buffer.from(await readFile(f.sourcePath));
    bytes[bytes.length - 1] ^= 0x01;
    await writeFile(f.sourcePath, bytes);
    await assert.rejects(
      () => generateSd01Derivative({ profile: f.profile, itemId: ITEM, sourceAssetId: f.sourceAssetId }),
      /SD01_SOURCE_SHA256_MISMATCH/,
    );
  } finally {
    await cleanup(f.root);
  }
});

test("SD01 refuses generation until explicitly enabled in Site Profile", async () => {
  const f = await fixture({ enabled: false });
  try {
    await assert.rejects(
      () => generateSd01Derivative({ profile: f.profile, itemId: ITEM, sourceAssetId: f.sourceAssetId }),
      /SD01_NOT_ENABLED/,
    );
  } finally {
    await cleanup(f.root);
  }
});

test("SD01 recovery reconstructs exact deterministic GENERATING output", async () => {
  const f = await fixture();
  try {
    const record = await generateSd01Derivative({ profile: f.profile, itemId: ITEM, sourceAssetId: f.sourceAssetId });
    const torn = {
      ...record,
      state: "GENERATING",
      generated_sha256: undefined,
      generated_size_bytes: undefined,
      width: undefined,
      height: undefined,
      error: undefined,
    };
    await writeFile(join(f.controlRoot, "dark-derivatives.jsonl"), `${JSON.stringify(torn)}\n`, "utf8");

    const recovered = await recoverGeneratingDarkDerivatives(f.profile);
    const latest = recovered.get(record.derivative_id);
    assert.equal(latest?.state, "QA_PENDING");
    assert.equal(latest?.width, 2);
    assert.equal(latest?.height, 1);
    assert.match(latest?.generated_sha256 ?? "", /^[a-f0-9]{64}$/);
  } finally {
    await cleanup(f.root);
  }
});

test("SD01 recovery fails closed when GENERATING output is missing", async () => {
  const f = await fixture();
  try {
    const record = await generateSd01Derivative({ profile: f.profile, itemId: ITEM, sourceAssetId: f.sourceAssetId });
    await rm(record.generated_path);
    const torn = {
      ...record,
      state: "GENERATING",
      generated_sha256: undefined,
      generated_size_bytes: undefined,
      width: undefined,
      height: undefined,
      error: undefined,
    };
    await writeFile(join(f.controlRoot, "dark-derivatives.jsonl"), `${JSON.stringify(torn)}\n`, "utf8");
    const recovered = await recoverGeneratingDarkDerivatives(f.profile);
    assert.equal(recovered.get(record.derivative_id)?.state, "FAILED_GENERATION");
    assert.match(recovered.get(record.derivative_id)?.error ?? "", /RECOVERY:SD01_RECOVERY_OUTPUT_MISSING/);
  } finally {
    await cleanup(f.root);
  }
});

test("SD01 Gate15 archives QA_PASS to Manifest dark and retry is idempotent", async () => {
  const f = await fixture();
  try {
    const record = await generateSd01Derivative({ profile: f.profile, itemId: ITEM, sourceAssetId: f.sourceAssetId });
    record.state = "QA_PASS";
    const first = await archiveApprovedSd01({
      profile: f.profile,
      record,
      archivedAt: "2026-08-27T02:00:00.000Z",
    });
    const target = join(f.darkDir, record.generated_filename);

    assert.equal(first.workflow_code, "SD01");
    assert.equal(first.destination_key, "dark");
    assert.equal(first.source_deleted, true);
    assert.equal(existsSync(record.generated_path), false);
    assert.equal(existsSync(target), true);
    assert.equal(await sha256File(target), record.generated_sha256);

    const manifestPath = join(f.manifestRoot, `${ITEM}.json`);
    let manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    assert.equal(manifest.archive_history.length, 2);
    const history = manifest.archive_history.find((entry: any) => entry.asset_id === record.generated_asset_id);
    assert.equal(history?.workflow_code, "SD01");
    assert.equal(history?.destination_key, "dark");

    const retry = await archiveApprovedSd01({ profile: f.profile, record });
    assert.equal(retry.asset_id, record.generated_asset_id);
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    assert.equal(manifest.archive_history.length, 2);
    assert.equal(await sha256File(target), record.generated_sha256);
  } finally {
    await cleanup(f.root);
  }
});

test("SD01 Gate15 fails before copy/delete when Manifest destinations.dark is missing", async () => {
  const f = await fixture({ darkDestination: false });
  try {
    const record = await generateSd01Derivative({ profile: f.profile, itemId: ITEM, sourceAssetId: f.sourceAssetId });
    record.state = "QA_PASS";
    await assert.rejects(() => archiveApprovedSd01({ profile: f.profile, record }), /SD01_DESTINATION_DARK_MISSING/);
    assert.equal(existsSync(record.generated_path), true);
  } finally {
    await cleanup(f.root);
  }
});

test("SD01 Gate15 rejects conflicting same-name F target and preserves D", async () => {
  const f = await fixture();
  try {
    const record = await generateSd01Derivative({ profile: f.profile, itemId: ITEM, sourceAssetId: f.sourceAssetId });
    record.state = "QA_PASS";
    await mkdir(f.darkDir, { recursive: true });
    const target = join(f.darkDir, record.generated_filename);
    await writeFile(target, Buffer.from("conflict"));
    await assert.rejects(() => archiveApprovedSd01({ profile: f.profile, record }), /SD01_ARCHIVE_TARGET_CONFLICT/);
    assert.equal(existsSync(record.generated_path), true);
    const manifest = JSON.parse(await readFile(join(f.manifestRoot, `${ITEM}.json`), "utf8"));
    assert.equal(manifest.archive_history.length, 1);
  } finally {
    await cleanup(f.root);
  }
});
