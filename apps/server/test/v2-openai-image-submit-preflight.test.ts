import test from "node:test";
import assert from "node:assert/strict";
import { buildOpenAIImageSubmitPreflight } from "../src/v2-openai-image-submit-preflight.js";
import { normalizeOpenAIImageSubmit } from "../src/v2-openai-image-submit.js";
import type { CloudRegistry } from "../src/v2-cloud.js";

function registry(enabled: boolean): CloudRegistry {
  return {
    schema_version: "1.1",
    cloud_enabled: enabled,
    currency: "USD",
    limits: { per_job: 1, per_sku: 5, daily: 20, monthly: 100 },
    budget_policy: {
      source: "RUNTIME_POLICY",
      persisted: true,
      updated_at: "2026-09-13T00:00:00.000Z",
    },
    activation_policy: {
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
        enabled,
        pricing_status: "KNOWN",
        models: [
          {
            model_key: "gpt-image-2.5-sunburst",
            snapshot: "gpt-image-2.5-sunburst-2026-09-08",
            display_name: "GPT-Image-2.5 Sunburst",
            media_type: "image",
            enabled,
            pricing_status: "KNOWN",
          },
        ],
      },
    ],
  };
}

function input() {
  return normalizeOpenAIImageSubmit({
    operation_id: "op_preflight_001",
    site_id: "drift-curio",
    item_id: "DC-ZY-SZ-31001",
    job_id: "job_preflight_001",
    model_key: "gpt-image-2.5-sunburst",
    prompt: "Controlled preflight prompt that must never be echoed.",
    estimated_cost: 0.25,
    spend: { sku: 0, daily: 0, monthly: 0 },
    acknowledge: "OPENAI_IMAGE_PROVIDER_CALL",
  });
}

test("submit preflight mirrors fail-closed blockers without provider or spend authority", () => {
  const result = buildOpenAIImageSubmitPreflight(registry(false), input(), {
    credentialConfigured: () => false,
    networkExecutionEnabled: () => false,
  });

  assert.equal(result.authority, "OPENAI_IMAGE_SUBMIT_PREFLIGHT_ONLY");
  assert.equal(result.ready_for_provider_call, false);
  assert.equal(result.fail_closed, true);
  assert.ok(result.blockers.includes("CLOUD_DISABLED"));
  assert.ok(result.blockers.includes("PROVIDER_DISABLED"));
  assert.ok(result.blockers.includes("PROVIDER_CREDENTIAL_MISSING"));
  assert.ok(result.blockers.includes("PROVIDER_NETWORK_GATE_CLOSED"));
  assert.ok(result.blockers.includes("MODEL_DISABLED"));
  assert.equal(result.request_model, "gpt-image-2.5-sunburst-2026-09-08");
  assert.equal(result.request.prompt_chars, input().prompt.length);
  assert.equal(JSON.stringify(result).includes(input().prompt), false);
  assert.equal(Object.values(result.audit).every((value) => value === false), true);
});

test("submit preflight may report READY while remaining strictly non-executing", () => {
  const result = buildOpenAIImageSubmitPreflight(registry(true), input(), {
    credentialConfigured: () => true,
    networkExecutionEnabled: () => true,
  });

  assert.equal(result.ready_for_provider_call, true);
  assert.equal(result.fail_closed, false);
  assert.deepEqual(result.blockers, []);
  assert.equal(result.cost_guard.allowed, true);
  assert.equal(result.activation_preflight.activation_ready, true);
  assert.equal(result.audit.provider_call, false);
  assert.equal(result.audit.spend_write, false);
  assert.equal(result.audit.mutation, false);
});
