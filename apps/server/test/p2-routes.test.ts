import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { registerP2Routes } from "../src/p2-routes.js";
import {
  assertExistingRealInside,
  assertInside,
  rawAssetId,
  safeId,
  validateItemId,
} from "../src/runtime-utils.js";

function workflow(prefix = "SC01") {
  return {
    "1": { class_type: "LoadImage", inputs: { image: "source.png" } },
    "2": {
      class_type: "Remove Background (RMBG)",
      inputs: {
        image: ["1", 0],
        model: "RMBG-2.0",
        sensitivity: 1,
        process_res: 1024,
        mask_blur: 0,
        mask_offset: -1,
        invert_output: false,
        refine_foreground: true,
        background: "Alpha",
      },
    },
    "3": { class_type: "SaveImage", inputs: { images: ["2", 0], filename_prefix: prefix } },
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function waitUntil<T>(fn: () => Promise<T | null>, timeoutMs = 4000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await fn();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 35));
  }
  throw new Error("TEST_TIMEOUT");
}

test("P2 routes register SC01, run serial prompt-correlated batch, persist QA, reject traversal, and reconstruct after restart", async () => {
  const root = await mkdtemp(join(tmpdir(), "vc-p2-routes-"));
  const sku = "DC-ZY-SZ-31001";
  const rawRoot = join(root, "raw");
  const rawDir = join(rawRoot, sku);
  const trashRoot = join(root, "trash");
  const stagingRoot = join(root, "staging");
  const controlRoot = join(root, "control");
  const inputRoot = join(root, "comfy-input");
  const outputRoot = join(root, "comfy-output");
  const manifestRoot = join(root, "manifests");
  await Promise.all([
    mkdir(rawDir, { recursive: true }),
    mkdir(trashRoot, { recursive: true }),
    mkdir(stagingRoot, { recursive: true }),
    mkdir(controlRoot, { recursive: true }),
    mkdir(inputRoot, { recursive: true }),
    mkdir(outputRoot, { recursive: true }),
    mkdir(manifestRoot, { recursive: true }),
  ]);

  const filenames = ["one.png", "two.png", "three.png"];
  for (const [index, filename] of filenames.entries()) {
    await writeFile(join(rawDir, filename), Buffer.from(`raw-${index + 1}`));
  }
  const assetIds = filenames.map((filename) => rawAssetId("drift-curio", sku, filename));

  const profile = {
    site_id: "drift-curio",
    display_name: "DRIFT CURIO",
    display_name_zh: "沉木站",
    item_adapter: "drift_curio_sku_v1",
    raw_root: rawRoot,
    trash_root: trashRoot,
    work_root: inputRoot,
    staging_root: stagingRoot,
    manifest_root: manifestRoot,
    enabled_workflows: ["SC01"],
    control_root: controlRoot,
    comfyui_input_root: inputRoot,
    comfyui_output_root: outputRoot,
  };

  const deps = {
    assertLocalRequest(req: any) {
      const ip = String(req.ip ?? "");
      if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(ip)) throw new Error("LOCAL_ONLY");
    },
    async loadSite(siteId: string) {
      if (siteId !== profile.site_id) throw new Error("SITE_NOT_FOUND");
      return profile;
    },
    validateProfileItem(candidate: typeof profile, itemId: string) {
      return validateItemId(candidate.item_adapter, itemId);
    },
    async resolveRawAsset(candidate: typeof profile, itemId: string, assetId: string) {
      validateItemId(candidate.item_adapter, itemId);
      const dir = join(candidate.raw_root, safeId(itemId));
      assertInside(candidate.raw_root, dir);
      await assertExistingRealInside(candidate.raw_root, dir);
      const name = (await readdir(dir)).find(
        (filename) => rawAssetId(candidate.site_id, itemId, filename) === assetId,
      );
      if (!name) throw new Error("ASSET_NOT_FOUND");
      const full = join(dir, name);
      await assertExistingRealInside(candidate.raw_root, full);
      return { full, filename: name, mime: "image/png", kind: "image" };
    },
  };

  const originalFetch = globalThis.fetch;
  let promptNumber = 0;
  const events: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/system_stats")) return json({ devices: [{ name: "mock-gpu", vram_total: 8, vram_free: 4 }] });
    if (url.endsWith("/queue")) return json({ queue_running: [], queue_pending: [] });
    if (url.endsWith("/prompt")) {
      promptNumber += 1;
      const promptId = `p${promptNumber}`;
      events.push(`submit:${promptId}`);
      if (promptNumber <= 3) await writeFile(join(outputRoot, `result-${promptId}.png`), Buffer.from(`out-${promptId}`));
      return json({ prompt_id: promptId });
    }
    const historyMatch = /\/history\/(p\d+)$/.exec(url);
    if (historyMatch) {
      const promptId = historyMatch[1];
      events.push(`history:${promptId}`);
      if (promptId === "p4") {
        return json({
          [promptId]: {
            outputs: {
              "3": { images: [{ filename: "escape.png", subfolder: "../escape", type: "output" }] },
            },
          },
        });
      }
      return json({
        [promptId]: {
          outputs: {
            "3": { images: [{ filename: `result-${promptId}.png`, subfolder: "", type: "output" }] },
          },
        },
      });
    }
    return json({ error: "UNEXPECTED_MOCK_URL" }, 404);
  }) as typeof fetch;

  let app = Fastify();
  try {
    await registerP2Routes(app, deps);

    const remoteRejected = await app.inject({
      method: "POST",
      url: "/api/workflows/SC01/register?site_id=drift-curio",
      remoteAddress: "192.168.1.22",
      headers: { "content-type": "application/json" },
      payload: workflow(),
    } as any);
    assert.equal(remoteRejected.statusCode, 400);
    assert.match(remoteRejected.body, /LOCAL_ONLY/);

    const registration = await app.inject({
      method: "POST",
      url: "/api/workflows/SC01/register?site_id=drift-curio",
      headers: { "content-type": "application/json" },
      payload: workflow(),
    });
    assert.equal(registration.statusCode, 200, registration.body);
    assert.equal(registration.json().workflow_status, "REGISTERED");

    const differentHash = await app.inject({
      method: "POST",
      url: "/api/workflows/SC01/register?site_id=drift-curio",
      headers: { "content-type": "application/json" },
      payload: workflow("SC01_DIFFERENT"),
    });
    assert.equal(differentHash.statusCode, 400);
    assert.match(differentHash.body, /SC01_DIFFERENT_HASH_REQUIRES_REBIND/);

    const workflowList = await app.inject({ method: "GET", url: "/api/workflows?site_id=drift-curio" });
    const list = workflowList.json();
    assert.equal(list.length, 13);
    assert.equal(list.filter((row: any) => row.executable).length, 1);
    assert.equal(list.find((row: any) => row.code === "SC01").workflow_status, "REGISTERED");

    const batch = await app.inject({
      method: "POST",
      url: "/api/jobs/batch",
      headers: { "content-type": "application/json" },
      payload: { site_id: "drift-curio", item_id: sku, workflow_code: "SC01", asset_ids: assetIds },
    });
    assert.equal(batch.statusCode, 200, batch.body);
    assert.equal(batch.json().serial, true);
    assert.equal(batch.json().jobs.length, 3);

    const completed = await waitUntil(async () => {
      const response = await app.inject({ method: "GET", url: `/api/jobs?site_id=drift-curio&item_id=${sku}` });
      const rows = response.json();
      return rows.length === 3 && rows.every((row: any) => row.state === "QA_PENDING") ? rows : null;
    });
    assert.deepEqual(events.slice(0, 6), [
      "submit:p1", "history:p1",
      "submit:p2", "history:p2",
      "submit:p3", "history:p3",
    ]);
    assert.deepEqual(
      completed.map((row: any) => row.generated_filename).sort(),
      [1, 2, 3].map((version) => `${sku}__cutout__master__wf-SC01__v${String(version).padStart(3, "0")}.png`).sort(),
    );
    for (const filename of filenames) assert.equal(existsSync(join(rawDir, filename)), true);

    const first = completed[0];
    const qaPass = await app.inject({
      method: "POST",
      url: `/api/qa/${first.generated_asset_id}/decision`,
      headers: { "content-type": "application/json" },
      payload: { decision: "PASS", note: "edge clean" },
    });
    assert.equal(qaPass.statusCode, 200);
    assert.equal(qaPass.json().job.state, "QA_PASS");
    assert.equal(qaPass.json().job.qa_note, "edge clean");

    const content = await app.inject({
      method: "GET",
      url: `/api/assets/generated/drift-curio/${sku}/${first.generated_asset_id}/content`,
    });
    assert.equal(content.statusCode, 200);
    assert.match(content.headers["content-type"] ?? "", /image\/png/);

    const retry = await app.inject({ method: "POST", url: `/api/jobs/${first.job_id}/retry` });
    assert.equal(retry.statusCode, 200);
    const retryId = retry.json().job.job_id;
    const failedCapture = await waitUntil(async () => {
      const response = await app.inject({ method: "GET", url: `/api/jobs?site_id=drift-curio&item_id=${sku}` });
      const row = response.json().find((candidate: any) => candidate.job_id === retryId);
      return row?.state === "FAILED_CAPTURE" ? row : null;
    });
    assert.match(failedCapture.error, /PATH_OUTSIDE_ALLOWLIST/);

    const journal = await readFile(join(controlRoot, "jobs.jsonl"), "utf8");
    assert.match(journal, /QA_PASS/);
    assert.match(journal, /FAILED_CAPTURE/);

    await app.close();
    app = Fastify();
    await registerP2Routes(app, deps);
    const reconstructed = await app.inject({ method: "GET", url: `/api/jobs?site_id=drift-curio&item_id=${sku}` });
    const reconstructedRows = reconstructed.json();
    assert.equal(reconstructedRows.some((row: any) => row.state === "QA_PASS" && row.qa_note === "edge clean"), true);
    assert.equal(reconstructedRows.some((row: any) => row.job_id === retryId && row.state === "FAILED_CAPTURE"), true);

    const system = await app.inject({ method: "GET", url: "/api/system/status?site_id=drift-curio" });
    assert.equal(system.statusCode, 200);
    assert.equal(system.json().comfyui.online, true);
    assert.equal(system.json().workflow_registry.executable, 1);
  } finally {
    globalThis.fetch = originalFetch;
    await app.close().catch(() => undefined);
    await rm(root, { recursive: true, force: true });
  }
});
