import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

async function text(url: URL) {
  return readFile(url, "utf8");
}

test("v4 final resume v2 executes the real patch path under strict mode", async () => {
  const scriptUrl = new URL(
    "../../../tools/P5_QA01_V4_FINAL_RESUME_RECOVERY_V2.ps1",
    import.meta.url,
  );
  const script = await text(scriptUrl);

  for (const token of [
    "Set-StrictMode -Version Latest",
    "P5_QA01_V4_FINAL_RESUME_RECOVERY_V2_PATCH_ONLY=PASS",
    "strict_mode_verify_literal=PASS",
    "$callNeedle = 'Run-Checked ''V4_VERIFY_GPU_RUNTIME'' $python @(''-c'',$verify)'",
    "$patched.Contains($callNeedle)",
    "TEMP_PY_FILE_BASE64_NO_NATIVE_QUOTE_TRANSIT",
    "tracked_gate_mutation=NONE",
    "temp_gate_parse=PASS",
  ]) {
    assert.ok(script.includes(token), `missing token: ${token}`);
  }

  // Regression for the exact Windows failure: a backslash does not escape '$'
  // in a PowerShell double-quoted string. That form must never return.
  assert.doesNotMatch(script, /-match\s+"[^"\n]*\\\$verify/);

  // Production/source boundaries remain fail closed.
  assert.doesNotMatch(script, /git\s+(reset|clean|stash\s+pop)/i);
  assert.doesNotMatch(script, /facebook\/VGGT-1B['"]/);
  assert.doesNotMatch(script, /WriteAllText\(\$gate/);

  for (const ch of script) {
    assert.ok(ch.charCodeAt(0) <= 127, "runner must remain ASCII-only for Windows PowerShell 5.1");
  }

  const scriptPath = fileURLToPath(scriptUrl);
  const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

  // This is deliberately PatchOnly, not PlanOnly. It executes
  // Patch-AccessProbeText -> Patch-GpuRuntimeVerifyText -> writes the temp gate
  // -> parses the generated PowerShell. The prior unbound-$verify bug occurred
  // inside this exact runtime path and would fail this test under StrictMode.
  const patched = spawnSync(
    "pwsh",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      scriptPath,
      "-RepoRoot",
      repoRoot,
      "-PatchOnly",
    ],
    { encoding: "utf8" },
  );

  assert.equal(patched.status, 0, patched.stdout + patched.stderr);
  assert.match(patched.stdout, /V4_FINAL_RESUME_V2_PATCH=PASS/);
  assert.match(patched.stdout, /strict_mode_verify_literal=PASS/);
  assert.match(patched.stdout, /gpu_verify_patch=TEMP_PY_FILE_BASE64_NO_NATIVE_QUOTE_TRANSIT/);
  assert.match(patched.stdout, /temp_gate_parse=PASS/);
  assert.match(patched.stdout, /P5_QA01_V4_FINAL_RESUME_RECOVERY_V2_PATCH_ONLY=PASS/);
});
