import type { FastifyInstance } from "fastify";
import { readCloudRegistry, type CloudRegistry } from "./v2-cloud.js";

const BUDGET_FIELDS = ["per_job", "per_sku", "daily", "monthly"] as const;
const IMPLEMENTED_PROVIDER_ADAPTERS = new Set<string>();

type Dependencies = {
  assertLocalRequest: (req: any) => void;
};

export type CloudActivationPreflightRequest = {
  provider_key?: unknown;
  model_key?: unknown;
  [key: string]: unknown;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function normalizeCloudActivationPreflightRequest(
  body: CloudActivationPreflightRequest | null | undefined,
) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("CLOUD_ACTIVATION_PREFLIGHT_REQUEST_INVALID");
  }
  const source = body as Record<string, unknown>;
  const allowed = new Set(["provider_key", "model_key"]);
  if (Object.keys(source).some((key) => !allowed.has(key))) {
    throw new Error("CLOUD_ACTIVATION_PREFLIGHT_SCOPE_VIOLATION");
  }
  return {
    provider_key: typeof source.provider_key === "string" && source.provider_key.trim()
      ? source.provider_key.trim()
      : undefined,
    model_key: typeof source.model_key === "string" && source.model_key.trim()
      ? source.model_key.trim()
      : undefined,
  };
}

export function evaluateCloudActivationPreflight(
  registry: CloudRegistry,
  input: { provider_key?: string; model_key?: string },
  credentialConfigured: (credentialEnv: string) => boolean = (credentialEnv) =>
    Boolean(process.env[credentialEnv]),
) {
  const blockers: string[] = [];
  const provider = registry.providers.find((row) => row.provider_key === input.provider_key);
  const model = provider?.models.find((row) => row.model_key === input.model_key);

  if (!registry.cloud_enabled) blockers.push("CLOUD_DISABLED");

  if (!input.provider_key) {
    blockers.push("PROVIDER_REQUIRED");
  } else if (!provider) {
    blockers.push("PROVIDER_NOT_REGISTERED");
  } else {
    if (!provider.enabled) blockers.push("PROVIDER_DISABLED");
    if (provider.adapter_status !== "READY") blockers.push("PROVIDER_ADAPTER_NOT_READY");
    if (!credentialConfigured(provider.credential_env)) blockers.push("PROVIDER_CREDENTIAL_MISSING");
    if (provider.pricing_status !== "KNOWN") blockers.push("PROVIDER_PRICING_UNKNOWN");
    if (!IMPLEMENTED_PROVIDER_ADAPTERS.has(provider.provider_key)) {
      blockers.push("PROVIDER_SUBMISSION_ADAPTER_ABSENT");
    }
  }

  if (!input.model_key) {
    blockers.push("MODEL_REQUIRED");
  } else if (provider && !model) {
    blockers.push("MODEL_NOT_REGISTERED");
  } else if (model) {
    if (!model.enabled) blockers.push("MODEL_DISABLED");
    if ((model.pricing_status ?? provider?.pricing_status) !== "KNOWN") {
      blockers.push("MODEL_PRICING_UNKNOWN");
    }
  }

  for (const field of BUDGET_FIELDS) {
    if (registry.limits[field] <= 0) {
      blockers.push(`${field.toUpperCase()}_LIMIT_NOT_CONFIGURED`);
    }
  }

  const uniqueBlockers = [...new Set(blockers)];
  return {
    activation_ready: uniqueBlockers.length === 0,
    fail_closed: true,
    provider_key: input.provider_key ?? null,
    model_key: input.model_key ?? null,
    credential_configured: provider ? credentialConfigured(provider.credential_env) : false,
    budget_source: registry.budget_policy?.source ?? "REGISTRY_DEFAULT",
    budget_persisted: Boolean(registry.budget_policy?.persisted),
    blockers: uniqueBlockers,
  };
}

export async function registerV2CloudActivationRoutes(app: FastifyInstance, deps: Dependencies) {
  app.post("/api/v2/cloud/activation-preflight", async (req, reply) => {
    try {
      deps.assertLocalRequest(req);
      const registry = await readCloudRegistry();
      const input = normalizeCloudActivationPreflightRequest(
        (req.body ?? {}) as CloudActivationPreflightRequest,
      );
      const preflight = evaluateCloudActivationPreflight(registry, input);
      return {
        ok: true,
        generated_at: new Date().toISOString(),
        authority: "CLOUD_ACTIVATION_PREFLIGHT_ONLY",
        preflight,
        audit: {
          mutation: false,
          provider_call: false,
          credential_write: false,
          registry_write: false,
          budget_write: false,
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
