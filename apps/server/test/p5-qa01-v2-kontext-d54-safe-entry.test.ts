import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

async function text(url: URL) { return readFile(url, "utf8"); }

test("P5 D5.4 local gate uses the subject-clipped critical landmark safe entry", async () => {
  const [safeEntry, gate] = await Promise.all([
    text(new URL("../../../tools/p5_qa01_kontext_d54_safe_entry.py", import.meta.url)),
    text(new URL("../../../tools/P5_QA01_V2_KONTEXT_D54_LOCAL_GATE.ps1", import.meta.url)),
  ]);

  for (const token of [
    "critical = critical_raw.convert(\"L\")",
    "subject = d2.binary_subject_mask(source.getchannel(\"A\"))",
    "clipped = ImageChops.multiply(critical, subject)",
    "D54_SAFE_CRITICAL_LOCK_OUTSIDE_SUBJECT",
    "D54_SAFE_CRITICAL_LOCK_EMPTY",
    'metrics["critical_lock_clipped_to_subject"] = True',
    "d54.build_anchor_masks = build_anchor_masks_subject_clipped",
  ]) assert.ok(safeEntry.includes(token), token);

  assert.match(gate, /p5_qa01_kontext_d54_safe_entry\.py/);
  assert.doesNotMatch(gate, /p5_qa01_kontext_d54_eval\.py/);

  const py = spawnSync("python", ["-m", "py_compile", "../../tools/p5_qa01_kontext_d54_safe_entry.py"], { encoding: "utf8" });
  assert.equal(py.status, 0, py.stderr || py.stdout);
});
