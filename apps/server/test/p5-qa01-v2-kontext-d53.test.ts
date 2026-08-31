import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

async function text(url: URL) { return readFile(url, "utf8"); }

test("P5 D5.3 allows bounded ecological overlap while preserving critical identity and fail-closed production state", async () => {
  const [python, wrapper, registryText, siteText] = await Promise.all([
    text(new URL("../../../tools/p5_qa01_kontext_d53_eval.py", import.meta.url)),
    text(new URL("../../../tools/P5_QA01_V2_KONTEXT_D53_LOCAL_GATE.ps1", import.meta.url)),
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
    'EXPECTED_D52_FINAL_SHA256 = "2814de612fdbc45faa9e7e3fd2fbdab82aa1007e8df9996f768fefbe07b849f4"',
    'EXPECTED_REALISM_BOARD_SHA256 = "53be649505d76cce1980b97ae77996af410a5b08844f0316a5e124c3c7c17f3c"',
    "MAX_EDITABLE_SUBJECT_RATIO = 0.24",
    "MIN_IDENTITY_LOCK_SUBJECT_RATIO = 0.70",
    "D53_EDIT_MASK_MUST_CROSS_SUBJECT_BOUNDARY",
    "D53_EDITABLE_SUBJECT_BUDGET_EXCEEDED",
    "D53_IDENTITY_LOCK_TOO_SMALL",
    "D53_OUTSIDE_EMBEDDING_CHANGED",
    "D53_IDENTITY_LOCK_REASSERTION_MISMATCH",
    "FAIL_PHYSICAL_INTEGRATION_PASTED_ON",
    '"mode": "controlled_occlusion_integration"',
    '"substrate_partial_burial_required": True',
    '"load_bearing_stone_overlap_required": True',
    '"sparse_epiphyte_silhouette_overlap_allowed": True',
    '"whole_subject_repaint_forbidden": True',
    '"donor_scene_direct_pixels_passed_to_comfy": False',
    '"production_mutation": "NONE"',
    "QA01_MUST_REMAIN_DISABLED_DURING_KONTEXT_D53_EVAL",
    "critical_landmark_lock_mask.png",
    "identity_lock_mask.png",
    "actual_delta_mask.png",
  ]) assert.ok(python.includes(token), token);

  assert.match(python, /editable = ImageChops\.subtract\(editable, critical\)/);
  assert.match(python, /identity_lock = ImageChops\.subtract\(prior_core, editable\)/);
  assert.match(python, /localized = Image\.composite\(raw, base, editable\)/);
  assert.match(python, /final = Image\.composite\(wet, localized, lock\)/);
  assert.doesNotMatch(python, /copy_input\([^\n]*scene_reference/i);
  assert.doesNotMatch(python, /archive_history\s*\.\s*append|destinations\[\s*["']aquarium["']\s*\]\s*=|write_text\([^\n]*manifest/i);

  for (const token of [
    "SAFETY_BRANCH=",
    "switch --detach",
    "PRIOR_D52_EVIDENCE_DIR_NOT_FOUND",
    "P5_D53_PYTHON_BOOTSTRAP=TOOLS_DIR_INSERTED",
    "$python -B $bootstrap",
    "Start-Process $review",
  ]) assert.ok(wrapper.includes(token), token);
  assert.doesNotMatch(wrapper, /git\s+(reset|clean|stash\s+pop)/i);
  assert.equal(Buffer.byteLength(wrapper, "utf8"), wrapper.length, "D5.3 Windows launcher must remain ASCII-only");

  const py = spawnSync("python", ["-m", "py_compile", "../../tools/p5_qa01_kontext_d53_eval.py"], { encoding: "utf8" });
  assert.equal(py.status, 0, py.stderr || py.stdout);

  const pwsh = spawnSync("pwsh", ["-NoProfile", "-Command", '$p="../../tools/P5_QA01_V2_KONTEXT_D53_LOCAL_GATE.ps1"; $t=[IO.File]::ReadAllText($p,[Text.Encoding]::UTF8); $tok=$null; $err=$null; [System.Management.Automation.Language.Parser]::ParseInput($t,[ref]$tok,[ref]$err)|Out-Null; if($err.Count -gt 0){$err|%{Write-Error $_.Message}; exit 1}'], { encoding: "utf8" });
  assert.equal(pwsh.status, 0, pwsh.stderr || pwsh.stdout);
});
