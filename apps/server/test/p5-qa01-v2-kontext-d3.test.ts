import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

async function text(url: URL) { return readFile(url, "utf8"); }

test("P5 D3 uses two-stage masked inpaint and remains evaluation-only", async () => {
  const [python, wrapper, registryText, siteText] = await Promise.all([
    text(new URL("../../../tools/p5_qa01_kontext_d3_eval.py", import.meta.url)),
    text(new URL("../../../tools/P5_QA01_V2_KONTEXT_D3_LOCAL_GATE.ps1", import.meta.url)),
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
    "STAGE1_SEED = 52073131",
    "STAGE2_SEED = 52073132",
    "STAGE1_DENOISE = 1.0",
    "STAGE2_DENOISE = 0.72",
    "VAEEncodeForInpaint",
    "protected_core.png",
    "upper_fine_band.png",
    "lower_contact_band.png",
    "local_anchor_zones.png",
    "stage2_editable_mask.png",
    "stage1_scaffold_preview.png",
    "candidate_stage1.png",
    "candidate_stage2_raw.png",
    "Image.composite(source_rgb, candidate, core)",
    "D3_{stage}_PROTECTED_CORE_REASSERTION_MISMATCH",
    "MIN_CORE_COVERAGE = 0.78",
    "Heavy Stump + Rightward Branch Flow + Central Negative Space",
    "smooth blue or teal gradient",
    "one coherent asymmetric support cluster",
    "QA01_MUST_REMAIN_DISABLED_DURING_KONTEXT_D3_EVAL",
    "QA01_REGISTRY_MUST_REMAIN_FAIL_CLOSED",
    "production_mutation\": \"NONE",
  ]) assert.ok(python.includes(token), token);

  assert.doesNotMatch(python, /archive_history\s*\.\s*append|destinations\[\s*["']aquarium["']\s*\]\s*=|write_text\([^\n]*manifest/i);

  for (const token of [
    "SAFETY_BRANCH=",
    "switch --detach",
    "P5_D3_PYTHON_BOOTSTRAP=TOOLS_DIR_INSERTED",
    "$python -B $bootstrap",
    "Remove-Item -LiteralPath $bootstrap",
    "Start-Process $review",
  ]) assert.ok(wrapper.includes(token), token);
  assert.doesNotMatch(wrapper, /git\s+(reset|clean|stash\s+pop)/i);

  const py = spawnSync("python", ["-m", "py_compile", "../../tools/p5_qa01_kontext_d3_eval.py"], { encoding: "utf8" });
  assert.equal(py.status, 0, py.stderr || py.stdout);

  const pwsh = spawnSync("pwsh", ["-NoProfile", "-Command", '$p="../../tools/P5_QA01_V2_KONTEXT_D3_LOCAL_GATE.ps1"; $t=[IO.File]::ReadAllText($p,[Text.Encoding]::UTF8); $tok=$null; $err=$null; [System.Management.Automation.Language.Parser]::ParseInput($t,[ref]$tok,[ref]$err)|Out-Null; if($err.Count -gt 0){$err|%{Write-Error $_.Message}; exit 1}'], { encoding: "utf8" });
  assert.equal(pwsh.status, 0, pwsh.stderr || pwsh.stdout);
});
