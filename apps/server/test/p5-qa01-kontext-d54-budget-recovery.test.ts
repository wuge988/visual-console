import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

async function text(url: URL) {
  return readFile(url, "utf8");
}

test("D5.4 keeps the frozen 0.32 identity budget while adaptively narrowing subject-side anchors", async () => {
  const [entry, gate, registryText, siteText] = await Promise.all([
    text(new URL("../../../tools/p5_qa01_kontext_d54_budgeted_entry.py", import.meta.url)),
    text(new URL("../../../tools/P5_QA01_V2_KONTEXT_D54_LOCAL_GATE.ps1", import.meta.url)),
    text(new URL("../../../config/workflows/registry.json", import.meta.url)),
    text(new URL("../../../config/sites/drift-curio.json", import.meta.url)),
  ]);

  const registry = JSON.parse(registryText);
  const site = JSON.parse(siteText);
  const qa01 = registry.workflows.find((row: any) => row.code === "QA01");

  assert.ok(qa01);
  assert.equal(qa01.workflow_status, "NOT_REGISTERED");
  assert.equal(qa01.executable, false);
  assert.equal(site.enabled_workflows.includes("QA01"), false);

  assert.match(entry, /FROZEN_MAX_UNION_EDITABLE_SUBJECT_RATIO = 0\.32/);
  assert.match(entry, /FROZEN_MIN_UNCHANGED_SUBJECT_RATIO = 0\.68/);
  assert.doesNotMatch(entry, /FROZEN_MAX_UNION_EDITABLE_SUBJECT_RATIO = 0\.3[3-9]/);
  assert.match(entry, /SUBJECT_INNER_BAND_DEPTHS = \(64, 56, 48, 42, 36, 30, 24, 18, 14, 10\)/);
  assert.match(entry, /_restrict_subject_depth/);
  assert.match(entry, /outside = ImageChops\.multiply\(mask, ImageChops\.invert\(subject\)\)/);
  assert.match(entry, /allowed_inside = ImageChops\.subtract\(subject, d2\.erode\(subject, depth\)\)/);
  assert.match(entry, /ratio <= FROZEN_MAX_UNION_EDITABLE_SUBJECT_RATIO and crosses/);
  assert.match(entry, /D54_ADAPTIVE_BUDGET_NO_VALID_PROFILE/);
  assert.match(entry, /critical = ImageChops\.multiply\(critical_geo, subject\)/);
  assert.match(entry, /D54_SAFE_CRITICAL_LOCK_OUTSIDE_SUBJECT/);
  assert.match(entry, /all_stages_cross_subject_boundary/);
  assert.match(entry, /broad_union_editable_subject_ratio/);
  assert.match(entry, /selected_subject_inner_band_depth/);
  assert.match(entry, /budget_attempts/);

  assert.match(gate, /p5_qa01_kontext_d54_budgeted_entry\.py/);
  assert.match(gate, /KONTEXT_D54_BUDGETED_SCRIPT_NOT_FOUND/);
  assert.doesNotMatch(gate, /p5_qa01_kontext_d54_safe_entry\.py/);
  assert.doesNotMatch(gate, /git\s+(reset|clean|stash\s+pop)/i);
});
