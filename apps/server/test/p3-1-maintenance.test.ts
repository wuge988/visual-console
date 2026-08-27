import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("P3.1 keeps the local P2/P3 service version truthful across health and system status", async () => {
  const [serverSource, routesSource] = await Promise.all([
    readFile(new URL("../src/p2-server.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/p2-routes.ts", import.meta.url), "utf8"),
  ]);

  assert.match(serverSource, /version:\s*"0\.3\.0-p3"/);
  assert.match(routesSource, /version:\s*"0\.3\.0-p3"/);
  assert.doesNotMatch(routesSource, /version:\s*"0\.2\.0-p2"/);
});

test("P3.1 keeps QA_FAIL visible to the server and reopenable in the review UI", async () => {
  const [routesSource, appSource] = await Promise.all([
    readFile(new URL("../src/p2-routes.ts", import.meta.url), "utf8"),
    readFile(new URL("../../web/src/App.vue", import.meta.url), "utf8"),
  ]);

  assert.match(routesSource, /\["QA_PENDING", "QA_PASS", "QA_FAIL"\]\.includes\(job\.state\)/);
  assert.match(appSource, /const failedReviewItems = computed\(\(\) => qaItems\.value\.filter\(\(x\) => x\.state === "QA_FAIL"\)\)/);
  assert.match(appSource, /setQaView\('FAILED'\)/);
  assert.match(appSource, /qaView === 'FAILED' \? '改为通过' : '通过'/);
  assert.match(appSource, /if \(qaView\.value !== "PENDING"\) return;/);
});
