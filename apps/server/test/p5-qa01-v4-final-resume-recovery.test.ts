import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

async function text(url: URL) {
  return readFile(url, "utf8");
}

test("v4 final resume bypasses PowerShell native quote loss for GPU verify", async () => {
  const scriptUrl = new URL(
    "../../../tools/P5_QA01_V4_FINAL_RESUME_RECOVERY.ps1",
    import.meta.url,
  );
  const gateUrl = new URL(
    "../../../tools/P5_QA01_V4_VIDEO2TWIN_LOCAL_GATE.ps1",
    import.meta.url,
  );
  const script = await text(scriptUrl);
  const gate = await text(gateUrl);

  for (const token of [
    "P5_QA01_V4_FINAL_RESUME_RECOVERY_PLAN=PASS",
    "Patch-AccessProbeText",
    "Patch-RevocationOfflineDownloadText",
    "Patch-GpuRuntimeVerifyText",
    "GPU_VERIFY_PATCH_SITE_MISMATCH",
    "GPU_VERIFY_INLINE_C_REMAINS",
    "TEMP_PY_FILE_BASE64_NO_NATIVE_QUOTE_TRANSIT",
    "[Convert]::FromBase64String($GpuProbeBase64)",
    "Run-Checked ''V4_VERIFY_GPU_RUNTIME'' $python @(''-B'',$gpuProbePath)",
    "RUNTIME_MARKER=PASS",
    "DIRECT_GPU_RUNTIME_VERIFY_FAILED",
    "PROCESS_SCOPED_LOCAL_URL_REWRITE",
    "59fe356bceab74ef7d5839b68aba232bce20e14d",
    "a322cd09820af0fe7d3092101d7660787853c7b2979c7e207c3be5e0bf4778aa",
    "qa01_enabled=false",
    "production_mutation=NONE",
  ]) {
    assert.ok(script.includes(token), `missing token: ${token}`);
  }

  // This is the exact Windows failure site being recovered. The tracked gate is
  // intentionally left unchanged; the recovery runner patches only a temp copy.
  assert.match(gate, /\$verify = 'import torch, gsplat;/);
  assert.match(
    gate,
    /Run-Checked 'V4_VERIFY_GPU_RUNTIME' \$python @\('-c',\$verify\)/,
  );

  const b64Match = script.match(/\$GpuProbeBase64 = '([^']+)'/);
  assert.ok(b64Match, "GPU probe base64 missing");
  const decoded = Buffer.from(b64Match[1], "base64").toString("utf8");
  assert.match(decoded, /print\("runtime_imports=PASS"\)/);
  assert.match(decoded, /from sam2\.automatic_mask_generator import SAM2AutomaticMaskGenerator/);
  assert.match(decoded, /from vggt\.models\.vggt import VGGT/);
  assert.match(decoded, /if not torch\.cuda\.is_available\(\):/);
  assert.doesNotMatch(decoded, /eval\(|exec\(/);

  // Production and source boundaries remain fail closed.
  assert.doesNotMatch(script, /git\s+(reset|clean|stash\s+pop)/i);
  assert.doesNotMatch(script, /F:\\1/);
  assert.doesNotMatch(script, /facebook\/VGGT-1B['"]/);
  assert.doesNotMatch(script, /WriteAllText\(\$gate/);

  for (const ch of script) {
    assert.ok(
      ch.charCodeAt(0) <= 127,
      "runner must remain ASCII-only for Windows PowerShell 5.1",
    );
  }

  const scriptPath = fileURLToPath(scriptUrl);
  const parsed = spawnSync(
    "pwsh",
    [
      "-NoProfile",
      "-Command",
      `$p=[System.Uri]::UnescapeDataString('${scriptUrl.pathname}'); if ($IsWindows -eq $false -and $p -match '^/[A-Za-z]:') { $p=$p.Substring(1) }; $t=[IO.File]::ReadAllText($p,[Text.Encoding]::UTF8); $tokens=$null; $errors=$null; [System.Management.Automation.Language.Parser]::ParseInput($t,[ref]$tokens,[ref]$errors)|Out-Null; if($errors.Count){$errors|%{$_.Message};exit 1}`,
    ],
    { encoding: "utf8" },
  );
  assert.equal(parsed.status, 0, parsed.stdout + parsed.stderr);

  const plan = spawnSync(
    "pwsh",
    ["-NoProfile", "-File", scriptPath, "-PlanOnly"],
    { encoding: "utf8" },
  );
  assert.equal(plan.status, 0, plan.stdout + plan.stderr);
  assert.match(plan.stdout, /P5_QA01_V4_FINAL_RESUME_RECOVERY_PLAN=PASS/);
  assert.match(plan.stdout, /gpu_verify=TEMP_PY_FILE_BASE64_NO_NATIVE_QUOTE_TRANSIT/);
  assert.match(plan.stdout, /recon3d_clone=PROCESS_SCOPED_LOCAL_URL_REWRITE/);
});
