import { deflateSync, inflateSync } from "node:zlib";

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const MAX_DIMENSION = 8192;
const MAX_PIXELS = 16_777_216;
const MAX_INPUT_BYTES = 128 * 1024 * 1024;

export type RgbaPng = {
  width: number;
  height: number;
  rgba: Buffer;
};

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

function isCriticalChunk(type: string) {
  return (type.charCodeAt(0) & 0x20) === 0;
}

function paeth(left: number, up: number, upLeft: number) {
  const prediction = left + up - upLeft;
  const leftDistance = Math.abs(prediction - left);
  const upDistance = Math.abs(prediction - up);
  const upLeftDistance = Math.abs(prediction - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) return left;
  if (upDistance <= upLeftDistance) return up;
  return upLeft;
}

export function decodeRgbaPng(input: Buffer): RgbaPng {
  if (input.length > MAX_INPUT_BYTES) throw new Error("SW01_PNG_INPUT_TOO_LARGE");
  if (input.length < PNG_SIGNATURE.length || !input.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error("SW01_PNG_SIGNATURE_INVALID");
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let sawIhdr = false;
  let sawIend = false;
  const idat: Buffer[] = [];

  while (offset < input.length) {
    if (offset + 12 > input.length) throw new Error("SW01_PNG_CHUNK_TRUNCATED");
    const length = input.readUInt32BE(offset);
    offset += 4;
    const typeBuffer = input.subarray(offset, offset + 4);
    const type = typeBuffer.toString("ascii");
    offset += 4;
    if (!/^[A-Za-z]{4}$/.test(type)) throw new Error("SW01_PNG_CHUNK_TYPE_INVALID");
    if (length > input.length - offset - 4) throw new Error("SW01_PNG_CHUNK_TRUNCATED");
    const data = input.subarray(offset, offset + length);
    offset += length;
    const expectedCrc = input.readUInt32BE(offset);
    offset += 4;
    const actualCrc = crc32(Buffer.concat([typeBuffer, data]));
    if (actualCrc !== expectedCrc) throw new Error("SW01_PNG_CRC_MISMATCH");

    if (!sawIhdr && type !== "IHDR") throw new Error("SW01_PNG_IHDR_NOT_FIRST");

    if (type === "IHDR") {
      if (sawIhdr || length !== 13) throw new Error("SW01_PNG_IHDR_INVALID");
      sawIhdr = true;
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const bitDepth = data[8];
      const colorType = data[9];
      const compression = data[10];
      const filter = data[11];
      const interlace = data[12];
      if (!width || !height || width > MAX_DIMENSION || height > MAX_DIMENSION) {
        throw new Error("SW01_PNG_DIMENSIONS_UNSUPPORTED");
      }
      if (width * height > MAX_PIXELS) throw new Error("SW01_PNG_PIXELS_EXCEEDED");
      if (bitDepth !== 8 || colorType !== 6 || compression !== 0 || filter !== 0 || interlace !== 0) {
        throw new Error("SW01_PNG_FORMAT_UNSUPPORTED");
      }
      continue;
    }

    if (type === "IDAT") {
      if (!sawIhdr || sawIend) throw new Error("SW01_PNG_IDAT_ORDER_INVALID");
      idat.push(Buffer.from(data));
      continue;
    }

    if (type === "IEND") {
      if (length !== 0 || !sawIhdr || !idat.length) throw new Error("SW01_PNG_IEND_INVALID");
      sawIend = true;
      if (offset !== input.length) throw new Error("SW01_PNG_TRAILING_DATA");
      break;
    }

    if (isCriticalChunk(type)) throw new Error("SW01_PNG_CRITICAL_CHUNK_UNSUPPORTED");
  }

  if (!sawIhdr || !sawIend || !idat.length) throw new Error("SW01_PNG_STRUCTURE_INVALID");

  const rowBytes = width * 4;
  const expectedInflatedBytes = (rowBytes + 1) * height;
  let inflated: Buffer;
  try {
    inflated = inflateSync(Buffer.concat(idat), { maxOutputLength: expectedInflatedBytes });
  } catch {
    throw new Error("SW01_PNG_IDAT_INVALID");
  }
  if (inflated.length !== expectedInflatedBytes) throw new Error("SW01_PNG_SCANLINE_SIZE_INVALID");

  const rgba = Buffer.alloc(rowBytes * height);
  let sourceOffset = 0;
  for (let y = 0; y < height; y++) {
    const filterType = inflated[sourceOffset++];
    if (filterType > 4) throw new Error("SW01_PNG_FILTER_UNSUPPORTED");
    const rowOffset = y * rowBytes;
    const previousOffset = (y - 1) * rowBytes;
    for (let x = 0; x < rowBytes; x++) {
      const encoded = inflated[sourceOffset++];
      const left = x >= 4 ? rgba[rowOffset + x - 4] : 0;
      const up = y > 0 ? rgba[previousOffset + x] : 0;
      const upLeft = y > 0 && x >= 4 ? rgba[previousOffset + x - 4] : 0;
      let predictor = 0;
      if (filterType === 1) predictor = left;
      else if (filterType === 2) predictor = up;
      else if (filterType === 3) predictor = Math.floor((left + up) / 2);
      else if (filterType === 4) predictor = paeth(left, up, upLeft);
      rgba[rowOffset + x] = (encoded + predictor) & 0xff;
    }
  }

  return { width, height, rgba };
}

function pngChunk(type: string, data: Buffer) {
  const typeBuffer = Buffer.from(type, "ascii");
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  typeBuffer.copy(out, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);
  return out;
}

export function encodeRgbPng(width: number, height: number, rgb: Buffer) {
  if (rgb.length !== width * height * 3) throw new Error("SW01_RGB_SIZE_INVALID");
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const rowBytes = width * 3;
  const scanlines = Buffer.alloc((rowBytes + 1) * height);
  for (let y = 0; y < height; y++) {
    const target = y * (rowBytes + 1);
    scanlines[target] = 0;
    rgb.copy(scanlines, target + 1, y * rowBytes, (y + 1) * rowBytes);
  }

  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk("IHDR", ihdr),
    pngChunk("sRGB", Buffer.from([0])),
    pngChunk("IDAT", deflateSync(scanlines, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

export function flattenRgbaPngOnWhite(input: Buffer) {
  const decoded = decodeRgbaPng(input);
  const rgb = Buffer.alloc(decoded.width * decoded.height * 3);
  for (let source = 0, target = 0; source < decoded.rgba.length; source += 4, target += 3) {
    const alpha = decoded.rgba[source + 3];
    const inverse = 255 - alpha;
    rgb[target] = Math.floor((decoded.rgba[source] * alpha + 255 * inverse + 127) / 255);
    rgb[target + 1] = Math.floor((decoded.rgba[source + 1] * alpha + 255 * inverse + 127) / 255);
    rgb[target + 2] = Math.floor((decoded.rgba[source + 2] * alpha + 255 * inverse + 127) / 255);
  }
  return {
    width: decoded.width,
    height: decoded.height,
    png: encodeRgbPng(decoded.width, decoded.height, rgb),
  };
}
