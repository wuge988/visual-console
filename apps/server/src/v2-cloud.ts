import type { FastifyInstance } from "fastify";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const PROVIDER_REGISTRY_PATH = join(ROOT, "config", "providers", "registry.json");
const BUDGET_POLICY_PATH = join(ROOT, ".visual-console-runtime", "v2-budget-policy.json");
const BUDGET_FIELDS = ["per_job", "per_sku", "daily", "monthly"] as const;

export type BudgetLimits = {
  per_job: number;
  per_sku: number;
  daily: number;
  monthly: number;
};

export type BudgetPolicyRecord = {
  schema_version: "1.0";
  updated_at: string;
  limits: BudgetLimits;
};

export type ProviderPricing = {
  basis?: string;
  currency?: string;
  text_input_per_million?: number;
  text_cached_input_per_million?: number;
  image_input_per_million?: number;
  image_cached_input_per_million?: number;
  image_output_per_million?: number;
};

export type ProviderModelEntry = {
  model_key: string;
  snapshot?: string;
  display_name?: string;
  media_type?: string;
  availability_status?: string;
  enabled?: boolean;
  pricing_status?: "KNOWN" | "UNKNOWN" | string;
  pricing?: ProviderPricing;
  notes?: string;
};

export type ProviderRegistryEntry = {
  provider_key: string;
  display_name: string;
  media_types: string[];
  adapter_status: string;
  credential_env: string;
  enabled: boolean;
  pricing_status: "KNOWN" | "UNKNOWN" | string;
  facts_status?: string;
  facts_verified_at?: string;
  source_urls?: string[];
  notes?: string;
  models: ProviderModelEntry[];
};

export type CloudRegistry = {
  schema_version: string;
  cloud_enabled: boolean;
  currency: string;
  limits: BudgetLimits;
  providers: ProviderRegistryEntry[];
  budget_policy?: {
    source: "REGISTRY_DEFAULT" | "RUNTIME_POLICY";
    persisted: boolean;
    updated_at: string | null;
  };
};

export type CostGuardInput = {
  registry: CloudRegistry;
  provider_key?: string;
  model_key?: string;
  estimated_cost?: number | null;
  spend?: {
    sku?: number;
    daily?: number;
    monthly?: number;
  };
};

export type CostGuardDryRunRequest = {
  provider_key?: unknown;
  model_key?: unknown;
  estimated_cost?: unknown;
  spend?: {
    sku?: unknown;
    daily?: unknown;
    monthly?: unknown;
  } | unknown;
};

export type BudgetPolicyWriteRequest = {
  acknowledge?: unknown;
  limits?: unknown;
  [key: string]: unknown;
};

type Dependencies = {
  assertLocalRequest: (req: any) => void;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function finiteNumber(value: unknown) {
  if (value == null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function normalizeBudgetLimits(value: unknown): BudgetLimits {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("BUDGET_POLICY_LIMITS_INVALID");
  }
  const source = value as Record<string, unknown>;
  const allowed = new Set<string>(BUDGET_FIELDS);
  if (Object.keys(source).some((key) => !allowed.has(key))) {
    throw new Error("BUDGET_POLICY_SCOPE_VIOLATION");
  }

  const result = {} as BudgetLimits;
  for (const key of BUDGET_FIELDS) {
    const parsed = finiteNumber(source[key]);
    if (parsed == null || parsed < 0) {
      throw new Error("BUDGET_POLICY_LIMITS_INVALID");
    }
    result[key] = parsed;
  }
  return result;
}

export function normalizeBudgetPolicyWriteRequest(body: BudgetPolicyWriteRequest | null | undefined) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("BUDGET_POLICY_REQUEST_INVALID");
  }
  const source = body as Record<string, unknown>;
  const allowed = new Set(["acknowledge", "limits"]);
  if (Object.keys(source).some((key) => !allowed.has(key))) {
    throw new Error("BUDGET_POLICY_SCOPE_VIOLATION");
  }
  if (source.acknowledge !== "BUDGET_POLICY_ONLY") {
    throw new Error("BUDGET_POLICY_ACK_REQUIRED");
  }
  return { limits: normalizeBudgetLimits(source.limits) };
}

export function normalizeCostGuardDryRunRequest(body: CostGuardDryRunRequest | null | undefined) {
  const spend = body?.spend && typeof body.spend === "object" ? body.spend as Record<string, unknown> : {};
  return {
    provider_key: typeof body?.provider_key === "string" ? body.provider_key : undefined,
    model_key: typeof body?.model_key === "string" ? body.model_key : undefined,
    estimated_cost: finiteNumber(body?.estimated_cost) ?? null,
    spend: {
      sku: finiteNumber(spend.sku) ?? 0,
      daily: finiteNumber(spend.daily) ?? 0,
      monthly: finiteNumber(spend.monthly) ?? 0,
    },
  };
}

