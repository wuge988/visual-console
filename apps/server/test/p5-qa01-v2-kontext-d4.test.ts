import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

async function text(url: URL) { return readFile(url, "utf8"); }

test("P5 D4 separates environment realism, geometry-locked photometry, and contact repair", async () => {
  const [python, wrapper, registryText, siteText] = await Promise.all([
    text(new URL("../../../tools/p5_qa01_kontext_d4_eval.py", import.meta.url)),
    text(new URL("../../../tools/P5_QA01_V2_KONTEXT_D4_LOCAL_GATE.ps1", import.meta.url)),
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
    'PRIOR_D31_HEAD = "8ad38c80f5a24c2911984266a9e6b5007a03a728"',
    'EXPECTED_D31_FINAL_SHA256 = "1955e5ac8d7ba7c3623509f3da13636a55bc0718549115b0c90089cab99109f4"',
    "ENV_DENOISE = 0.90",
    "CONTACT_DENOISE = 0.58",
    "WET_BRIGHTNESS_BASE = 0.76",
    "environment_editable_mask.png",
    "wet_core_alpha_geometry_exact",
    "photometric_core_exact_pixel_reassertion",
    '"class_type": "VAEEncode"',
    '"class_type": "SetLatentNoiseMask"',
    '"latent_image": ["16", 0]',
    "QA01_MUST_REMAIN_DISABLED_DURING_KONTEXT_D4_EVAL",
    "QA01_REGISTRY_MUST_REMAIN_FAIL_CLOSED",
    '"production_mutation": "NONE"',
  ]) assert.ok(python.includes(token), token);

  assert.doesNotMatch(python, /"class_type":\s*"VAEEncodeForInpaint"/);
  assert.doesNotMatch(python, /archive_history\s*\.\s*append|destinations\[\s*["']aquarium["']\s*\]\s*=|write_text\([^\n]*manifest/i);

  for (const token of [
    "SAFETY_BRANCH=",
    "switch --detach",
    "P5_D4_PYTHON_BOOTSTRAP=TOOLS_DIR_INSERTED",
    "$python -B $bootstrap",
    "PRIOR_D31_EVIDENCE_DIR_NOT_FOUND",
    "Start-Process $review",
  ]) assert.ok(wrapper.includes(token), token);
  assert.doesNotMatch(wrapper, /git\s+(reset|clean|stash\s+pop)/i);

  const py = spawnSync("python", ["-m", "py_compile", "../../tools/p5_qa01_kontext_d4_eval.py"], { encoding: "utf8" });
  assert.equal(py.status, 0, py.stderr || py.stdout);

  const pwsh = spawnSync("pwsh", ["-NoProfile", "-Command", '$p="../../tools/P5_QA01_V2_KONTEXT_D4_LOCAL_GATE.ps1"; $t=[IO.File]::ReadAllText($p,[Text.Encoding]::UTF8); $tok=$null; $err=$null; [System.Management.Automation.Language.Parser]::ParseInput($t,[ref]$tok,[ref]$err)|Out-Null; if($err.Count -gt 0){$err|%{Write-Error $_.Message}; exit 1}'], { encoding: "utf8" });
  assert.equal(pwsh.status, 0, pwsh.stderr || pwsh.stdout);
});