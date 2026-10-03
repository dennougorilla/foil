// Colour maths for custom frame colours. No DOM, so face.ts and the exporter can use it.

const HEX = /^#[0-9a-f]{6}$/i;
export const isHex = (v: unknown): v is string => typeof v === 'string' && HEX.test(v);

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** WCAG relative luminance, 0..1. */
export function luminance(hex: string): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = rgb(hex);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/** True when light ink reads better than dark ink on this colour. */
export function isDark(hex: string): boolean {
  const bg = luminance(hex);
  return contrast(bg, luminance('#f3eee2')) > contrast(bg, luminance('#262d31'));
}

/** A custom frame colour with ink that stays readable on it: whichever ink contrasts more. */
export function customFrame(hex: string): { fill: string; ink: string; sub: string } {
  const light = !isDark(hex);
  return light
    ? { fill: hex, ink: '#262d31', sub: 'rgba(38,45,49,.55)' }
    : { fill: hex, ink: '#f3eee2', sub: 'rgba(243,238,226,.6)' };
}
