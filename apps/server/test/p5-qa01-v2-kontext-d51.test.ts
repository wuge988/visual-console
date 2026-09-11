import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

async function text(url: URL) { return readFile(url, "utf8"); }

test("P5 D5.1 replaces experimental chained multi-reference latents with a stitched single-reference canvas and remains fail-closed", async () => {
  const [python, wrapper, registryText, siteText] = await Promise.all([
    text(new URL("../../../tools/p5_qa01_kontext_d51_eval.py", import.meta.url)),
    text(new URL("../../../tools/P5_QA01_V2_KONTEXT_D51_LOCAL_GATE.ps1", import.meta.url)),
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
    "REFERENCE_CANVAS_WIDTH = 1536",
    "REFERENCE_CANVAS_HEIGHT = 768",
    "left_role\": \"exact_sellable_driftwood_identity",
    "right_role\": \"photographic_realism_exemplar_only_no_layout_copy",
    '"class_type": "ReferenceLatent"',
    "STITCHED_REFERENCE_CANVAS_SINGLE_REFERENCE_LATENT_PLUS_SetLatentNoiseMask",
    "OFFICIAL_COMPAT_STITCHED_CANVAS_SINGLE_REFERENCE_LATENT",
    "QA01_MUST_REMAIN_DISABLED_DURING_KONTEXT_D51_EVAL",
    '"production_mutation": "NONE"',
    "compact_execution_error",
    "D51_COMFY_RUNTIME_ERROR:",
    "runtime_diagnostics=SANITIZED_NO_TENSOR_DUMP",
  ]) assert.ok(python.includes(token), token);

  assert.doesNotMatch(python, /FluxKontextMultiReferenceLatentMethod/);
  assert.doesNotMatch(python, /json\.dumps\(status\b/);
  assert.match(python, /for key in \("prompt_id", "node_id", "node_type", "exception_type", "exception_message"\)/);
  assert.doesNotMatch(python, /archive_history\s*\.\s*append|destinations\[\s*["']aquarium["']\s*\]\s*=|write_text\([^\n]*manifest/i);

  for (const token of [
    "SAFETY_BRANCH=",
    "switch --detach",
    "SCENE_REFERENCE_PATH_REQUIRED",
    "P5_D51_PYTHON_BOOTSTRAP=TOOLS_DIR_INSERTED",
    "$python -B $bootstrap",
    "Start-Process $review",
  ]) assert.ok(wrapper.includes(token), token);
  assert.doesNotMatch(wrapper, /git\s+(reset|clean|stash\s+pop)/i);
  assert.equal(Buffer.byteLength(wrapper, "utf8"), wrapper.length, "D5.1 Windows launcher must remain ASCII-only");

  const py = spawnSync("python", ["-m", "py_compile", "../../tools/p5_qa01_kontext_d51_eval.py"], { encoding: "utf8" });
  assert.equal(py.status, 0, py.stderr || py.stdout);

  const pwsh = spawnSync("pwsh", ["-NoProfile", "-Command", '$p="../../tools/P5_QA01_V2_KONTEXT_D51_LOCAL_GATE.ps1"; $t=[IO.File]::ReadAllText($p,[Text.Encoding]::UTF8); $tok=$null; $err=$null; [System.Management.Automation.Language.Parser]::ParseInput($t,[ref]$tok,[ref]$err)|Out-Null; if($err.Count -gt 0){$err|%{Write-Error $_.Message}; exit 1}'], { encoding: "utf8" });
  assert.equal(pwsh.status, 0, pwsh.stderr || pwsh.stdout);
});
