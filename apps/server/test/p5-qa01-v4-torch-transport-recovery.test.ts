import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

async function text(url: URL) {
  return readFile(url, "utf8");
}

test("v4 torch recovery uses uv cache/retries and resumes the validated pipeline", async () => {
  const scriptUrl = new URL(
    "../../../tools/P5_QA01_V4_TORCH_TRANSPORT_RECOVERY.ps1",
    import.meta.url,
  );
  const script = await text(scriptUrl);

  for (const token of [
    "P5_QA01_V4_TORCH_TRANSPORT_RECOVERY_PLAN=PASS",
    "P5_QA01_V4_TORCH_TRANSPORT_RECOVERY=PASS",
    "UV_PIP_CACHE_RESILIENT",
    "$env:UV_HTTP_RETRIES = '20'",
    "$env:UV_HTTP_TIMEOUT = '180'",
    "$env:UV_HTTP_CONNECT_TIMEOUT = '30'",
    "$env:UV_CONCURRENT_DOWNLOADS = '1'",
    "$env:UV_LINK_MODE = 'copy'",
    "$env:UV_TORCH_BACKEND = 'cu128'",
    "'--torch-backend', 'cu128'",
    "'torch==2.9.1'",
    "'torchvision==0.24.1'",
    "V4_INSTALL_TORCH_CU128_UV",
    "V4_VERIFY_TORCH_CU128",
    "torch.__version__.startswith(\"2.9.1+cu128\")",
    "torchvision.__version__.startswith(\"0.24.1+cu128\")",
    "torch.cuda.is_available()",
    "Start-Process -FilePath $FilePath",
    "native_stream_mode=START_PROCESS_INHERITED_CONSOLE",
    "pip_system_temp_path=NOT_USED_FOR_TORCH_DOWNLOAD",
    "V4_RESUME_VIDEO2TWIN_PIPELINE",
    "5601155de9c09cc1e2ee45fbf147e21410d714a5",
    "a322cd09820af0fe7d3092101d7660787853c7b2979c7e207c3be5e0bf4778aa",
  ]) {
    assert.ok(script.includes(token), `missing token: ${token}`);
  }

  assert.doesNotMatch(script, /git\s+(reset|clean|stash\s+pop)/i);
  assert.doesNotMatch(script, /Remove-Item[^\n]*DRIFT_CURIO_VISUAL_PIPELINE/i);

  const scriptPath = fileURLToPath(scriptUrl);
  const parsed = spawnSync(
    "pwsh",
    [
      "-NoProfile",
      "-Command",
      `$t=[IO.File]::ReadAllText('${scriptPath.replaceAll("'", "''")}',[Text.Encoding]::UTF8);$tok=$null;$err=$null;[System.Management.Automation.Language.Parser]::ParseInput($t,[ref]$tok,[ref]$err)|Out-Null;if($err.Count){$err|%{$_.Message};exit 1}`,
    ],
    { encoding: "utf8" },
  );
  assert.equal(parsed.status, 0, parsed.stdout + parsed.stderr);

  const planned = spawnSync(
    "pwsh",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath, "-PlanOnly"],
    { encoding: "utf8" },
  );
  assert.equal(planned.status, 0, planned.stdout + planned.stderr);
  assert.match(planned.stdout, /P5_QA01_V4_TORCH_TRANSPORT_RECOVERY_PLAN=PASS/);
  assert.match(planned.stdout, /transport=UV_PIP_CACHE_RESILIENT/);
  assert.match(planned.stdout, /torch_backend=cu128/);
  assert.match(planned.stdout, /uv_http_retries=20/);
  assert.match(planned.stdout, /uv_concurrent_downloads=1/);
  assert.match(planned.stdout, /uv_link_mode=copy/);
});
