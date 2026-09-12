import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateCloudActivationPreflight,
  normalizeCloudActivationPreflightRequest,
} from "../src/v2-cloud-activation.js";
import type { CloudRegistry } from "../src/v2-cloud.js";

function registry(overrides: Partial<CloudRegistry> = {}): CloudRegistry {
  return {
    schema_version: "1.1",
    cloud_enabled: false,
    currency: "USD",
    limits: { per_job: 0, per_sku: 0, daily: 0, monthly: 0 },
    budget_policy: {
      source: "REGISTRY_DEFAULT",
      persisted: false,
      updated_at: null,
    },
    providers: [
      {
        provider_key: "openai-image",
        display_name: "OpenAI Image",
        media_types: ["image"],
        adapter_status: "NOT_CONFIGURED",
        credential_env: "OPENAI_API_KEY",
        enabled: false,
        pricing_status: "KNOWN",
        models: [
          {
            model_key: "gpt-image-2.5-sunburst",
            display_name: "GPT-Image-2.5 Sunburst",
            media_type: "image",
            availability_status: "DOCUMENTED",
            enabled: false,
            pricing_status: "KNOWN",
          },
        ],
      },
    ],
    ...overrides,
  };
}

test("activation preflight rejects authority-smuggling fields", () => {
  assert.throws(
    () => normalizeCloudActivationPreflightRequest({
      provider_key: "openai-image",
      model_key: "gpt-image-2.5-sunburst",
      cloud_enabled: true,
    }),
    /CLOUD_ACTIVATION_PREFLIGHT_SCOPE_VIOLATION/,
  );
});

test("default provider activation preflight fails closed with explicit blockers", () => {
  const result = evaluateCloudActivationPreflight(
    registry(),
    { provider_key: "openai-image", model_key: "gpt-image-2.5-sunburst" },
    () => false,
  );

  assert.equal(result.activation_ready, false);
  assert.equal(result.fail_closed, true);
  assert.equal(result.credential_configured, false);
  assert.deepEqual(result.blockers, [
    "CLOUD_DISABLED",
    "PROVIDER_DISABLED",
    "PROVIDER_ADAPTER_NOT_READY",
    "PROVIDER_CREDENTIAL_MISSING",
    "PROVIDER_SUBMISSION_ADAPTER_ABSENT",
    "MODEL_DISABLED",
    "PER_JOB_LIMIT_NOT_CONFIGURED",
    "PER_SKU_LIMIT_NOT_CONFIGURED",
    "DAILY_LIMIT_NOT_CONFIGURED",
    "MONTHLY_LIMIT_NOT_CONFIGURED",
  ]);
});

test("even configured registry cannot become executable before a submission adapter exists", () => {
  const configured = registry({
    cloud_enabled: true,
    limits: { per_job: 1, per_sku: 5, daily: 20, monthly: 100 },
    budget_policy: {
      source: "RUNTIME_POLICY",
      persisted: true,
      updated_at: "2026-09-13T00:00:00.000Z",
    },
    providers: [
      {
        provider_key: "openai-image",
        display_name: "OpenAI Image",
        media_types: ["image"],
        adapter_status: "READY",
        credential_env: "OPENAI_API_KEY",
        enabled: true,
        pricing_status: "KNOWN",
        models: [
          {
            model_key: "gpt-image-2.5-sunburst",
            enabled: true,
            pricing_status: "KNOWN",
          },
        ],
      },
    ],
  });

  const result = evaluateCloudActivationPreflight(
    configured,
    { provider_key: "openai-image", model_key: "gpt-image-2.5-sunburst" },
    () => true,
  );

  assert.equal(result.activation_ready, false);
  assert.deepEqual(result.blockers, ["PROVIDER_SUBMISSION_ADAPTER_ABSENT"]);
  assert.equal(result.budget_source, "RUNTIME_POLICY");
  assert.equal(result.budget_persisted, true);
});

test("activation preflight never exposes credential names or values", () => {
  const secret = "sk-secret-value-that-must-not-leak";
  const result = evaluateCloudActivationPreflight(
    registry(),
    { provider_key: "openai-image", model_key: "gpt-image-2.5-sunburst" },
    (credentialEnv) => credentialEnv === "OPENAI_API_KEY" && Boolean(secret),
  );
  const serialized = JSON.stringify(result);

  assert.equal(result.credential_configured, true);
  assert.equal(serialized.includes("OPENAI_API_KEY"), false);
  assert.equal(serialized.includes(secret), false);
});
