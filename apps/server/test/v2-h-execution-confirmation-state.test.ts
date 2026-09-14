import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  executionConfirmationFingerprint,
  isExecutionConfirmationFresh,
  type ExecutionConfirmationSnapshot,
} from "../../web/src/v2-h-execution-confirmation-state.js";

const baseline: ExecutionConfirmationSnapshot = {
  model: "gpt-image-2.5-sunburst-2026-09-08",
  operationId: "op_exec_confirm_1",
  siteId: "drift-curio",
  itemId: "DC-ZY-SZ-31001",
  jobId: "job_exec_confirm_1",
  prompt: "Create one controlled image derivative.",
  estimatedCost: "0.25",
  skuSpend: "0",
  dailySpend: "0",
  monthlySpend: "0",
  confirmationPhrase: "EXECUTE ONE OPENAI IMAGE CALL",
  acknowledgement: true,
};

test("V2-H execution confirmation fingerprint covers every execution-envelope and human-confirmation field", () => {
  const original = executionConfirmationFingerprint(baseline);
  const mutations: Array<[string, Partial<ExecutionConfirmationSnapshot>]> = [
    ["model", { model: "gpt-image-2.5-flare-2026-09-08" }],
    ["operation id", { operationId: "op_exec_confirm_2" }],
    ["site id", { siteId: "drift-curio-preview" }],
    ["item id", { itemId: "DC-ZY-SZ-31002" }],
    ["job id", { jobId: "job_exec_confirm_2" }],
    ["prompt", { prompt: "Create a changed controlled image derivative." }],
    ["estimated cost", { estimatedCost: "0.2501" }],
    ["sku spend", { skuSpend: "0.10" }],
    ["daily spend", { dailySpend: "0.10" }],
    ["monthly spend", { monthlySpend: "0.10" }],
    ["confirmation phrase", { confirmationPhrase: "EXECUTE ONE OPENAI IMAGE CALL " }],
    ["acknowledgement", { acknowledgement: false }],
  ];

  for (const [name, patch] of mutations) {
    const changed = executionConfirmationFingerprint({ ...baseline, ...patch });
    assert.notEqual(changed, original, `${name} must invalidate the validated fingerprint`);
    assert.equal(isExecutionConfirmationFresh(original, { ...baseline, ...patch }), false, `${name} must be stale`);
  }
});

test("V2-H freshness is exact-envelope based rather than BLOCKED/ARMED visual-state based", () => {
  const validated = executionConfirmationFingerprint(baseline);
  assert.equal(isExecutionConfirmationFresh(validated, baseline), true);
  assert.equal(isExecutionConfirmationFresh(null, baseline), false);
  assert.equal(isExecutionConfirmationFresh(validated, { ...baseline, prompt: `${baseline.prompt} changed` }), false);
});

test("V2-H UI has explicit STALE / revalidation handling and no armed-only invalidation branch", async () => {
  const source = await readFile(
    new URL("../../web/src/v2-h-openai-image-execution-confirmation.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /lastValidatedEnvelopeFingerprint/);
  assert.match(source, /validationRequestFingerprint/);
  assert.match(source, /validationInvalidated/);
  assert.match(source, /result\.dataset\.state = "stale"/);
  assert.match(source, /REVALIDATION REQUIRED/);
  assert.match(source, /REVALIDATION_REQUIRED/);
  assert.match(source, /EXECUTION_ENVELOPE_CHANGED_DURING_VALIDATION/);
  assert.doesNotMatch(source, /result\.dataset\.state === "armed"/);
});
