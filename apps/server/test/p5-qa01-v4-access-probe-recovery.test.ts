import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

async function text(url: URL) {
  return readFile(url, "utf8");
}

test("v4 recovery isolates Hugging Face probe stderr, patches revocation-offline download, and parses the generated temp gate", async () => {
  const scriptUrl = new URL(
    "../../../tools/P5_QA01_V4_ACCESS_PROBE_RECOVERY_RUN.ps1",
    import.meta.url,
  );
  const script = await text(scriptUrl);

  for (const token of [
    "Patch-AccessProbeText",
    "Patch-RevocationOfflineDownloadText",
    "LINE_SAFE_START_PROCESS_STREAM_ISOLATION",
    "hf_probe_stderr_isolation=PASS",
    "SCHANNEL_REVOCATION_OFFLINE_RESILIENT_PINNED_SHA256",
    "V4_ACCESS_PROBE_RECOVERY_PATCH=PASS",
    "temp_gate_parse=PASS",
    "P5_QA01_V4_ACCESS_PROBE_RECOVERY_PATCH_ONLY=PASS",
    "$probeProcess = Start-Process -FilePath $PythonExe",
    "-RedirectStandardOutput $probeStdout",
    "-RedirectStandardError $probeStderr",
    "return [int]$probeProcess.ExitCode",
    "$env:HF_HUB_DISABLE_SYMLINKS_WARNING = '1'",
    "ACCESS_PROBE_NATIVE_STDERR_MERGE_FORBIDDEN",
    "ACCESS_PROBE_PATCH_SITE_MISMATCH",
    "ACCESS_PROBE_PATCH_STRUCTURE_MISMATCH",
    "UV_DOWNLOAD_PATCH_SITE_MISMATCH",
    "--ssl-revoke-best-effort",
    "--ssl-no-revoke",
    "V4_UV_DOWNLOAD_FAILED",
    "P5_QA01_V4_VIDEO2TWIN_LOCAL_GATE.ps1",
    "-VideoPath $VideoPath",
    "[regex]::Split($Text, '\\r?\\n')",
  ]) {
    assert.ok(script.includes(token), `missing token: ${token}`);
  }

  // Recovery must not mutate the tracked Gate or use destructive Git cleanup.
  assert.doesNotMatch(script, /\[System\.IO\.File\]::WriteAllText\(\$gate,/);
  assert.doesNotMatch(script, /git\s+(reset|clean|stash\s+pop)/i);

  // Regression for Windows PowerShell 5.1: native stderr must never be merged
  // into the Success/Error streams with 2>&1 inside the injected probe path.
  assert.doesNotMatch(
    script,
    /\$probeOutput\s*=\s*@\(& \$PythonExe -B \$probePath 2>&1\)/,
  );

  // Regression for prior malformed-temp-gate failure: do not use Regex.Replace
  // replacement strings/MatchEvaluator to inject PowerShell containing '$' tokens.
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
  assert.match(
    executed.stdout,
    /patch_method=LINE_SAFE_START_PROCESS_STREAM_ISOLATION/,
  );
  assert.match(executed.stdout, /hf_probe_stderr_isolation=PASS/);
  assert.match(
    executed.stdout,
    /uv_download_patch=SCHANNEL_REVOCATION_OFFLINE_RESILIENT_PINNED_SHA256/,
  );
  assert.match(executed.stdout, /temp_gate_parse=PASS/);
  assert.match(
    executed.stdout,
    /P5_QA01_V4_ACCESS_PROBE_RECOVERY_PATCH_ONLY=PASS/,
  );
});
