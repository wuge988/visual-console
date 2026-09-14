import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("execution intent UI binds only to the intent endpoint and keeps submit unbound", async () => {
  const source = await readFile(
    new URL("../../web/src/v2-h-openai-image-execution-intent-ui.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /openai-image\/execution-intent/);
  assert.match(source, /OPENAI_IMAGE_EXECUTION_INTENT_ONLY/);
  assert.match(source, /NO SUBMIT BOUND/);
  assert.match(source, /INTENT ISSUED — NO EXECUTION/);
  assert.match(source, /BLOCKED — NO INTENT/);
  assert.match(source, /REVALIDATION REQUIRED/);
  assert.match(source, /EXECUTION_ENVELOPE_CHANGED_DURING_INTENT_REQUEST/);
  assert.doesNotMatch(source, /const\s+SUBMIT_API/);
  assert.doesNotMatch(source, /fetch\([^\n]*\/submit["'`]/);
});

test("execution intent UI requires exact phrase and explicit acknowledgement before request", async () => {
  const source = await readFile(
    new URL("../../web/src/v2-h-openai-image-execution-intent-ui.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /EXECUTE ONE OPENAI IMAGE CALL/);
  assert.match(source, /checkbox\.checked/);
  assert.match(source, /phrase\.value\.trim\(\) === CONFIRM_PHRASE/);
  assert.match(source, /acknowledge:\s*ACK/);
  assert.match(source, /confirmation_phrase:\s*CONFIRM_PHRASE/);
});

test("execution intent UI never renders the opaque token as a fact row", async () => {
  const source = await readFile(
    new URL("../../web/src/v2-h-openai-image-execution-intent-ui.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /heldToken = success\.execution_intent\.token/);
  assert.match(source, /token 仅保留在当前浏览器内存，不显示在页面/);
  assert.doesNotMatch(source, /\["Token",\s*success\.execution_intent\.token\]/);
  assert.doesNotMatch(source, /textContent\s*=\s*success\.execution_intent\.token/);
});
