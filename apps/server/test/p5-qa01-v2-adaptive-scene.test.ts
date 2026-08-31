import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

async function text(url: URL) {
  return readFile(url, "utf8");
}

test("P5 v2 rejects generic background paste and keeps QA01 fail-closed", async () => {
  const [registryText, siteText, architecture, rejection, probe, localGate] = await Promise.all([
    text(new URL("../../../config/workflows/registry.json", import.meta.url)),
    text(new URL("../../../config/sites/drift-curio.json", import.meta.url)),
    text(new URL("../../../docs/p5/P5_FOUR_REALMS_ADAPTIVE_SCENE_V2.md", import.meta.url)),
    text(new URL("../../../docs/p5/P5_QA01_V1_VISUAL_REJECTION.md", import.meta.url)),
    text(new URL("../../../tools/P5_QA01_V2_CAPABILITY_PROBE.ps1", import.meta.url)),
    text(new URL("../../../tools/P5_QA01_V2_CAPABILITY_LOCAL_GATE.ps1", import.meta.url)),
  ]);

  const registry = JSON.parse(registryText);
  const site = JSON.parse(siteText);
  const qa01 = registry.workflows.find((row: any) => row.code === "QA01");

  assert.ok(qa01);
  assert.equal(qa01.workflow_status, "NOT_REGISTERED");
  assert.equal(qa01.executable, false);
  assert.equal(site.enabled_workflows.includes("QA01"), false);

  assert.match(rejection, /REJECT_ALL/);
  assert.match(rejection, /V1_BACKGROUND_PASTE_NON_PRODUCTION/);
  assert.match(rejection, /A1,A2,B1,B2,C1,C2/);
  assert.match(rejection, /four individually designed Realms/i);

  assert.match(architecture, /per-SKU scene recipe/i);
  assert.match(architecture, /No prefab repetition/i);
  assert.match(architecture, /Identity Core/);
  assert.match(architecture, /Integration Band/);
  assert.match(architecture, /FLUX\.1 Kontext/);
  assert.match(architecture, /Empty-background text-to-image plus hard compositing is explicitly non-production/i);
  assert.match(architecture, /QA01.*Aquarium/s);
  assert.match(architecture, /QR01.*Rainforest/s);
  assert.match(architecture, /QP01.*Reptile/s);
  assert.match(architecture, /QC01.*Collectible/s);

  assert.match(probe, /QA01_MUST_REMAIN_DISABLED_DURING_V2_PROBE/);
  assert.match(probe, /ReferenceLatent/);
  assert.match(probe, /FluxGuidance/);
  assert.match(probe, /FluxKontextImageScale/);
  assert.match(probe, /probe_mode = "READ_ONLY"/);
  assert.match(probe, /nodeProbeStatus = "NOT_RUN_OFFLINE"/);
  assert.match(probe, /UNKNOWN_OFFLINE/);
  assert.match(probe, /unknown_nodes/);
  assert.doesNotMatch(probe, /Invoke-WebRequest[^\n]+-Method\s+(Post|Put|Patch|Delete)/i);
  assert.doesNotMatch(probe, /Remove-Item|Move-Item|Rename-Item/i);
  assert.doesNotMatch(probe, /git\s+(reset|clean|stash\s+pop)/i);

  assert.match(localGate, /SAFETY_BRANCH=/);
  assert.match(localGate, /switch --detach/);
  assert.match(localGate, /P5_QA01_RUNTIME_GATE\.ps1/);
  assert.match(localGate, /ComfyUI offline; recover existing verified runtime without downloads/);
  assert.match(localGate, /P5_QA01_V2_RUNTIME_RECOVERED=/);
  assert.match(localGate, /P5_QA01_V2_CAPABILITY_PROBE\.ps1/);
  assert.doesNotMatch(localGate, /git\s+(reset|clean|stash\s+pop)/i);
});
