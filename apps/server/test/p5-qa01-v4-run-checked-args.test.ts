import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

async function text(url: URL) {
  return readFile(url, "utf8");
}

test("v4 Run-Checked does not collide with PowerShell automatic $args", async () => {
  const gate = await text(
    new URL("../../../tools/P5_QA01_V4_VIDEO2TWIN_LOCAL_GATE.ps1", import.meta.url),
  );

  assert.match(
    gate,
    /function Run-Checked\(\[string\]\$Label, \[string\]\$Exe, \[string\[\]\]\$CommandArgs\)/,
  );
  assert.match(gate, /& \$Exe @CommandArgs/);
  assert.match(gate, /\$args is a PowerShell automatic variable/i);

  // The failed Windows run showed uv's top-level help because @Args resolved to
  // PowerShell's automatic $args collection instead of the intended payload.
  assert.doesNotMatch(gate, /function Run-Checked\([^\n]*\[string\[\]\]\$Args\)/);
  assert.doesNotMatch(gate, /& \$Exe @Args/);

  // Keep the known-good uv syntax itself frozen; only forwarding was faulty.
  assert.match(gate, /Run-Checked 'V4_UV_PYTHON_INSTALL' \$uvExe @\('python','install','3\.10'\)/);
  assert.match(gate, /Run-Checked 'V4_UV_VENV_CREATE' \$uvExe @\('venv','--python','3\.10','--seed',\$venv\)/);
});
