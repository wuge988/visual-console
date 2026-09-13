import type { FastifyInstance } from "fastify";
import { evaluateCloudActivationPreflight } from "./v2-cloud-activation.js";
import { evaluateCostGuard, readCloudRegistry, type CloudRegistry } from "./v2-cloud.js";
import { appendCloudSpendEvent, type CloudSpendLedgerEvent } from "./v2-cloud-spend.js";
import {
  normalizeOpenAIImageRequestPlan,
  type OpenAIImageRequestPlanInput,
} from "./v2-openai-image-plan.js";

const PROVIDER_KEY = "openai-image";
const OPENAI_IMAGE_ENDPOINT = "https://api.openai.com/v1/images/generations";
const NETWORK_EXECUTION_ENV = "VISUAL_CONSOLE_ALLOW_PAID_PROVIDER_CALLS";
const PROVIDER_ACK = "OPENAI_IMAGE_PROVIDER_CALL";

type Dependencies = {
  assertLocalRequest: (req: any) => void;
};

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
type AppendSpendLike = (input: Parameters<typeof appendCloudSpendEvent>[0]) => Promise<CloudSpendLedgerEvent>;

export type OpenAIImageSubmitInput = OpenAIImageRequestPlanInput & {
  operation_id?: unknown;
  site_id?: unknown;
  item_id?: unknown;
  job_id?: unknown;
  acknowledge?: unknown;
};

export type NormalizedOpenAIImageSubmit = {
  operation_id: string;
  site_id: string;
  item_id: string;
  job_id: string;
  model_key: string;
  prompt: string;
  estimated_cost: number;
  spend: {
    sku: number;
    daily: number;
    monthly: number;
  };
  acknowledge: typeof PROVIDER_ACK;
};

export class OpenAIImageSubmitBlockedError extends Error {
  blockers: string[];

  constructor(blockers: string[]) {
    super("OPENAI_IMAGE_SUBMIT_BLOCKED");
    this.blockers = [...new Set(blockers)];
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function requiredIdentifier(value: unknown, code: string) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || text.length > 200 || !/^[A-Za-z0-9._:-]+$/.test(text)) throw new Error(code);
  return text;
}

export function paidProviderNetworkEnabled() {
  return process.env[NETWORK_EXECUTION_ENV] === "1";
}

export function normalizeOpenAIImageSubmit(
  body: OpenAIImageSubmitInput | null | undefined,
): NormalizedOpenAIImageSubmit {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("OPENAI_IMAGE_SUBMIT_REQUEST_INVALID");
  }
  const source = body as Record<string, unknown>;
  const allowed = new Set([
    "operation_id",
    "site_id",
    "item_id",
    "job_id",
    "model_key",
    "prompt",
    "estimated_cost",
    "spend",
    "acknowledge",
  ]);
  if (Object.keys(source).some((key) => !allowed.has(key))) {
    throw new Error("OPENAI_IMAGE_SUBMIT_SCOPE_VIOLATION");
  }
  if (source.acknowledge !== PROVIDER_ACK) {
    throw new Error("OPENAI_IMAGE_SUBMIT_ACK_REQUIRED");
  }

  const planInput = normalizeOpenAIImageRequestPlan({
    model_key: source.model_key,
    prompt: source.prompt,
    estimated_cost: source.estimated_cost,
    spend: source.spend,
  });
  if (planInput.estimated_cost == null) {
    throw new Error("OPENAI_IMAGE_SUBMIT_ESTIMATED_COST_REQUIRED");
  }

  return {
    operation_id: requiredIdentifier(source.operation_id, "OPENAI_IMAGE_SUBMIT_OPERATION_ID_INVALID"),
    site_id: requiredIdentifier(source.site_id, "OPENAI_IMAGE_SUBMIT_SITE_ID_INVALID"),
    item_id: requiredIdentifier(source.item_id, "OPENAI_IMAGE_SUBMIT_ITEM_ID_INVALID"),
    job_id: requiredIdentifier(source.job_id, "OPENAI_IMAGE_SUBMIT_JOB_ID_INVALID"),
    model_key: planInput.model_key,
    prompt: planInput.prompt,
    estimated_cost: planInput.estimated_cost,
    spend: planInput.spend,
    acknowledge: PROVIDER_ACK,
  };
}

function compactUsage(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const numberOrNull = (candidate: unknown) => {
    const parsed = Number(candidate);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  };
  const inputDetails = row.input_tokens_details && typeof row.input_tokens_details === "object"
    ? row.input_tokens_details as Record<string, unknown>
    : {};
  const outputDetails = row.output_tokens_details && typeof row.output_tokens_details === "object"
    ? row.output_tokens_details as Record<string, unknown>
    : {};
  return {
    input_tokens: numberOrNull(row.input_tokens),
    output_tokens: numberOrNull(row.output_tokens),
    total_tokens: numberOrNull(row.total_tokens),
    input_text_tokens: numberOrNull(inputDetails.text_tokens),
    input_image_tokens: numberOrNull(inputDetails.image_tokens),
    output_image_tokens: numberOrNull(outputDetails.image_tokens),
  };
}

