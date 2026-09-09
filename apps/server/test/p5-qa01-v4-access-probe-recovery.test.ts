import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

async function text(url: URL) {
  return readFile(url, "utf8");
}

test("v4 access-probe recovery line-patches the real tracked gate and the generated temp gate parses", async () => {
  const scriptUrl = new URL(
    "../../../tools/P5_QA01_V4_ACCESS_PROBE_RECOVERY_RUN.ps1",
    import.meta.url,
  );
  const script = await text(scriptUrl);

  for (const token of [
    "Patch-AccessProbeText",
    "LINE_SAFE_NO_REGEX_REPLACEMENT",
    "V4_ACCESS_PROBE_RECOVERY_PATCH=PASS",
    "temp_gate_parse=PASS",
    "P5_QA01_V4_ACCESS_PROBE_RECOVERY_PATCH_ONLY=PASS",
    "$probeOutput = @(& $PythonExe -B $probePath 2>&1)",
    "$probeExit = $LASTEXITCODE",
    "$probeOutput | ForEach-Object { Write-Host $_ }",
    "return [int]$probeExit",
    "ACCESS_PROBE_PATCH_SITE_MISMATCH",
    "ACCESS_PROBE_PATCH_STRUCTURE_MISMATCH",
    "P5_QA01_V4_VIDEO2TWIN_LOCAL_GATE.ps1",
    "-VideoPath $VideoPath",
    "[regex]::Split($Text, '\\r?\\n')",
  ]) {
    assert.ok(script.includes(token), `missing token: ${token}`);
  }

  // Recovery must not mutate the tracked Gate or use destructive Git cleanup.
  assert.doesNotMatch(script, /\[System\.IO\.File\]::WriteAllText\(\$gate,/);
  assert.doesNotMatch(script, /git\s+(reset|clean|stash\s+pop)/i);
  // Regression for the Windows parse failure: do not use Regex.Replace replacement
  // strings/MatchEvaluator to inject PowerShell containing '$' tokens.
  assert.doesNotMatch(script, /\[regex\]::Replace\(/);
  assert.doesNotMatch(script, /MatchEvaluator/);

  const scriptPath = fileURLToPath(scriptUrl);
  const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
  const executed = spawnSync(
    "pwsh",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      scriptPath,
      "-RepoRoot",
      repoRoot,
      "-Branch",
      "CI_PATCH_ONLY",
      "-ExpectedHead",
      "CI_PATCH_ONLY",
      "-VideoPath",
      "CI_PATCH_ONLY",
      "-PatchOnly",
    ],
    { encoding: "utf8" },
  );

  assert.equal(executed.status, 0, executed.stdout + executed.stderr);
  assert.match(executed.stdout, /V4_ACCESS_PROBE_RECOVERY_PATCH=PASS/);
  assert.match(executed.stdout, /patch_method=LINE_SAFE_NO_REGEX_REPLACEMENT/);
  assert.match(executed.stdout, /temp_gate_parse=PASS/);
  assert.match(executed.stdout, /P5_QA01_V4_ACCESS_PROBE_RECOVERY_PATCH_ONLY=PASS/);
});
