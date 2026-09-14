import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { readFile } from "node:fs/promises";
import { registerV2OpenAIImageSubmitRoutes } from "../src/v2-openai-image-submit.js";

function body(overrides: Record<string, unknown> = {}) {
  return {
    operation_id: "op_binding_001",
    site_id: "drift-curio",
    item_id: "DC-ZY-SZ-31001",
    job_id: "job_binding_001",
    model_key: "gpt-image-2.5-sunburst",
    prompt: "Create one controlled image derivative.",
    estimated_cost: 0.25,
    spend: { sku: 0, daily: 0, monthly: 0 },
    acknowledge: "OPENAI_IMAGE_PROVIDER_CALL",
    ...overrides,
  };
}

test("submit HTTP route rejects requests without an execution-intent token before consumer invocation", async () => {
  const app = Fastify();
  let consumeCalls = 0;
  await registerV2OpenAIImageSubmitRoutes(app, {
    assertLocalRequest: () => {},
    consumeExecutionIntent: () => {
      consumeCalls += 1;
      throw new Error("MUST_NOT_CONSUME");
    },
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/v2/cloud/openai-image/submit",
    payload: body(),
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.json().error, "OPENAI_IMAGE_EXECUTION_INTENT_TOKEN_REQUIRED");
  assert.equal(consumeCalls, 0);
  await app.close();
});

test("submit HTTP route converts execution-intent mismatch into a fail-closed 409", async () => {
  const app = Fastify();
  let consumeCalls = 0;
  await registerV2OpenAIImageSubmitRoutes(app, {
    assertLocalRequest: () => {},
    consumeExecutionIntent: () => {
      consumeCalls += 1;
      throw new Error("OPENAI_IMAGE_EXECUTION_INTENT_ENVELOPE_MISMATCH");
    },
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/v2/cloud/openai-image/submit",
    payload: body({ execution_intent_token: "a".repeat(43) }),
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.json().fail_closed, true);
  assert.deepEqual(response.json().blockers, ["OPENAI_IMAGE_EXECUTION_INTENT_ENVELOPE_MISMATCH"]);
  assert.equal(consumeCalls, 1);
  await app.close();
});

test("runtime server binds the submit route to the shared execution-intent store", async () => {
  const source = await readFile(new URL("../src/p2-server.ts", import.meta.url), "utf8");
  assert.match(source, /openAIImageExecutionIntentStore/);
  assert.match(source, /consumeExecutionIntent:\s*\(token, input\)\s*=>\s*openAIImageExecutionIntentStore\.consume\(token, input\)/);
});
