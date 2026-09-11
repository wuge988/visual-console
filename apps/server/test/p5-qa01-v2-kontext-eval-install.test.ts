import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

async function text(url: URL) {
  return readFile(url, "utf8");
}

test("P5 Kontext dev installer is resumable, identity-gated, and evaluation-only", async () => {
  const [installer, localGate, boundary, registryText, siteText] = await Promise.all([
    text(new URL("../../../tools/P5_QA01_V2_KONTEXT_EVAL_MODEL_INSTALL_GATE.ps1", import.meta.url)),
    text(new URL("../../../tools/P5_QA01_V2_KONTEXT_EVAL_MODEL_INSTALL_LOCAL_GATE.ps1", import.meta.url)),
    text(new URL("../../../docs/p5/P5_QA01_KONTEXT_DEV_EVAL_LICENSE_BOUNDARY.md", import.meta.url)),
    text(new URL("../../../config/workflows/registry.json", import.meta.url)),
    text(new URL("../../../config/sites/drift-curio.json", import.meta.url)),
  ]);

  const registry = JSON.parse(registryText);
  const site = JSON.parse(siteText);
  const qa01 = registry.workflows.find((row: any) => row.code === "QA01");

  assert.equal(qa01.workflow_status, "NOT_REGISTERED");
  assert.equal(qa01.executable, false);
  assert.equal(site.enabled_workflows.includes("QA01"), false);

  assert.match(boundary, /EVALUATION_ONLY \/ NON_PRODUCTION \/ QA01_DISABLED/);
  assert.match(boundary, /Non-Commercial License/);
  assert.match(boundary, /commercially licensed BFL route|another model\/runtime/i);

  assert.match(installer, /11904640136/);
  assert.match(installer, /630ba795ec64283b4230ea23cf79406c2c68b7c578229ed139f30043eadb30a2/);
  assert.match(installer, /335304388/);
  assert.match(installer, /afc8e28272cd15db3919bacdb6918ce9c1ed22e96cb12c4d5ed0fba823529e38/);
  assert.match(installer, /246144152/);
  assert.match(installer, /660c6f5b1abae9dc498ac2d21e1347d2abdb0cf6c0c0c8576cd796491d9a6cdd/);
  assert.match(installer, /5157348688/);
  assert.match(installer, /a498f0485dc9536735258018417c3fd7758dc3bccc0a645feaa472b34955557a/);

  assert.match(installer, /--continue-at/);
  assert.match(installer, /attempt_\$\{attempt\}_before_bytes/);
  assert.match(installer, /attempt_\$\{attempt\}_after_bytes/);
  assert.match(installer, /attempt_\$\{attempt\}_delta_bytes/);
  assert.match(installer, /Quarantine-Invalid/);
  assert.match(installer, /Test-Identity/);
  assert.match(installer, /Move-Item -LiteralPath \$part -Destination \$target/);
  assert.match(installer, /evaluation_only=\$true/);
  assert.match(installer, /production_authorized=\$false/);
  assert.match(installer, /QA01_MUST_REMAIN_DISABLED_DURING_KONTEXT_DEV_EVAL_INSTALL/);
  assert.doesNotMatch(installer, /Remove-Item|git\s+(reset|clean|stash\s+pop)/i);

  assert.match(localGate, /SAFETY_BRANCH=/);
  assert.match(localGate, /switch --detach/);
  assert.match(localGate, /P5_QA01_V2_KONTEXT_EVAL_MODEL_INSTALL_GATE\.ps1/);
  assert.doesNotMatch(localGate, /git\s+(reset|clean|stash\s+pop)/i);

  const pwsh = spawnSync(
    "pwsh",
    [
      "-NoProfile",
      "-Command",
      '$bad=$false; foreach($p in @("tools/P5_QA01_V2_KONTEXT_EVAL_MODEL_INSTALL_GATE.ps1","tools/P5_QA01_V2_KONTEXT_EVAL_MODEL_INSTALL_LOCAL_GATE.ps1")){ $t=[IO.File]::ReadAllText($p,[Text.Encoding]::UTF8); $tok=$null; $err=$null; [System.Management.Automation.Language.Parser]::ParseInput($t,[ref]$tok,[ref]$err)|Out-Null; if($err.Count -gt 0){$err|%{Write-Error ("${p}: "+$_.Message)}; $bad=$true} }; if($bad){exit 1}',
    ],
    { encoding: "utf8" },
  );
  assert.equal(pwsh.status, 0, pwsh.stderr || pwsh.stdout);
});
