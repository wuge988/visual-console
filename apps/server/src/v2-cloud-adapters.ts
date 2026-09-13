import type { FastifyInstance } from "fastify";
import { readCloudRegistry, type CloudRegistry } from "./v2-cloud.js";

export type ProviderAdapterImplementationStatus = "NOT_IMPLEMENTED" | "PLANNING_ONLY" | "READY";

export type ProviderAdapterContract = {
  provider_key: string;
  contract_version: "1.0";
  implementation_status: ProviderAdapterImplementationStatus;
  media_types: string[];
  network_execution: boolean;
  submission_adapter: string | null;
  submit_path: string | null;
};

type Dependencies = {
  assertLocalRequest: (req: any) => void;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

const CONTRACTS: Record<string, ProviderAdapterContract> = {
  "openai-image": {
    provider_key: "openai-image",
    contract_version: "1.0",
    implementation_status: "NOT_IMPLEMENTED",
    media_types: ["image"],
    network_execution: false,
    submission_adapter: null,
    submit_path: null,
  },
  "seedance-video": {
    provider_key: "seedance-video",
    contract_version: "1.0",
    implementation_status: "NOT_IMPLEMENTED",
    media_types: ["video"],
    network_execution: false,
    submission_adapter: null,
    submit_path: null,
  },
};

export function providerAdapterContract(providerKey: string): ProviderAdapterContract | null {
  return CONTRACTS[providerKey] ? { ...CONTRACTS[providerKey], media_types: [...CONTRACTS[providerKey].media_types] } : null;
}

export function hasExecutableProviderAdapter(providerKey: string) {
  const contract = CONTRACTS[providerKey];
  return Boolean(
    contract
    && contract.implementation_status === "READY"
    && contract.network_execution
    && contract.submission_adapter
    && contract.submit_path,
  );
}

export function projectProviderAdapterContracts(registry: CloudRegistry) {
  return registry.providers.map((provider) => {
    const contract = providerAdapterContract(provider.provider_key);
    return {
      provider_key: provider.provider_key,
      display_name: provider.display_name,
      registry_adapter_status: provider.adapter_status,
      contract_version: contract?.contract_version ?? "1.0",
      implementation_status: contract?.implementation_status ?? "NOT_IMPLEMENTED",
      media_types: contract?.media_types ?? [...provider.media_types],
      network_execution: Boolean(contract?.network_execution),
      submission_adapter: contract?.submission_adapter ?? null,
      submit_path: contract?.submit_path ?? null,
      executable: hasExecutableProviderAdapter(provider.provider_key),
    };
  });
}

export async function registerV2CloudAdapterRoutes(app: FastifyInstance, deps: Dependencies) {
  app.get("/api/v2/cloud/adapters", async (req, reply) => {
    try {
      deps.assertLocalRequest(req);
      const registry = await readCloudRegistry();
      return {
        ok: true,
        generated_at: new Date().toISOString(),
        authority: "PROVIDER_ADAPTER_REGISTRY_READ_ONLY",
        adapters: projectProviderAdapterContracts(registry),
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
