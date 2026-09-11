import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

async function text(url: URL) {
  return readFile(url, "utf8");
}

test("v4 short-video recovery raises sampling density without relaxing identity minimums", async () => {
  const scriptUrl = new URL(
    "../../../tools/P5_QA01_V4_FRAME_SELECTION_RECOVERY.ps1",
    import.meta.url,
  );
  const script = await text(scriptUrl);

  for (const token of [
    "a322cd09820af0fe7d3092101d7660787853c7b2979c7e207c3be5e0bf4778aa",
    "59fe356bceab74ef7d5839b68aba232bce20e14d",
    "facebook/VGGT-1B-Commercial",
    "facebook/sam2.1-hiera-base-plus",
    "$MinimumAcceptedFrames = 16",
    "$SampleFps = 8.0",
    "RECOVERY_SAMPLE_FPS_MUST_BE_8",
    "FRAME_SELECTION_RECOVERY_POLICY=PASS sample_fps=8 window=3 max_frames=30 minimum_accepted=16",
    "--sample-fps','8'",
    "--window','3'",
    "--max-frames','30'",
    "FAILED_PREP_NOT_EMPTY_REFUSE_DELETE",
    "RECON_OUTPUT_ALREADY_EXISTS_REFUSE_OVERWRITE",
    "ORIGINAL_SAMPLE_FPS_6_SELECTED_15_BELOW_MINIMUM_16",
    "V4_RECOVERY_RECON3D_IDENTITY_SPLAT",
    "scene.ply",
    "scene.splat",
    "qa01_enabled = $false",
    "production_mutation = 'NONE'",
    "P5_QA01_V4_FRAME_SELECTION_RECOVERY=PASS",
  ]) {
    assert.ok(script.includes(token), `missing token: ${token}`);
  }

  // Recovery increases temporal sampling only. It must not weaken the
  // minimum usable-frame contract or reopen production mutation routes.
  assert.doesNotMatch(script, /MinimumAcceptedFrames\s*=\s*1[0-5]\b/);
  assert.doesNotMatch(script, /facebook\/VGGT-1B['"]/);
  assert.doesNotMatch(script, /git\s+(reset|clean|stash\s+pop)/i);
  assert.doesNotMatch(script, /archive_history|destinations\.aquarium/i);
  assert.doesNotMatch(script, /Copy-Item[^\n]+raw_root|Move-Item[^\n]+raw_root|Remove-Item[^\n]+raw_root/i);

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
