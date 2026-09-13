import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { CloudRegistry } from "./v2-cloud.js";

const ROOT = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const ACTIVATION_POLICY_PATH = join(ROOT, ".visual-console-runtime", "v2-cloud-activation-policy.json");

export type ActivationModelPolicy = {
  model_key: string;
  enabled: boolean;
};

export type ActivationProviderPolicy = {
  provider_key: string;
  enabled: boolean;
  models: ActivationModelPolicy[];
};

export type CloudActivationPolicyRecord = {
  schema_version: "1.0";
  updated_at: string;
  cloud_enabled: boolean;
  providers: ActivationProviderPolicy[];
};

export type CloudActivationPolicyWriteRequest = {
  acknowledge?: unknown;
  cloud_enabled?: unknown;
  providers?: unknown;
  [key: string]: unknown;
};

function requiredBoolean(value: unknown, code: string) {
  if (typeof value !== "boolean") throw new Error(code);
  return value;
}

function requiredKey(value: unknown, code: string) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || text.length > 200 || !/^[A-Za-z0-9._:-]+$/.test(text)) throw new Error(code);
  return text;
}

function normalizeModel(value: unknown): ActivationModelPolicy {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("CLOUD_ACTIVATION_MODEL_INVALID");
  }
  const source = value as Record<string, unknown>;
  const allowed = new Set(["model_key", "enabled"]);
  if (Object.keys(source).some((key) => !allowed.has(key))) {
    throw new Error("CLOUD_ACTIVATION_POLICY_SCOPE_VIOLATION");
  }
  return {
    model_key: requiredKey(source.model_key, "CLOUD_ACTIVATION_MODEL_KEY_INVALID"),
    enabled: requiredBoolean(source.enabled, "CLOUD_ACTIVATION_MODEL_ENABLED_INVALID"),
  };
}

function normalizeProvider(value: unknown): ActivationProviderPolicy {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("CLOUD_ACTIVATION_PROVIDER_INVALID");
  }
  const source = value as Record<string, unknown>;
  const allowed = new Set(["provider_key", "enabled", "models"]);
  if (Object.keys(source).some((key) => !allowed.has(key))) {
    throw new Error("CLOUD_ACTIVATION_POLICY_SCOPE_VIOLATION");
  }
  if (!Array.isArray(source.models)) throw new Error("CLOUD_ACTIVATION_MODELS_INVALID");
  return {
    provider_key: requiredKey(source.provider_key, "CLOUD_ACTIVATION_PROVIDER_KEY_INVALID"),
    enabled: requiredBoolean(source.enabled, "CLOUD_ACTIVATION_PROVIDER_ENABLED_INVALID"),
    models: source.models.map(normalizeModel),
  };
}

export function normalizeCloudActivationPolicyWriteRequest(
  body: CloudActivationPolicyWriteRequest | null | undefined,
) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("CLOUD_ACTIVATION_POLICY_REQUEST_INVALID");
  }
  const source = body as Record<string, unknown>;
  const allowed = new Set(["acknowledge", "cloud_enabled", "providers"]);
  if (Object.keys(source).some((key) => !allowed.has(key))) {
    throw new Error("CLOUD_ACTIVATION_POLICY_SCOPE_VIOLATION");
  }
  if (source.acknowledge !== "CLOUD_ACTIVATION_POLICY_ONLY") {
    throw new Error("CLOUD_ACTIVATION_POLICY_ACK_REQUIRED");
  }
  if (!Array.isArray(source.providers)) throw new Error("CLOUD_ACTIVATION_PROVIDERS_INVALID");
  return {
    cloud_enabled: requiredBoolean(source.cloud_enabled, "CLOUD_ACTIVATION_CLOUD_ENABLED_INVALID"),
    providers: source.providers.map(normalizeProvider),
  };
}

