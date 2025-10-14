/**
 * Color utilities for mixing and normalising hex colours used throughout the UI.
 */

/** Represents an RGB colour with 0-255 channel intensities. */
interface RgbColor {
  red: number;
  green: number;
  blue: number;
}

/**
 * Normalises shorthand hex colour strings (#abc) into their 6-digit form (#aabbcc).
 */
const normaliseHex = (value: string): string => {
  const hex = value.replace(/^#/, "").trim();
  if (hex.length === 3) {
    return hex
      .split("")
      .map((char) => char + char)
      .join("");
  }
  return hex;
};

/**
 * Parses a CSS hex colour string (with or without leading '#') into an RGB tuple.
 */
const parseHexColor = (value: string): RgbColor => {
  const hex = normaliseHex(value);
  if (hex.length !== 6) {
    throw new Error(`Unsupported colour format: ${value}`);
  }

  const red = parseInt(hex.slice(0, 2), 16);
  const green = parseInt(hex.slice(2, 4), 16);
  const blue = parseInt(hex.slice(4, 6), 16);

  if ([red, green, blue].some((channel) => Number.isNaN(channel))) {
    throw new Error(`Unable to parse colour: ${value}`);
  }

  return { red, green, blue };
};

/**
 * Converts an RGB tuple into a CSS hex colour string (#rrggbb).
 */
const toHex = ({ red, green, blue }: RgbColor): string => {
  const channelToHex = (channel: number) =>
    Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, "0");

  return `#${channelToHex(red)}${channelToHex(green)}${channelToHex(blue)}`;
};

/**
 * Linearly interpolates between two RGB colours.
 *
 * @param from Starting colour in hex format.
 * @param to Target colour in hex format.
 * @param ratio Interpolation factor in the range [0, 1]. Values outside the range are clamped.
 */
export const mixHexColors = (from: string, to: string, ratio: number): string => {
  const clampedRatio = Math.max(0, Math.min(1, ratio));
  const start = parseHexColor(from);
  const end = parseHexColor(to);

  const mixChannel = (a: number, b: number) => a + (b - a) * clampedRatio;

  return toHex({
    red: mixChannel(start.red, end.red),
    green: mixChannel(start.green, end.green),
    blue: mixChannel(start.blue, end.blue),
  });
};

export default mixHexColors;
