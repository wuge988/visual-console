import assert from "node:assert/strict";
import test from "node:test";
import {
  assertCanonicalAssetLineage,
  canonicalArchiveFromRecord,
  canonicalAssetsFromP2Jobs,
  canonicalJobFromP2,
  canonicalQaFromP2Job,
} from "../src/canonical-contract.js";
import type { P2Job } from "../src/p2-runtime.js";

const baseJob: P2Job = {
  job_id: "job-1",
  site_id: "drift-curio",
  item_id: "DC-ZY-SZ-31001",
  workflow_code: "SC01",
  source_asset_id: "raw-1",
  source_filename: "capture.jpg",
  state: "QA_PASS",
  created_at: "2026-09-14T00:00:00.000Z",
  updated_at: "2026-09-14T00:01:00.000Z",
  generated_asset_id: "asset-1",
  generated_filename: "piece.png",
  generated_sha256: "a".repeat(64),
  generated_size_bytes: 123,
  qa_note: "reviewed",
};

test("canonical job preserves Exact Piece identity and separates QA from generation", () => {
  const job = canonicalJobFromP2(baseJob);
  assert.equal(job.site_id, "drift-curio");
  assert.equal(job.item_id, "DC-ZY-SZ-31001");
  assert.equal(job.pipeline, "PRODUCT_IMAGE");
  assert.equal(job.generation_state, "SUCCEEDED");
  assert.equal(job.qa_state, "QA_PASS");
  assert.deepEqual(job.source_asset_ids, ["raw-1"]);
  assert.deepEqual(job.output_asset_ids, ["asset-1"]);
});

test("canonical job does not promote a failed QA result to archive", () => {
  const job = canonicalJobFromP2({ ...baseJob, state: "QA_FAIL" });
  assert.equal(job.generation_state, "SUCCEEDED");
  assert.equal(job.qa_state, "QA_FAIL");
  assert.equal(job.archive_state, "REJECTED");
});

test("canonical asset projection preserves source identity and generated lineage", () => {
  const assets = canonicalAssetsFromP2Jobs([baseJob, { ...baseJob, job_id: "job-2" }]);
  assert.equal(assets.length, 2);
  const source = assets.find((asset) => asset.asset_id === "raw-1");
  const generated = assets.find((asset) => asset.asset_id === "asset-1");
  assert.equal(source?.kind, "RAW");
  assert.equal(generated?.parent_asset_id, "raw-1");
  assert.equal(generated?.sha256, "a".repeat(64));
});

test("canonical QA projection remains separate from generation", () => {
  const qa = canonicalQaFromP2Job(baseJob);
  assert.equal(qa?.asset_id, "asset-1");
  assert.equal(qa?.state, "QA_PASS");
  assert.equal(qa?.note, "reviewed");
});

test("canonical archive projection preserves durable evidence", () => {
  const archive = canonicalArchiveFromRecord({
    site_id: "drift-curio",
    item_id: "DC-ZY-SZ-31001",
    asset_id: "asset-1",
    archived_at: "2026-09-14T00:02:00.000Z",
    result: "VERIFIED_ARCHIVE",
    sha256: "B".repeat(64),
    size_bytes: 123,
    destination_key: "cutout",
  });
  assert.equal(archive.state, "VERIFIED_ARCHIVE");
  assert.equal(archive.sha256, "b".repeat(64));
  assert.equal(archive.destination_key, "cutout");
});

test("canonical asset requires durable identity and provenance", () => {
  const asset = assertCanonicalAssetLineage({
    site_id: "drift-curio",
    item_id: "DC-ZY-SZ-31001",
    asset_id: "asset-1",
    filename: "piece.png",
    kind: "PRODUCT_MASTER",
    sha256: "a".repeat(64),
    size_bytes: 123,
    provenance: {
      pipeline: "PRODUCT_IMAGE",
      workflow_code: "SC01",
    },
  });
  assert.equal(asset.asset_id, "asset-1");
});

test("canonical asset rejects malformed evidence", () => {
  assert.throws(
    () =>
      assertCanonicalAssetLineage({
        site_id: "drift-curio",
        item_id: "DC-ZY-SZ-31001",
        asset_id: "asset-1",
        filename: "piece.png",
        kind: "PRODUCT_MASTER",
        sha256: "bad",
        provenance: {
          pipeline: "PRODUCT_IMAGE",
          workflow_code: "SC01",
        },
      }),
    /ASSET_SHA256_INVALID/,
  );
});
