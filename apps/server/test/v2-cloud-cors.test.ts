import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("../../../", import.meta.url)));

test("local V2 CORS permits budget-policy PUT preflight", async () => {
  const source = await readFile(resolve(ROOT, "src", "p2-server.ts"), "utf8");
  assert.match(source, /methods:\s*\[[^\]]*"PUT"[^\]]*\]/s);
});
