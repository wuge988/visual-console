import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

async function text(url: URL) { return readFile(url, "utf8"); }

test("P5 D5.2 destroys donor composition before conditioning and keeps QA01 fail-closed", async () => {
  const [python, wrapper, registryText, siteText] = await Promise.all([
    text(new URL("../../../tools/p5_qa01_kontext_d52_eval.py", import.meta.url)),
    text(new URL("../../../tools/P5_QA01_V2_KONTEXT_D52_LOCAL_GATE.ps1", import.meta.url)),
    text(new URL("../../../config/workflows/registry.json", import.meta.url)),
    text(new URL("../../../config/sites/drift-curio.json", import.meta.url)),
  ]);
  const registry = JSON.parse(registryText);
  const site = JSON.parse(siteText);
  const qa01 = registry.workflows.find((row: any) => row.code === "QA01");

  assert.equal(qa01.workflow_status, "NOT_REGISTERED");
  assert.equal(qa01.executable, false);
  assert.equal(site.enabled_workflows.includes("QA01"), false);

  for (const token of [
    "REALISM_GRID_COLS = 9",
    "REALISM_GRID_ROWS = 8",
    "REALISM_COLOR_SATURATION = 0.15",
    "REALISM_PERMUTATION_A = 37",
    "REALISM_PERMUTATION_B = 17",
    "macro_layout_destroyed",
    "donor_scene_direct_pixels_passed_to_comfy",
    "D52_REALISM_BOARD_FIXED_TILE_GUARD_FAILED",
    "D52_DONOR_SCENE_DIRECT_CONDITIONING_FORBIDDEN",
    "composition_destroyed_realism_material_board_only",
    "FAIL_REFERENCE_COMPOSITION_LEAK_NOT_ACCEPTABLE",
    "ANTI_REPLICATION_REALISM_BOARD_SINGLE_REFERENCE_LATENT_PLUS_SetLatentNoiseMask",
    "MATURE_SHADED_FOREST_STREAM_DARK_SUBSTRATE_OPEN_RIGHT_LANE",
    "QA01_MUST_REMAIN_DISABLED_DURING_KONTEXT_D52_EVAL",
    '"production_mutation": "NONE"',
  ]) assert.ok(python.includes(token), token);

  assert.match(python, /source_index = \(dest_index \* REALISM_PERMUTATION_A \+ REALISM_PERMUTATION_B\) % tile_count/);
  assert.match(python, /build_realism_material_board\(evidence \/ "scene_reference\.png", evidence \/ "realism_material_board\.png"\)/);
  assert.match(python, /build_reference_canvas\(evidence \/ "eval_input_white\.png", evidence \/ "realism_material_board\.png"/);
  assert.doesNotMatch(python, /copy_input\(evidence \/ "scene_reference\.png"/);
  assert.doesNotMatch(python, /archive_history\s*\.\s*append|destinations\[\s*["']aquarium["']\s*\]\s*=|write_text\([^\n]*manifest/i);

  for (const token of [
    "SAFETY_BRANCH=",
    "switch --detach",
    "SCENE_REFERENCE_PATH_REQUIRED",
    "P5_D52_PYTHON_BOOTSTRAP=TOOLS_DIR_INSERTED",
    "$python -B $bootstrap",
    "Start-Process $review",
  ]) assert.ok(wrapper.includes(token), token);
  assert.doesNotMatch(wrapper, /git\s+(reset|clean|stash\s+pop)/i);
  assert.equal(Buffer.byteLength(wrapper, "utf8"), wrapper.length, "D5.2 Windows launcher must remain ASCII-only");

  const py = spawnSync("python", ["-m", "py_compile", "../../tools/p5_qa01_kontext_d52_eval.py"], { encoding: "utf8" });
  assert.equal(py.status, 0, py.stderr || py.stdout);

  const pwsh = spawnSync("pwsh", ["-NoProfile", "-Command", '$p="../../tools/P5_QA01_V2_KONTEXT_D52_LOCAL_GATE.ps1"; $t=[IO.File]::ReadAllText($p,[Text.Encoding]::UTF8); $tok=$null; $err=$null; [System.Management.Automation.Language.Parser]::ParseInput($t,[ref]$tok,[ref]$err)|Out-Null; if($err.Count -gt 0){$err|%{Write-Error $_.Message}; exit 1}'], { encoding: "utf8" });
  assert.equal(pwsh.status, 0, pwsh.stderr || pwsh.stdout);
});
