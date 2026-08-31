import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

async function text(url: URL) {
  return readFile(url, "utf8");
}

test("P5 QA01 style sample stays evidence-only and identity-first", async () => {
  const [registryText, siteText, contract, sampleGate, localGate, compositor] = await Promise.all([
    text(new URL("../../../config/workflows/registry.json", import.meta.url)),
    text(new URL("../../../config/sites/drift-curio.json", import.meta.url)),
    text(new URL("../../../docs/p5/P5_QA01_STYLE_SAMPLE_CONTRACT.md", import.meta.url)),
    text(new URL("../../../tools/P5_QA01_STYLE_SAMPLE_GATE.ps1", import.meta.url)),
    text(new URL("../../../tools/P5_QA01_STYLE_SAMPLE_LOCAL_GATE.ps1", import.meta.url)),
    text(new URL("../../../tools/p5_qa01_compose.py", import.meta.url)),
  ]);

  const registry = JSON.parse(registryText);
  const site = JSON.parse(siteText);
  const qa01 = registry.workflows.find((row: any) => row.code === "QA01");
  assert.ok(qa01);
  assert.equal(qa01.workflow_status, "NOT_REGISTERED");
  assert.equal(qa01.executable, false);
  assert.equal(site.enabled_workflows.includes("QA01"), false);

  assert.match(contract, /TARGET_RUNTIME_PASS \/ ISOLATED_STYLE_SAMPLE_READY \/ QA01_DISABLED/);
  assert.match(contract, /latest VERIFIED P3 `SC01` Cutout on F/i);
  assert.match(contract, /PreviewImage/);
  assert.match(contract, /41073101/);
  assert.match(contract, /41073102/);
  assert.match(contract, /41073103/);
  assert.match(contract, /A1.*A2.*B1.*B2.*C1.*C2/s);
  assert.match(contract, /no rotation/i);
  assert.match(contract, /no perspective warp/i);
  assert.match(contract, /no relighting/i);
  assert.match(contract, /no generated shadow/i);
  assert.match(contract, /must not:[\s\S]*Manifest\.destinations\.aquarium/i);

  assert.match(sampleGate, /QA01_MUST_REMAIN_DISABLED_DURING_STYLE_SAMPLE/);
  assert.match(sampleGate, /VERIFIED_SC01_ARCHIVE_HISTORY_NOT_FOUND/);
  assert.match(sampleGate, /VERIFIED_SC01_SHA256_MISMATCH/);
  assert.match(sampleGate, /PreviewImage/);
  assert.match(sampleGate, /class_type = "KSampler"/);
  assert.match(sampleGate, /sampler_name = \$Sampler/);
  assert.match(sampleGate, /scheduler = \$Scheduler/);
  assert.match(sampleGate, /41073101/);
  assert.match(sampleGate, /41073102/);
  assert.match(sampleGate, /41073103/);
  assert.match(sampleGate, /Invoke-WebRequest[^\n]+\/prompt/);
  assert.match(sampleGate, /production_mutation = "NONE"/);
  assert.match(sampleGate, /P5_QA01_STYLE_SAMPLE_GATE=PASS/);
  assert.match(sampleGate, /candidate_labels=A1,A2,B1,B2,C1,C2/);
  assert.doesNotMatch(sampleGate, /Manifest\.destinations\.aquarium\s*=/i);
  assert.doesNotMatch(sampleGate, /archive_history\s*=/i);
  assert.doesNotMatch(sampleGate, /Remove-Item/i);
  assert.doesNotMatch(sampleGate, /git\s+(reset|clean|stash\s+pop)/i);

  assert.match(localGate, /SAFETY_BRANCH=/);
  assert.match(localGate, /switch --detach/);
  assert.match(localGate, /P5_QA01_STYLE_SAMPLE_LOCAL_PREP=PASS/);
  assert.match(localGate, /P5_QA01_STYLE_SAMPLE_GATE\.ps1/);
  assert.match(localGate, /P5_QA01_STYLE_SAMPLE_LOCAL_GATE=PASS/);
  assert.doesNotMatch(localGate, /git\s+(reset|clean|stash\s+pop)/i);

  assert.match(compositor, /Image\.Resampling\.LANCZOS/);
  assert.match(compositor, /alpha_composite/);
  assert.match(compositor, /"rotation_degrees": 0/);
  assert.match(compositor, /"perspective_warp": False/);
  assert.match(compositor, /"non_uniform_scale": False/);
  assert.match(compositor, /"relight": False/);
  assert.match(compositor, /"synthetic_shadow": False/);
  assert.match(compositor, /"vignette": False/);
  assert.doesNotMatch(compositor, /ImageEnhance|ImageFilter|rotate\(|transform\(/);
});
