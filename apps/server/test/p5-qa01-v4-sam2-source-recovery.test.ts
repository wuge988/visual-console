import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

async function text(url: URL) {
  return readFile(url, "utf8");
}

test("v4 SAM2 recovery uses exact official source and preseeded recon3d cache", async () => {
  const scriptUrl = new URL(
    "../../../tools/P5_QA01_V4_SAM2_SOURCE_RECOVERY.ps1",
    import.meta.url,
  );
  const script = await text(scriptUrl);

  for (const token of [
    "P5_QA01_V4_SAM2_SOURCE_RECOVERY_PLAN=PASS",
    "https://codeload.github.com/facebookresearch/sam2/zip/",
    "2b90b9f5ceec907a1c18123530e92e794ad901a4",
    "64becbca23f880e0056449377496da248a74da43",
    "78a634cddb19615c45601681ffbcd1f29af66f47",
    "065e469e27c2d3af40d51d072031e828692c799b",
    "3a3bef1e566d86c3ba0fd75f425530bc6505e9bf",
    "d9f4e515b0d161942bf2bb64560056b3efbe6dac",
    "SAM2_ARCHIVE_VERIFY=PASS",
    "SAM2_CRITICAL_BLOBS=PASS",
    "SAM2_BUILD_CUDA = '0'",
    "SAM2_RUNTIME_VERIFY=PASS",
    "runtime-py310-pt291-cu128-v1.json",
    "59fe356bceab74ef7d5839b68aba232bce20e14d",
    "PERSISTENT_PINNED_LOCAL_GIT_CACHE",
    "GIT_CONFIG_COUNT = '2'",
    "protocol.file.allow",
    "refs/heads/dc-pinned",
    "recon3d_clone_transport=PROCESS_SCOPED_LOCAL_URL_REWRITE",
    "5601155de9c09cc1e2ee45fbf147e21410d714a5",
    "a322cd09820af0fe7d3092101d7660787853c7b2979c7e207c3be5e0bf4778aa",
    "qa01_enabled=false",
    "production_mutation=NONE",
  ]) {
    assert.ok(script.includes(token), `missing token: ${token}`);
  }

  assert.doesNotMatch(script, /mirrors\.aliyun|pypi\.tuna|hf-mirror/i);
  assert.doesNotMatch(script, /git\s+(reset|clean|stash\s+pop)/i);
  assert.doesNotMatch(script, /F:\\1/);
  assert.doesNotMatch(script, /facebook\/VGGT-1B['"]/);

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
  assert.match(plan.stdout, /P5_QA01_V4_SAM2_SOURCE_RECOVERY_PLAN=PASS/);
  assert.match(plan.stdout, /sam2_integrity=ZIP_CRC_PLUS_CRITICAL_GIT_BLOBS/);
  assert.match(plan.stdout, /recon3d_clone=PROCESS_SCOPED_URL_REWRITE/);
});
