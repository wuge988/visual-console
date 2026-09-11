import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

async function text(url: URL) {
  return readFile(url, "utf8");
}

test("v4 final resume v3 handoff verifies exact runners before the Windows physical gate", async () => {
  const scriptUrl = new URL(
    "../../../tools/P5_QA01_V4_FINAL_RESUME_V3_HANDOFF.ps1",
    import.meta.url,
  );
  const v2Url = new URL(
    "../../../tools/P5_QA01_V4_FINAL_RESUME_RECOVERY_V2.ps1",
    import.meta.url,
  );
  const v3Url = new URL(
    "../../../tools/P5_QA01_V4_FINAL_RESUME_RECOVERY_V3.ps1",
    import.meta.url,
  );
  const repoRootUrl = new URL("../../../", import.meta.url);
  const script = await text(scriptUrl);

  for (const token of [
    "4dce2f1fb8fd6e4e58df6e333ec8c90c174be687",
    "ed216ac6bcd2f703ac6826631b9984dd43320172",
    "a81d5307cbab518786a5171144e8851d32b27cc0",
    "d3bc233484cb3815a564ba832d9bfe913782a21b",
    "a322cd09820af0fe7d3092101d7660787853c7b2979c7e207c3be5e0bf4778aa",
    "raw.githubusercontent.com/wuge988/visual-console",
    "hash-object --no-filters",
    "WORKTREE_CLEAN=PASS",
    "SOURCE_VIDEO_MUTATION=NONE",
    "THIS_IS_V3_HANDOFF=PASS",
    "DIRECT_V2_EXECUTION=FORBIDDEN_KNOWN_TYPO",
    "--ssl-revoke-best-effort",
    "--ssl-no-revoke",
    "P5_QA01_V4_FINAL_RESUME_V3_HANDOFF_SELF_CHECK=PASS",
    "P5_QA01_V4_FINAL_RESUME_V3_HANDOFF=PASS",
    "qa01_enabled=false",
    "production_mutation=NONE",
  ]) {
    assert.ok(script.includes(token), `missing token: ${token}`);
  }

  // The handoff itself stays ASCII-only so Windows PowerShell 5.1 cannot
  // misdecode a hard-coded Unicode source path. The caller supplies VideoPath.
  assert.doesNotMatch(script, /独立站|DRIFT CURIO\\DRIFT_CURIO_VISUAL_PIPELINE/);
  assert.match(script, /\[string\]\$VideoPath = ''/);
  assert.doesNotMatch(script, /git\s+(reset|clean|stash\s+pop)/i);
  assert.doesNotMatch(script, /merge|deploy|enable QA01/i);

  // The Schannel no-revoke fallback is acceptable only because the downloaded
  // V2/V3 scripts are subsequently pinned by exact Git blob SHA before execution.
  const noRevokeIndex = script.indexOf("--ssl-no-revoke");
  const hashIndex = script.indexOf("hash-object --no-filters");
  assert.ok(noRevokeIndex >= 0, "missing Schannel fallback");
  assert.ok(hashIndex >= 0, "missing exact blob verification");

  const executed = spawnSync(
    "pwsh",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      fileURLToPath(scriptUrl),
      "-RepoRoot",
      fileURLToPath(repoRootUrl),
      "-V2Path",
      fileURLToPath(v2Url),
      "-V3Path",
      fileURLToPath(v3Url),
      "-SelfCheckOnly",
    ],
    { encoding: "utf8" },
  );

  assert.equal(executed.status, 0, executed.stdout + executed.stderr);
  assert.match(executed.stdout, /THIS_IS_V3_HANDOFF=PASS/);
  assert.match(executed.stdout, /DIRECT_V2_EXECUTION=FORBIDDEN_KNOWN_TYPO/);
  assert.match(executed.stdout, /V2_BLOB=PASS a81d5307cbab518786a5171144e8851d32b27cc0/);
  assert.match(executed.stdout, /V2_PARSE=PASS/);
  assert.match(executed.stdout, /V3_BLOB=PASS d3bc233484cb3815a564ba832d9bfe913782a21b/);
  assert.match(executed.stdout, /V3_PARSE=PASS/);
  assert.match(executed.stdout, /VALIDATED_REMOTE_HEAD=4dce2f1fb8fd6e4e58df6e333ec8c90c174be687/);
  assert.match(executed.stdout, /P5_QA01_V4_FINAL_RESUME_V3_HANDOFF_SELF_CHECK=PASS/);
  assert.match(executed.stdout, /qa01_enabled=false/);
  assert.match(executed.stdout, /production_mutation=NONE/);
});
