import assert from "node:assert/strict";
import test from "node:test";
import { buildV2Summary } from "../src/v2-summary.js";
import type { P2Job } from "../src/p2-runtime.js";
import type { ArchiveRecord } from "../src/p3-archive.js";

function job(
  id: string,
  state: P2Job["state"],
  createdAt = "2026-09-12T10:00:00",
  generatedAssetId?: string,
): P2Job {
  return {
    job_id: id,
    site_id: "drift-curio",
    item_id: "DC-ZY-SZ-31001",
    workflow_code: "SC01",
    source_asset_id: `source-${id}`,
    state,
    created_at: createdAt,
    updated_at: createdAt,
    generated_asset_id: generatedAssetId,
  };
}

function archive(assetId: string): ArchiveRecord {
  return {
    event: "ARCHIVE_SNAPSHOT",
    site_id: "drift-curio",
    item_id: "DC-ZY-SZ-31001",
    archived_at: "2026-09-12T15:00:00",
    gate: "15",
    workflow_code: "SC01",
    asset_id: assetId,
    filename: "DC-ZY-SZ-31001__cutout__master__wf-SC01__v001.png",
    destination_key: "cutout",
    destination_path: "F:/formal/cutout.png",
    size_bytes: 123,
    sha256: "a".repeat(64),
    result: "VERIFIED_ARCHIVE",
    source_deleted: true,
  };
}

test("V2 summary separates outcomes from cross-midnight action backlog", () => {
  const result = buildV2Summary({
    dayKey: "2026-09-12",
    jobs: [
      job("queued", "QUEUED"),
      job("old-queued", "QUEUED", "2026-09-11T23:30:00"),
      job("running", "RUNNING"),
      job("qa-pending", "QA_PENDING", "2026-09-12T11:00:00", "asset-pending"),
      job("old-pending", "QA_PENDING", "2026-09-11T22:00:00", "asset-old-pending"),
      job("qa-ready", "QA_PASS", "2026-09-12T12:00:00", "asset-ready"),
      job("qa-archived", "QA_PASS", "2026-09-12T13:00:00", "asset-archived"),
      job("qa-rejected", "QA_FAIL", "2026-09-12T14:00:00", "asset-rejected"),
      job("failed", "FAILED_RUNTIME"),
      job("old", "QA_PASS", "2026-09-11T10:00:00", "asset-old"),
    ],
    archives: [archive("asset-archived")],
    system: {
      comfyuiOnline: true,
      comfyQueueRunning: 0,
      comfyQueuePending: 2,
    },
  });

  assert.deepEqual(result.generation, {
    queued: 2,
    running: 1,
    completed: 4,
    failed: 1,
  });
  assert.deepEqual(result.qa, { pending: 2, passed: 2, rejected: 1 });
  assert.deepEqual(result.archive, { ready: 2, archived: 1 });
  assert.equal(result.system.comfyui, "ONLINE");
  assert.equal(result.system.worker, "BUSY");
  assert.equal(result.system.queue_depth, 3);
  assert.equal(result.cloud_cost.enabled, false);
  assert.equal(result.cloud_cost.today, 0);
});

test("V2 summary reports idle/offline without inventing cloud spend", () => {
  const result = buildV2Summary({
    dayKey: "2026-09-12",
    jobs: [],
    archives: [],
    system: {
      comfyuiOnline: false,
      comfyQueueRunning: 0,
      comfyQueuePending: 0,
    },
  });

  assert.equal(result.system.comfyui, "OFFLINE");
  assert.equal(result.system.worker, "IDLE");
  assert.equal(result.system.queue_depth, 0);
  assert.deepEqual(result.cloud_cost, {
    enabled: false,
    currency: "USD",
    today: 0,
    month: 0,
    reason: "CLOUD_NOT_CONFIGURED",
  });
});
