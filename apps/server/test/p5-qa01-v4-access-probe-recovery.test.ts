import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

async function text(url: URL) {
  return readFile(url, "utf8");
}

test("v4 access-probe recovery preserves native output while returning only scalar exit code", async () => {
  const scriptUrl = new URL(
    "../../../tools/P5_QA01_V4_ACCESS_PROBE_RECOVERY_RUN.ps1",
    import.meta.url,
  );
  const script = await text(scriptUrl);

  for (const token of [
    "V4_ACCESS_PROBE_RECOVERY_PATCH=PASS",
    "tracked_gate_mutation=NONE",
    "$probeOutput = @(& $PythonExe -B $probePath 2>&1)",
    "$probeExit = $LASTEXITCODE",
    "$probeOutput | ForEach-Object { Write-Host $_ }",
    "return [int]$probeExit",
    "ACCESS_PROBE_PATCH_SITE_MISMATCH",
    "P5_QA01_V4_VIDEO2TWIN_LOCAL_GATE.ps1",
    "-VideoPath $VideoPath",
    "\\r?\\n",
    "& \\$PythonExe -B \\$probePath",
    "return \\$LASTEXITCODE",
    "Remove-Item -LiteralPath \\$probePath -Force -ErrorAction SilentlyContinue",
    "$matches = [regex]::Matches($text, $pattern)",
    "[regex]::Replace($text, $pattern",
  ]) {
    assert.ok(script.includes(token), `missing token: ${token}`);
  }

  // Recovery must not mutate the tracked Gate or use destructive Git cleanup.
  assert.doesNotMatch(script, /\[System\.IO\.File\]::WriteAllText\(\$gate,/);
  assert.doesNotMatch(script, /git\s+(reset|clean|stash\s+pop)/i);

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
});
