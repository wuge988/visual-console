import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

async function text(url: URL) {
  return readFile(url, "utf8");
}

test("P4 static renderers load into the accepted six-page shell only after physical validation", async () => {
  const [registryText, mainSource, swIntegration, sdIntegration] = await Promise.all([
    text(new URL("../../../config/workflows/registry.json", import.meta.url)),
    text(new URL("../../web/src/main.ts", import.meta.url)),
    text(new URL("../../web/src/p4-sw01-integration.ts", import.meta.url)),
    text(new URL("../../web/src/p4-sd01-integration.ts", import.meta.url)),
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

  assert.equal(sd01.workflow_status, "VALIDATED_LOCAL_RENDERER");
  assert.equal(sd01.executable, true);
  assert.equal(sd01.execution_engine, "LOCAL_RENDERER");
  assert.equal(sd01.frozen_runtime.renderer, "sd01-flat-gallery-surface-rgb-v1");
  assert.equal(sd01.frozen_runtime.input, "VERIFIED_SC01_ARCHIVE");
  assert.equal(sd01.frozen_runtime.background, "#171B20");
  assert.equal(sd01.frozen_runtime.relight, false);
  assert.equal(sd01.frozen_runtime.synthetic_shadow, false);
  assert.equal(sd01.frozen_runtime.vignette, false);
  assert.equal(sd01.frozen_runtime.generative_inference, false);

  assert.match(mainSource, /p4-sw01-integration\.css/);
  assert.match(mainSource, /p4-sw01-integration\.js/);
  assert.match(mainSource, /p4-sd01-integration\.css/);
  assert.match(mainSource, /p4-sd01-integration\.js/);

  for (const route of ["/workspace", "/workflows", "/jobs", "/qa", "/assets", "/system"]) {
    assert.ok(swIntegration.includes(`\"${route}\"`), `missing SW01 six-page integration route ${route}`);
    assert.ok(sdIntegration.includes(`\"${route}\"`), `missing SD01 six-page integration route ${route}`);
  }

  assert.match(swIntegration, /\/api\/derivatives\/SW01\/batch/);
  assert.match(swIntegration, /\/api\/derivatives\/qa\//);
  assert.match(swIntegration, /\/api\/derivatives\/archive\//);
  assert.ok(swIntegration.includes("/api/derivatives${query}"));

  assert.match(sdIntegration, /\/api\/dark-derivatives\/SD01\/batch/);
  assert.match(sdIntegration, /\/api\/dark-derivatives\/qa\//);
  assert.match(sdIntegration, /\/api\/dark-derivatives\/archive\//);
  assert.ok(sdIntegration.includes("/api/dark-derivatives${query}"));
  assert.match(sdIntegration, /#171B20/);

  for (const source of [swIntegration, sdIntegration]) {
    assert.ok(source.includes("/api/archive${query}"));
    assert.match(source, /workflow_code === "SC01"/);
    assert.match(source, /destination_key === "cutout"/);
    assert.match(source, /result === "VERIFIED_ARCHIVE"/);
    assert.match(source, /body: "\{\}"/);
  }
});
