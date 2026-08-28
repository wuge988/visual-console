import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

async function text(url: URL) {
  return readFile(url, "utf8");
}

test("P5 D1 visual fail escalates to a read-only masked-inpaint capability gate", async () => {
  const [review, gate, registryText, siteText] = await Promise.all([
    text(new URL("../../../docs/p5/P5_QA01_KONTEXT_D1_VISUAL_REVIEW.md", import.meta.url)),
    text(new URL("../../../tools/P5_QA01_V2_D2_MASK_CAPABILITY_LOCAL_GATE.ps1", import.meta.url)),
    text(new URL("../../../config/workflows/registry.json", import.meta.url)),
    text(new URL("../../../config/sites/drift-curio.json", import.meta.url)),
  ]);

  for (const token of [
    "D1_RUNTIME_PASS",
    "D1_VISUAL_FAIL",
    "IDENTITY_MUCH_BETTER",
    "SCENE_REALISM_FAIL",
    "D2_MASK_ESCALATION_REQUIRED",
    "candidate SHA256: `d3c06f44e219d20aa964000d8c5bfa85f6adbce8e4f644f72451378ecb502cce`",
    "Do not continue with repeated whole-frame Kontext denoise tuning",
    "reassert the protected SC01 core deterministically",
  ]) {
    assert.match(review, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  const registry = JSON.parse(registryText);
  const site = JSON.parse(siteText);
  const qa01 = registry.workflows.find((row: any) => row.code === "QA01");
  assert.equal(qa01.workflow_status, "NOT_REGISTERED");
  assert.equal(qa01.executable, false);
  assert.equal(site.enabled_workflows.includes("QA01"), false);

  for (const token of [
    "VAEEncodeForInpaint",
    "SetLatentNoiseMask",
    "InpaintModelConditioning",
    "preferred_mask_runtime",
    "mask_runtime_ready",
    "SC01 alpha -> protected core + integration band -> masked environment generation -> deterministic protected-core reassertion",
    "probe_mode = \"READ_ONLY\"",
    "production_mutation = \"NONE\"",
    "QA01_MUST_REMAIN_DISABLED_DURING_D2_CAPABILITY_GATE",
    "QA01_REGISTRY_MUST_REMAIN_FAIL_CLOSED",
  ]) {
    assert.match(gate, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.doesNotMatch(gate, /git\s+(reset|clean|stash\s+pop)/i);
  assert.doesNotMatch(gate, /Invoke-WebRequest[^\n]+huggingface|curl\.exe|aria2c/i);
  assert.doesNotMatch(gate, /archive_history|destinations\.aquarium|Manifest/i);

  const pwsh = spawnSync(
    "pwsh",
    [
      "-NoProfile",
      "-Command",
      '$p="../../tools/P5_QA01_V2_D2_MASK_CAPABILITY_LOCAL_GATE.ps1"; $t=[IO.File]::ReadAllText($p,[Text.Encoding]::UTF8); $tok=$null; $err=$null; [System.Management.Automation.Language.Parser]::ParseInput($t,[ref]$tok,[ref]$err)|Out-Null; if($err.Count -gt 0){$err|%{Write-Error ("${p}: "+$_.Message)}; exit 1}',
    ],
    { encoding: "utf8" },
  );
  assert.equal(pwsh.status, 0, pwsh.stderr || pwsh.stdout);
});
