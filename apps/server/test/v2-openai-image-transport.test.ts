import test from "node:test";
import assert from "node:assert/strict";
import {
  executeOpenAIImageTransport,
  normalizeOpenAIImageTransportInput,
  openAIImageTransportFacts,
} from "../src/v2-openai-image-transport.js";

const SECRET = "sk-test-secret-never-return";

test("transport input is strict and bounded", () => {
  assert.deepEqual(
    normalizeOpenAIImageTransportInput({
      request_model: "gpt-image-2.5-sunburst-2026-09-08",
      prompt: "Create a neutral studio render.",
    }),
    {
      request_model: "gpt-image-2.5-sunburst-2026-09-08",
      prompt: "Create a neutral studio render.",
    },
  );

  assert.throws(
    () => normalizeOpenAIImageTransportInput({
      request_model: "gpt-image-2.5-sunburst-2026-09-08",
      prompt: "x",
      endpoint: "https://example.com",
    } as any),
    /OPENAI_IMAGE_TRANSPORT_SCOPE_VIOLATION/,
  );
});

test("transport posts only to the fixed OpenAI image endpoint and never returns the credential", async () => {
  let seenUrl = "";
  let seenInit: RequestInit | undefined;
  const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
    seenUrl = String(input);
    seenInit = init;
    return new Response(
      JSON.stringify({ created: 123, data: [{ b64_json: "ZmFrZS1pbWFnZQ==" }] }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
          "x-request-id": "req_image_123",
        },
      },
    );
  };

  const result = await executeOpenAIImageTransport(
    {
      request_model: "gpt-image-2.5-sunburst-2026-09-08",
      prompt: "Create a neutral studio render.",
    },
    SECRET,
    fetchImpl,
  );

  assert.equal(seenUrl, "https://api.openai.com/v1/images/generations");
  assert.equal(seenInit?.method, "POST");
  assert.equal((seenInit?.headers as Record<string, string>).authorization, `Bearer ${SECRET}`);
  assert.deepEqual(JSON.parse(String(seenInit?.body)), {
    model: "gpt-image-2.5-sunburst-2026-09-08",
    prompt: "Create a neutral studio render.",
  });
  assert.equal(result.request_id, "req_image_123");
  assert.equal(result.http_status, 200);
  assert.equal(JSON.stringify(result).includes(SECRET), false);
});

test("transport fails closed before network without a credential", async () => {
  let called = false;
  const fetchImpl = async () => {
    called = true;
    return new Response("{}", { status: 200 });
  };

  await assert.rejects(
    executeOpenAIImageTransport(
      { request_model: "gpt-image-2.5-sunburst", prompt: "x" },
      "",
      fetchImpl,
    ),
    /OPENAI_IMAGE_TRANSPORT_CREDENTIAL_MISSING/,
  );
  assert.equal(called, false);
});

test("provider HTTP and network failures are sanitized", async () => {
  await assert.rejects(
    executeOpenAIImageTransport(
      { request_model: "gpt-image-2.5-sunburst", prompt: "x" },
      SECRET,
      async () => new Response(`provider body contains ${SECRET}`, { status: 401 }),
    ),
    (error: any) => {
      assert.equal(error.message, "OPENAI_IMAGE_PROVIDER_HTTP_401");
      assert.equal(String(error).includes(SECRET), false);
      return true;
    },
  );

  await assert.rejects(
    executeOpenAIImageTransport(
      { request_model: "gpt-image-2.5-sunburst", prompt: "x" },
      SECRET,
      async () => { throw new Error(`network leaked ${SECRET}`); },
    ),
    (error: any) => {
      assert.equal(error.message, "OPENAI_IMAGE_PROVIDER_NETWORK_ERROR");
      assert.equal(String(error).includes(SECRET), false);
      return true;
    },
  );
});

test("transport primitive is not itself HTTP execution authority", () => {
  assert.equal(openAIImageTransportFacts.network_execution_primitive, true);
  assert.equal(openAIImageTransportFacts.http_route_exposed, false);
  assert.equal(openAIImageTransportFacts.credential_source, "CALLER_INJECTED_ONLY");
  assert.equal(openAIImageTransportFacts.authority, "NO_HTTP_ROUTE_NO_EXECUTION_AUTHORITY");
});
