import type { FastifyInstance } from "fastify";
import { evaluateCloudActivationPreflight } from "./v2-cloud-activation.js";
import { evaluateCostGuard, readCloudRegistry, type CloudRegistry } from "./v2-cloud.js";

const PROVIDER_KEY = "openai-image";
const OPENAI_IMAGE_ENDPOINT = "https://api.openai.com/v1/images/generations";
const LOCAL_PROMPT_LIMIT = 65_536;

type Dependencies = {
  assertLocalRequest: (req: any) => void;
};

export type OpenAIImageRequestPlanInput = {
  model_key?: unknown;
  prompt?: unknown;
  estimated_cost?: unknown;
  spend?: unknown;
  [key: string]: unknown;
};

export type NormalizedOpenAIImageRequestPlan = {
  model_key: string;
  prompt: string;
  estimated_cost: number | null;
  spend: {
    sku: number;
    daily: number;
    monthly: number;
  };
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function optionalNonNegative(value: unknown, code: string) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(code);
  return parsed;
}

function normalizeSpend(value: unknown) {
  if (value == null) return { sku: 0, daily: 0, monthly: 0 };
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("OPENAI_IMAGE_PLAN_SPEND_INVALID");
  }
  const source = value as Record<string, unknown>;
  const allowed = new Set(["sku", "daily", "monthly"]);
  if (Object.keys(source).some((key) => !allowed.has(key))) {
    throw new Error("OPENAI_IMAGE_PLAN_SPEND_SCOPE_VIOLATION");
  }
  return {
    sku: optionalNonNegative(source.sku, "OPENAI_IMAGE_PLAN_SPEND_INVALID") ?? 0,
    daily: optionalNonNegative(source.daily, "OPENAI_IMAGE_PLAN_SPEND_INVALID") ?? 0,
    monthly: optionalNonNegative(source.monthly, "OPENAI_IMAGE_PLAN_SPEND_INVALID") ?? 0,
  };
}

export function normalizeOpenAIImageRequestPlan(
  body: OpenAIImageRequestPlanInput | null | undefined,
): NormalizedOpenAIImageRequestPlan {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("OPENAI_IMAGE_PLAN_REQUEST_INVALID");
  }
  const source = body as Record<string, unknown>;
  const allowed = new Set(["model_key", "prompt", "estimated_cost", "spend"]);
  if (Object.keys(source).some((key) => !allowed.has(key))) {
    throw new Error("OPENAI_IMAGE_PLAN_SCOPE_VIOLATION");
  }

  const modelKey = typeof source.model_key === "string" ? source.model_key.trim() : "";
  if (!modelKey) throw new Error("OPENAI_IMAGE_PLAN_MODEL_REQUIRED");

  const prompt = typeof source.prompt === "string" ? source.prompt.trim() : "";
  if (!prompt) throw new Error("OPENAI_IMAGE_PLAN_PROMPT_REQUIRED");
  if (prompt.length > LOCAL_PROMPT_LIMIT) throw new Error("OPENAI_IMAGE_PLAN_PROMPT_LOCAL_LIMIT");

  return {
    model_key: modelKey,
    prompt,
    estimated_cost: optionalNonNegative(
      source.estimated_cost,
      "OPENAI_IMAGE_PLAN_ESTIMATED_COST_INVALID",
    ),
    spend: normalizeSpend(source.spend),
  };
}

export function buildOpenAIImageRequestPlan(
  registry: CloudRegistry,
  input: NormalizedOpenAIImageRequestPlan,
) {
  const provider = registry.providers.find((row) => row.provider_key === PROVIDER_KEY);
  if (!provider) throw new Error("OPENAI_IMAGE_PROVIDER_NOT_REGISTERED");
  const model = provider.models.find((row) => row.model_key === input.model_key);
  if (!model) throw new Error("OPENAI_IMAGE_MODEL_NOT_REGISTERED");
  if ((model.media_type ?? provider.media_types[0]) !== "image") {
    throw new Error("OPENAI_IMAGE_MODEL_MEDIA_TYPE_INVALID");
  }

  const requestModel = model.snapshot || model.model_key;
  const preflight = evaluateCloudActivationPreflight(registry, {
    provider_key: PROVIDER_KEY,
    model_key: model.model_key,
  });
  const guard = evaluateCostGuard({
    registry,
    provider_key: PROVIDER_KEY,
    model_key: model.model_key,
    estimated_cost: input.estimated_cost,
    spend: input.spend,
  });

  return {
    provider_key: PROVIDER_KEY,
    model_key: model.model_key,
    request_model: requestModel,
    endpoint: OPENAI_IMAGE_ENDPOINT,
    method: "POST" as const,
    request: {
      headers: {
        authorization: "Bearer ***",
        "content-type": "application/json",
      },
      body: {
        model: requestModel,
        prompt: input.prompt,
        output_format: "png" as const,
      },
    },
    estimated_cost: input.estimated_cost,
    cost_guard: guard,
    activation_preflight: preflight,
    plan_ready: true,
    executable: false,
    execution_blocker: "OPENAI_IMAGE_NETWORK_EXECUTION_NOT_IMPLEMENTED",
  };
}

export async function registerV2OpenAIImagePlanRoutes(
  app: FastifyInstance,
  deps: Dependencies,
) {
  app.post("/api/v2/cloud/openai-image/request-plan", async (req, reply) => {
    try {
      deps.assertLocalRequest(req);
      const registry = await readCloudRegistry();
      const input = normalizeOpenAIImageRequestPlan(
        (req.body ?? {}) as OpenAIImageRequestPlanInput,
      );
      const plan = buildOpenAIImageRequestPlan(registry, input);
      return {
        ok: true,
        generated_at: new Date().toISOString(),
        authority: "OPENAI_IMAGE_REQUEST_PLAN_ONLY",
        plan,
        audit: {
          mutation: false,
          provider_call: false,
          credential_write: false,
          adapter_write: false,
          registry_write: false,
          budget_write: false,
          spend_write: false,
          job_write: false,
          qa_write: false,
          archive_write: false,
          source_write: false,
        },
      };
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });
}
