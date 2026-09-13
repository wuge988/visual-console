import test from "node:test";
import assert from "node:assert/strict";
import {
  buildOpenAIImageRequestPlan,
  normalizeOpenAIImageRequestPlan,
} from "../src/v2-openai-image-plan.js";
import type { CloudRegistry } from "../src/v2-cloud.js";

function registry(): CloudRegistry {
  return {
    schema_version: "1.1",
    cloud_enabled: false,
    currency: "USD",
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
        adapter_status: "NOT_CONFIGURED",
        credential_env: "VISUAL_CONSOLE_TEST_OPENAI_KEY",
        enabled: false,
        pricing_status: "KNOWN",
        models: [
          {
            model_key: "gpt-image-2.5-sunburst",
            snapshot: "gpt-image-2.5-sunburst-2026-09-08",
            display_name: "GPT-Image-2.5 Sunburst",
            media_type: "image",
            enabled: false,
            pricing_status: "KNOWN",
          },
        ],
      },
    ],
  };
}

test("request-plan normalization is strict and rejects authority smuggling", () => {
  assert.deepEqual(
    normalizeOpenAIImageRequestPlan({
      model_key: "gpt-image-2.5-sunburst",
      prompt: "  exact driftwood product photo  ",
      estimated_cost: 0.25,
      spend: { sku: 1, daily: 2, monthly: 3 },
    }),
    {
      model_key: "gpt-image-2.5-sunburst",
      prompt: "exact driftwood product photo",
      estimated_cost: 0.25,
      spend: { sku: 1, daily: 2, monthly: 3 },
    },
  );

  assert.throws(
    () => normalizeOpenAIImageRequestPlan({
      model_key: "gpt-image-2.5-sunburst",
      prompt: "x",
      execute: true,
    }),
    /OPENAI_IMAGE_PLAN_SCOPE_VIOLATION/,
  );
  assert.throws(
    () => normalizeOpenAIImageRequestPlan({ model_key: "m", prompt: "" }),
    /OPENAI_IMAGE_PLAN_PROMPT_REQUIRED/,
  );
  assert.throws(
    () => normalizeOpenAIImageRequestPlan({ model_key: "m", prompt: "x".repeat(32001) }),
    /OPENAI_IMAGE_PLAN_PROMPT_LOCAL_LIMIT/,
  );
});

test("request plan pins documented snapshot, PNG output and redacted authorization", () => {
  delete process.env.VISUAL_CONSOLE_TEST_OPENAI_KEY;
  const input = normalizeOpenAIImageRequestPlan({
    model_key: "gpt-image-2.5-sunburst",
    prompt: "Create a controlled studio derivative",
    estimated_cost: 0.25,
  });
  const plan = buildOpenAIImageRequestPlan(registry(), input);

  assert.equal(plan.provider_key, "openai-image");
  assert.equal(plan.request_model, "gpt-image-2.5-sunburst-2026-09-08");
  assert.equal(plan.endpoint, "https://api.openai.com/v1/images/generations");
  assert.equal(plan.method, "POST");
  assert.deepEqual(plan.request.body, {
    model: "gpt-image-2.5-sunburst-2026-09-08",
    prompt: "Create a controlled studio derivative",
    output_format: "png",
  });
  assert.equal(plan.request.headers.authorization, "Bearer ***");
  assert.equal(plan.plan_ready, true);
  assert.equal(plan.executable, false);
  assert.equal(plan.execution_blocker, "OPENAI_IMAGE_REQUEST_PLAN_ONLY");
});

test("planning never upgrades fail-closed execution gates", () => {
  const previousGate = process.env.VISUAL_CONSOLE_ALLOW_PAID_PROVIDER_CALLS;
  delete process.env.VISUAL_CONSOLE_ALLOW_PAID_PROVIDER_CALLS;
  const input = normalizeOpenAIImageRequestPlan({
    model_key: "gpt-image-2.5-sunburst",
    prompt: "x",
    estimated_cost: 0.25,
  });
  const plan = buildOpenAIImageRequestPlan(registry(), input);

  assert.equal(plan.cost_guard.allowed, false);
  assert.ok(plan.cost_guard.reasons.includes("CLOUD_DISABLED"));
  assert.ok(plan.cost_guard.reasons.includes("PROVIDER_DISABLED"));
  assert.ok(plan.cost_guard.reasons.includes("PROVIDER_ADAPTER_NOT_READY"));
  assert.ok(plan.cost_guard.reasons.includes("MODEL_DISABLED"));

  assert.equal(plan.activation_preflight.activation_ready, false);
  assert.ok(plan.activation_preflight.blockers.includes("CLOUD_DISABLED"));
  assert.ok(plan.activation_preflight.blockers.includes("PROVIDER_DISABLED"));
  assert.ok(plan.activation_preflight.blockers.includes("PROVIDER_ADAPTER_NOT_READY"));
  assert.ok(plan.activation_preflight.blockers.includes("PROVIDER_CREDENTIAL_MISSING"));
  assert.ok(plan.activation_preflight.blockers.includes("PROVIDER_NETWORK_GATE_CLOSED"));
  assert.equal(plan.activation_preflight.blockers.includes("PROVIDER_SUBMISSION_ADAPTER_ABSENT"), false);
  assert.ok(plan.activation_preflight.blockers.includes("MODEL_DISABLED"));

  if (previousGate == null) delete process.env.VISUAL_CONSOLE_ALLOW_PAID_PROVIDER_CALLS;
  else process.env.VISUAL_CONSOLE_ALLOW_PAID_PROVIDER_CALLS = previousGate;
});

test("unknown model and invalid spend are rejected before planning", () => {
  assert.throws(
    () => buildOpenAIImageRequestPlan(
      registry(),
      normalizeOpenAIImageRequestPlan({ model_key: "unknown", prompt: "x" }),
    ),
    /OPENAI_IMAGE_MODEL_NOT_REGISTERED/,
  );

  assert.throws(
    () => normalizeOpenAIImageRequestPlan({
      model_key: "gpt-image-2.5-sunburst",
      prompt: "x",
      spend: { daily: -1 },
    }),
    /OPENAI_IMAGE_PLAN_SPEND_INVALID/,
  );
});
