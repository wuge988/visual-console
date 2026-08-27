import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

async function text(url: URL) {
  return readFile(url, "utf8");
}

test("P4A promotes SW01 only after physical validation and loads it into the six-page shell", async () => {
  const [registryText, mainSource, integrationSource] = await Promise.all([
    text(new URL("../../../config/workflows/registry.json", import.meta.url)),
    text(new URL("../../web/src/main.ts", import.meta.url)),
    text(new URL("../../web/src/p4-sw01-integration.ts", import.meta.url)),
  ]);

  const registry = JSON.parse(registryText);
  const sw01 = registry.workflows.find((row: any) => row.code === "SW01");
  const sd01 = registry.workflows.find((row: any) => row.code === "SD01");

  assert.equal(sw01.workflow_status, "VALIDATED_LOCAL_RENDERER");
  assert.equal(sw01.executable, true);
  assert.equal(sw01.execution_engine, "LOCAL_RENDERER");
  assert.equal(sw01.frozen_runtime.renderer, "sw01-flat-white-rgb-v1");
  assert.equal(sw01.frozen_runtime.input, "VERIFIED_SC01_ARCHIVE");
  assert.equal(sw01.frozen_runtime.background, "#FFFFFF");
  assert.equal(sw01.frozen_runtime.generative_inference, false);

  assert.equal(sd01.executable, false);
  assert.equal(sd01.workflow_status, "NOT_REGISTERED");

  assert.match(mainSource, /p4-sw01-integration\.css/);
  assert.match(mainSource, /p4-sw01-integration\.js/);

  for (const route of ["/workspace", "/workflows", "/jobs", "/qa", "/assets", "/system"]) {
    assert.ok(integrationSource.includes(`\"${route}\"`), `missing six-page integration route ${route}`);
  }

  assert.match(integrationSource, /\/api\/derivatives\/SW01\/batch/);
  assert.match(integrationSource, /\/api\/derivatives\/qa\//);
  assert.match(integrationSource, /\/api\/derivatives\/archive\//);
  assert.match(integrationSource, /\/api\/derivatives\?/);
  assert.match(integrationSource, /\/api\/archive\?/);
  assert.match(integrationSource, /workflow_code === "SC01"/);
  assert.match(integrationSource, /destination_key === "cutout"/);
  assert.match(integrationSource, /result === "VERIFIED_ARCHIVE"/);
  assert.match(integrationSource, /body: "\{\}"/);
});
