import assert from "node:assert/strict";
import test from "node:test";
import { deflateSync, inflateSync } from "node:zlib";
import { flattenRgbaPngOnDark, SD01_BACKGROUND_HEX, SD01_BACKGROUND_RGB, SD01_RENDERER_ID } from "../src/png-dark.js";

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer) {
  const typeBuffer = Buffer.from(type, "ascii");
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  typeBuffer.copy(out, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);
  return out;
}

function rgbaPng(width: number, rows: Buffer[]) {
  const height = rows.length;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const scanlines: Buffer[] = [];
  for (const row of rows) {
    assert.equal(row.length, width * 4);
    scanlines.push(Buffer.from([0]), row);
  }
  return Buffer.concat([
    SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.concat(scanlines))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function decodeRgbOutput(png: Buffer) {
  let offset = 8;
  let width = 0;
  let height = 0;
  const idat: Buffer[] = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.subarray(offset + 4, offset + 8).toString("ascii");
    const data = png.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      assert.equal(data[8], 8);
      assert.equal(data[9], 2);
      assert.equal(data[12], 0);
    } else if (type === "IDAT") {
      idat.push(Buffer.from(data));
    }
  }
  const raw = inflateSync(Buffer.concat(idat));
  const rowBytes = width * 3;
  const rgb = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    const source = y * (rowBytes + 1);
    assert.equal(raw[source], 0);
    raw.copy(rgb, y * rowBytes, source + 1, source + 1 + rowBytes);
  }
  return { width, height, rgb };
}

test("SD01 frozen renderer constants match approved Candidate A", () => {
  assert.equal(SD01_BACKGROUND_HEX, "#171B20");
  assert.deepEqual(SD01_BACKGROUND_RGB, [23, 27, 32]);
  assert.equal(SD01_RENDERER_ID, "sd01-flat-gallery-surface-rgb-v1");
});

test("SD01 composites RGBA over exact #171B20 and emits opaque RGB PNG", () => {
  const source = rgbaPng(3, [Buffer.from([
    255, 0, 0, 255,
    0, 0, 255, 0,
    100, 150, 200, 128,
  ])]);
  const result = flattenRgbaPngOnDark(source);
  const decoded = decodeRgbOutput(result.png);

  assert.equal(result.width, 3);
  assert.equal(result.height, 1);
  assert.equal(decoded.width, 3);
  assert.equal(decoded.height, 1);
  assert.deepEqual([...decoded.rgb], [
    255, 0, 0,
    23, 27, 32,
    62, 89, 116,
  ]);
});

test("SD01 rendering is byte-deterministic", () => {
  const source = rgbaPng(2, [Buffer.from([
    1, 2, 3, 0,
    200, 100, 50, 255,
  ])]);
  const first = flattenRgbaPngOnDark(source);
  const second = flattenRgbaPngOnDark(source);
  assert.deepEqual(first.png, second.png);
});

test("SD01 inherits fail-closed PNG validation", () => {
  const bad = Buffer.from("not-a-png");
  assert.throws(() => flattenRgbaPngOnDark(bad), /SW01_PNG_SIGNATURE_INVALID/);
});
