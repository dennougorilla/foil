// Colour maths for custom frame and backdrop colours. No DOM, so face.ts and the exporter can use it.

export type Swirl = [string, string, string];

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

function toHsl(hex: string): [number, number, number] {
  const [r, g, b] = rgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function fromHsl(h: number, s: number, l: number): string {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return `#${[f(0), f(8), f(4)].map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('')}`;
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

/** Three poster-paint tones (dark, mid, light) for the swirl, built from one picked colour. */
export function swirlFrom(hex: string): Swirl {
  const [h, s, l] = toHsl(hex);
  const sat = Math.max(s, 0.08);
  return [
    fromHsl(h, Math.min(1, sat * 0.75), Math.min(0.11, 0.04 + l * 0.12)),
    fromHsl(h, sat, Math.min(0.56, Math.max(0.3, l))),
    fromHsl((h + 14) % 360, Math.min(1, sat * 0.9), Math.min(0.82, Math.max(0.6, l + 0.24))),
  ];
}

/** Hand-picked backdrops that sit before the custom colours. */
export const BACKDROPS: { id: string; swirl: Swirl }[] = [
  { id: 'felt', swirl: ['#0a1a12', '#2a7a4f', '#7fd39c'] },
  { id: 'night', swirl: ['#090d1f', '#2b3f9e', '#8aa6ff'] },
  { id: 'ember', swirl: ['#1a0a06', '#b0442a', '#ffb067'] },
];

/** The swirl for a stored backdrop choice, or null to follow the finish. */
export function backdropSwirl(choice: string): Swirl | null {
  if (isHex(choice)) return swirlFrom(choice);
  return BACKDROPS.find((b) => b.id === choice)?.swirl ?? null;
}
