import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inspectAquariumSourceReadiness } from "../src/p3a-aquarium.js";

function sha256(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "vc-p3a-"));
  const sku = "DC-ZY-SZ-31001";
  const rawRoot = join(root, "raw");
  const assetRoot = join(root, "assets");
  const formalDir = join(assetRoot, sku, "cutout");
  const manifestRoot = join(root, "manifests");
  const controlRoot = join(root, "control");
  await Promise.all([
    mkdir(rawRoot, { recursive: true }),
    mkdir(formalDir, { recursive: true }),
    mkdir(manifestRoot, { recursive: true }),
    mkdir(controlRoot, { recursive: true }),
  ]);

  const filename = `${sku}__cutout__master__wf-SC01__v001.png`;
  const target = join(formalDir, filename);
  const bytes = Buffer.from("verified-sc01-cutout");
  const hash = sha256(bytes);
  const assetId = "asset-sc01-verified";
  await writeFile(target, bytes);

  const archivedAt = "2026-09-15T00:00:00.000Z";
  const history = {
    archived_at: archivedAt,
    gate: "15",
    workflow_code: "SC01",
    asset_id: assetId,
    filename,
    destination_key: "cutout",
    destination_path: target,
    size_bytes: bytes.length,
    sha256: hash,
    result: "VERIFIED_ARCHIVE",
  };
  await writeFile(
    join(manifestRoot, `${sku}.json`),
    `${JSON.stringify({ sku, destinations: { cutout: formalDir }, archive_history: [history] }, null, 2)}\n`,
  );
  await writeFile(
    join(controlRoot, "archives.jsonl"),
    `${JSON.stringify({ ...history, event: "ARCHIVE_SNAPSHOT", site_id: "drift-curio", item_id: sku, source_deleted: true })}\n`,
  );

  return {
    root,
    target,
    profile: {
      site_id: "drift-curio",
      raw_root: rawRoot,
      asset_root: assetRoot,
      manifest_root: manifestRoot,
      control_root: controlRoot,
      enabled_workflows: ["SC01", "SW01", "SD01"],
    },
  };
}

test("P3-A readiness binds exactly one durable SC01 source package while QA01 remains disabled", async () => {
  const data = await fixture();
  try {
    const result = await inspectAquariumSourceReadiness(data.profile, "DC-ZY-SZ-31001");
    assert.equal(result.authority, "EVALUATION_ONLY");
    assert.equal(result.execution_authorized, false);
    assert.equal(result.production_registration, false);
    assert.equal(result.qa01.executable, false);
    assert.equal(result.qa01.site_enabled, false);
    assert.equal(result.source_ready, true);
    assert.equal(result.contract_safe, true);
    assert.equal(result.evaluation_ready, true);
    assert.equal(result.next_gate, "BOUNDED_ENGINE_BENCHMARK");
    assert.match(result.source?.source_package_id ?? "", /^p3a-src-[a-f0-9]{24}$/);
    assert.deepEqual(result.blockers, []);
    assert.equal(result.candidate_routes.length, 2);
  } finally {
    await rm(data.root, { recursive: true, force: true });
  }
});

test("P3-A readiness fails closed when formal SC01 bytes drift", async () => {
  const data = await fixture();
  try {
    await writeFile(data.target, Buffer.from("drifted-bytes"));
    const result = await inspectAquariumSourceReadiness(data.profile, "DC-ZY-SZ-31001");
    assert.equal(result.source_ready, false);
    assert.equal(result.evaluation_ready, false);
    assert.equal(result.execution_authorized, false);
    assert.ok(result.blockers.some((blocker) => /SIZE_DRIFT|SHA256_DRIFT/.test(blocker)));
  } finally {
    await rm(data.root, { recursive: true, force: true });
  }
});

test("P3-A readiness fails closed if QA01 is prematurely site-enabled", async () => {
  const data = await fixture();
  try {
    const result = await inspectAquariumSourceReadiness(
      { ...data.profile, enabled_workflows: [...data.profile.enabled_workflows, "QA01"] },
      "DC-ZY-SZ-31001",
    );
    assert.equal(result.contract_safe, false);
    assert.equal(result.evaluation_ready, false);
    assert.ok(result.blockers.includes("QA01_MUST_REMAIN_SITE_DISABLED_DURING_P3A"));
  } finally {
    await rm(data.root, { recursive: true, force: true });
  }
});
