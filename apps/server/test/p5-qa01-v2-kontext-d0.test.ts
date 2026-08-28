import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

async function text(url: URL) {
  return readFile(url, "utf8");
}

test("P5 Kontext D0 stays evaluation-only, exact-piece anchored, and fail-closed", async () => {
  const [python, wrapper, registryText, siteText] = await Promise.all([
    text(new URL("../../../tools/p5_qa01_kontext_d0_eval.py", import.meta.url)),
    text(new URL("../../../tools/P5_QA01_V2_KONTEXT_D0_LOCAL_GATE.ps1", import.meta.url)),
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
    "VERIFIED_SC01",
    "source_sc01_sha256",
    "Identity",
    "no_prefab_background",
    "evaluation_only",
    "production_authorized",
    "qa01_enabled",
    "flux1-dev-kontext_fp8_scaled.safetensors",
    "ReferenceLatent",
    "FluxKontextImageScale",
    "ConditioningZeroOut",
    "KSampler",
    "PreviewImage",
    "52073101",
    "Preserve the driftwood's exact major silhouette",
  ]) {
    assert.match(python, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(python, /"evaluation_only": True/);
  assert.match(python, /"production_authorized": False/);
  assert.match(python, /"qa01_enabled": False/);
  assert.match(python, /QA01_MUST_REMAIN_DISABLED_DURING_KONTEXT_D0_EVAL/);
  assert.match(python, /QA01_REGISTRY_MUST_REMAIN_FAIL_CLOSED/);
  assert.match(python, /latest_verified\(manifest, "SC01", "cutout"\)/);
  assert.match(python, /--lowvram/);
  assert.match(python, /--cpu-vae/);
  assert.doesNotMatch(python, /archive_history\s*\.\s*append|destinations\[\s*["']aquarium["']\s*\]\s*=|write_text\([^\n]*manifest/i);

  assert.match(wrapper, /SAFETY_BRANCH=/);
  assert.match(wrapper, /switch --detach/);
  assert.match(wrapper, /p5_qa01_kontext_d0_eval\.py/);
  assert.doesNotMatch(wrapper, /git\s+(reset|clean|stash\s+pop)/i);

  const py = spawnSync("python", ["-m", "py_compile", "tools/p5_qa01_kontext_d0_eval.py"], { encoding: "utf8" });
  assert.equal(py.status, 0, py.stderr || py.stdout);

  const pwsh = spawnSync(
    "pwsh",
    [
      "-NoProfile",
      "-Command",
      '$p="tools/P5_QA01_V2_KONTEXT_D0_LOCAL_GATE.ps1"; $t=[IO.File]::ReadAllText($p,[Text.Encoding]::UTF8); $tok=$null; $err=$null; [System.Management.Automation.Language.Parser]::ParseInput($t,[ref]$tok,[ref]$err)|Out-Null; if($err.Count -gt 0){$err|%{Write-Error ("${p}: "+$_.Message)}; exit 1}',
    ],
    { encoding: "utf8" },
  );
  assert.equal(pwsh.status, 0, pwsh.stderr || pwsh.stdout);
});
