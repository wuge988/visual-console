import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generatedAssetId, type P2Job } from "../src/p2-runtime.js";
import {
  archiveApprovedAsset,
  readArchiveJournal,
  type P3SiteProfile,
} from "../src/p3-archive.js";
import { sha256File } from "../src/runtime-utils.js";

const ITEM = "DC-ZY-SZ-31001";
const SITE = "drift-curio";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "vc-p3-archive-"));
  const assetRoot = join(root, "formal-assets");
  const rawRoot = join(assetRoot, "01_RAW");
  const stagingRoot = join(root, "staging");
  const manifestRoot = join(root, "manifests");
  const controlRoot = join(root, "control");
  const destination = join(assetRoot, "02_IMAGE_MASTER", ITEM, "cutout");
  const filename = `${ITEM}__cutout__master__wf-SC01__v004.png`;
  const sourceDir = join(stagingRoot, "visual-console", ITEM, "cutout");
  const source = join(sourceDir, filename);
  const bytes = Buffer.from("verified transparent master fixture\n", "utf8");

  await Promise.all([
    mkdir(rawRoot, { recursive: true }),
    mkdir(sourceDir, { recursive: true }),
    mkdir(manifestRoot, { recursive: true }),
    mkdir(controlRoot, { recursive: true }),
  ]);
  await writeFile(source, bytes);
  await writeFile(
    join(manifestRoot, `${ITEM}.json`),
    `${JSON.stringify({
      sku: ITEM,
      destinations: { cutout: destination },
      archive_history: [],
    }, null, 2)}\n`,
    "utf8",
  );

  const hash = await sha256File(source);
  const profile: P3SiteProfile = {
    site_id: SITE,
    display_name: "DRIFT CURIO",
    display_name_zh: "沉木站",
    item_adapter: "drift_curio_sku_v1",
    raw_root: rawRoot,
    trash_root: join(assetRoot, "100_Trash"),
    work_root: join(root, "work"),
    staging_root: stagingRoot,
    manifest_root: manifestRoot,
    control_root: controlRoot,
    asset_root: assetRoot,
    enabled_workflows: ["SC01"],
  };
  const job: P2Job = {
    job_id: "job_archive_fixture",
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
    version: 4,
  };

  return {
    root,
    assetRoot,
    stagingRoot,
    manifestRoot,
    controlRoot,
    destination,
    filename,
    source,
    bytes,
    profile,
    job,
  };
}

async function cleanup(root: string) {
  await rm(root, { recursive: true, force: true });
}

test("Gate15 archives QA_PASS to Manifest cutout destination, verifies, records history, then deletes D source", async () => {
  const f = await fixture();
  try {
    const record = await archiveApprovedAsset({
      profile: f.profile,
      job: f.job,
      archivedAt: "2026-08-27T01:00:00.000Z",
    });
    const target = join(f.destination, f.filename);
    assert.equal(record.asset_id, f.job.generated_asset_id);
    assert.equal(record.destination_key, "cutout");
    assert.equal(record.source_deleted, true);
    assert.equal(existsSync(f.source), false);
    assert.equal(existsSync(target), true);
    assert.deepEqual(await readFile(target), f.bytes);

    const manifest = JSON.parse(await readFile(join(f.manifestRoot, `${ITEM}.json`), "utf8"));
    assert.equal(manifest.archive_history.length, 1);
    assert.equal(manifest.archive_history[0].asset_id, f.job.generated_asset_id);
    assert.equal(manifest.archive_history[0].sha256, f.job.generated_sha256);
    assert.equal(manifest.archive_history[0].result, "VERIFIED_ARCHIVE");

    const journal = await readArchiveJournal(join(f.controlRoot, "archives.jsonl"));
    assert.equal(journal.get(f.job.generated_asset_id!)?.filename, f.filename);
  } finally {
    await cleanup(f.root);
  }
});

