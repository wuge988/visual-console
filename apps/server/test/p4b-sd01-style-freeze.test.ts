import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

async function text(url: URL) {
  return readFile(url, "utf8");
}

test("P4B style review keeps SD01 disabled and read-only while comparing canonical dark tokens", async () => {
  const [registryText, html, css, js, packet] = await Promise.all([
    text(new URL("../../../config/workflows/registry.json", import.meta.url)),
    text(new URL("../../web/public/sd01-style.html", import.meta.url)),
    text(new URL("../../web/public/sd01-style.css", import.meta.url)),
    text(new URL("../../web/public/sd01-style.js", import.meta.url)),
    text(new URL("../../../docs/p4/P4B_SD01_STYLE_FREEZE_PACKET.md", import.meta.url)),
  ]);

  const registry = JSON.parse(registryText);
  const sd01 = registry.workflows.find((row: any) => row.code === "SD01");
  assert.ok(sd01);
  assert.equal(sd01.workflow_status, "NOT_REGISTERED");
  assert.equal(sd01.executable, false);

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
  assert.doesNotMatch(js, /\/api\/derivatives\//);
  assert.doesNotMatch(js, /\/api\/qa\//);

  assert.match(packet, /Candidate A \/ #171B20/);
  assert.match(packet, /SD01_EXECUTION_NOT_AUTHORIZED/);
  assert.match(packet, /no SD01 production output is written to D staging/);
});
