import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

async function text(url: URL) { return readFile(url, "utf8"); }

test("P5 D3.1 repairs Stage 2 gray placeholder leakage with latent-preserving noise mask", async () => {
  const [python, wrapper, registryText, siteText] = await Promise.all([
    text(new URL("../../../tools/p5_qa01_kontext_d31_eval.py", import.meta.url)),
    text(new URL("../../../tools/P5_QA01_V2_KONTEXT_D31_LOCAL_GATE.ps1", import.meta.url)),
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
    'PRIOR_D3_HEAD = "11b2164a4bb017e45d3361d360bd986b611710dd"',
    'EXPECTED_STAGE1_SHA256 = "6bd58f363026e9a73edcd67b3403c7448f0fd484c1ec491c571bd86270410136"',
    'EXPECTED_BROKEN_D3_SHA256 = "d938ecb2e99fc7a25a9b809c06694661f457b0652edf87f30c0c430927d920f1"',
    "EXPECTED_STAGE2_EDITABLE_PIXELS = 138108",
    '"class_type": "VAEEncode"',
    '"class_type": "SetLatentNoiseMask"',
    '"samples": ["15", 0]',
    '"mask": ["14", 1]',
    '"latent_image": ["16", 0]',
    "stage2_gray_placeholder_source_removed=True",
    "reuse exact D3 Stage 1",
    "QA01_MUST_REMAIN_DISABLED_DURING_KONTEXT_D31_EVAL",
    "QA01_REGISTRY_MUST_REMAIN_FAIL_CLOSED",
    '"production_mutation": "NONE"',
  ]) assert.ok(python.includes(token), token);

  assert.doesNotMatch(python, /archive_history\s*\.\s*append|destinations\[\s*["']aquarium["']\s*\]\s*=|write_text\([^\n]*manifest/i);
  assert.doesNotMatch(python, /"class_type":\s*"VAEEncodeForInpaint"/);

  for (const token of [
    "SAFETY_BRANCH=",
    "switch --detach",
    "P5_D31_PYTHON_BOOTSTRAP=TOOLS_DIR_INSERTED",
    "$python -B $bootstrap",
    "PRIOR_D3_EVIDENCE_DIR_NOT_FOUND",
    "Start-Process $review",
  ]) assert.ok(wrapper.includes(token), token);
  assert.doesNotMatch(wrapper, /git\s+(reset|clean|stash\s+pop)/i);

  const py = spawnSync("python", ["-m", "py_compile", "../../tools/p5_qa01_kontext_d31_eval.py"], { encoding: "utf8" });
  assert.equal(py.status, 0, py.stderr || py.stdout);

  const pwsh = spawnSync("pwsh", ["-NoProfile", "-Command", '$p="../../tools/P5_QA01_V2_KONTEXT_D31_LOCAL_GATE.ps1"; $t=[IO.File]::ReadAllText($p,[Text.Encoding]::UTF8); $tok=$null; $err=$null; [System.Management.Automation.Language.Parser]::ParseInput($t,[ref]$tok,[ref]$err)|Out-Null; if($err.Count -gt 0){$err|%{Write-Error $_.Message}; exit 1}'], { encoding: "utf8" });
  assert.equal(pwsh.status, 0, pwsh.stderr || pwsh.stdout);
});
