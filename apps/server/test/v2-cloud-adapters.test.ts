import test from "node:test";
import assert from "node:assert/strict";
import {
  hasExecutableProviderAdapter,
  projectProviderAdapterContracts,
  providerAdapterContract,
} from "../src/v2-cloud-adapters.js";
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
        credential_env: "OPENAI_API_KEY",
        enabled: false,
        pricing_status: "KNOWN",
        models: [],
      },
      {
        provider_key: "seedance-video",
        display_name: "Seedance Video",
        media_types: ["video"],
        adapter_status: "NOT_CONFIGURED",
        credential_env: "ARK_API_KEY",
        enabled: false,
        pricing_status: "UNKNOWN",
        models: [],
      },
    ],
  };
}

test("declared provider adapter contracts remain explicitly non-executable", () => {
  for (const providerKey of ["openai-image", "seedance-video"]) {
    const contract = providerAdapterContract(providerKey);
    assert.ok(contract);
    assert.equal(contract.implementation_status, "NOT_IMPLEMENTED");
    assert.equal(contract.network_execution, false);
    assert.equal(contract.submission_adapter, null);
    assert.equal(contract.submit_path, null);
    assert.equal(hasExecutableProviderAdapter(providerKey), false);
  }
});

test("unknown providers have no adapter contract and cannot execute", () => {
  assert.equal(providerAdapterContract("unknown-provider"), null);
  assert.equal(hasExecutableProviderAdapter("unknown-provider"), false);
});

test("adapter projection is read-only capability metadata and contains no credential fields", () => {
  const projected = projectProviderAdapterContracts(registry());
  assert.equal(projected.length, 2);
  assert.deepEqual(projected.map((row) => row.executable), [false, false]);
  assert.deepEqual(projected.map((row) => row.network_execution), [false, false]);

  const serialized = JSON.stringify(projected);
  assert.equal(serialized.includes("credential_env"), false);
  assert.equal(serialized.includes("OPENAI_API_KEY"), false);
  assert.equal(serialized.includes("ARK_API_KEY"), false);
});
