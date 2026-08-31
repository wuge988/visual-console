import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

async function text(url: URL) {
  return readFile(url, "utf8");
}

test("D6 stays closed and QA01 v3.1 preserves the photographic backplate outside Blender", async () => {
  const [doc, reviewDoc, gate, blenderScript, compositor, installer, registryText, siteText] = await Promise.all([
    text(new URL("../../../docs/p5/P5_QA01_D6_TERMINATION_AND_V3_GEOMETRY_FIRST.md", import.meta.url)),
    text(new URL("../../../docs/p5/P5_QA01_V3_GEOMETRY_OCCLUSION_VISUAL_REVIEW.md", import.meta.url)),
    text(new URL("../../../tools/P5_QA01_V3_GEOMETRY_LOCAL_GATE.ps1", import.meta.url)),
    text(new URL("../../../tools/p5_qa01_v3_geometry_occlusion_blender.py", import.meta.url)),
    text(new URL("../../../tools/p5_qa01_v31_composite.py", import.meta.url)),
    text(new URL("../../../tools/P5_QA01_V3_BLENDER_PORTABLE_INSTALL.ps1", import.meta.url)),
    text(new URL("../../../config/workflows/registry.json", import.meta.url)),
    text(new URL("../../../config/sites/drift-curio.json", import.meta.url)),
  ]);

  for (const token of [
    "D6_PREFLIGHT_FAIL_CLOSED",
    "D6_MASK_REPAIR_FORBIDDEN",
    "do not create D6.1",
    "do not lower the cross-boundary threshold",
    "Geometry-First 2.5D Occlusion Proof",
    "strictly nearer Z depth",
    "no diffusion model is called",
  ]) {
    assert.match(doc, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  }

  for (const token of [
    "V3_OCCLUSION_MECHANISM_PASS",
    "V3_BACKPLATE_REGISTRATION_FAIL",
    "FOREGROUND_RGBA_PLATE_PLUS_DETERMINISTIC_PIXEL_COMPOSITE",
    "Pixels where foreground alpha is zero must remain pixel-exact to D5.3",
  ]) {
    assert.match(reviewDoc, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  }

  const registry = JSON.parse(registryText);
  const site = JSON.parse(siteText);
  const qa01 = registry.workflows.find((row: any) => row.code === "QA01");
  assert.ok(qa01);
  assert.equal(qa01.workflow_status, "NOT_REGISTERED");
  assert.equal(qa01.executable, false);
  assert.equal(site.enabled_workflows.includes("QA01"), false);

  for (const token of [
    "V31_BLENDER_NOT_FOUND",
    "source_sc01.png",
    "candidate.png",
    "foreground_geometry_plate.png",
    "foreground_alpha.png",
    "p5_qa01_v3_geometry_occlusion_blender.py",
    "p5_qa01_v31_composite.py",
    "outside_foreground_pixel_exact=true",
    "photographic_backplate_passed_through_blender=false",
    "production_mutation=NONE",
    "P5_QA01_V31_GEOMETRY_LOCAL_GATE=PASS",
    "Read-Utf8Json",
    "System.Text.UTF8Encoding",
    "System.IO.File]::ReadAllText",
    "UTF8_JSON_DECODE_FAILED",
    "UTF8_JSON_PARSE_FAILED",
    "--python-exit-code 17",
    "V31_BLENDER_RENDER_FAILED",
    "V31_PILLOW_RUNTIME_NOT_FOUND",
  ]) {
    assert.match(gate, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(gate, /Get-Content\s+-Raw[^\n]+registry\.json/i);
  assert.doesNotMatch(gate, /git\s+(reset|clean|stash\s+pop)/i);
  assert.doesNotMatch(gate, /Invoke-WebRequest|curl\.exe|aria2c/i);
  assert.doesNotMatch(gate, /archive_history|destinations\.aquarium/i);

  for (const token of [
    "support_stone_A",
    "support_stone_B",
    "substrate_mound",
    "leaf_",
    "P5_QA01_V31_FOREGROUND_RENDER=PASS",
    "configure_render_engine",
    'for candidate in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT")',
    "V31_EEVEE_ENGINE_UNAVAILABLE",
    "render_engine={selected_engine}",
    "configure_color_management",
    'scene.render.image_settings.color_mode = "RGBA"',
    "scene.render.film_transparent = True",
    "photographic_backplate_passed_through_blender=False",
  ]) {
    assert.match(blenderScript, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(blenderScript, /aquarium_backplate/i);
  assert.doesNotMatch(blenderScript, /make_image_material/i);
  assert.doesNotMatch(blenderScript, /film_transparent\s*=\s*False/i);
  assert.doesNotMatch(blenderScript, /BLENDER_EEVEE_NEXT"\s+if\s+bpy\.app\.version/i);

  for (const token of [
    "Image.alpha_composite",
    "V31_OUTSIDE_FOREGROUND_PIXEL_DRIFT",
    "outside_foreground_pixel_exact=True",
    "foreground_alpha_nonzero_pixels",
    "FOREGROUND_RGBA_PLATE_PLUS_DETERMINISTIC_PIXEL_COMPOSITE",
  ]) {
    assert.match(compositor, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  for (const token of [
    "https://download.blender.org/release/Blender5.2",
    "5.2.1",
    "windows-x64.zip",
    "blender-$Version.sha256",
    "Get-FileHash",
    "Expand-Archive",
    "D:\\AI\\TOOLS\\Blender",
    "P5_QA01_V3_BLENDER_PORTABLE_INSTALL=PASS",
  ]) {
    assert.match(installer, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(installer, /config\\workflows|config\\sites|archive_history|destinations\.aquarium/i);
  assert.doesNotMatch(installer, /Start-Process[^\n]+RunAs|msiexec/i);

  for (const path of [
    "../../tools/p5_qa01_v3_geometry_occlusion_blender.py",
    "../../tools/p5_qa01_v31_composite.py",
  ]) {
    const py = spawnSync("python3", ["-m", "py_compile", path], { encoding: "utf8" });
    assert.equal(py.status, 0, py.stderr || py.stdout);
  }

  for (const path of [
    "../../tools/P5_QA01_V3_GEOMETRY_LOCAL_GATE.ps1",
    "../../tools/P5_QA01_V3_BLENDER_PORTABLE_INSTALL.ps1",
  ]) {
    const pwsh = spawnSync(
      "pwsh",
      [
        "-NoProfile",
        "-Command",
        `$p="${path}"; $t=[IO.File]::ReadAllText($p,[Text.Encoding]::UTF8); $tok=$null; $err=$null; [System.Management.Automation.Language.Parser]::ParseInput($t,[ref]$tok,[ref]$err)|Out-Null; if($err.Count -gt 0){$err|%{Write-Error ("${path}: "+$_.Message)}; exit 1}`,
      ],
      { encoding: "utf8" },
    );
    assert.equal(pwsh.status, 0, pwsh.stderr || pwsh.stdout);
  }
});