export function evaluateOpenAIImageSubmit(
  registry: CloudRegistry,
  input: NormalizedOpenAIImageSubmit,
  options: {
    credentialConfigured?: (credentialEnv: string) => boolean;
    networkExecutionEnabled?: () => boolean;
  } = {},
) {
  const provider = registry.providers.find((row) => row.provider_key === PROVIDER_KEY);
  if (!provider) throw new Error("OPENAI_IMAGE_PROVIDER_NOT_REGISTERED");
  const model = provider.models.find((row) => row.model_key === input.model_key);
  if (!model) throw new Error("OPENAI_IMAGE_MODEL_NOT_REGISTERED");
  if ((model.media_type ?? provider.media_types[0]) !== "image") {
    throw new Error("OPENAI_IMAGE_MODEL_MEDIA_TYPE_INVALID");
  }

  const preflight = evaluateCloudActivationPreflight(
    registry,
    { provider_key: PROVIDER_KEY, model_key: model.model_key },
    options.credentialConfigured,
    options.networkExecutionEnabled,
  );
  const guard = evaluateCostGuard({
    registry,
    provider_key: PROVIDER_KEY,
    model_key: model.model_key,
    estimated_cost: input.estimated_cost,
    spend: input.spend,
  });
  const blockers = [
    ...preflight.blockers,
    ...guard.reasons.map((reason) => `COST_GUARD:${reason}`),
  ];

  return {
    provider,
    model,
    request_model: model.snapshot || model.model_key,
    preflight,
    guard,
    blockers: [...new Set(blockers)],
    executable: blockers.length === 0,
  };
}

export async function executeOpenAIImageSubmit(
  registry: CloudRegistry,
  input: NormalizedOpenAIImageSubmit,
  options: {
    apiKey?: string;
    fetchImpl?: FetchLike;
    appendSpend?: AppendSpendLike;
    networkExecutionEnabled?: () => boolean;
  } = {},
) {
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY ?? "";
  const networkExecutionEnabled = options.networkExecutionEnabled ?? paidProviderNetworkEnabled;
  const evaluation = evaluateOpenAIImageSubmit(registry, input, {
    credentialConfigured: () => Boolean(apiKey),
    networkExecutionEnabled,
  });
  if (!evaluation.executable) {
    throw new OpenAIImageSubmitBlockedError(evaluation.blockers);
  }

  const appendSpend = options.appendSpend ?? appendCloudSpendEvent;
  const reservation = await appendSpend({
    event_type: "RESERVATION",
    spend_id: `openai-image:${input.operation_id}`,
    site_id: input.site_id,
    job_id: input.job_id,
    item_id: input.item_id,
    provider_key: PROVIDER_KEY,
    model_key: input.model_key,
    amount: input.estimated_cost,
    currency: evaluation.guard.currency,
    approval_source: "OPENAI_IMAGE_PROVIDER_CALL_ACK",
  });

  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const response = await fetchImpl(OPENAI_IMAGE_ENDPOINT, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: evaluation.request_model,
      prompt: input.prompt,
      n: 1,
      output_format: "png",
    }),
  });

  const providerRequestId = response.headers.get("x-request-id");
  if (!response.ok) {
    throw new Error(`OPENAI_IMAGE_PROVIDER_HTTP_${response.status}`);
  }
  const payload = await response.json() as any;
  const imageB64 = typeof payload?.data?.[0]?.b64_json === "string" ? payload.data[0].b64_json : "";
  if (!imageB64) throw new Error("OPENAI_IMAGE_PROVIDER_RESPONSE_INVALID");

  return {
    provider_key: PROVIDER_KEY,
    model_key: input.model_key,
    request_model: evaluation.request_model,
    output_format: typeof payload?.output_format === "string" ? payload.output_format : "png",
    quality: typeof payload?.quality === "string" ? payload.quality : null,
    size: typeof payload?.size === "string" ? payload.size : null,
    created: Number.isFinite(Number(payload?.created)) ? Number(payload.created) : null,
    image_b64: imageB64,
    usage: compactUsage(payload?.usage),
    provider_request_id: providerRequestId,
    reservation: {
      spend_id: reservation.spend_id,
      amount: reservation.amount,
      currency: reservation.currency,
      event_id: reservation.event_id,
    },
    spend_status: "RESERVED_ESTIMATE_UNSETTLED" as const,
  };
}

export async function registerV2OpenAIImageSubmitRoutes(
  app: FastifyInstance,
  deps: Dependencies,
) {
  app.post("/api/v2/cloud/openai-image/submit", async (req, reply) => {
    try {
      deps.assertLocalRequest(req);
      const input = normalizeOpenAIImageSubmit((req.body ?? {}) as OpenAIImageSubmitInput);
      const registry = await readCloudRegistry();
      const result = await executeOpenAIImageSubmit(registry, input);
      return {
        ok: true,
        generated_at: new Date().toISOString(),
        authority: "OPENAI_IMAGE_PROVIDER_EXECUTION",
        result,
        audit: {
          mutation: true,
          provider_call: true,
          credential_write: false,
          adapter_write: false,
          registry_write: false,
          budget_write: false,
          spend_write: true,
          job_write: false,
          qa_write: false,
          archive_write: false,
          source_write: false,
        },
      };
    } catch (error) {
      if (error instanceof OpenAIImageSubmitBlockedError) {
        return reply.code(409).send({
          error: error.message,
          fail_closed: true,
          blockers: error.blockers,
        });
      }
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });
}
