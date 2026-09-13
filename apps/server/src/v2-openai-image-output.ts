const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
export const OPENAI_IMAGE_MAX_DECODED_BYTES = 64 * 1024 * 1024;

export type OpenAIImageDecodedOutput = {
  provider: "openai-image";
  format: "png";
  mime: "image/png";
  bytes: Buffer;
  byte_length: number;
  created_at: number | null;
  revised_prompt: string | null;
  usage: Record<string, unknown> | null;
};

function plainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function validateOpenAIImageBase64EncodedLength(length: number) {
  if (!Number.isInteger(length) || length <= 0) {
    throw new Error("OPENAI_IMAGE_OUTPUT_BASE64_INVALID");
  }
  const maxEncodedLength = Math.ceil(OPENAI_IMAGE_MAX_DECODED_BYTES / 3) * 4;
  if (length > maxEncodedLength) {
    throw new Error("OPENAI_IMAGE_OUTPUT_TOO_LARGE");
  }
}

function decodeBase64Image(value: unknown) {
  const encoded = typeof value === "string" ? value.trim() : "";
  if (!encoded) throw new Error("OPENAI_IMAGE_OUTPUT_B64_REQUIRED");
  validateOpenAIImageBase64EncodedLength(encoded.length);
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || encoded.length % 4 === 1) {
    throw new Error("OPENAI_IMAGE_OUTPUT_BASE64_INVALID");
  }

  const unpadded = encoded.replace(/=+$/, "");
  const padding = (4 - (unpadded.length % 4)) % 4;
  const normalized = `${unpadded}${"=".repeat(padding)}`;
  let bytes: Buffer;
  try {
    bytes = Buffer.from(normalized, "base64");
  } catch {
    throw new Error("OPENAI_IMAGE_OUTPUT_BASE64_INVALID");
  }
  if (!bytes.length) throw new Error("OPENAI_IMAGE_OUTPUT_EMPTY");
  if (bytes.length > OPENAI_IMAGE_MAX_DECODED_BYTES) {
    throw new Error("OPENAI_IMAGE_OUTPUT_TOO_LARGE");
  }

  const canonicalInput = unpadded;
  const canonicalDecoded = bytes.toString("base64").replace(/=+$/, "");
  if (canonicalDecoded !== canonicalInput) {
    throw new Error("OPENAI_IMAGE_OUTPUT_BASE64_INVALID");
  }
  return bytes;
}

export function parseOpenAIImageGenerationOutput(
  value: Record<string, unknown> | null | undefined,
): OpenAIImageDecodedOutput {
  if (!plainObject(value)) throw new Error("OPENAI_IMAGE_OUTPUT_INVALID");
  if (!Array.isArray(value.data) || value.data.length < 1) {
    throw new Error("OPENAI_IMAGE_OUTPUT_DATA_REQUIRED");
  }
  const first = value.data[0];
  if (!plainObject(first)) throw new Error("OPENAI_IMAGE_OUTPUT_ITEM_INVALID");

  const bytes = decodeBase64Image(first.b64_json);
  if (bytes.length < PNG_SIGNATURE.length || !bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new Error("OPENAI_IMAGE_OUTPUT_NOT_PNG");
  }

  const created = Number(value.created);
  const createdAt = Number.isFinite(created) && created >= 0 ? created : null;
  const revisedPrompt = typeof first.revised_prompt === "string" && first.revised_prompt.trim()
    ? first.revised_prompt.trim()
    : null;
  const usage = plainObject(value.usage) ? { ...value.usage } : null;

  return {
    provider: "openai-image",
    format: "png",
    mime: "image/png",
    bytes,
    byte_length: bytes.length,
    created_at: createdAt,
    revised_prompt: revisedPrompt,
    usage,
  };
}

export const openAIImageOutputFacts = Object.freeze({
  provider: "openai-image" as const,
  expected_wire_field: "data[0].b64_json" as const,
  output_format: "png" as const,
  mime: "image/png" as const,
  max_decoded_bytes: OPENAI_IMAGE_MAX_DECODED_BYTES,
  filesystem_write: false,
  provider_call: false,
  authority: "DECODE_VALIDATE_ONLY" as const,
});
