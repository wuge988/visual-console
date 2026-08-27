import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generatedAssetId, type P2Job } from "../src/p2-runtime.js";
import { archiveApprovedAsset, type P3SiteProfile } from "../src/p3-archive.js";
import { sha256File } from "../src/runtime-utils.js";

const ITEM = "DC-ZY-SZ-31001";
const SITE = "drift-curio";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "vc-p3-manifest-compat-"));
  const assetRoot = join(root, "formal-assets");
  const rawRoot = join(assetRoot, "01_RAW");
  const stagingRoot = join(root, "staging");
  const manifestRoot = join(root, "manifests");
  const controlRoot = join(root, "control");
  const destination = join(assetRoot, "02_MASTER_STATIC", ITEM, "cutout");
  const filename = `${ITEM}__cutout__master__wf-SC01__v001.png`;
  const source = join(stagingRoot, ITEM, "cutout", filename);
  const bytes = Buffer.from("bom compatible transparent master\n", "utf8");

  await Promise.all([
    mkdir(rawRoot, { recursive: true }),
    mkdir(join(stagingRoot, ITEM, "cutout"), { recursive: true }),
    mkdir(manifestRoot, { recursive: true }),
    mkdir(controlRoot, { recursive: true }),
  ]);
  await writeFile(source, bytes);

  const hash = await sha256File(source);
  const profile: P3SiteProfile = {
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
    enabled_workflows: ["SC01"],
  };
  const job: P2Job = {
    job_id: "job_manifest_compat",
    site_id: SITE,
    item_id: ITEM,
    workflow_code: "SC01",
    source_asset_id: "a".repeat(32),
    state: "QA_PASS",
    created_at: "2026-08-27T00:00:00.000Z",
    updated_at: "2026-08-27T00:01:00.000Z",
    generated_asset_id: generatedAssetId(SITE, ITEM, filename),
    generated_filename: filename,
    generated_path: source,
    generated_sha256: hash,
    generated_size_bytes: bytes.length,
    version: 1,
  };

  return {
    root,
    assetRoot,
    manifestRoot,
    destination,
    filename,
    source,
    profile,
    job,
  };
}

test("Gate15 accepts a legacy UTF-8 BOM Manifest and normalizes it on persistence", async () => {
  const f = await fixture();
  try {
    const manifestPath = join(f.manifestRoot, `${ITEM}.json`);
    await writeFile(
      manifestPath,
      `\uFEFF${JSON.stringify({
        schema_version: "1.0",
        sku: ITEM,
        destinations: { cutout: f.destination },
        archive_history: [],
      }, null, 2)}\n`,
      "utf8",
    );

    const record = await archiveApprovedAsset({
      profile: f.profile,
      job: f.job,
      archivedAt: "2026-08-27T06:00:00.000Z",
    });

    assert.equal(record.result, "VERIFIED_ARCHIVE");
    assert.equal(existsSync(f.source), false);
    assert.equal(existsSync(join(f.destination, f.filename)), true);

    const persistedText = await readFile(manifestPath, "utf8");
    assert.notEqual(persistedText.charCodeAt(0), 0xfeff);
    const manifest = JSON.parse(persistedText);
    assert.equal(manifest.archive_history.length, 1);
    assert.equal(manifest.archive_history[0].asset_id, f.job.generated_asset_id);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("Gate15 rejects malformed Manifest JSON before copy or delete", async () => {
  const f = await fixture();
  try {
    const manifestPath = join(f.manifestRoot, `${ITEM}.json`);
    await writeFile(
      manifestPath,
      `\uFEFF{"sku":"${ITEM}","destinations":{"cutout":`,
      "utf8",
    );

    await assert.rejects(
      () => archiveApprovedAsset({ profile: f.profile, job: f.job }),
      /ARCHIVE_MANIFEST_INVALID_JSON/,
    );
    assert.equal(existsSync(f.source), true);
    assert.equal(existsSync(join(f.destination, f.filename)), false);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});
