import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

async function text(url: URL) {
  return readFile(url, "utf8");
}

test("P5 Kontext D1 records D0 visual rejection and remains evaluation-only", async () => {
  const [python, wrapper, review, registryText, siteText] = await Promise.all([
    text(new URL("../../../tools/p5_qa01_kontext_d1_eval.py", import.meta.url)),
    text(new URL("../../../tools/P5_QA01_V2_KONTEXT_D1_LOCAL_GATE.ps1", import.meta.url)),
    text(new URL("../../../docs/p5/P5_QA01_KONTEXT_D0_VISUAL_REVIEW.md", import.meta.url)),
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
    "D0_VISUAL_FAIL",
    "IDENTITY_DRIFT",
    "SCENE_REALISM_BELOW_BAR",
    "candidate SHA256: `decc03e580b60d9f3223a603967a7ffbf28d401303627c1d64abc3ec5533de82`",
    "masked/inpaint identity protection",
  ]) {
    assert.match(review, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  for (const token of [
    "SEED = 52073111",
    "STEPS = 24",
    "GUIDANCE = 2.2",
    "DENOISE = 0.62",
    "eval_input_scaffold.png",
    "scaffold_preserves_exact_sc01_pixels",
    "ReferenceLatent",
    "latent_image\": [\"16\", 0]",
    "d0_visual_result\": \"FAIL\"",
    "production_authorized\": False",
    "qa01_enabled\": False",
    "Keep at least eighty percent of visible wood surface exposed",
    "never cover broad wood surfaces with a moss blanket",
    "front glass",
  ]) {
    assert.match(python, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(python, /latest_verified\(manifest, "SC01", "cutout"\)/);
  assert.match(python, /QA01_MUST_REMAIN_DISABLED_DURING_KONTEXT_D1_EVAL/);
  assert.match(python, /QA01_REGISTRY_MUST_REMAIN_FAIL_CLOSED/);
  assert.doesNotMatch(python, /archive_history\s*\.\s*append|destinations\[\s*["']aquarium["']\s*\]\s*=|write_text\([^\n]*manifest/i);

  assert.match(wrapper, /SAFETY_BRANCH=/);
  assert.match(wrapper, /switch --detach/);
  assert.match(wrapper, /p5_qa01_kontext_d1_eval\.py/);
  assert.doesNotMatch(wrapper, /git\s+(reset|clean|stash\s+pop)/i);

  const py = spawnSync("python", ["-m", "py_compile", "../../tools/p5_qa01_kontext_d1_eval.py"], { encoding: "utf8" });
  assert.equal(py.status, 0, py.stderr || py.stdout);

  const pwsh = spawnSync(
    "pwsh",
    [
      "-NoProfile",
      "-Command",
      '$p="../../tools/P5_QA01_V2_KONTEXT_D1_LOCAL_GATE.ps1"; $t=[IO.File]::ReadAllText($p,[Text.Encoding]::UTF8); $tok=$null; $err=$null; [System.Management.Automation.Language.Parser]::ParseInput($t,[ref]$tok,[ref]$err)|Out-Null; if($err.Count -gt 0){$err|%{Write-Error ("${p}: "+$_.Message)}; exit 1}',
    ],
    { encoding: "utf8" },
  );
  assert.equal(pwsh.status, 0, pwsh.stderr || pwsh.stdout);
});
