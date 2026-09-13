import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  openAIImageStagingFacts,
  stageOpenAIImageOutput,
} from "../src/v2-openai-image-staging.js";
import type { OpenAIImageDecodedOutput } from "../src/v2-openai-image-output.js";

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);

function output(): OpenAIImageDecodedOutput {
  return {
    provider: "openai-image",
    format: "png",
    mime: "image/png",
    bytes: Buffer.from(PNG_BYTES),
    byte_length: PNG_BYTES.length,
    created_at: 123,
    revised_prompt: null,
    usage: null,
  };
}

test("writes only a verified PNG beneath the supplied staging root", async () => {
  const root = await mkdtemp(join(tmpdir(), "visual-console-openai-stage-"));
  try {
    const result = await stageOpenAIImageOutput({
      staging_root: root,
      site_id: "drift-curio",
      item_id: "DC-ZY-SZ-31001",
      job_id: "job_test_001",
      output: output(),
    });

    assert.equal(result.provider, "openai-image");
    assert.equal(result.mime, "image/png");
    assert.equal(result.byte_length, PNG_BYTES.length);
    assert.equal(result.reused_existing, false);
    assert.match(result.filename, /^openai-image__[a-f0-9]{24}\.png$/);
    assert.equal(result.path.startsWith(root), true);
    assert.equal((await readFile(result.path)).equals(PNG_BYTES), true);
    assert.match(result.sha256, /^[a-f0-9]{64}$/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("same verified output is idempotently reused rather than overwritten", async () => {
  const root = await mkdtemp(join(tmpdir(), "visual-console-openai-stage-"));
  try {
    const input = {
      staging_root: root,
      site_id: "drift-curio",
      item_id: "DC-ZY-SZ-31001",
      job_id: "job_test_002",
      output: output(),
    };
    const first = await stageOpenAIImageOutput(input);
    const second = await stageOpenAIImageOutput(input);
    assert.equal(first.path, second.path);
    assert.equal(second.reused_existing, true);
    assert.equal(first.sha256, second.sha256);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("existing path with mismatched bytes fails closed", async () => {
  const root = await mkdtemp(join(tmpdir(), "visual-console-openai-stage-"));
  try {
    const input = {
      staging_root: root,
      site_id: "drift-curio",
      item_id: "DC-ZY-SZ-31001",
      job_id: "job_test_003",
      output: output(),
    };
    const first = await stageOpenAIImageOutput(input);
    await writeFile(first.path, Buffer.from("tampered"));
    await assert.rejects(stageOpenAIImageOutput(input), /OPENAI_IMAGE_STAGING_SIZE_MISMATCH|OPENAI_IMAGE_STAGING_SHA256_MISMATCH/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("unsafe identifiers and malformed decoded outputs are rejected", async () => {
  const root = await mkdtemp(join(tmpdir(), "visual-console-openai-stage-"));
  try {
    await assert.rejects(
      stageOpenAIImageOutput({
        staging_root: root,
        site_id: "../escape",
        item_id: "DC-ZY-SZ-31001",
        job_id: "job_test_004",
        output: output(),
      }),
      /INVALID_ITEM_ID/,
    );

    const invalid = output();
    invalid.byte_length += 1;
    await assert.rejects(
      stageOpenAIImageOutput({
        staging_root: root,
        site_id: "drift-curio",
        item_id: "DC-ZY-SZ-31001",
        job_id: "job_test_004",
        output: invalid,
      }),
      /OPENAI_IMAGE_STAGING_OUTPUT_INVALID/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("staging sink does not claim RAW, Archive, Job or Provider authority", () => {
  assert.equal(openAIImageStagingFacts.destination, "SITE_STAGING_ROOT");
  assert.equal(openAIImageStagingFacts.raw_write, false);
  assert.equal(openAIImageStagingFacts.archive_write, false);
  assert.equal(openAIImageStagingFacts.job_write, false);
  assert.equal(openAIImageStagingFacts.provider_call, false);
  assert.equal(openAIImageStagingFacts.verified_sha256, true);
  assert.equal(openAIImageStagingFacts.authority, "STAGING_WRITE_ONLY");
});
