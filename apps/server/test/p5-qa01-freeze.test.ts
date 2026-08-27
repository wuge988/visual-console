import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

async function text(url: URL) {
  return readFile(url, "utf8");
}

test("P5 keeps QA01 disabled while freezing identity-first Aquarium scene architecture", async () => {
  const [registryText, siteText, packet, probe, localGate] = await Promise.all([
    text(new URL("../../../config/workflows/registry.json", import.meta.url)),
    text(new URL("../../../config/sites/drift-curio.json", import.meta.url)),
    text(new URL("../../../docs/p5/P5_QA01_SCENE_FREEZE_PACKET.md", import.meta.url)),
    text(new URL("../../../tools/P5_QA01_CAPABILITY_PROBE.ps1", import.meta.url)),
    text(new URL("../../../tools/P5_QA01_LOCAL_PROBE_GATE.ps1", import.meta.url)),
  ]);

  const registry = JSON.parse(registryText);
  const site = JSON.parse(siteText);
  const qa01 = registry.workflows.find((row: any) => row.code === "QA01");

  assert.ok(qa01);
  assert.equal(qa01.workflow_status, "NOT_REGISTERED");
  assert.equal(qa01.executable, false);
  assert.equal(site.enabled_workflows.includes("QA01"), false);

  assert.match(packet, /identity-first layered scene architecture/i);
  assert.match(packet, /verified P3 SC01 Cutout on F/i);
  assert.match(packet, /not allowed to regenerate, repaint, deform, or hallucinate the product body/i);
  assert.match(packet, /PENDING_LOCAL_CAPABILITY_PROBE/);
  assert.match(packet, /destination key: `aquarium`/);
  assert.match(packet, /QA01_DISABLED/);

  assert.match(probe, /QA01_MUST_REMAIN_DISABLED_DURING_PROBE/);
  assert.match(probe, /P5_QA01_CAPABILITY_PROBE=PASS/);
  assert.match(probe, /D:\\AI\\MODELS\\ComfyUI/);
  assert.match(probe, /ComfyUI\\models/);
  assert.match(probe, /effective_checkpoint_options/);
  assert.match(probe, /effective_sdxl_like_checkpoint_options/);
  assert.match(probe, /extra_model_paths_files/);
  assert.doesNotMatch(probe, /Invoke-WebRequest[^\n]+-Method\s+(Post|Put|Patch|Delete)/i);
  assert.doesNotMatch(probe, /git\s+(reset|clean|stash\s+pop)/i);

  assert.match(localGate, /SAFETY_BRANCH=/);
  assert.match(localGate, /switch --detach/);
  assert.match(localGate, /P5_QA01_LOCAL_PROBE_PREP=PASS/);
  assert.match(localGate, /P5_QA01_CAPABILITY_PROBE\.ps1/);
  assert.doesNotMatch(localGate, /git\s+(reset|clean|stash\s+pop)/i);
});
