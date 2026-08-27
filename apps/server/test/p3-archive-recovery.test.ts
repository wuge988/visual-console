import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generatedAssetId, type P2Job } from "../src/p2-runtime.js";
import { archiveApprovedAsset, runArchiveSerialized, type P3SiteProfile } from "../src/p3-archive.js";
import { sha256File } from "../src/runtime-utils.js";

const ITEM = "DC-ZY-SZ-31001";

async function makeFixture() {
  const root = await mkdtemp(join(tmpdir(), "vc-p3-recovery-"));
  const assetRoot = join(root, "formal");
  const rawRoot = join(assetRoot, "01_RAW");
  const stagingRoot = join(root, "staging");
  const manifestRoot = join(root, "manifests");
  const controlRoot = join(root, "control");
  const destination = join(assetRoot, "02_IMAGE_MASTER", ITEM, "cutout");
  const filename = `${ITEM}__cutout__master__wf-SC01__v001.png`;
  const source = join(stagingRoot, "visual-console", ITEM, "cutout", filename);
  const bytes = Buffer.from("exact master", "utf8");
  await Promise.all([
    mkdir(rawRoot, { recursive: true }),
    mkdir(join(stagingRoot, "visual-console", ITEM, "cutout"), { recursive: true }),
    mkdir(manifestRoot, { recursive: true }),
    mkdir(controlRoot, { recursive: true }),
    mkdir(destination, { recursive: true }),
  ]);
  await writeFile(source, bytes);
  const hash = await sha256File(source);
  const profile: P3SiteProfile = {
    site_id: "drift-curio",
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
    job_id: "job_recovery",
    site_id: "drift-curio",
    item_id: ITEM,
    workflow_code: "SC01",
    source_asset_id: "a".repeat(32),
    state: "QA_PASS",
    created_at: "2026-08-27T00:00:00.000Z",
    updated_at: "2026-08-27T00:01:00.000Z",
    generated_asset_id: generatedAssetId("drift-curio", ITEM, filename),
    generated_filename: filename,
    generated_path: source,
    generated_sha256: hash,
    generated_size_bytes: bytes.length,
    version: 1,
  };
  return { root, assetRoot, stagingRoot, manifestRoot, controlRoot, destination, filename, source, bytes, hash, profile, job };
}

test("missing D source cannot be promoted from an F lookalike without durable Gate15 Manifest history", async () => {
  const f = await makeFixture();
  try {
    const target = join(f.destination, f.filename);
    await writeFile(target, f.bytes);
    await rm(f.source);
    await writeFile(
      join(f.manifestRoot, `${ITEM}.json`),
      `${JSON.stringify({ sku: ITEM, destinations: { cutout: f.destination }, archive_history: [] }, null, 2)}\n`,
      "utf8",
    );

    await assert.rejects(
      () => archiveApprovedAsset({ profile: f.profile, job: f.job }),
      /ARCHIVE_SOURCE_MISSING_WITHOUT_DURABLE_HISTORY/,
    );
    const manifest = JSON.parse(await readFile(join(f.manifestRoot, `${ITEM}.json`), "utf8"));
    assert.equal(manifest.archive_history.length, 0);
    assert.equal(existsSync(target), true);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("archive mutation lock executes concurrent requests serially", async () => {
  const events: string[] = [];
  let releaseFirst;
  const firstBarrier = new Promise((resolve) => { releaseFirst = resolve; });
  const first = runArchiveSerialized(async () => {
    events.push("first:start");
    await firstBarrier;
    events.push("first:end");
    return 1;
  });
  const second = runArchiveSerialized(async () => {
    events.push("second:start");
    events.push("second:end");
    return 2;
  });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(events, ["first:start"]);
  releaseFirst();
  assert.deepEqual(await Promise.all([first, second]), [1, 2]);
  assert.deepEqual(events, ["first:start", "first:end", "second:start", "second:end"]);
});
