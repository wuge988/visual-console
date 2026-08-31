import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

async function text(url: URL) { return readFile(url, "utf8"); }

test("P5 D5.4 forces staged semantic foreground anchors while preserving anti-replication and production fail-closed state", async () => {
  const [python, wrapper, registryText, siteText] = await Promise.all([
    text(new URL("../../../tools/p5_qa01_kontext_d54_eval.py", import.meta.url)),
    text(new URL("../../../tools/P5_QA01_V2_KONTEXT_D54_LOCAL_GATE.ps1", import.meta.url)),
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
    'EXPECTED_D53_FINAL_SHA256 = "79c78c8ba14f168c96b112ba50ccee27dedea168b13ebb36156e51838dd99117"',
    'EXPECTED_REALISM_BOARD_SHA256 = "53be649505d76cce1980b97ae77996af410a5b08844f0316a5e124c3c7c17f3c"',
    'EXPECTED_REFERENCE_CANVAS_SHA256 = "60d86a36eed1581a00c75890c330dbbbf46243b2a802fa1d2955335d51d88c05"',
    "MAX_UNION_EDITABLE_SUBJECT_RATIO = 0.32",
    "MIN_UNCHANGED_SUBJECT_RATIO = 0.68",
    "FAIL_SEMANTIC_OCCLUSION_INSUFFICIENT",
    '"mode": "staged_semantic_foreground_anchors"',
    '"hardscape_foreground_occlusion_required": True',
    '"substrate_partial_burial_required": True',
    '"epiphyte_silhouette_overlap_required": True',
    '"contact_shadow_coherence_required": True',
    '"parameter_only_d53_retry_forbidden": True',
    '"whole_subject_repaint_forbidden": True',
    '"donor_scene_direct_pixels_passed_to_comfy": False',
    '"production_mutation": "NONE"',
    "D54_UNION_EDITABLE_SUBJECT_BUDGET_EXCEEDED",
    "D54_CRITICAL_LANDMARK_ANCHOR_OVERLAP",
    "D54_STAGE_CHANGED_OUTSIDE_ANCHOR",
    "D54_OUTSIDE_ANCHOR_UNION_CHANGED",
    "D54_CRITICAL_LANDMARK_REASSERTION_MISMATCH",
    "hardscape_anchor_mask.png",
    "epiphyte_anchor_mask.png",
    "coherence_anchor_mask.png",
    "anchor_union_mask.png",
    "critical_landmark_lock_mask.png",
    "actual_delta_mask.png",
    "QA01_MUST_REMAIN_DISABLED_DURING_KONTEXT_D54_EVAL",
  ]) assert.ok(python.includes(token), token);

  assert.match(python, /stage_specs = \[/);
  assert.match(python, /\("hardscape"/);
  assert.match(python, /\("epiphyte"/);
  assert.match(python, /\("coherence"/);
  assert.match(python, /localized = Image\.composite\(raw, base, mask\)/);
  assert.match(python, /final = Image\.composite\(wet, localized, critical\)/);
  assert.doesNotMatch(python, /copy_input\([^\n]*scene_reference/i);
  assert.doesNotMatch(python, /archive_history\s*\.\s*append|destinations\[\s*["']aquarium["']\s*\]\s*=|write_text\([^\n]*manifest/i);

  for (const token of [
    "SAFETY_BRANCH=",
    "switch --detach",
    "PRIOR_D53_EVIDENCE_DIR_NOT_FOUND",
    "P5_D54_PYTHON_BOOTSTRAP=TOOLS_DIR_INSERTED",
    "$python -B $bootstrap",
    "Start-Process $review",
  ]) assert.ok(wrapper.includes(token), token);
  assert.doesNotMatch(wrapper, /git\s+(reset|clean|stash\s+pop)/i);
  assert.equal(Buffer.byteLength(wrapper, "utf8"), wrapper.length, "D5.4 Windows launcher must remain ASCII-only");

  const py = spawnSync("python", ["-m", "py_compile", "../../tools/p5_qa01_kontext_d54_eval.py"], { encoding: "utf8" });
  assert.equal(py.status, 0, py.stderr || py.stdout);

  const pwsh = spawnSync("pwsh", ["-NoProfile", "-Command", '$p="../../tools/P5_QA01_V2_KONTEXT_D54_LOCAL_GATE.ps1"; $t=[IO.File]::ReadAllText($p,[Text.Encoding]::UTF8); $tok=$null; $err=$null; [System.Management.Automation.Language.Parser]::ParseInput($t,[ref]$tok,[ref]$err)|Out-Null; if($err.Count -gt 0){$err|%{Write-Error $_.Message}; exit 1}'], { encoding: "utf8" });
  assert.equal(pwsh.status, 0, pwsh.stderr || pwsh.stdout);
});
