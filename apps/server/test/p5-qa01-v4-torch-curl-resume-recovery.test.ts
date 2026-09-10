import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

async function text(url: URL) {
  return readFile(url, "utf8");
}

test("v4 torch curl recovery uses persistent resumable official PyTorch wheels and preserves production boundaries", async () => {
  const scriptUrl = new URL(
    "../../../tools/P5_QA01_V4_TORCH_CURL_RESUME_RECOVERY.ps1",
    import.meta.url,
  );
  const script = await text(scriptUrl);

  for (const token of [
    "P5_QA01_V4_TORCH_CURL_RESUME_RECOVERY_PLAN=PASS",
    "transport=CURL_OFFICIAL_R2_PERSISTENT_PART_RESUME",
    "download-r2.pytorch.org",
    "torch-2.9.1%2Bcu128-cp310-cp310-win_amd64.whl",
    "torchvision-0.24.1%2Bcu128-cp310-cp310-win_amd64.whl",
    "--continue-at",
    "--retry-all-errors",
    "--ssl-revoke-best-effort",
    "wheel_archive_integrity=ZIP_TEST_PLUS_METADATA",
    "mirror_fallback=DISABLED",
    "WHEEL_ARCHIVE_VERIFY=PASS",
    "zipfile.ZipFile",
    "zf.testzip()",
    "2.9.1+cu128",
    "0.24.1+cu128",
    "V4_INSTALL_LOCAL_TORCH_WHEELS",
    "TORCH_RUNTIME_VERIFY=PASS",
    "torch.cuda.is_available()",
    "video_path_scope=CALLER_SUPPLIED_UNICODE_SAFE",
    "a322cd09820af0fe7d3092101d7660787853c7b2979c7e207c3be5e0bf4778aa",
    "5601155de9c09cc1e2ee45fbf147e21410d714a5",
    "P5_QA01_V4_ACCESS_PROBE_RECOVERY_FINAL.ps1",
  ]) {
    assert.ok(script.includes(token), `missing token: ${token}`);
  }

  assert.doesNotMatch(script, /mirrors\.aliyun|pypi\.tuna|hf-mirror/i);
  assert.doesNotMatch(script, /--ssl-no-revoke/);
  assert.doesNotMatch(script, /git\s+(reset|clean|stash\s+pop)/i);
  assert.doesNotMatch(script, /F:\\1/);

  for (const ch of script) {
    assert.ok(ch.charCodeAt(0) <= 127, "runner must remain ASCII-only for Windows PowerShell 5.1");
  }

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

  const plan = spawnSync("pwsh", ["-NoProfile", "-File", scriptUrl.pathname, "-PlanOnly"], {
    encoding: "utf8",
  });
  assert.equal(plan.status, 0, plan.stdout + plan.stderr);
  assert.match(plan.stdout, /P5_QA01_V4_TORCH_CURL_RESUME_RECOVERY_PLAN=PASS/);
});
