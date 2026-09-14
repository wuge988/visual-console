import test from "node:test";
import assert from "node:assert/strict";
import {
  executeOpenAIImageSubmit,
  normalizeOpenAIImageProviderExecution,
  normalizeOpenAIImageSubmit,
  OpenAIImageSubmitBlockedError,
} from "../src/v2-openai-image-submit.js";
import type { CloudRegistry } from "../src/v2-cloud.js";

function readyRegistry(): CloudRegistry {
  return {
    schema_version: "1.1",
    cloud_enabled: true,
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
        enabled: true,
        pricing_status: "KNOWN",
        models: [
          {
            model_key: "gpt-image-2.5-sunburst",
            snapshot: "gpt-image-2.5-sunburst-2026-09-08",
            display_name: "GPT-Image-2.5 Sunburst",
            media_type: "image",
            enabled: true,
            pricing_status: "KNOWN",
          },
        ],
      },
    ],
  };
}

function submitBody(overrides: Record<string, unknown> = {}) {
  return {
    operation_id: "op_test_001",
    site_id: "drift-curio",
    item_id: "DC-ZY-SZ-31001",
    job_id: "job_test_001",
    model_key: "gpt-image-2.5-sunburst",
    prompt: "Create one controlled image derivative.",
    estimated_cost: 0.25,
    spend: { sku: 0, daily: 0, monthly: 0 },
    acknowledge: "OPENAI_IMAGE_PROVIDER_CALL",
    ...overrides,
  };
}

function normalizedInput() {
  return normalizeOpenAIImageSubmit(submitBody());
}

test("submit normalization requires explicit provider-call acknowledgement and rejects scope smuggling", () => {
  assert.throws(
    () => normalizeOpenAIImageSubmit({
      operation_id: "op1",
      site_id: "drift-curio",
      item_id: "DC-ZY-SZ-31001",
      job_id: "job1",
      model_key: "gpt-image-2.5-sunburst",
      prompt: "x",
      estimated_cost: 0.1,
    }),
    /OPENAI_IMAGE_SUBMIT_ACK_REQUIRED/,
  );

  assert.throws(
    () => normalizeOpenAIImageSubmit({
      operation_id: "op1",
      site_id: "drift-curio",
      item_id: "DC-ZY-SZ-31001",
      job_id: "job1",
      model_key: "gpt-image-2.5-sunburst",
      prompt: "x",
      estimated_cost: 0.1,
      acknowledge: "OPENAI_IMAGE_PROVIDER_CALL",
      bypass_cost_guard: true,
    }),
    /OPENAI_IMAGE_SUBMIT_SCOPE_VIOLATION/,
  );
});

test("provider execution request requires an opaque execution-intent token and keeps strict submit scope", () => {
  assert.throws(
    () => normalizeOpenAIImageProviderExecution(submitBody()),
    /OPENAI_IMAGE_EXECUTION_INTENT_TOKEN_REQUIRED/,
  );

  const token = "a".repeat(43);
  const normalized = normalizeOpenAIImageProviderExecution({
    ...submitBody(),
    execution_intent_token: token,
  });
  assert.equal(normalized.execution_intent_token, token);
  assert.equal(normalized.submit.operation_id, "op_test_001");

  assert.throws(
    () => normalizeOpenAIImageProviderExecution({
      ...submitBody({ bypass_cost_guard: true }),
      execution_intent_token: token,
    }),
    /OPENAI_IMAGE_SUBMIT_SCOPE_VIOLATION/,
  );
});

test("execution intent proof is required before spend reservation or network access", async () => {
  let spendWrites = 0;
  let providerCalls = 0;

  await assert.rejects(
    () => executeOpenAIImageSubmit(readyRegistry(), normalizedInput(), {
      apiKey: "sk-test-secret",
      networkExecutionEnabled: () => true,
      appendSpend: async () => {
        spendWrites += 1;
        throw new Error("MUST_NOT_WRITE");
      },
      fetchImpl: async () => {
        providerCalls += 1;
        throw new Error("MUST_NOT_CALL");
      },
    }),
    (error: unknown) => {
      assert.ok(error instanceof OpenAIImageSubmitBlockedError);
      assert.deepEqual(error.blockers, ["EXECUTION_INTENT_REQUIRED"]);
      return true;
    },
  );

  assert.equal(spendWrites, 0);
  assert.equal(providerCalls, 0);
});

