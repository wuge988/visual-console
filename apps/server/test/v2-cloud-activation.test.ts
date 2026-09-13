import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import {
  evaluateCloudActivationPreflight,
  normalizeCloudActivationPreflightRequest,
  registerV2CloudActivationRoutes,
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

function configuredRegistry(): CloudRegistry {
  return registry({
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

test("default provider activation preflight fails closed with explicit independent blockers", () => {
  const result = evaluateCloudActivationPreflight(
    registry(),
    { provider_key: "openai-image", model_key: "gpt-image-2.5-sunburst" },
    () => false,
    () => false,
  );

  assert.equal(result.activation_ready, false);
  assert.equal(result.fail_closed, true);
  assert.equal(result.credential_configured, false);
  assert.equal(result.network_call_enabled, false);
  assert.deepEqual(result.blockers, [
    "CLOUD_DISABLED",
    "PROVIDER_DISABLED",
    "PROVIDER_ADAPTER_NOT_READY",
    "PROVIDER_CREDENTIAL_MISSING",
    "PROVIDER_NETWORK_GATE_CLOSED",
    "MODEL_DISABLED",
    "PER_JOB_LIMIT_NOT_CONFIGURED",
    "PER_SKU_LIMIT_NOT_CONFIGURED",
    "DAILY_LIMIT_NOT_CONFIGURED",
    "MONTHLY_LIMIT_NOT_CONFIGURED",
  ]);
});

test("configured registry and credential still cannot execute while paid-provider network gate is closed", () => {
  const result = evaluateCloudActivationPreflight(
    configuredRegistry(),
    { provider_key: "openai-image", model_key: "gpt-image-2.5-sunburst" },
    () => true,
    () => false,
  );

  assert.equal(result.activation_ready, false);
  assert.deepEqual(result.blockers, ["PROVIDER_NETWORK_GATE_CLOSED"]);
  assert.equal(result.network_call_enabled, false);
  assert.equal(result.budget_source, "RUNTIME_POLICY");
  assert.equal(result.budget_persisted, true);
});

test("activation becomes ready only when registry, credential, adapter, budgets and explicit network gate all pass", () => {
  const result = evaluateCloudActivationPreflight(
    configuredRegistry(),
    { provider_key: "openai-image", model_key: "gpt-image-2.5-sunburst" },
    () => true,
    () => true,
  );

  assert.equal(result.activation_ready, true);
  assert.equal(result.network_call_enabled, true);
  assert.deepEqual(result.blockers, []);
});

test("activation preflight never exposes credential names or values", () => {
  const secret = "sk-secret-value-that-must-not-leak";
  const result = evaluateCloudActivationPreflight(
    registry(),
    { provider_key: "openai-image", model_key: "gpt-image-2.5-sunburst" },
    (credentialEnv) => credentialEnv === "OPENAI_API_KEY" && Boolean(secret),
    () => false,
  );
  const serialized = JSON.stringify(result);

  assert.equal(result.credential_configured, true);
  assert.equal(serialized.includes("OPENAI_API_KEY"), false);
  assert.equal(serialized.includes(secret), false);
});

test("activation-preflight route stays read-only and reports authoritative blockers", async () => {
  const previous = process.env.VISUAL_CONSOLE_ALLOW_PAID_PROVIDER_CALLS;
  delete process.env.VISUAL_CONSOLE_ALLOW_PAID_PROVIDER_CALLS;
  const app = Fastify();
  await registerV2CloudActivationRoutes(app, { assertLocalRequest: () => undefined });

  const response = await app.inject({
    method: "POST",
    url: "/api/v2/cloud/activation-preflight",
    payload: {
      provider_key: "openai-image",
      model_key: "gpt-image-2.5-sunburst",
    },
  });
  const body = response.json();

  assert.equal(response.statusCode, 200);
  assert.equal(body.authority, "CLOUD_ACTIVATION_PREFLIGHT_ONLY");
  assert.equal(body.preflight.activation_ready, false);
  assert.equal(body.preflight.blockers.includes("CLOUD_DISABLED"), true);
  assert.equal(body.preflight.blockers.includes("PROVIDER_NETWORK_GATE_CLOSED"), true);
  assert.equal(body.preflight.blockers.includes("PROVIDER_SUBMISSION_ADAPTER_ABSENT"), false);
  assert.deepEqual(body.audit, {
    mutation: false,
    provider_call: false,
    credential_write: false,
    registry_write: false,
    budget_write: false,
    job_write: false,
    qa_write: false,
    archive_write: false,
    source_write: false,
  });

  await app.close();
  if (previous == null) delete process.env.VISUAL_CONSOLE_ALLOW_PAID_PROVIDER_CALLS;
  else process.env.VISUAL_CONSOLE_ALLOW_PAID_PROVIDER_CALLS = previous;
});
