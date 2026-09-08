import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

async function text(url: URL) {
  return readFile(url, "utf8");
}

function esc(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("v4 is low-touch existing-video Video2Twin and keeps all prior stop-loss / production boundaries", async () => {
  const [doc, mobileStop, routeStop, prep, patcher, gate, registryText, siteText] = await Promise.all([
    text(new URL("../../../docs/p5/P5_QA01_V4_LOW_TOUCH_VIDEO2TWIN_PILOT.md", import.meta.url)),
    text(new URL("../../../docs/p5/P5_QA01_V4_REALITYSCAN_MOBILE_STOP.md", import.meta.url)),
    text(new URL("../../../docs/p5/P5_QA01_V32_STOP_AND_V4_DIGITAL_TWIN_ROUTE.md", import.meta.url)),
    text(new URL("../../../tools/p5_qa01_v4_video2twin_prep.py", import.meta.url)),
    text(new URL("../../../tools/p5_qa01_v4_patch_recon3d.py", import.meta.url)),
    text(new URL("../../../tools/P5_QA01_V4_VIDEO2TWIN_LOCAL_GATE.ps1", import.meta.url)),
    text(new URL("../../../config/workflows/registry.json", import.meta.url)),
    text(new URL("../../../config/sites/drift-curio.json", import.meta.url)),
  ]);

  for (const token of [
    "REALITYSCAN_MOBILE_MANUAL_CAPTURE_TERMINATED",
    "60–300 photo turntable capture",
    "manual connected/unconnected image triage",
  ]) {
    assert.match(mobileStop, new RegExp(esc(token), "i"));
  }
  for (const token of [
    "V32_ROUTE_TERMINATED",
    "REALITYSCAN_MOBILE_MANUAL_CAPTURE_TERMINATED",
    "Low-touch capture",
  ]) {
    assert.match(routeStop, new RegExp(esc(token), "i"));
  }

  for (const token of [
    "LOW_TOUCH_VIDEO2TWIN_PILOT_IMPLEMENTED",
    "existing-video",
    "DC-ZY-SZ-31001",
    "59fe356bceab74ef7d5839b68aba232bce20e14d",
    "6a1697e839113e12802b52d5cc6951044a4abe47",
    "a288dd0f14786c93483e45524328726ab7b1b4ce",
    "2b90b9f5ceec907a1c18123530e92e794ad901a4",
    "facebook/VGGT-1B-Commercial",
    "facebook/sam2.1-hiera-base-plus",
    "gsplat",
    "1.5.3",
    "0.12.10",
    "f65744f94072152b1f86ba2aace4d01f1124d9a8ecb235805039e3718c36cac2",
    "No files are written back",
    "No production Manifest mutation",
  ]) {
    assert.match(doc, new RegExp(esc(token), "i"));
  }

  const registry = JSON.parse(registryText);
  const site = JSON.parse(siteText);
  const qa01 = registry.workflows.find((row: any) => row.code === "QA01");
  assert.ok(qa01);
  assert.equal(qa01.workflow_status, "NOT_REGISTERED");
  assert.equal(qa01.executable, false);
  assert.equal(site.enabled_workflows.includes("QA01"), false);

  for (const token of [
    "Hasasasaki/photo-to-mesh",
    "6a1697e839113e12802b52d5cc6951044a4abe47",
    "TEMPORAL_WINDOW_SHARPEST_THEN_EVEN_CAP",
    "SAM2AutomaticMaskGenerator",
    "facebook/sam2.1-hiera-base-plus",
    "SAM2_AUTOMATIC_MASK_GENERATOR_DETERMINISTIC_SELECTION",
    "manual_per_frame_clicks",
    "NEUTRAL_GRAY = 127",
    "V4_TOO_FEW_USABLE_MASKED_FRAMES",
    "P5_QA01_V4_VIDEO2TWIN_PREP=PASS",
    "source_video_read_only",
  ]) {
    assert.match(prep, new RegExp(esc(token)));
  }
  assert.match(prep, /np\.full_like\(image_rgb, args\.background/);
  assert.doesNotMatch(prep, /sam3/i);

  for (const token of [
    "59fe356bceab74ef7d5839b68aba232bce20e14d",
    "facebook/VGGT-1B-Commercial",
    "FORBIDDEN_MODEL_ID = \"facebook/VGGT-1B\"",
    "FORBIDDEN_VGGT_MODEL_REMAINS",
    "foreground_only_point_cloud=true",
    "foreground_only_l1=true",
    "ssim_weight=0.0",
    ".dc_video2twin_patch.json",
    "RECON3D_HEAD_MISMATCH",
    "PATCH_SOURCE_MISMATCH",
  ]) {
    assert.match(patcher, new RegExp(esc(token)));
  }
  // The old model literal must exist only as the donor source pattern / forbidden
  // sentinel; the patch output is explicitly the commercial checkpoint and the
  // patcher verifies the forbidden literal is absent from patched executable code.
  const sourcePatchPatterns = patcher.match(/model = VGGT\.from_pretrained\(\"facebook\/VGGT-1B\"\)\.to\(device\)/g) ?? [];
  assert.equal(sourcePatchPatterns.length, 2);
  assert.match(patcher, /f'model = VGGT\.from_pretrained\(\"\{COMMERCIAL_MODEL_ID\}\"\)\.to\(device\)'/);
  assert.match(patcher, /torch\.abs\(rendered - gt_image\)\[foreground\]\.mean\(\)/);

  for (const token of [
    "P5_QA01_V4_VIDEO2TWIN_LOCAL_GATE=FAIL",
    "QA01_REGISTRY_MUST_REMAIN_FAIL_CLOSED",
    "QA01_MUST_REMAIN_DISABLED",
    "Auto-discover existing SKU video in RAW (read-only)",
    "V4_VIDEO_NOT_FOUND_FOR_SKU",
    "RAW_MUTATION=NONE",
    "D:\\AI\\TOOLS\\DC_Video2Twin",
    "D:\\AI\\MODELS",
    "0.12.10",
    "f65744f94072152b1f86ba2aace4d01f1124d9a8ecb235805039e3718c36cac2",
    "V4_VGGT_COMMERCIAL_ACCESS_REQUIRED",
    "facebook/VGGT-1B-Commercial",
    "fallback_to_noncommercial_model=false",
    "torch==2.9.1",
    "torchvision==0.24.1",
    "https://download.pytorch.org/whl/cu128",
    "gsplat==1.5.3",
    "https://docs.gsplat.studio/whl/pt29cu128",
    "a288dd0f14786c93483e45524328726ab7b1b4ce",
    "2b90b9f5ceec907a1c18123530e92e794ad901a4",
    "SAM2_BUILD_CUDA",
    "p5_qa01_v4_patch_recon3d.py",
    "p5_qa01_v4_video2twin_prep.py",
    "--pose-method",
    "vggt",
    "--max-frames",
    "30",
    "--steps",
    "3500",
    "--resize",
    "640",
    "--no-metric",
    "--no-viewer",
    "--no-factor-graph",
    "scene.ply",
    "scene.splat",
    "production_mutation='NONE'",
    "P5_QA01_V4_VIDEO2TWIN_LOCAL_GATE=PASS",
  ]) {
    assert.match(gate, new RegExp(esc(token)));
  }

  assert.doesNotMatch(gate, /mast3r/i);
  assert.doesNotMatch(gate, /facebook\/VGGT-1B['"]/);
  assert.doesNotMatch(gate, /git\s+(reset|clean|stash\s+pop)/i);
  assert.doesNotMatch(gate, /archive_history|destinations\.aquarium/i);
  assert.doesNotMatch(gate, /Copy-Item[^\n]+raw_root|Move-Item[^\n]+raw_root|Remove-Item[^\n]+raw_root/i);

  const psPath = new URL("../../../tools/P5_QA01_V4_VIDEO2TWIN_LOCAL_GATE.ps1", import.meta.url);
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

  for (const rel of [
    "../../../tools/p5_qa01_v4_video2twin_prep.py",
    "../../../tools/p5_qa01_v4_patch_recon3d.py",
  ]) {
    const url = new URL(rel, import.meta.url);
    const compiled = spawnSync("python3", ["-m", "py_compile", url.pathname], { encoding: "utf8" });
    assert.equal(compiled.status, 0, compiled.stdout + compiled.stderr);
  }
});
