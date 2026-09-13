const OPENAI_IMAGE_ENDPOINT = "https://api.openai.com/v1/images/generations";
const MAX_PROMPT_CHARS = 65_536;

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type OpenAIImageTransportInput = {
  request_model: string;
  prompt: string;
};

export type OpenAIImageTransportResult = {
  provider: "openai-image";
  endpoint: typeof OPENAI_IMAGE_ENDPOINT;
  http_status: number;
  request_id: string | null;
  body: Record<string, unknown>;
};

function requiredText(value: unknown, code: string, maxLength = 512) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || text.length > maxLength) throw new Error(code);
  return text;
}

export function normalizeOpenAIImageTransportInput(
  value: OpenAIImageTransportInput | null | undefined,
): OpenAIImageTransportInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("OPENAI_IMAGE_TRANSPORT_REQUEST_INVALID");
  }
  const source = value as Record<string, unknown>;
  const allowed = new Set(["request_model", "prompt"]);
  if (Object.keys(source).some((key) => !allowed.has(key))) {
    throw new Error("OPENAI_IMAGE_TRANSPORT_SCOPE_VIOLATION");
  }
  return {
    request_model: requiredText(
      source.request_model,
      "OPENAI_IMAGE_TRANSPORT_MODEL_REQUIRED",
      200,
    ),
    prompt: requiredText(
      source.prompt,
      "OPENAI_IMAGE_TRANSPORT_PROMPT_REQUIRED",
      MAX_PROMPT_CHARS,
    ),
  };
}

export async function executeOpenAIImageTransport(
  value: OpenAIImageTransportInput,
  apiKey: string,
  fetchImpl: FetchLike = fetch,
): Promise<OpenAIImageTransportResult> {
  const input = normalizeOpenAIImageTransportInput(value);
  const credential = typeof apiKey === "string" ? apiKey.trim() : "";
  if (!credential) throw new Error("OPENAI_IMAGE_TRANSPORT_CREDENTIAL_MISSING");

  let response: Response;
  try {
    response = await fetchImpl(OPENAI_IMAGE_ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${credential}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: input.request_model,
        prompt: input.prompt,
      }),
    });
  } catch {
    throw new Error("OPENAI_IMAGE_PROVIDER_NETWORK_ERROR");
  }

  if (!response.ok) {
    throw new Error(`OPENAI_IMAGE_PROVIDER_HTTP_${response.status}`);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error("OPENAI_IMAGE_PROVIDER_RESPONSE_INVALID_JSON");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("OPENAI_IMAGE_PROVIDER_RESPONSE_INVALID");
  }

  return {
    provider: "openai-image",
    endpoint: OPENAI_IMAGE_ENDPOINT,
    http_status: response.status,
    request_id: response.headers.get("x-request-id"),
    body: body as Record<string, unknown>,
  };
}

export const openAIImageTransportFacts = Object.freeze({
  provider: "openai-image" as const,
  endpoint: OPENAI_IMAGE_ENDPOINT,
  network_execution_primitive: true,
  http_route_exposed: false,
  credential_source: "CALLER_INJECTED_ONLY" as const,
  authority: "NO_HTTP_ROUTE_NO_EXECUTION_AUTHORITY" as const,
});
