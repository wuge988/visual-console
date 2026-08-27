import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

async function text(url: URL) {
  return readFile(url, "utf8");
}

test("P4B frozen style surface stays read-only after P4C promotes the validated SD01 renderer", async () => {
  const [registryText, html, css, js, result] = await Promise.all([
    text(new URL("../../../config/workflows/registry.json", import.meta.url)),
    text(new URL("../../web/public/sd01-style.html", import.meta.url)),
    text(new URL("../../web/public/sd01-style.css", import.meta.url)),
    text(new URL("../../web/public/sd01-style.js", import.meta.url)),
    text(new URL("../../../docs/p4b/P4B_STYLE_FREEZE_RESULT.md", import.meta.url)),
  ]);

  const registry = JSON.parse(registryText);
  const sd01 = registry.workflows.find((row: any) => row.code === "SD01");
  assert.ok(sd01);
  assert.equal(sd01.workflow_status, "VALIDATED_LOCAL_RENDERER");
  assert.equal(sd01.executable, true);
  assert.equal(sd01.execution_engine, "LOCAL_RENDERER");
  assert.equal(sd01.frozen_runtime?.renderer, "sd01-flat-gallery-surface-rgb-v1");
  assert.equal(sd01.frozen_runtime?.background, "#171B20");
  assert.equal(sd01.frozen_runtime?.relight, false);
  assert.equal(sd01.frozen_runtime?.synthetic_shadow, false);
  assert.equal(sd01.frozen_runtime?.vignette, false);
  assert.equal(sd01.frozen_runtime?.generative_inference, false);

  assert.match(html, /STYLE REVIEW ONLY/);
  assert.match(html, /Gallery Surface/);
  assert.match(html, /Gallery Background/);
  assert.match(html, /Pure Black Reference/);
  assert.match(css, /\.stage-a\{background:#171b20\}/);
  assert.match(css, /\.stage-b\{background:#0e1114\}/);
  assert.match(css, /\.stage-r\{background:#000\}/);

  assert.match(js, /\/api\/archive\?site_id=/);
  assert.match(js, /workflow_code === "SC01"/);
  assert.match(js, /destination_key === "cutout"/);
  assert.match(js, /result === "VERIFIED_ARCHIVE"/);
  assert.doesNotMatch(js, /method\s*:\s*["']POST["']/i);
  assert.doesNotMatch(js, /\/api\/dark-derivatives\//);

  assert.match(result, /CANDIDATE_A_FROZEN/);
  assert.match(result, /selected background: `#171B20`/);
  assert.match(result, /no additional visual treatment is authorized for v1/i);
});
