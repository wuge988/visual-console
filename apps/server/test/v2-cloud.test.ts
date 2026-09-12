import test from "node:test";
import assert from "node:assert/strict";
import { evaluateCostGuard, projectCloudRegistry, type CloudRegistry } from "../src/v2-cloud.js";

function registry(overrides: Partial<CloudRegistry> = {}): CloudRegistry {
  return {
    schema_version: "1.1",
    cloud_enabled: false,
    currency: "USD",
    limits: { per_job: 0, per_sku: 0, daily: 0, monthly: 0 },
    providers: [
      {
        provider_key: "provider-a",
        display_name: "Provider A",
        media_types: ["image"],
        adapter_status: "NOT_CONFIGURED",
        credential_env: "V2_TEST_PROVIDER_KEY",
        enabled: false,
        pricing_status: "UNKNOWN",
        facts_status: "VERIFIED",
        facts_verified_at: "2026-09-12",
        source_urls: ["https://example.com/provider-a"],
        models: [],
      },
    ],
    ...overrides,
  };
}

test("Cost Guard fails closed with the default registry", () => {
  const result = evaluateCostGuard({ registry: registry() });
  assert.equal(result.allowed, false);
  assert.equal(result.fail_closed, true);
  assert.ok(result.reasons.includes("CLOUD_DISABLED"));
  assert.ok(result.reasons.includes("PROVIDER_REQUIRED"));
  assert.ok(result.reasons.includes("ESTIMATED_COST_REQUIRED"));
});

test("unknown provider pricing blocks a cloud request", () => {
  const source = registry({
    cloud_enabled: true,
    limits: { per_job: 5, per_sku: 20, daily: 50, monthly: 200 },
    providers: [
      {
        provider_key: "provider-a",
        display_name: "Provider A",
        media_types: ["image"],
        adapter_status: "READY",
        credential_env: "V2_TEST_PROVIDER_KEY",
        enabled: true,
        pricing_status: "UNKNOWN",
        models: [],
      },
    ],
  });
  const result = evaluateCostGuard({ registry: source, provider_key: "provider-a", estimated_cost: 1 });
  assert.equal(result.allowed, false);
  assert.ok(result.reasons.includes("PROVIDER_PRICING_UNKNOWN"));
});

test("configured budgets and known pricing can pass the guard", () => {
  const source = registry({
    cloud_enabled: true,
    limits: { per_job: 5, per_sku: 20, daily: 50, monthly: 200 },
    providers: [
      {
        provider_key: "provider-a",
        display_name: "Provider A",
        media_types: ["image"],
        adapter_status: "READY",
        credential_env: "V2_TEST_PROVIDER_KEY",
        enabled: true,
        pricing_status: "KNOWN",
        models: [
          {
            model_key: "model-a",
            display_name: "Model A",
            media_type: "image",
            enabled: true,
            pricing_status: "KNOWN",
          },
        ],
      },
    ],
  });
  const result = evaluateCostGuard({
    registry: source,
    provider_key: "provider-a",
    model_key: "model-a",
    estimated_cost: 2,
    spend: { sku: 3, daily: 8, monthly: 20 },
  });
  assert.deepEqual(result.reasons, []);
  assert.equal(result.allowed, true);
});

test("per-job and accumulated limits block requests independently", () => {
  const source = registry({
    cloud_enabled: true,
    limits: { per_job: 3, per_sku: 5, daily: 10, monthly: 30 },
    providers: [
      {
        provider_key: "provider-a",
        display_name: "Provider A",
        media_types: ["image"],
        adapter_status: "READY",
        credential_env: "V2_TEST_PROVIDER_KEY",
        enabled: true,
        pricing_status: "KNOWN",
        models: [],
      },
    ],
  });
  const result = evaluateCostGuard({
    registry: source,
    provider_key: "provider-a",
    estimated_cost: 4,
    spend: { sku: 2, daily: 8, monthly: 28 },
  });
  assert.equal(result.allowed, false);
  assert.ok(result.reasons.includes("PER_JOB_LIMIT_EXCEEDED"));
  assert.ok(result.reasons.includes("PER_SKU_LIMIT_EXCEEDED"));
  assert.ok(result.reasons.includes("DAILY_LIMIT_EXCEEDED"));
  assert.ok(result.reasons.includes("MONTHLY_LIMIT_EXCEEDED"));
});

test("provider projection never exposes credential values or env names", () => {
  process.env.V2_TEST_PROVIDER_KEY = "secret-value";
  const projected = projectCloudRegistry(registry());
  assert.equal(projected.providers[0].credential_configured, true);
  assert.equal("credential_env" in projected.providers[0], false);
  assert.equal(JSON.stringify(projected).includes("V2_TEST_PROVIDER_KEY"), false);
  assert.equal(JSON.stringify(projected).includes("secret-value"), false);
  delete process.env.V2_TEST_PROVIDER_KEY;
});

test("provider projection exposes verified public model facts without granting execution", () => {
  const source = registry({
    providers: [
      {
        provider_key: "provider-a",
        display_name: "Provider A",
        media_types: ["image"],
        adapter_status: "NOT_CONFIGURED",
        credential_env: "V2_TEST_PROVIDER_KEY",
        enabled: false,
        pricing_status: "KNOWN",
        facts_status: "VERIFIED",
        facts_verified_at: "2026-09-12",
        source_urls: ["https://example.com/provider-a"],
        models: [
          {
            model_key: "model-a",
            snapshot: "model-a-2026-09-08",
            display_name: "Model A",
            media_type: "image",
            availability_status: "DOCUMENTED",
            enabled: false,
            pricing_status: "KNOWN",
            pricing: { basis: "TOKEN", currency: "USD", image_output_per_million: 30 },
          },
        ],
      },
    ],
  });
  const projected = projectCloudRegistry(source);
  assert.equal(projected.providers[0].facts_status, "VERIFIED");
  assert.equal(projected.providers[0].models[0].snapshot, "model-a-2026-09-08");
  assert.equal(projected.providers[0].models[0].pricing?.image_output_per_million, 30);
  assert.equal(projected.providers[0].enabled, false);
  assert.equal(projected.providers[0].models[0].enabled, false);
});
