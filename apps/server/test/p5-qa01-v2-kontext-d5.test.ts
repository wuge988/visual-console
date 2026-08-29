import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

async function text(url: URL) { return readFile(url, "utf8"); }

test("P5 D5 uses a second user-approved scene reference for realism while keeping QA01 fail-closed", async () => {
  const [python, wrapper, registryText, siteText] = await Promise.all([
    text(new URL("../../../tools/p5_qa01_kontext_d5_eval.py", import.meta.url)),
    text(new URL("../../../tools/P5_QA01_V2_KONTEXT_D5_LOCAL_GATE.ps1", import.meta.url)),
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
    'PRIOR_D4_HEAD = "4d84a5f63b82322cb9c1b247fd19cb7f7cd126a4"',
    'EXPECTED_D4_FINAL_SHA256 = "904acda038d220a35046776dc217ef0e84b3eac7fc3726872dfcb9ec465fb9d3"',
    'MULTI_REFERENCE_METHOD = "index_timestep_zero"',
    '"class_type": "ReferenceLatent"',
    '"class_type": "FluxKontextMultiReferenceLatentMethod"',
    '"conditioning": ["8", 0], "latent": ["19", 0]',
    '"reference_latents_method": MULTI_REFERENCE_METHOD',
    "photographic_realism_exemplar_only_no_layout_copy",
    "scene_reference_role=PHOTOGRAPHIC_REALISM_ONLY_NO_LAYOUT_COPY",
    "QA01_MUST_REMAIN_DISABLED_DURING_KONTEXT_D5_EVAL",
    "QA01_REGISTRY_MUST_REMAIN_FAIL_CLOSED",
    '"production_mutation": "NONE"',
  ]) assert.ok(python.includes(token), token);

  assert.doesNotMatch(python, /archive_history\s*\.\s*append|destinations\[\s*["']aquarium["']\s*\]\s*=|write_text\([^\n]*manifest/i);

  for (const token of [
    "SAFETY_BRANCH=",
    "switch --detach",
    "Resolve-SceneReference",
    "System.Windows.Forms.OpenFileDialog",
    "Select approved Aquarium realism reference for D5 evaluation",
    "P5_D5_PYTHON_BOOTSTRAP=TOOLS_DIR_INSERTED",
    "$python -B $bootstrap",
    "PRIOR_D4_EVIDENCE_DIR_NOT_FOUND",
    "Start-Process $review",
  ]) assert.ok(wrapper.includes(token), token);
  assert.doesNotMatch(wrapper, /git\s+(reset|clean|stash\s+pop)/i);

  // The local launcher is intentionally ASCII-only because the standard gate handoff
  // writes fetched scripts as UTF-8 without BOM, which Windows PowerShell 5.1 may
  // otherwise decode using the legacy ANSI code page and corrupt quoted strings.
  assert.equal(Buffer.byteLength(wrapper, "utf8"), wrapper.length, "D5 Windows launcher must remain ASCII-only for PS5.1 no-BOM handoff");

  const py = spawnSync("python", ["-m", "py_compile", "../../tools/p5_qa01_kontext_d5_eval.py"], { encoding: "utf8" });
  assert.equal(py.status, 0, py.stderr || py.stdout);

  const pwsh = spawnSync("pwsh", ["-NoProfile", "-Command", '$p="../../tools/P5_QA01_V2_KONTEXT_D5_LOCAL_GATE.ps1"; $t=[IO.File]::ReadAllText($p,[Text.Encoding]::UTF8); $tok=$null; $err=$null; [System.Management.Automation.Language.Parser]::ParseInput($t,[ref]$tok,[ref]$err)|Out-Null; if($err.Count -gt 0){$err|%{Write-Error $_.Message}; exit 1}'], { encoding: "utf8" });
  assert.equal(pwsh.status, 0, pwsh.stderr || pwsh.stdout);
});
