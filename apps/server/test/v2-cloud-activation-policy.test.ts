import test from "node:test";
import assert from "node:assert/strict";
import {
  applyActivationPolicy,
  normalizeCloudActivationPolicyWriteRequest,
  validateActivationPolicyAgainstRegistry,
  type CloudActivationPolicyRecord,
} from "../src/v2-cloud-activation-policy.js";
import type { CloudRegistry } from "../src/v2-cloud.js";

function registry(): CloudRegistry {
  return {
    schema_version: "1.1",
    cloud_enabled: false,
    currency: "USD",
    limits: { per_job: 1, per_sku: 5, daily: 20, monthly: 100 },
    providers: [
      {
        provider_key: "openai-image",
        display_name: "OpenAI Image",
        media_types: ["image"],
        adapter_status: "NOT_CONFIGURED",
        credential_env: "TEST_OPENAI_KEY",
        enabled: false,
        pricing_status: "KNOWN",
        models: [
          { model_key: "model-a", enabled: false, pricing_status: "KNOWN" },
          { model_key: "model-b", enabled: false, pricing_status: "KNOWN" },
        ],
      },
      {
        provider_key: "seedance-video",
        display_name: "Seedance Video",
        media_types: ["video"],
        adapter_status: "NOT_CONFIGURED",
        credential_env: "TEST_SEEDANCE_KEY",
        enabled: false,
        pricing_status: "UNKNOWN",
        models: [
          { model_key: "model-c", enabled: false, pricing_status: "UNKNOWN" },
        ],
      },
    ],
  };
}

function policy(): Omit<CloudActivationPolicyRecord, "schema_version" | "updated_at"> {
  return {
    cloud_enabled: true,
    providers: [
      {
        provider_key: "openai-image",
        enabled: true,
        models: [
          { model_key: "model-a", enabled: true },
          { model_key: "model-b", enabled: false },
        ],
      },
      {
        provider_key: "seedance-video",
        enabled: false,
        models: [{ model_key: "model-c", enabled: false }],
      },
    ],
  };
}

test("activation policy request requires acknowledgement and exact scope", () => {
  const body = policy();
  assert.deepEqual(
    normalizeCloudActivationPolicyWriteRequest({
      acknowledge: "CLOUD_ACTIVATION_POLICY_ONLY",
      ...body,
    }),
    body,
  );
  assert.throws(
    () => normalizeCloudActivationPolicyWriteRequest(body as any),
    /CLOUD_ACTIVATION_POLICY_ACK_REQUIRED/,
  );
  assert.throws(
    () => normalizeCloudActivationPolicyWriteRequest({
      acknowledge: "CLOUD_ACTIVATION_POLICY_ONLY",
      ...body,
      provider_call: true,
    }),
    /CLOUD_ACTIVATION_POLICY_SCOPE_VIOLATION/,
  );
});

test("activation policy requires explicit boolean state", () => {
  assert.throws(
    () => normalizeCloudActivationPolicyWriteRequest({
      acknowledge: "CLOUD_ACTIVATION_POLICY_ONLY",
      cloud_enabled: "true",
      providers: [],
    }),
    /CLOUD_ACTIVATION_CLOUD_ENABLED_INVALID/,
  );
  assert.throws(
    () => normalizeCloudActivationPolicyWriteRequest({
      acknowledge: "CLOUD_ACTIVATION_POLICY_ONLY",
      cloud_enabled: false,
      providers: [{ provider_key: "openai-image", enabled: 1, models: [] }],
    }),
    /CLOUD_ACTIVATION_PROVIDER_ENABLED_INVALID/,
  );
});

test("activation policy requires exact provider and model coverage", () => {
  const source = registry();
  const valid = policy();
  assert.equal(validateActivationPolicyAgainstRegistry(valid, source), valid);

  assert.throws(
    () => validateActivationPolicyAgainstRegistry({
      cloud_enabled: true,
      providers: valid.providers.slice(0, 1),
    }, source),
    /CLOUD_ACTIVATION_PROVIDER_COVERAGE_MISMATCH/,
  );

  assert.throws(
    () => validateActivationPolicyAgainstRegistry({
      cloud_enabled: true,
      providers: [
        {
          provider_key: "openai-image",
          enabled: true,
          models: [{ model_key: "model-a", enabled: true }],
        },
        valid.providers[1],
      ],
    }, source),
    /CLOUD_ACTIVATION_MODEL_COVERAGE_MISMATCH/,
  );
});

test("activation policy rejects duplicate provider and model keys", () => {
  const source = registry();
  const valid = policy();
  assert.throws(
    () => validateActivationPolicyAgainstRegistry({
      cloud_enabled: true,
      providers: [valid.providers[0], valid.providers[0]],
    }, source),
    /CLOUD_ACTIVATION_PROVIDER_DUPLICATE/,
  );

  assert.throws(
    () => validateActivationPolicyAgainstRegistry({
      cloud_enabled: true,
      providers: [
        {
          provider_key: "openai-image",
          enabled: true,
          models: [
            { model_key: "model-a", enabled: true },
            { model_key: "model-a", enabled: false },
          ],
        },
        valid.providers[1],
      ],
    }, source),
    /CLOUD_ACTIVATION_MODEL_DUPLICATE/,
  );
});

test("activation policy overlays enablement only and preserves execution blockers", () => {
  const source = registry();
  const record: CloudActivationPolicyRecord = {
    schema_version: "1.0",
    updated_at: "2026-09-13T08:00:00.000Z",
    ...policy(),
  };
  const applied = applyActivationPolicy(source, record);

  assert.equal(applied.cloud_enabled, true);
  assert.equal(applied.providers[0].enabled, true);
  assert.equal(applied.providers[0].models[0].enabled, true);
  assert.equal(applied.providers[0].models[1].enabled, false);
  assert.equal(applied.providers[1].enabled, false);
  assert.equal(applied.providers[0].adapter_status, "NOT_CONFIGURED");
  assert.equal(applied.providers[0].pricing_status, "KNOWN");
  assert.equal(applied.providers[1].pricing_status, "UNKNOWN");
  assert.deepEqual(applied.activation_policy, {
    source: "RUNTIME_POLICY",
    persisted: true,
    updated_at: "2026-09-13T08:00:00.000Z",
  });
});
