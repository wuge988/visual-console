import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

async function text(url: URL) {
  return readFile(url, "utf8");
}

test("P5 style recovery reuses isolated backgrounds without production mutation or SDXL rerun", async () => {
  const [gate, localGate, registryText, siteText] = await Promise.all([
    text(new URL("../../../tools/P5_QA01_STYLE_SAMPLE_RECOVERY_GATE.ps1", import.meta.url)),
    text(new URL("../../../tools/P5_QA01_STYLE_SAMPLE_RECOVERY_LOCAL_GATE.ps1", import.meta.url)),
    text(new URL("../../../config/workflows/registry.json", import.meta.url)),
    text(new URL("../../../config/sites/drift-curio.json", import.meta.url)),
  ]);

  const registry = JSON.parse(registryText);
  const site = JSON.parse(siteText);
  const qa01 = registry.workflows.find((row: any) => row.code === "QA01");

  assert.ok(qa01);
  assert.equal(qa01.workflow_status, "NOT_REGISTERED");
  assert.equal(qa01.executable, false);
  assert.equal(site.enabled_workflows.includes("QA01"), false);

  assert.match(gate, /WINDOWS_POWERSHELL_5_1_GENERIC_LIST_ARRAY_MATERIALIZATION/);
  assert.match(gate, /backgrounds_reused = \$true/);
  assert.match(gate, /reran_sdxl = \$false/);
  assert.match(gate, /source_sc01\.png/);
  assert.match(gate, /background_A\.png/);
  assert.match(gate, /background_B\.png/);
  assert.match(gate, /background_C\.png/);
  assert.match(gate, /candidate_.*\.png/);
  assert.match(gate, /P5_QA01_STYLE_SAMPLE_RECOVERY_GATE=PASS/);
  assert.match(gate, /production_mutation=NONE/);
  assert.match(gate, /QA01_MUST_REMAIN_DISABLED_DURING_STYLE_RECOVERY/);
  assert.match(gate, /RECOVERY_SC01_COPY_SHA256_MISMATCH/);
  assert.match(gate, /VERIFIED_SC01_SHA256_MISMATCH/);
  assert.match(gate, /\$backgrounds = @\(\)/);
  assert.match(gate, /\$candidates = @\(\)/);
  assert.doesNotMatch(gate, /Post-ComfyPrompt|\/prompt|KSampler|CheckpointLoaderSimple/);
  assert.doesNotMatch(gate, /Manifest\.destinations\.aquarium|archive_history\s*=|jobs\.jsonl|qa\.jsonl|archives\.jsonl/);
  assert.doesNotMatch(gate, /git\s+(reset|clean|stash\s+pop)/i);

  assert.match(localGate, /SAFETY_BRANCH=/);
  assert.match(localGate, /switch --detach/);
  assert.match(localGate, /P5_QA01_STYLE_SAMPLE_RECOVERY_LOCAL_PREP=PASS/);
  assert.match(localGate, /P5_QA01_STYLE_SAMPLE_RECOVERY_GATE\.ps1/);
  assert.match(localGate, /P5_QA01_STYLE_SAMPLE_RECOVERY_LOCAL_GATE=PASS/);
  assert.doesNotMatch(localGate, /git\s+(reset|clean|stash\s+pop)/i);
});