export function validateActivationPolicyAgainstRegistry(
  policy: Pick<CloudActivationPolicyRecord, "cloud_enabled" | "providers">,
  registry: CloudRegistry,
) {
  const providerKeys = policy.providers.map((row) => row.provider_key);
  if (new Set(providerKeys).size !== providerKeys.length) {
    throw new Error("CLOUD_ACTIVATION_PROVIDER_DUPLICATE");
  }

  const registryProviderKeys = registry.providers.map((row) => row.provider_key).sort();
  const policyProviderKeys = [...providerKeys].sort();
  if (JSON.stringify(registryProviderKeys) !== JSON.stringify(policyProviderKeys)) {
    throw new Error("CLOUD_ACTIVATION_PROVIDER_COVERAGE_MISMATCH");
  }

  for (const providerPolicy of policy.providers) {
    const provider = registry.providers.find((row) => row.provider_key === providerPolicy.provider_key);
    if (!provider) throw new Error("CLOUD_ACTIVATION_PROVIDER_NOT_REGISTERED");
    const modelKeys = providerPolicy.models.map((row) => row.model_key);
    if (new Set(modelKeys).size !== modelKeys.length) throw new Error("CLOUD_ACTIVATION_MODEL_DUPLICATE");
    const registryModelKeys = provider.models.map((row) => row.model_key).sort();
    const policyModelKeys = [...modelKeys].sort();
    if (JSON.stringify(registryModelKeys) !== JSON.stringify(policyModelKeys)) {
      throw new Error("CLOUD_ACTIVATION_MODEL_COVERAGE_MISMATCH");
    }
  }

  return policy;
}

export function applyActivationPolicy(
  registry: CloudRegistry,
  policy: CloudActivationPolicyRecord,
): CloudRegistry {
  validateActivationPolicyAgainstRegistry(policy, registry);
  const providerPolicies = new Map(policy.providers.map((row) => [row.provider_key, row]));
  return {
    ...registry,
    cloud_enabled: policy.cloud_enabled,
    providers: registry.providers.map((provider) => {
      const providerPolicy = providerPolicies.get(provider.provider_key)!;
      const modelPolicies = new Map(providerPolicy.models.map((row) => [row.model_key, row.enabled]));
      return {
        ...provider,
        enabled: providerPolicy.enabled,
        models: provider.models.map((model) => ({
          ...model,
          enabled: Boolean(modelPolicies.get(model.model_key)),
        })),
      };
    }),
    activation_policy: {
      source: "RUNTIME_POLICY",
      persisted: true,
      updated_at: policy.updated_at,
    },
  };
}

export async function readActivationPolicyRecord(): Promise<CloudActivationPolicyRecord | null> {
  try {
    const parsed = JSON.parse(await readFile(ACTIVATION_POLICY_PATH, "utf8"));
    if (String(parsed?.schema_version ?? "") !== "1.0" || typeof parsed?.updated_at !== "string") {
      throw new Error("CLOUD_ACTIVATION_POLICY_INVALID");
    }
    const normalized = normalizeCloudActivationPolicyWriteRequest({
      acknowledge: "CLOUD_ACTIVATION_POLICY_ONLY",
      cloud_enabled: parsed.cloud_enabled,
      providers: parsed.providers,
    });
    return {
      schema_version: "1.0",
      updated_at: new Date(parsed.updated_at).toISOString(),
      ...normalized,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return null;
    throw error;
  }
}

export async function persistActivationPolicy(
  policy: Pick<CloudActivationPolicyRecord, "cloud_enabled" | "providers">,
): Promise<CloudActivationPolicyRecord> {
  const record: CloudActivationPolicyRecord = {
    schema_version: "1.0",
    updated_at: new Date().toISOString(),
    cloud_enabled: policy.cloud_enabled,
    providers: policy.providers.map((provider) => ({
      provider_key: provider.provider_key,
      enabled: provider.enabled,
      models: provider.models.map((model) => ({ ...model })),
    })),
  };
  await mkdir(dirname(ACTIVATION_POLICY_PATH), { recursive: true });
  await writeFile(ACTIVATION_POLICY_PATH, `${JSON.stringify(record, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  return record;
}