test("Gate15 retry after D source deletion is idempotent when F target and Manifest prove exact identity", async () => {
  const f = await fixture();
  try {
    const first = await archiveApprovedAsset({
      profile: f.profile,
      job: f.job,
      archivedAt: "2026-08-27T01:00:00.000Z",
    });
    assert.equal(existsSync(f.source), false);

    const second = await archiveApprovedAsset({
      profile: f.profile,
      job: f.job,
      archivedAt: "2026-08-27T02:00:00.000Z",
    });
    assert.equal(second.sha256, first.sha256);
    assert.equal(second.archived_at, first.archived_at);
    const manifest = JSON.parse(await readFile(join(f.manifestRoot, `${ITEM}.json`), "utf8"));
    assert.equal(manifest.archive_history.length, 1);
  } finally {
    await cleanup(f.root);
  }
});

test("Gate15 rejects non-QA_PASS and never deletes staging source", async () => {
  const f = await fixture();
  try {
    await assert.rejects(
      () => archiveApprovedAsset({ profile: f.profile, job: { ...f.job, state: "QA_PENDING" } }),
      /ARCHIVE_REQUIRES_QA_PASS/,
    );
    assert.equal(existsSync(f.source), true);
    assert.equal(existsSync(join(f.destination, f.filename)), false);
  } finally {
    await cleanup(f.root);
  }
});

test("Gate15 fails closed when staging bytes drift from captured SHA", async () => {
  const f = await fixture();
  try {
    await writeFile(f.source, Buffer.from("mutated after QA", "utf8"));
    await assert.rejects(
      () => archiveApprovedAsset({ profile: f.profile, job: f.job }),
      /ARCHIVE_(SIZE|SHA256)_MISMATCH/,
    );
    assert.equal(existsSync(f.source), true);
    assert.equal(existsSync(join(f.destination, f.filename)), false);
  } finally {
    await cleanup(f.root);
  }
});

test("Gate15 never overwrites a same-name different-content F target", async () => {
  const f = await fixture();
  try {
    await mkdir(f.destination, { recursive: true });
    const target = join(f.destination, f.filename);
    const conflicting = Buffer.from("different formal asset", "utf8");
    await writeFile(target, conflicting);

    await assert.rejects(
      () => archiveApprovedAsset({ profile: f.profile, job: f.job }),
      /ARCHIVE_TARGET_CONFLICT/,
    );
    assert.equal(existsSync(f.source), true);
    assert.deepEqual(await readFile(target), conflicting);
    const manifest = JSON.parse(await readFile(join(f.manifestRoot, `${ITEM}.json`), "utf8"));
    assert.equal(manifest.archive_history.length, 0);
  } finally {
    await cleanup(f.root);
  }
});

test("Gate15 rejects Manifest destination outside formal asset root", async () => {
  const f = await fixture();
  try {
    const outside = join(f.root, "outside-formal-root");
    await writeFile(
      join(f.manifestRoot, `${ITEM}.json`),
      `${JSON.stringify({ sku: ITEM, destinations: { cutout: outside }, archive_history: [] }, null, 2)}\n`,
      "utf8",
    );
    await assert.rejects(
      () => archiveApprovedAsset({ profile: f.profile, job: f.job }),
      /PATH_OUTSIDE_ALLOWLIST/,
    );
    assert.equal(existsSync(f.source), true);
    assert.equal(existsSync(outside), false);
  } finally {
    await cleanup(f.root);
  }
});

test("Gate15 fails closed on conflicting prior Manifest archive history", async () => {
  const f = await fixture();
  try {
    await writeFile(
      join(f.manifestRoot, `${ITEM}.json`),
      `${JSON.stringify({
        sku: ITEM,
        destinations: { cutout: f.destination },
        archive_history: [{
          archived_at: "2026-08-27T00:30:00.000Z",
          gate: "15",
          workflow_code: "SC01",
          asset_id: f.job.generated_asset_id,
          filename: f.filename,
          destination_key: "cutout",
          destination_path: join(f.destination, f.filename),
          size_bytes: f.bytes.length,
          sha256: "f".repeat(64),
          result: "VERIFIED_ARCHIVE",
        }],
      }, null, 2)}\n`,
      "utf8",
    );
    await assert.rejects(
      () => archiveApprovedAsset({ profile: f.profile, job: f.job }),
      /ARCHIVE_HISTORY_CONFLICT/,
    );
    assert.equal(existsSync(f.source), true);
  } finally {
    await cleanup(f.root);
  }
});
