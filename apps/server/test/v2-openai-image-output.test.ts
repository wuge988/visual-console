import test from "node:test";
import assert from "node:assert/strict";
import {
  OPENAI_IMAGE_MAX_DECODED_BYTES,
  openAIImageOutputFacts,
  parseOpenAIImageGenerationOutput,
  validateOpenAIImageBase64EncodedLength,
} from "../src/v2-openai-image-output.js";

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);

function validBody() {
  return {
    created: 123456,
    data: [
      {
        b64_json: PNG_BYTES.toString("base64"),
        revised_prompt: "  refined prompt  ",
      },
    ],
    usage: { total_tokens: 42 },
  };
}

test("decodes validated PNG output and preserves bounded metadata", () => {
  const result = parseOpenAIImageGenerationOutput(validBody());
  assert.equal(result.provider, "openai-image");
  assert.equal(result.format, "png");
  assert.equal(result.mime, "image/png");
  assert.equal(result.byte_length, PNG_BYTES.length);
  assert.equal(result.bytes.equals(PNG_BYTES), true);
  assert.equal(result.created_at, 123456);
  assert.equal(result.revised_prompt, "refined prompt");
  assert.deepEqual(result.usage, { total_tokens: 42 });
});

test("requires the documented data[0].b64_json wire shape", () => {
  assert.throws(
    () => parseOpenAIImageGenerationOutput({ data: [] }),
    /OPENAI_IMAGE_OUTPUT_DATA_REQUIRED/,
  );
  assert.throws(
    () => parseOpenAIImageGenerationOutput({ data: [{}] }),
    /OPENAI_IMAGE_OUTPUT_B64_REQUIRED/,
  );
});

test("rejects malformed base64 before accepting provider output", () => {
  assert.throws(
    () => parseOpenAIImageGenerationOutput({ data: [{ b64_json: "%%%%" }] }),
    /OPENAI_IMAGE_OUTPUT_BASE64_INVALID/,
  );
  assert.throws(
    () => parseOpenAIImageGenerationOutput({ data: [{ b64_json: "A" }] }),
    /OPENAI_IMAGE_OUTPUT_BASE64_INVALID/,
  );
});

test("rejects non-PNG bytes even when base64 is valid", () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
  assert.throws(
    () => parseOpenAIImageGenerationOutput({ data: [{ b64_json: jpeg.toString("base64") }] }),
    /OPENAI_IMAGE_OUTPUT_NOT_PNG/,
  );
});

test("encoded length guard fails closed before allocating oversized output", () => {
  const maxEncodedLength = Math.ceil(OPENAI_IMAGE_MAX_DECODED_BYTES / 3) * 4;
  assert.doesNotThrow(() => validateOpenAIImageBase64EncodedLength(maxEncodedLength));
  assert.throws(
    () => validateOpenAIImageBase64EncodedLength(maxEncodedLength + 1),
    /OPENAI_IMAGE_OUTPUT_TOO_LARGE/,
  );
});

test("output decoder has no filesystem or provider-call authority", () => {
  assert.equal(openAIImageOutputFacts.expected_wire_field, "data[0].b64_json");
  assert.equal(openAIImageOutputFacts.output_format, "png");
  assert.equal(openAIImageOutputFacts.filesystem_write, false);
  assert.equal(openAIImageOutputFacts.provider_call, false);
  assert.equal(openAIImageOutputFacts.authority, "DECODE_VALIDATE_ONLY");
});
