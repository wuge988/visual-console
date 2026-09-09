import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

async function text(url: URL) {
  return readFile(url, "utf8");
}

test("v4 video discovery is bounded, read-only, identity-first, and never silently selects an unrelated generic video", async () => {
  const wrapper = await text(
    new URL("../../../tools/P5_QA01_V4_VIDEO_DISCOVER_AND_RUN.ps1", import.meta.url),
  );

  for (const token of [
    "Bounded read-only discovery for existing SKU video",
    "VIDEO_DISCOVERY_MUTATION=NONE",
    "VIDEO_DISCOVERY_ROOTS=",
    "VIDEO_DISCOVERY_MODE=IDENTITY_PATH_MATCH",
    "VIDEO_DISCOVERY_MODE=EXPLICIT_SELECTION_REQUIRED",
    "V4_VIDEO_NOT_FOUND_IN_BOUNDED_DISCOVERY_ROOTS",
    "V4_VIDEO_SELECTION_REQUIRED",
    "VIDEO_DISCOVERY_MODE=EXPLICIT_PATH",
    "P5_QA01_V4_VIDEO2TWIN_LOCAL_GATE.ps1",
    "-VideoPath $VideoPath",
    "D:\\AI\\WORK",
    "D:\\Users\\Administrator\\Desktop",
  ]) {
    assert.match(wrapper, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(wrapper, /\.FullName -like \"\*\$Sku\*\"/);
  assert.match(wrapper, /pathCompact\.Contains\(\$skuCompact\)/);
  assert.match(wrapper, /\.FullName -like \"\*\$skuSerial\*\"/);
  assert.match(wrapper, /drift\|curio\|3d\|scan\|reality\|photogram\|splat/i);

  // Generic candidates may be shown to the operator, but must never be silently auto-selected.
  assert.doesNotMatch(wrapper, /\$VideoPath\s*=\s*\$ranked\[0\]/);

  // No broad destructive Git or file-system cleanup is allowed.
  assert.doesNotMatch(wrapper, /git\s+(reset|clean|stash\s+pop)/i);
  assert.doesNotMatch(wrapper, /Remove-Item|Move-Item|Copy-Item/i);

  const psPath = new URL("../../../tools/P5_QA01_V4_VIDEO_DISCOVER_AND_RUN.ps1", import.meta.url);
  const parsed = spawnSync(
    "pwsh",
    [
      "-NoProfile",
      "-Command",
      `$p=[System.Uri]::UnescapeDataString('${psPath.pathname}'); if ($IsWindows -eq $false -and $p -match '^/[A-Za-z]:') { $p=$p.Substring(1) }; $t=[IO.File]::ReadAllText($p,[Text.Encoding]::UTF8); $tokens=$null; $errors=$null; [System.Management.Automation.Language.Parser]::ParseInput($t,[ref]$tokens,[ref]$errors)|Out-Null; if($errors.Count){$errors|%{$_.Message};exit 1}`,
    ],
    { encoding: "utf8" },
  );
  assert.equal(parsed.status, 0, parsed.stdout + parsed.stderr);
});
