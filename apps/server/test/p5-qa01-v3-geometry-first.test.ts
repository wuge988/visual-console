import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

async function text(url: URL) {
  return readFile(url, "utf8");
}

test("D6 stays closed, v3.1 is immutable Human-PASS evidence, and v3.2 only materializes accepted foreground", async () => {
  const [
    doc,
    v3ReviewDoc,
    v32Doc,
    gate,
    blenderScript,
    compositor,
    materializer,
    installer,
    registryText,
    siteText,
  ] = await Promise.all([
    text(new URL("../../../docs/p5/P5_QA01_D6_TERMINATION_AND_V3_GEOMETRY_FIRST.md", import.meta.url)),
    text(new URL("../../../docs/p5/P5_QA01_V3_GEOMETRY_OCCLUSION_VISUAL_REVIEW.md", import.meta.url)),
    text(new URL("../../../docs/p5/P5_QA01_V31_VISUAL_REVIEW_AND_V32_MATERIALIZATION.md", import.meta.url)),
    text(new URL("../../../tools/P5_QA01_V3_GEOMETRY_LOCAL_GATE.ps1", import.meta.url)),
    text(new URL("../../../tools/p5_qa01_v3_geometry_occlusion_blender.py", import.meta.url)),
    text(new URL("../../../tools/p5_qa01_v31_composite.py", import.meta.url)),
    text(new URL("../../../tools/p5_qa01_v32_materialize.py", import.meta.url)),
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
    assert.match(v3ReviewDoc, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  }

  for (const token of [
    "V31_RUNTIME_PASS",
    "V31_REGISTRATION_PASS",
    "V31_OCCLUSION_PASS",
    "V31_HUMAN_VISUAL_PASS",
    "V31_IMMUTABLE_ARTIFACT_FROZEN",
    "Geometry-Locked Foreground Materialization",
    "Eevee rerender byte identity is not a valid acceptance contract",
    "v3.2 does **not invoke Blender**",
    "V32_ACCEPTED_V31_EVIDENCE_NOT_FOUND",
    "intact donor scene is never passed to ComfyUI",
    "Pixels outside the materialization mask must remain byte-exact to accepted v3.1",
    "726220184280d7a1ee1b3c9097063ef34e4ead950c68b7b7b09783bd25998308",
    "66a3ef87e1ba80cebe6782a0f0735cc8c763db385870d0db68c690430c17c1ff",
    "c191950330d83fe48d94e5d84b82c8d81bef485f72a09f8f561b90429b6e5d55",
    "14ad76a9c9129c3b467501e55ddba62fb01ef6c18b2cdee57cbfe5229eaa6e25",
  ]) {
    assert.match(v32Doc, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  }

  const registry = JSON.parse(registryText);
  const site = JSON.parse(siteText);
  const qa01 = registry.workflows.find((row: any) => row.code === "QA01");
  assert.ok(qa01);
  assert.equal(qa01.workflow_status, "NOT_REGISTERED");
  assert.equal(qa01.executable, false);
  assert.equal(site.enabled_workflows.includes("QA01"), false);

  for (const token of [
    "source_sc01.png",
    "candidate.png",
    "realism_material_board.png",
    "foreground_geometry_plate.png",
    "foreground_alpha.png",
    "geometry_occlusion_proof.png",
    "p5_qa01_v32_materialize.py",
    "726220184280d7a1ee1b3c9097063ef34e4ead950c68b7b7b09783bd25998308",
    "66a3ef87e1ba80cebe6782a0f0735cc8c763db385870d0db68c690430c17c1ff",
    "V32_ACCEPTED_V31_EVIDENCE_NOT_FOUND",
    "Locate immutable Human-PASS v3.1 artifacts by frozen SHA256",
    "P5_QA01_V31_GEOMETRY_V32_MATERIALIZATION_",
    "accepted_v31_provenance.txt",
    "v31_baseline_mode=IMMUTABLE_ACCEPTED_ARTIFACT_REUSE",
    "accepted_v31_evidence_dir=",
    "blender_invoked_for_v32=false",
    "outside_materialization_pixel_exact=true",
    "foreground_occupancy_decided_by_renderer_before_diffusion=true",
    "intact_donor_conditioned=false",
    "realism_material_board_conditioned=true",
    "production_mutation=NONE",
    "P5_QA01_V32_GEOMETRY_MATERIALIZATION_LOCAL_GATE=PASS",
    "Read-Utf8Json",
    "System.Text.UTF8Encoding",
    "System.IO.File]::ReadAllText",
    "UTF8_JSON_DECODE_FAILED",
    "UTF8_JSON_PARSE_FAILED",
    "V32_PILLOW_RUNTIME_NOT_FOUND",
  ]) {
    assert.match(gate, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(gate, /p5_qa01_v3_geometry_occlusion_blender\.py/i);
  assert.doesNotMatch(gate, /p5_qa01_v31_composite\.py/i);
  assert.doesNotMatch(gate, /--python-exit-code/i);
  assert.doesNotMatch(gate, /&\s*\$blender/i);
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
  assert.match(blenderScript, /random\.seed\(seed\)/);
  assert.match(blenderScript, /random\.seed\(44\)/);
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
    "EXPECTED_V31_FOREGROUND_SHA256",
    "EXPECTED_V31_FINAL_SHA256",
    "EXPECTED_REALISM_BOARD_SHA256",
    "MATERIALIZE_SEED = 52073201",
    "MATERIALIZE_STEPS = 24",
    "MATERIALIZE_GUIDANCE = 2.4",
    "MATERIALIZE_DENOISE = 0.78",
    "foreground_materialization_mask.png",
    "geometry_occlusion_materialized.png",
    "V32_OUTSIDE_MATERIALIZATION_PIXEL_DRIFT",
    "GEOMETRY_LOCKED_FOREGROUND_MATERIALIZATION",
    "foreground_occupancy_decided_by_renderer_before_diffusion",
    "intact_donor_conditioned",
    "realism_material_board_conditioned",
    "d4.build_noise_mask_workflow",
    "d51.run_stage_sanitized",
    "P5_QA01_V32_MATERIALIZATION_GATE=PASS",
  ]) {
    assert.match(materializer, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(materializer, /scene_reference\.png/i);
  assert.doesNotMatch(materializer, /archive_history|destinations\.aquarium/i);
  assert.doesNotMatch(materializer, /Image\.composite\([^\n]+source_sc01/i);

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
    "../../tools/p5_qa01_v32_materialize.py",
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
