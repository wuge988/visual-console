import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  assertExistingRealInside,
  assertInside,
  ensureSafeDirectory,
  safeId,
  sha256File,
} from "./runtime-utils.js";
import type { OpenAIImageDecodedOutput } from "./v2-openai-image-output.js";

export type OpenAIImageStagingInput = {
  staging_root: string;
  site_id: string;
  item_id: string;
  job_id: string;
  output: OpenAIImageDecodedOutput;
};

export type OpenAIImageStagingResult = {
  provider: "openai-image";
  site_id: string;
  item_id: string;
  job_id: string;
  path: string;
  filename: string;
  mime: "image/png";
  byte_length: number;
  sha256: string;
  reused_existing: boolean;
};

function sha256Buffer(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

function assertDecodedOutput(output: OpenAIImageDecodedOutput) {
  if (
    output?.provider !== "openai-image"
    || output.format !== "png"
    || output.mime !== "image/png"
    || !Buffer.isBuffer(output.bytes)
    || output.bytes.length <= 0
    || output.byte_length !== output.bytes.length
  ) {
    throw new Error("OPENAI_IMAGE_STAGING_OUTPUT_INVALID");
  }
}

export async function stageOpenAIImageOutput(
  input: OpenAIImageStagingInput,
): Promise<OpenAIImageStagingResult> {
  const stagingRoot = String(input?.staging_root ?? "").trim();
  if (!stagingRoot) throw new Error("OPENAI_IMAGE_STAGING_ROOT_REQUIRED");
  const siteId = safeId(String(input?.site_id ?? ""));
  const itemId = safeId(String(input?.item_id ?? ""));
  const jobId = safeId(String(input?.job_id ?? ""));
  assertDecodedOutput(input.output);

  const digest = sha256Buffer(input.output.bytes);
  const siteDir = join(stagingRoot, siteId);
  const itemDir = join(siteDir, itemId);
  const jobDir = join(itemDir, jobId);
  await ensureSafeDirectory(stagingRoot, jobDir);

  const filename = `openai-image__${digest.slice(0, 24)}.png`;
  const target = join(jobDir, filename);
  assertInside(stagingRoot, target);

  let reusedExisting = false;
  try {
    await writeFile(target, input.output.bytes, {
      flag: "wx",
      mode: 0o600,
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== "EEXIST") throw error;
    reusedExisting = true;
  }

  try {
    await assertExistingRealInside(stagingRoot, target);
    const [info, storedHash] = await Promise.all([stat(target), sha256File(target)]);
    if (!info.isFile()) throw new Error("OPENAI_IMAGE_STAGING_TARGET_NOT_FILE");
    if (info.size !== input.output.bytes.length) {
      throw new Error("OPENAI_IMAGE_STAGING_SIZE_MISMATCH");
    }
    if (storedHash !== digest) {
      throw new Error("OPENAI_IMAGE_STAGING_SHA256_MISMATCH");
    }
    return {
      provider: "openai-image",
      site_id: siteId,
      item_id: itemId,
      job_id: jobId,
      path: target,
      filename,
      mime: "image/png",
      byte_length: info.size,
      sha256: storedHash,
      reused_existing: reusedExisting,
    };
  } catch (error) {
    if (!reusedExisting && existsSync(target)) {
      await rm(target, { force: true }).catch(() => undefined);
    }
    throw error;
  }
}

export const openAIImageStagingFacts = Object.freeze({
  provider: "openai-image" as const,
  destination: "SITE_STAGING_ROOT" as const,
  raw_write: false,
  archive_write: false,
  job_write: false,
  provider_call: false,
  verified_sha256: true,
  authority: "STAGING_WRITE_ONLY" as const,
});
