import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  allocateNextVersion,
  assertLoopbackComfyUrl,
  copyVerifiedNoDelete,
  parseJournalText,
  persistSc01Binding,
  selectPromptOutput,
  validateSc01Workflow,
  versionedCutoutFilename,
  type P2Job,
} from "../src/p2-runtime.js";

function validWorkflow() {
  return {
    "1": { class_type: "LoadImage", inputs: { image: "source.png" } },
    "2": {
      class_type: "Remove Background (RMBG)",
      inputs: {
        image: ["1", 0],
        model: "RMBG-2.0",
        sensitivity: 1,
        process_res: 1024,
        mask_blur: 0,
        mask_offset: -1,
        invert_output: false,
        refine_foreground: true,
        background: "Alpha",
        background_color: "#222222",
      },
    },
    "3": { class_type: "SaveImage", inputs: { images: ["2", 0], filename_prefix: "SC01" } },
  };
}

test("SC01 validator accepts exact frozen signature, Alpha mode, background_color metadata, and exactly one LoadImage", () => {
  const result = validateSc01Workflow(validWorkflow());
  assert.equal(result.loadImageNodeId, "1");
  assert.equal(result.rmbgNodeId, "2");
  assert.equal(result.workflowHash.length, 64);
});

test("SC01 validator rejects Color background mode", () => {
  const wrongBackground = validWorkflow();
  wrongBackground["2"].inputs.background = "Color";
  assert.throws(() => validateSc01Workflow(wrongBackground), /SC01_BACKGROUND_MUST_BE_ALPHA/);
});

test("SC01 validator rejects parameter drift and ambiguous LoadImage", () => {
  const wrong = validWorkflow();
  wrong["2"].inputs.process_res = 1536;
  assert.throws(() => validateSc01Workflow(wrong), /SC01_FROZEN_SIGNATURE_NOT_UNIQUE/);

  const ambiguous: any = validWorkflow();
  ambiguous["9"] = { class_type: "LoadImage", inputs: { image: "other.png" } };
  assert.throws(() => validateSc01Workflow(ambiguous), /SC01_REQUIRES_EXACTLY_ONE_LOADIMAGE/);
});

test("SC01 binding is idempotent for same hash and blocks different hash overwrite", async () => {
  const root = await mkdtemp(join(tmpdir(), "vc-p2-binding-"));
  try {
    const first = validWorkflow();
    const validation = validateSc01Workflow(first);
    const state = await persistSc01Binding({ controlRoot: root, workflow: first, validation });
    const again = await persistSc01Binding({ controlRoot: root, workflow: first, validation });
    assert.equal(again.workflow_hash, state.workflow_hash);

    const changed: any = validWorkflow();
    changed["3"].inputs.filename_prefix = "SC01_CHANGED";
    const changedValidation = validateSc01Workflow(changed);
    await assert.rejects(
      () => persistSc01Binding({ controlRoot: root, workflow: changed, validation: changedValidation }),
      /SC01_DIFFERENT_HASH_REQUIRES_REBIND/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("version allocation never overwrites prior SC01 versions", () => {
  const item = "DC-ZY-SZ-31001";
  const next = allocateNextVersion(
    [
      versionedCutoutFilename(item, 1),
      versionedCutoutFilename(item, 2),
      "unrelated.png",
    ],
    item,
  );
  assert.equal(next, 3);
  assert.equal(versionedCutoutFilename(item, next), `${item}__cutout__master__wf-SC01__v003.png`);
});

test("ComfyUI URL is restricted to loopback", () => {
  assert.equal(assertLoopbackComfyUrl("http://127.0.0.1:8188"), "http://127.0.0.1:8188");
  assert.equal(assertLoopbackComfyUrl("http://localhost:8188"), "http://localhost:8188");
  assert.throws(() => assertLoopbackComfyUrl("http://192.168.1.8:8188"), /COMFYUI_MUST_BE_LOOPBACK/);
});

test("prompt output selection is prompt-correlated and rejects ambiguous outputs", () => {
  const selected = selectPromptOutput(
    { p1: { outputs: { "7": { images: [{ filename: "exact.png", subfolder: "", type: "output" }] } } } },
    "p1",
  );
  assert.equal(selected.filename, "exact.png");
  assert.throws(
    () =>
      selectPromptOutput(
        {
          p1: {
            outputs: {
              "7": { images: [{ filename: "a.png", subfolder: "", type: "output" }] },
              "8": { images: [{ filename: "b.png", subfolder: "", type: "output" }] },
            },
          },
        },
        "p1",
      ),
    /SC01_PROMPT_OUTPUT_AMBIGUOUS/,
  );
});

test("journal reconstructs latest snapshots and tolerates only a torn tail", () => {
  const base: P2Job = {
    job_id: "job_1",
    site_id: "drift-curio",
    item_id: "DC-ZY-SZ-31001",
    workflow_code: "SC01",
    source_asset_id: "a".repeat(32),
    state: "QUEUED",
    created_at: "2026-08-26T00:00:00.000Z",
    updated_at: "2026-08-26T00:00:00.000Z",
  };
  const done = { ...base, state: "QA_PENDING" as const, updated_at: "2026-08-26T00:01:00.000Z" };
  const text = [
    JSON.stringify({ event: "JOB_SNAPSHOT", job: base }),
    JSON.stringify({ event: "JOB_SNAPSHOT", job: done }),
    '{"event":"JOB_SNAPSHOT","job":',
  ].join("\n");
  const result = parseJournalText(text);
  assert.equal(result.tornTailIgnored, true);
  assert.equal(result.jobs.get("job_1")?.state, "QA_PENDING");

  assert.throws(
    () => parseJournalText(`${JSON.stringify({ event: "JOB_SNAPSHOT", job: base })}\n{bad}\n${JSON.stringify({ event: "JOB_SNAPSHOT", job: done })}`),
    /JOB_JOURNAL_CORRUPT/,
  );
});

test("verified copy preserves source and rejects overwrite", async () => {
  const root = await mkdtemp(join(tmpdir(), "vc-p2-copy-"));
  try {
    const source = join(root, "source.bin");
    const target = join(root, "target.bin");
    await writeFile(source, Buffer.from("exact-piece"));
    const result = await copyVerifiedNoDelete(source, target);
    assert.equal(result.sizeBytes, 11);
    assert.equal(existsSync(source), true);
    assert.equal(await readFile(target, "utf8"), "exact-piece");
    await assert.rejects(() => copyVerifiedNoDelete(source, target));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});