import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

async function text(url: URL) {
  return readFile(url, "utf8");
}

test("v4 final resume v3 fixes and semantically executes the GPU probe before Windows handoff", async () => {
  const scriptUrl = new URL(
    "../../../tools/P5_QA01_V4_FINAL_RESUME_RECOVERY_V3.ps1",
    import.meta.url,
  );
  const v2Url = new URL(
    "../../../tools/P5_QA01_V4_FINAL_RESUME_RECOVERY_V2.ps1",
    import.meta.url,
  );
  const script = await text(scriptUrl);

  for (const token of [
    "GPU_PROBE_CONTRACT=PASS",
    "gpu_probe_is_available_calls=3",
    "gpu_probe_forbidden_typo=ABSENT",
    "V4_FINAL_RESUME_V3_PATCH=PASS",
    "probe_fix=torch.cuda.is_available",
    "probe_semantic_contract=PASS",
    "source_v2_mutation=NONE",
    "P5_QA01_V4_FINAL_RESUME_RECOVERY_V3_PATCH_ONLY=PASS",
    "qa01_enabled=false",
    "production_mutation=NONE",
  ]) {
    assert.ok(script.includes(token), `missing token: ${token}`);
  }

  const newMatch = script.match(/\$NewProbeBase64 = '([^']+)'/);
  const oldMatch = script.match(/\$OldProbeBase64 = '([^']+)'/);
  assert.ok(newMatch, "new GPU probe base64 missing");
  assert.ok(oldMatch, "old GPU probe base64 missing");

  const probe = Buffer.from(newMatch[1], "base64").toString("utf8");
  const oldProbe = Buffer.from(oldMatch[1], "base64").toString("utf8");

  // Exact regression for the Windows failure that escaped v2.
  assert.match(oldProbe, /torch\.cuda\.is_availe\(\)/);
  assert.doesNotMatch(probe, /is_availe/);
  assert.equal((probe.match(/torch\.cuda\.is_available\(\)/g) ?? []).length, 3);
  assert.match(probe, /torch\.cuda\.get_device_name\(0\)/);
  assert.match(probe, /raise SystemExit\(46\)/);

  // Semantic execution, not just string inspection: run the exact decoded probe
  // against lightweight stub modules exposing the real API spellings. A typo such
  // as is_availe() raises AttributeError and fails CI.
  const root = await mkdtemp(join(tmpdir(), "dc-v4-probe-v3-"));
  try {
    await writeFile(
      join(root, "torch.py"),
      [
        '__version__ = "2.9.1+cu128"',
        "class _Cuda:",
        "    def is_available(self): return True",
        '    def get_device_name(self, index): return "CI-STUB-GPU"',
        "cuda = _Cuda()",
        "",
      ].join("\n"),
      "utf8",
    );
    await writeFile(join(root, "gsplat.py"), '__version__ = "1.5.3"\n', "utf8");

    await mkdir(join(root, "sam2"), { recursive: true });
    await writeFile(join(root, "sam2", "__init__.py"), "", "utf8");
    await writeFile(
      join(root, "sam2", "automatic_mask_generator.py"),
      "class SAM2AutomaticMaskGenerator: pass\n",
      "utf8",
    );

    await mkdir(join(root, "vggt", "models"), { recursive: true });
    await writeFile(join(root, "vggt", "__init__.py"), "", "utf8");
    await writeFile(join(root, "vggt", "models", "__init__.py"), "", "utf8");
    await writeFile(join(root, "vggt", "models", "vggt.py"), "class VGGT: pass\n", "utf8");

    const probePath = join(root, "probe.py");
    await writeFile(probePath, probe, "utf8");

    const executed = spawnSync("python3", ["-B", probePath], {
      encoding: "utf8",
      env: { ...process.env, PYTHONPATH: root },
    });
    assert.equal(executed.status, 0, executed.stdout + executed.stderr);
    assert.match(executed.stdout, /runtime_imports=PASS/);
    assert.match(executed.stdout, /cuda=True/);
    assert.match(executed.stdout, /gpu=CI-STUB-GPU/);
    assert.match(executed.stdout, /gsplat=1\.5\.3/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }

  // Execute the actual V3 correction against the exact V2 file, then parse the
  // corrected temporary V2 under PowerShell StrictMode. This closes the previous
  // gap between static assertions and the handoff path.
  const scriptPath = fileURLToPath(scriptUrl);
  const v2Path = fileURLToPath(v2Url);
  const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
  const patched = spawnSync(
    "pwsh",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      scriptPath,
      "-RepoRoot",
      repoRoot,
      "-V2Path",
      v2Path,
      "-PatchOnly",
    ],
    { encoding: "utf8" },
  );
  assert.equal(patched.status, 0, patched.stdout + patched.stderr);
  assert.match(patched.stdout, /GPU_PROBE_CONTRACT=PASS/);
  assert.match(patched.stdout, /V2_BLOB=PASS a81d5307cbab518786a5171144e8851d32b27cc0/);
  assert.match(patched.stdout, /V4_FINAL_RESUME_V3_PATCH=PASS/);
  assert.match(patched.stdout, /probe_semantic_contract=PASS/);
  assert.match(patched.stdout, /temp_v2_parse=PASS/);
  assert.match(patched.stdout, /P5_QA01_V4_FINAL_RESUME_RECOVERY_V3_PATCH_ONLY=PASS/);

  // Fail-closed boundaries remain intact.
  assert.doesNotMatch(script, /git\s+(reset|clean|stash\s+pop)/i);
  assert.doesNotMatch(script, /WriteAllText\([^\n]*P5_QA01_V4_FINAL_RESUME_RECOVERY_V2\.ps1/);
  assert.doesNotMatch(script, /facebook\/VGGT-1B['"]/);
});
