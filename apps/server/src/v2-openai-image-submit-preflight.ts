import type { FastifyInstance } from "fastify";
import { readCloudRegistry, type CloudRegistry } from "./v2-cloud.js";
import {
  evaluateOpenAIImageSubmit,
  normalizeOpenAIImageSubmit,
  paidProviderNetworkEnabled,
  type OpenAIImageSubmitInput,
  type NormalizedOpenAIImageSubmit,
} from "./v2-openai-image-submit.js";

const AUTHORITY = "OPENAI_IMAGE_SUBMIT_PREFLIGHT_ONLY";

type Dependencies = {
  assertLocalRequest: (req: any) => void;
};

type PreflightOptions = {
  credentialConfigured?: (credentialEnv: string) => boolean;
  networkExecutionEnabled?: () => boolean;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function buildOpenAIImageSubmitPreflight(
  registry: CloudRegistry,
  input: NormalizedOpenAIImageSubmit,
  options: PreflightOptions = {},
) {
  const evaluation = evaluateOpenAIImageSubmit(registry, input, {
    credentialConfigured: options.credentialConfigured ?? ((credentialEnv) => Boolean(process.env[credentialEnv])),
    networkExecutionEnabled: options.networkExecutionEnabled ?? paidProviderNetworkEnabled,
  });

  return {
    authority: AUTHORITY,
    ready_for_provider_call: evaluation.executable,
    fail_closed: !evaluation.executable,
    provider_key: evaluation.provider.provider_key,
    model_key: evaluation.model.model_key,
    request_model: evaluation.request_model,
    estimated_cost: input.estimated_cost,
    spend: { ...input.spend },
    request: {
      operation_id: input.operation_id,
      site_id: input.site_id,
      item_id: input.item_id,
      job_id: input.job_id,
      prompt_chars: input.prompt.length,
      acknowledgement_present: true,
    },
    activation_preflight: evaluation.preflight,
    cost_guard: evaluation.guard,
    blockers: evaluation.blockers,
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
}

export async function registerV2OpenAIImageSubmitPreflightRoutes(
  app: FastifyInstance,
  deps: Dependencies,
) {
  app.post("/api/v2/cloud/openai-image/submit-preflight", async (req, reply) => {
    try {
      deps.assertLocalRequest(req);
      const input = normalizeOpenAIImageSubmit((req.body ?? {}) as OpenAIImageSubmitInput);
      const registry = await readCloudRegistry();
      const preflight = buildOpenAIImageSubmitPreflight(registry, input);
      return {
        ok: true,
        generated_at: new Date().toISOString(),
        ...preflight,
      };
    } catch (error) {
      return reply.code(400).send({
        error: errorMessage(error),
        fail_closed: true,
        authority: AUTHORITY,
      });
    }
  });
}