test("closed paid-provider network gate blocks before spend reservation or network access", async () => {
  let spendWrites = 0;
  let providerCalls = 0;

  await assert.rejects(
    () => executeOpenAIImageSubmit(readyRegistry(), normalizedInput(), {
      executionIntentVerified: true,
      apiKey: "sk-test-secret",
      networkExecutionEnabled: () => false,
      appendSpend: async () => {
        spendWrites += 1;
        throw new Error("MUST_NOT_WRITE");
      },
      fetchImpl: async () => {
        providerCalls += 1;
        throw new Error("MUST_NOT_CALL");
      },
    }),
    (error: unknown) => {
      assert.ok(error instanceof OpenAIImageSubmitBlockedError);
      assert.deepEqual(error.blockers, ["PROVIDER_NETWORK_GATE_CLOSED"]);
      return true;
    },
  );

  assert.equal(spendWrites, 0);
  assert.equal(providerCalls, 0);
});

test("missing credential blocks before spend reservation or network access", async () => {
  let providerCalls = 0;
  await assert.rejects(
    () => executeOpenAIImageSubmit(readyRegistry(), normalizedInput(), {
      executionIntentVerified: true,
      apiKey: "",
      networkExecutionEnabled: () => true,
      appendSpend: async () => {
        throw new Error("MUST_NOT_WRITE");
      },
      fetchImpl: async () => {
        providerCalls += 1;
        throw new Error("MUST_NOT_CALL");
      },
    }),
    (error: unknown) => {
      assert.ok(error instanceof OpenAIImageSubmitBlockedError);
      assert.ok(error.blockers.includes("PROVIDER_CREDENTIAL_MISSING"));
      return true;
    },
  );
  assert.equal(providerCalls, 0);
});

test("fully authorized execution reserves estimate, pins snapshot and calls provider exactly once", async () => {
  const secret = "sk-test-secret-value";
  const reservations: any[] = [];
  let providerCalls = 0;

  const result = await executeOpenAIImageSubmit(readyRegistry(), normalizedInput(), {
    executionIntentVerified: true,
    apiKey: secret,
    networkExecutionEnabled: () => true,
    appendSpend: async (input) => {
      reservations.push(input);
      return {
        schema_version: "1.0",
        event_id: "cse_test_001",
        recorded_at: "2026-09-13T00:00:00.000Z",
        event_type: "RESERVATION",
        spend_id: String(input.spend_id),
        site_id: String(input.site_id),
        job_id: String(input.job_id),
        item_id: String(input.item_id),
        provider_key: String(input.provider_key),
        model_key: String(input.model_key),
        amount: Number(input.amount),
        currency: String(input.currency),
        approval_source: String(input.approval_source),
        occurred_at: "2026-09-13T00:00:00.000Z",
      };
    },
    fetchImpl: async (input, init) => {
      providerCalls += 1;
      assert.equal(String(input), "https://api.openai.com/v1/images/generations");
      assert.equal(init?.method, "POST");
      const headers = init?.headers as Record<string, string>;
      assert.equal(headers.authorization, `Bearer ${secret}`);
      assert.equal(headers["content-type"], "application/json");
      assert.deepEqual(JSON.parse(String(init?.body)), {
        model: "gpt-image-2.5-sunburst-2026-09-08",
        prompt: "Create one controlled image derivative.",
        n: 1,
        output_format: "png",
      });
      return new Response(JSON.stringify({
        created: 1770000000,
        output_format: "png",
        quality: "high",
        size: "1024x1024",
        data: [{ b64_json: "aGVsbG8=" }],
        usage: {
          input_tokens: 10,
          output_tokens: 20,
          total_tokens: 30,
          input_tokens_details: { text_tokens: 10, image_tokens: 0 },
          output_tokens_details: { image_tokens: 20 },
        },
      }), {
        status: 200,
        headers: { "content-type": "application/json", "x-request-id": "req_test_001" },
      });
    },
  });

  assert.equal(providerCalls, 1);
  assert.equal(reservations.length, 1);
  assert.equal(reservations[0].event_type, "RESERVATION");
  assert.equal(reservations[0].spend_id, "openai-image:op_test_001");
  assert.equal(reservations[0].amount, 0.25);
  assert.equal(reservations[0].approval_source, "OPENAI_IMAGE_EXECUTION_INTENT");
  assert.equal(result.request_model, "gpt-image-2.5-sunburst-2026-09-08");
  assert.equal(result.image_b64, "aGVsbG8=");
  assert.equal(result.provider_request_id, "req_test_001");
  assert.equal(result.spend_status, "RESERVED_ESTIMATE_UNSETTLED");
  assert.equal(result.usage?.total_tokens, 30);
  assert.equal(JSON.stringify(result).includes(secret), false);
});
