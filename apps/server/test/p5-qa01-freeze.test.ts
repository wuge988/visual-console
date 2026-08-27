import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

async function text(url: URL) {
  return readFile(url, "utf8");
}

test("P5 keeps QA01 disabled while freezing identity-first Aquarium scene architecture", async () => {
  const [registryText, siteText, packet, decision, probe, localGate, installGate, pathCLocalGate, webPackageText] = await Promise.all([
    text(new URL("../../../config/workflows/registry.json", import.meta.url)),
    text(new URL("../../../config/sites/drift-curio.json", import.meta.url)),
    text(new URL("../../../docs/p5/P5_QA01_SCENE_FREEZE_PACKET.md", import.meta.url)),
    text(new URL("../../../docs/p5/P5_QA01_CAPABILITY_DECISION_TEMPLATE.md", import.meta.url)),
    text(new URL("../../../tools/P5_QA01_CAPABILITY_PROBE.ps1", import.meta.url)),
    text(new URL("../../../tools/P5_QA01_LOCAL_PROBE_GATE.ps1", import.meta.url)),
    text(new URL("../../../tools/P5_QA01_PATH_C_INSTALL_GATE.ps1", import.meta.url)),
    text(new URL("../../../tools/P5_QA01_PATH_C_LOCAL_GATE.ps1", import.meta.url)),
    text(new URL("../../web/package.json", import.meta.url)),
  ]);

  const registry = JSON.parse(registryText);
  const site = JSON.parse(siteText);
  const webPackage = JSON.parse(webPackageText);
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

  assert.match(decision, /PATH_C — NO VIABLE STATIC IMAGE CHECKPOINT INSTALLED/);
  assert.match(decision, /sd_xl_base_1\.0\.safetensors/);
  assert.match(decision, /6938078334/);
  assert.match(decision, /31e35c80fc4829d14f90153f4c74cd59c90b779f6afe05a74cd6120b893f7e5b/);
  assert.match(decision, /one checkpoint only, no custom-node install/i);

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

  assert.match(installGate, /stabilityai\/stable-diffusion-xl-base-1\.0/);
  assert.match(installGate, /sd_xl_base_1\.0\.safetensors/);
  assert.match(installGate, /6938078334/);
  assert.match(installGate, /31e35c80fc4829d14f90153f4c74cd59c90b779f6afe05a74cd6120b893f7e5b/);
  assert.match(installGate, /--lowvram/);
  assert.match(installGate, /QA01_MUST_REMAIN_DISABLED_DURING_INSTALL_GATE/);
  assert.match(installGate, /CheckpointLoaderSimple/);
  assert.match(installGate, /CLIPTextEncode/);
  assert.match(installGate, /EmptyLatentImage/);
  assert.match(installGate, /KSampler/);
  assert.match(installGate, /VAEDecode/);
  assert.match(installGate, /P5_QA01_PATH_C_INSTALL_GATE=PASS/);
  assert.doesNotMatch(installGate, /custom_nodes.*(git|clone|install)/i);
  assert.doesNotMatch(installGate, /extra_model_paths\.yaml[^\n]*(Set-Content|WriteAllText|Out-File)/i);
  assert.doesNotMatch(installGate, /git\s+(reset|clean|stash\s+pop)/i);

  assert.match(pathCLocalGate, /apps\/web\/src\/App\.vue\.js/);
  assert.match(pathCLocalGate, /apps\/web\/src\/main\.js/);
  assert.match(pathCLocalGate, /apps\/web\/tsconfig\.tsbuildinfo/);
  assert.match(pathCLocalGate, /VISUAL_CONSOLE_RECOVERY_P5_/);
  assert.match(pathCLocalGate, /P5_QA01_PATH_C_LOCAL_PREP=PASS/);
  assert.match(pathCLocalGate, /P5_QA01_PATH_C_INSTALL_GATE\.ps1/);
  assert.doesNotMatch(pathCLocalGate, /git\s+(reset|clean|stash\s+pop)/i);

  assert.equal(webPackage.scripts.build, "vue-tsc --noEmit && vite build");
});
