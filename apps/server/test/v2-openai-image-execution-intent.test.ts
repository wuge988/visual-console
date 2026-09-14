import test from "node:test";
import assert from "node:assert/strict";
import {
  buildOpenAIImageExecutionIntent,
  normalizeOpenAIImageExecutionIntent,
  OpenAIImageExecutionIntentBlockedError,
  OpenAIImageExecutionIntentStore,
  openAIImageExecutionEnvelopeFingerprint,
} from "../src/v2-openai-image-execution-intent.js";
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
      updated_at: "2026-09-14T00:00:00.000Z",
    },
    activation_policy: {
      source: "RUNTIME_POLICY",
      persisted: true,
      updated_at: "2026-09-14T00:00:00.000Z",
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

function intentBody(overrides: Record<string, unknown> = {}) {
  return {
    operation_id: "op_intent_001",
    site_id: "drift-curio",
    item_id: "DC-ZY-SZ-31001",
    job_id: "job_intent_001",
    model_key: "gpt-image-2.5-sunburst",
    prompt: "Create one controlled image derivative.",
    estimated_cost: 0.25,
    spend: { sku: 0, daily: 0, monthly: 0 },
    acknowledge: "OPENAI_IMAGE_PROVIDER_CALL",
    confirmation_phrase: "EXECUTE ONE OPENAI IMAGE CALL",
    ...overrides,
  };
}

test("execution intent requires the exact human confirmation phrase and rejects scope smuggling", () => {
  assert.throws(
    () => normalizeOpenAIImageExecutionIntent(intentBody({ confirmation_phrase: "EXECUTE" })),
    /OPENAI_IMAGE_EXECUTION_INTENT_CONFIRMATION_REQUIRED/,
  );

  assert.throws(
    () => normalizeOpenAIImageExecutionIntent(intentBody({ bypass_cost_guard: true })),
    /OPENAI_IMAGE_SUBMIT_SCOPE_VIOLATION/,
  );
});

test("execution intent stays fail-closed when provider readiness is blocked and issues no token", () => {
  const registry = readyRegistry();
  registry.cloud_enabled = false;
  const normalized = normalizeOpenAIImageExecutionIntent(intentBody());
  const store = new OpenAIImageExecutionIntentStore();

  assert.throws(
    () => buildOpenAIImageExecutionIntent(registry, normalized, {
      credentialConfigured: () => true,
      networkExecutionEnabled: () => true,
      store,
    }),
    (error: unknown) => {
      assert.ok(error instanceof OpenAIImageExecutionIntentBlockedError);
      assert.ok(error.blockers.includes("CLOUD_DISABLED"));
      return true;
    },
  );
});

test("fully ready evaluation can issue a short-lived single-use intent without provider or spend mutation", () => {
  let now = Date.parse("2026-09-14T00:00:00.000Z");
  const store = new OpenAIImageExecutionIntentStore({ now: () => now, ttlMs: 60_000 });
  const normalized = normalizeOpenAIImageExecutionIntent(intentBody());
  const result = buildOpenAIImageExecutionIntent(readyRegistry(), normalized, {
    credentialConfigured: () => true,
    networkExecutionEnabled: () => true,
    store,
  });

  assert.equal(result.authority, "OPENAI_IMAGE_EXECUTION_INTENT_ONLY");
  assert.equal(result.execution_intent_issued, true);
  assert.equal(result.execution_intent.single_use, true);
  assert.equal(result.execution_intent.operation_id, "op_intent_001");
  assert.equal(result.execution_intent.issued_at, "2026-09-14T00:00:00.000Z");
  assert.equal(result.execution_intent.expires_at, "2026-09-14T00:01:00.000Z");
  assert.match(result.execution_intent.token, /^[A-Za-z0-9_-]{40,128}$/);
  assert.deepEqual(Object.values(result.audit), new Array(Object.keys(result.audit).length).fill(false));

  const consumed = store.consume(result.execution_intent.token, normalized.submit);
  assert.equal(consumed.intent_id, result.execution_intent.intent_id);
  assert.equal(consumed.operation_id, "op_intent_001");

  assert.throws(
    () => store.consume(result.execution_intent.token, normalized.submit),
    /OPENAI_IMAGE_EXECUTION_INTENT_NOT_FOUND_OR_CONSUMED/,
  );

  now += 1;
});

test("intent is bound to the exact normalized execution envelope and mismatch burns the token", () => {
  const store = new OpenAIImageExecutionIntentStore();
  const original = normalizeOpenAIImageExecutionIntent(intentBody());
  const changed = normalizeOpenAIImageExecutionIntent(intentBody({
    prompt: "Create a different controlled image derivative.",
  }));

  assert.notEqual(
    openAIImageExecutionEnvelopeFingerprint(original.submit),
    openAIImageExecutionEnvelopeFingerprint(changed.submit),
  );

  const issued = store.issue(original.submit);
  assert.throws(
    () => store.consume(issued.token, changed.submit),
    /OPENAI_IMAGE_EXECUTION_INTENT_ENVELOPE_MISMATCH/,
  );
  assert.throws(
    () => store.consume(issued.token, original.submit),
    /OPENAI_IMAGE_EXECUTION_INTENT_NOT_FOUND_OR_CONSUMED/,
  );
});

test("expired intent fails closed and is consumed", () => {
  let now = 1_000;
  const store = new OpenAIImageExecutionIntentStore({ now: () => now, ttlMs: 50 });
  const normalized = normalizeOpenAIImageExecutionIntent(intentBody());
  const issued = store.issue(normalized.submit);
  now = 1_051;

  assert.throws(
    () => store.consume(issued.token, normalized.submit),
    /OPENAI_IMAGE_EXECUTION_INTENT_EXPIRED/,
  );
  assert.throws(
    () => store.consume(issued.token, normalized.submit),
    /OPENAI_IMAGE_EXECUTION_INTENT_NOT_FOUND_OR_CONSUMED/,
  );
});
