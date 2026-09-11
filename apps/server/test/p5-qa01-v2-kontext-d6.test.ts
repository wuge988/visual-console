import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

async function text(url: URL) { return readFile(url, "utf8"); }

test("P5 D6 closes D5.x local repaint and forces foreground occlusion without sellable-piece RGB conditioning", async () => {
  const [doc, evaluator, gate, registryText, siteText] = await Promise.all([
    text(new URL("../../../docs/p5/P5_QA01_KONTEXT_D6_IMPLEMENTATION.md", import.meta.url)),
    text(new URL("../../../tools/p5_qa01_kontext_d6_eval.py", import.meta.url)),
    text(new URL("../../../tools/P5_QA01_V2_KONTEXT_D6_LOCAL_GATE.ps1", import.meta.url)),
    text(new URL("../../../config/workflows/registry.json", import.meta.url)),
    text(new URL("../../../config/sites/drift-curio.json", import.meta.url)),
  ]);

  for (const token of [
    "D54_HUMAN_VISUAL_FAIL",
    "exact-pixel reassert + local masked-inpaint",
    "Masked wood pixels are deliberately removed from the stage input",
    "reference canvas does **not** contain sellable-piece RGB pixels",
    "There is **no third generative coherence pass** in D6",
  ]) assert.ok(doc.includes(token), token);

  for (const token of [
    'MAX_OCCLUSION_SUBJECT_RATIO = 0.20',
    'MIN_UNCHANGED_SUBJECT_RATIO = 0.80',
    'build_silhouette_material_reference',
    'exact_sellable_piece_rgb_in_reference_canvas',
    '"exact_sellable_piece_rgb_in_reference_canvas": False',
    '"masked_wood_reconstruction_forbidden": True',
    'D6_OUTSIDE_OCCLUSION_UNION_CHANGED',
    'D6_CRITICAL_LANDMARK_CHANGED',
    'third_generative_coherence_pass_forbidden',
    'foreground_hardscape_must_replace_authorized_wood_pixels',
    'foreground_epiphyte_must_replace_authorized_wood_pixels',
  ]) assert.ok(evaluator.includes(token), token);

  assert.doesNotMatch(evaluator, /stage_c_coherence|COHERENCE_PROMPT|COHERENCE_SEED/);
  assert.match(gate, /p5_qa01_kontext_d6_eval\.py/);
  assert.match(gate, /P5_QA01_V2_KONTEXT_D6_LOCAL_GATE=PASS/);
  assert.doesNotMatch(gate, /git\s+(reset|clean|stash\s+pop)/i);

  const registry = JSON.parse(registryText);
  const site = JSON.parse(siteText);
  const qa01 = registry.workflows.find((row: any) => row.code === "QA01");
  assert.ok(qa01);
  assert.equal(qa01.workflow_status, "NOT_REGISTERED");
  assert.equal(qa01.executable, false);
  assert.equal(site.enabled_workflows.includes("QA01"), false);

  const py = spawnSync("python", ["-m", "py_compile", "../../tools/p5_qa01_kontext_d6_eval.py"], { encoding: "utf8" });
  assert.equal(py.status, 0, py.stderr || py.stdout);

  const pwsh = spawnSync("pwsh", ["-NoProfile", "-Command", '$p="../../tools/P5_QA01_V2_KONTEXT_D6_LOCAL_GATE.ps1"; $t=[IO.File]::ReadAllText($p,[Text.Encoding]::UTF8); $tok=$null; $err=$null; [System.Management.Automation.Language.Parser]::ParseInput($t,[ref]$tok,[ref]$err)|Out-Null; if($err.Count -gt 0){$err|%{Write-Error ("${p}: "+$_.Message)}; exit 1}'], { encoding: "utf8" });
  assert.equal(pwsh.status, 0, pwsh.stderr || pwsh.stdout);
});
