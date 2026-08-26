import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  SessionStore,
  assertExistingRealInside,
  assertInside,
  expectedChunkSize,
  moveFileToTrash,
  rankLanCandidates,
  selectLanCandidate,
  sha256File,
  transferVerified,
  validateChunkLength,
  validateDeclaredUploadSize,
  validateDirectUploadSize,
  validateItemId,
} from "../src/runtime-utils.js";

async function tempRoot() {
  return mkdtemp(join(tmpdir(), "visual-console-test-"));
}

test("DRIFT CURIO adapter accepts frozen SKU grammar and rejects invalid IDs", () => {
  for (const sku of [
    "DC-ZY-SZ-31001",
    "DC-TL-GQ-00001",
    "DC-YT-DZ-99999",
    "DC-XX-YY-12345",
  ]) {
    assert.equal(validateItemId("drift_curio_sku_v1", sku), sku);
  }
  for (const bad of [
    "DC-ZY-ZY-31001",
    "DC-AB-SZ-31001",
    "DC-ZY-SZ-3100",
    "../DC-ZY-SZ-31001",
  ]) {
    assert.throws(() => validateItemId("drift_curio_sku_v1", bad));
  }
  assert.throws(() => validateItemId("unknown_adapter", "DC-ZY-SZ-31001"));
});

test("LAN ranking excludes Karing/TUN and prefers WLAN over Ethernet", () => {
  const networks = {
    "Karing TUN Network Adapter": [
      { family: "IPv4", internal: false, address: "10.20.0.1" },
    ],
    "以太网": [
      { family: "IPv4", internal: false, address: "192.168.1.2" },
    ],
    WLAN: [
      { family: "IPv4", internal: false, address: "192.168.3.8" },
    ],
  };
  const ranked = rankLanCandidates(networks);
  assert.equal(ranked[0]?.interface, "WLAN");
  assert.equal(selectLanCandidate(networks).address, "192.168.3.8");
  assert.equal(
    ranked.find((row) => row.interface.includes("Karing"))?.excluded,
    true,
  );
});

test("session regeneration invalidates the older same-item token and expiry is enforced", () => {
  let now = 1_000;
  const store = new SessionStore(100, () => now);
  const first = store.create("drift-curio", "DC-ZY-SZ-31001");
  assert.equal(store.validate(first.token).itemId, "DC-ZY-SZ-31001");

  const second = store.create("drift-curio", "DC-ZY-SZ-31001");
  assert.throws(() => store.validate(first.token), /INVALID_OR_EXPIRED_SESSION/);
  assert.equal(store.validate(second.token).itemId, "DC-ZY-SZ-31001");

  now = 1_101;
  assert.throws(() => store.validate(second.token), /INVALID_OR_EXPIRED_SESSION/);
});

test("direct, declared-file and chunk limits are strict", () => {
  const MiB = 1024 * 1024;
  assert.equal(validateDirectUploadSize(32 * MiB, 32 * MiB), 32 * MiB);
  assert.throws(
    () => validateDirectUploadSize(32 * MiB + 1, 32 * MiB),
    /DIRECT_UPLOAD_TOO_LARGE/,
  );
  assert.equal(validateDeclaredUploadSize(5 * MiB, 5 * MiB), 5 * MiB);
  assert.throws(
    () => validateDeclaredUploadSize(5 * MiB + 1, 5 * MiB),
    /FILE_TOO_LARGE/,
  );

  const fileSize = 20 * MiB + 3;
  const chunkSize = 8 * MiB;
  const total = Math.ceil(fileSize / chunkSize);
  assert.equal(expectedChunkSize(fileSize, total, 0, chunkSize), 8 * MiB);
  assert.equal(expectedChunkSize(fileSize, total, 1, chunkSize), 8 * MiB);
  assert.equal(expectedChunkSize(fileSize, total, 2, chunkSize), 4 * MiB + 3);
  assert.doesNotThrow(() => validateChunkLength(4 * MiB + 3, 4 * MiB + 3));
  assert.throws(() => validateChunkLength(4 * MiB + 2, 4 * MiB + 3));
});

test("lexical path traversal is rejected", () => {
  const root = join(tmpdir(), "vc-root");
  assert.doesNotThrow(() => assertInside(root, join(root, "sku", "file.jpg")));
  assert.throws(() => assertInside(root, join(root, "..", "escape.jpg")));
});

test("real-path guard rejects symlink escape when supported", async (t) => {
  const root = await tempRoot();
  const outside = await tempRoot();
  try {
    const link = join(root, "escape-link");
    try {
      await symlink(outside, link, "dir");
    } catch (error) {
      t.skip(`symlink creation not supported in this environment: ${String(error)}`);
      return;
    }
    await assert.rejects(
      () => assertExistingRealInside(root, link),
      /(SYMLINK_OR_REPARSE_NOT_ALLOWED|PATH_OUTSIDE_ALLOWLIST)/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("verified transfer succeeds, removes source and preserves hash", async () => {
  const root = await tempRoot();
  try {
    const source = join(root, "source.bin");
    const target = join(root, "target.bin");
    await writeFile(source, Buffer.from("visual-console-transfer"));
    const before = await sha256File(source);
    const result = await transferVerified(source, target);
    assert.equal(result.sha256, before);
    assert.equal(existsSync(source), false);
    assert.equal(await sha256File(target), before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("verified transfer never overwrites an existing target", async () => {
  const root = await tempRoot();
  try {
    const source = join(root, "source.bin");
    const target = join(root, "target.bin");
    await writeFile(source, "new-data");
    await writeFile(target, "existing-data");
    await assert.rejects(() => transferVerified(source, target));
    assert.equal(await readFile(source, "utf8"), "new-data");
    assert.equal(await readFile(target, "utf8"), "existing-data");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("verification failure cleans target but preserves source", async () => {
  const root = await tempRoot();
  try {
    const source = join(root, "source.bin");
    const target = join(root, "target.bin");
    await writeFile(source, "safe-source");
    await assert.rejects(
      () =>
        transferVerified(source, target, async () => {
          throw new Error("TRANSFER_SHA256_MISMATCH");
        }),
      /TRANSFER_SHA256_MISMATCH/,
    );
    assert.equal(existsSync(source), true);
    assert.equal(existsSync(target), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("trash move uses flat SKU layout and appends an audit record", async () => {
  const root = await tempRoot();
  try {
    const rawDir = join(root, "raw", "DC-ZY-SZ-31001");
    const trashRoot = join(root, "100_Trash");
    await mkdir(rawDir, { recursive: true });
    const source = join(rawDir, "bad-shot.jpg");
    await writeFile(source, "bad-shot-content");

    const result = await moveFileToTrash({
      source,
      trashRoot,
      siteId: "drift-curio",
      itemId: "DC-ZY-SZ-31001",
      assetId: "0123456789abcdef0123456789abcdef",
      assetType: "RAW",
      filename: "bad-shot.jpg",
    });

    assert.equal(existsSync(source), false);
    assert.equal(existsSync(result.target), true);
    assert.equal(result.target.includes(join("DC-ZY-SZ-31001", "RAW")), false);
    const index = await readFile(join(trashRoot, "trash-index.jsonl"), "utf8");
    assert.match(index, /"event":"TRASH"/);
    assert.match(index, /"item_id":"DC-ZY-SZ-31001"/);
    assert.match(index, /bad-shot\.jpg/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