export function applyBudgetPolicy(registry: CloudRegistry, policy: BudgetPolicyRecord): CloudRegistry {
  return {
    ...registry,
    limits: { ...policy.limits },
    budget_policy: {
      source: "RUNTIME_POLICY",
      persisted: true,
      updated_at: policy.updated_at,
    },
  };
}

async function readBudgetPolicyRecord(): Promise<BudgetPolicyRecord | null> {
  try {
    const parsed = JSON.parse(await readFile(BUDGET_POLICY_PATH, "utf8"));
    if (String(parsed?.schema_version ?? "") !== "1.0" || typeof parsed?.updated_at !== "string") {
      throw new Error("BUDGET_POLICY_INVALID");
    }
    return {
      schema_version: "1.0",
      updated_at: parsed.updated_at,
      limits: normalizeBudgetLimits(parsed.limits),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return null;
    throw error;
  }
}

export async function persistBudgetPolicy(limits: BudgetLimits): Promise<BudgetPolicyRecord> {
  const record: BudgetPolicyRecord = {
    schema_version: "1.0",
    updated_at: new Date().toISOString(),
    limits: { ...limits },
  };
  await mkdir(dirname(BUDGET_POLICY_PATH), { recursive: true });
  await writeFile(BUDGET_POLICY_PATH, `${JSON.stringify(record, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  return record;
}

export async function readCloudRegistry(): Promise<CloudRegistry> {
  const parsed = JSON.parse(await readFile(PROVIDER_REGISTRY_PATH, "utf8"));
  if (!parsed || !Array.isArray(parsed.providers) || !parsed.limits) {
    throw new Error("PROVIDER_REGISTRY_INVALID");
  }
  const base: CloudRegistry = {
    schema_version: String(parsed.schema_version ?? "unknown"),
    cloud_enabled: Boolean(parsed.cloud_enabled),
    currency: String(parsed.currency ?? "USD"),
    limits: normalizeBudgetLimits(parsed.limits),
    providers: parsed.providers,
    budget_policy: {
      source: "REGISTRY_DEFAULT",
      persisted: false,
      updated_at: null,
    },
  };
  const policy = await readBudgetPolicyRecord();
  return policy ? applyBudgetPolicy(base, policy) : base;
}

export function evaluateCostGuard(input: CostGuardInput) {
  const reasons: string[] = [];
  const registry = input.registry;
  const provider = registry.providers.find((row) => row.provider_key === input.provider_key);
  const model = provider?.models.find((row) => row.model_key === input.model_key);
  const estimatedCost = input.estimated_cost;
  const spend = {
    sku: Number(input.spend?.sku ?? 0),
    daily: Number(input.spend?.daily ?? 0),
    monthly: Number(input.spend?.monthly ?? 0),
  };

  if (!registry.cloud_enabled) reasons.push("CLOUD_DISABLED");
  if (!input.provider_key) reasons.push("PROVIDER_REQUIRED");
  else if (!provider) reasons.push("PROVIDER_NOT_REGISTERED");
  else {
    if (!provider.enabled) reasons.push("PROVIDER_DISABLED");
    if (provider.adapter_status !== "READY") reasons.push("PROVIDER_ADAPTER_NOT_READY");
    if (provider.pricing_status !== "KNOWN") reasons.push("PROVIDER_PRICING_UNKNOWN");
  }

  if (input.model_key) {
    if (!model) reasons.push("MODEL_NOT_REGISTERED");
    else {
      if (!model.enabled) reasons.push("MODEL_DISABLED");
      if ((model.pricing_status ?? provider?.pricing_status) !== "KNOWN") reasons.push("MODEL_PRICING_UNKNOWN");
    }
  }

  if (estimatedCost == null || !Number.isFinite(estimatedCost) || estimatedCost < 0) {
    reasons.push("ESTIMATED_COST_REQUIRED");
  } else {
    if (registry.limits.per_job <= 0) reasons.push("PER_JOB_LIMIT_NOT_CONFIGURED");
    else if (estimatedCost > registry.limits.per_job) reasons.push("PER_JOB_LIMIT_EXCEEDED");

    if (registry.limits.per_sku <= 0) reasons.push("PER_SKU_LIMIT_NOT_CONFIGURED");
    else if (spend.sku + estimatedCost > registry.limits.per_sku) reasons.push("PER_SKU_LIMIT_EXCEEDED");

    if (registry.limits.daily <= 0) reasons.push("DAILY_LIMIT_NOT_CONFIGURED");
    else if (spend.daily + estimatedCost > registry.limits.daily) reasons.push("DAILY_LIMIT_EXCEEDED");

    if (registry.limits.monthly <= 0) reasons.push("MONTHLY_LIMIT_NOT_CONFIGURED");
    else if (spend.monthly + estimatedCost > registry.limits.monthly) reasons.push("MONTHLY_LIMIT_EXCEEDED");
  }

  return {
    allowed: reasons.length === 0,
    fail_closed: true,
    currency: registry.currency,
    estimated_cost: estimatedCost ?? null,
    reasons: [...new Set(reasons)],
  };
}

export function projectCloudRegistry(registry: CloudRegistry) {
  return {
    schema_version: registry.schema_version,
    cloud_enabled: registry.cloud_enabled,
    currency: registry.currency,
    limits: registry.limits,
    budget_policy: registry.budget_policy ?? {
      source: "REGISTRY_DEFAULT",
      persisted: false,
      updated_at: null,
    },
    configured_provider_count: registry.providers.filter((row) => row.enabled && row.adapter_status === "READY").length,
    providers: registry.providers.map((provider) => ({
      provider_key: provider.provider_key,
      display_name: provider.display_name,
      media_types: provider.media_types,
      adapter_status: provider.adapter_status,
      enabled: provider.enabled,
      pricing_status: provider.pricing_status,
      facts_status: provider.facts_status ?? "UNVERIFIED",
      facts_verified_at: provider.facts_verified_at ?? null,
      source_urls: provider.source_urls ?? [],
      notes: provider.notes ?? "",
      credential_configured: Boolean(process.env[provider.credential_env]),
      model_count: provider.models.length,
      enabled_model_count: provider.models.filter((row) => row.enabled).length,
      models: provider.models.map((model) => ({
        model_key: model.model_key,
        snapshot: model.snapshot ?? null,
        display_name: model.display_name ?? model.model_key,
        media_type: model.media_type ?? provider.media_types[0] ?? "unknown",
        availability_status: model.availability_status ?? "UNKNOWN",
        enabled: Boolean(model.enabled),
        pricing_status: model.pricing_status ?? provider.pricing_status,
        pricing: model.pricing ?? null,
        notes: model.notes ?? "",
      })),
    })),
  };
}

export async function registerV2CloudRoutes(app: FastifyInstance, deps: Dependencies) {
  app.get("/api/v2/cloud", async (req, reply) => {
    try {
      deps.assertLocalRequest(req);
      const registry = await readCloudRegistry();
      return {
        ok: true,
        generated_at: new Date().toISOString(),
        authority: "COST_GUARD_FAIL_CLOSED",
        registry: projectCloudRegistry(registry),
        default_guard: evaluateCostGuard({ registry }),
        audit: {
          provider_calls_enabled: false,
          paid_generation_adapter: "NOT_IMPLEMENTED",
          actual_spend_tracking: "NOT_IMPLEMENTED",
        },
      };
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  app.post("/api/v2/cloud/evaluate", async (req, reply) => {
    try {
      deps.assertLocalRequest(req);
      const registry = await readCloudRegistry();
      const input = normalizeCostGuardDryRunRequest((req.body ?? {}) as CostGuardDryRunRequest);
      return {
        ok: true,
        generated_at: new Date().toISOString(),
        authority: "COST_GUARD_DRY_RUN_ONLY",
        guard: evaluateCostGuard({ registry, ...input }),
        audit: {
          mutation: false,
          provider_call: false,
          budget_write: false,
          job_write: false,
        },
      };
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  app.put("/api/v2/cloud/budget-policy", async (req, reply) => {
    try {
      deps.assertLocalRequest(req);
      const input = normalizeBudgetPolicyWriteRequest((req.body ?? {}) as BudgetPolicyWriteRequest);
      await persistBudgetPolicy(input.limits);
      const registry = await readCloudRegistry();
      return {
        ok: true,
        generated_at: new Date().toISOString(),
        authority: "BUDGET_POLICY_WRITE_ONLY",
        registry: projectCloudRegistry(registry),
        audit: {
          budget_write: true,
          provider_call: false,
          cloud_enablement_write: false,
          provider_enablement_write: false,
          model_enablement_write: false,
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
