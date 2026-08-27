import { decodeRgbaPng, encodeRgbPng } from "./png-white.js";

export const SD01_BACKGROUND_HEX = "#171B20" as const;
export const SD01_BACKGROUND_RGB = [23, 27, 32] as const;
export const SD01_RENDERER_ID = "sd01-flat-gallery-surface-rgb-v1" as const;

export function flattenRgbaPngOnDark(input: Buffer) {
  const decoded = decodeRgbaPng(input);
  const rgb = Buffer.alloc(decoded.width * decoded.height * 3);
  const [backgroundR, backgroundG, backgroundB] = SD01_BACKGROUND_RGB;

  for (let source = 0, target = 0; source < decoded.rgba.length; source += 4, target += 3) {
    const alpha = decoded.rgba[source + 3];
    const inverse = 255 - alpha;
    rgb[target] = Math.floor((decoded.rgba[source] * alpha + backgroundR * inverse + 127) / 255);
    rgb[target + 1] = Math.floor((decoded.rgba[source + 1] * alpha + backgroundG * inverse + 127) / 255);
    rgb[target + 2] = Math.floor((decoded.rgba[source + 2] * alpha + backgroundB * inverse + 127) / 255);
  }

  return {
    width: decoded.width,
    height: decoded.height,
    png: encodeRgbPng(decoded.width, decoded.height, rgb),
  };
}
