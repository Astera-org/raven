import { createHash } from "node:crypto";

export function generateColorFromId(id: string | number): string {
  const hash = createHash("sha256").update(String(id)).digest("hex");

  // Take the first 8 hex chars as a 32-bit-ish int
  const num = parseInt(hash.slice(0, 8), 16);

  const hue = num % 360;
  const saturation = 45 + (num % 41); // 45-85%
  const lightness = 80 + ((num >>> 8) % 11); // 80-90%

  return hslToHex(hue, saturation, lightness);
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;

  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));

  const toHex = (n: number) =>
    Math.round(f(n) * 255)
      .toString(16)
      .padStart(2, "0");

  return `#${toHex(0)}${toHex(8)}${toHex(4)}`;
}
