import assert from "node:assert/strict";
import test from "node:test";
import { deflateSync, inflateSync } from "node:zlib";
import { flattenRgbaPngOnWhite } from "../src/png-white.js";

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

function paeth(left: number, up: number, upLeft: number) {
  const p = left + up - upLeft;
  const pa = Math.abs(p - left);
  const pb = Math.abs(p - up);
  const pc = Math.abs(p - upLeft);
  if (pa <= pb && pa <= pc) return left;
  if (pb <= pc) return up;
  return upLeft;
}

function filterRow(row: Buffer, previous: Buffer | undefined, filter: number) {
  const encoded = Buffer.alloc(row.length);
  for (let x = 0; x < row.length; x++) {
    const left = x >= 4 ? row[x - 4] : 0;
    const up = previous?.[x] ?? 0;
    const upLeft = x >= 4 ? previous?.[x - 4] ?? 0 : 0;
    let predictor = 0;
    if (filter === 1) predictor = left;
    else if (filter === 2) predictor = up;
    else if (filter === 3) predictor = Math.floor((left + up) / 2);
    else if (filter === 4) predictor = paeth(left, up, upLeft);
    encoded[x] = (row[x] - predictor + 256) & 0xff;
  }
  return encoded;
}

function rgbaPng(width: number, rows: Buffer[], filters?: number[]) {
  const height = rows.length;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const scanlines: Buffer[] = [];
  for (let y = 0; y < height; y++) {
    assert.equal(rows[y].length, width * 4);
    const filter = filters?.[y] ?? 0;
    scanlines.push(Buffer.from([filter]), filterRow(rows[y], y ? rows[y - 1] : undefined, filter));
  }
  return Buffer.concat([
    SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.concat(scanlines))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function decodeRgbOutput(png: Buffer) {
  assert.equal(png.subarray(0, 8).equals(SIGNATURE), true);
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
    } else if (type === "IDAT") idat.push(Buffer.from(data));
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

test("SW01 composites RGBA over exact white and emits opaque RGB PNG", () => {
  const source = rgbaPng(3, [Buffer.from([
    255, 0, 0, 255,
    0, 0, 255, 0,
    0, 0, 0, 128,
  ])]);
  const result = flattenRgbaPngOnWhite(source);
  const decoded = decodeRgbOutput(result.png);

  assert.equal(result.width, 3);
  assert.equal(result.height, 1);
  assert.equal(decoded.width, 3);
  assert.equal(decoded.height, 1);
  assert.deepEqual([...decoded.rgb], [255, 0, 0, 255, 255, 255, 127, 127, 127]);
});

test("SW01 decoder handles PNG filters 0 through 4 deterministically", () => {
  const rows = [0, 1, 2, 3, 4].map((index) => Buffer.from([
    10 + index, 20 + index, 30 + index, 255,
    40 + index, 50 + index, 60 + index, 128,
  ]));
  const source = rgbaPng(2, rows, [0, 1, 2, 3, 4]);
  const first = flattenRgbaPngOnWhite(source);
  const second = flattenRgbaPngOnWhite(source);

  assert.equal(first.width, 2);
  assert.equal(first.height, 5);
  assert.deepEqual(first.png, second.png);
  const decoded = decodeRgbOutput(first.png);
  assert.deepEqual([...decoded.rgb.subarray(0, 6)], [10, 20, 30, 147, 152, 157]);
});

test("SW01 fails closed on a non-alpha RGB source PNG", () => {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const source = Buffer.concat([
    SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.from([0, 1, 2, 3]))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  assert.throws(() => flattenRgbaPngOnWhite(source), /SW01_PNG_FORMAT_UNSUPPORTED/);
});

test("SW01 rejects CRC corruption before rendering", () => {
  const source = rgbaPng(1, [Buffer.from([1, 2, 3, 255])]);
  const corrupted = Buffer.from(source);
  corrupted[20] ^= 0xff;
  assert.throws(() => flattenRgbaPngOnWhite(corrupted), /SW01_PNG_CRC_MISMATCH/);
});
