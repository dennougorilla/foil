// Ordered (Bayer) dithering onto a fixed palette, for GIFs whose smooth gradients would otherwise
// break into bands in 256 colours. The pattern is fixed to the pixel grid, so still areas stay
// identical from frame to frame and the GIF's frame deltas still compress.

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** Palette index per pixel. `spread` is the dither's full swing, in 0..255 steps. */
export function ditherToPalette(rgba: ArrayLike<number>, width: number, palette: number[][], spread: number): Uint8Array {
  const n = rgba.length / 4;
  const out = new Uint8Array(n);
  // Nearest palette entry per 6-bit colour, found on first use.
  const cache = new Int16Array(1 << 18).fill(-1);
  const nearest = (r: number, g: number, b: number) => {
    let best = 0;
    let bestD = Infinity;
    for (let k = 0; k < palette.length; k++) {
      const [pr, pg, pb] = palette[k];
      const d = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    }
    return best;
  };
  const q = (v: number) => Math.min(63, Math.max(0, Math.round(v / 4)));
  for (let p = 0; p < n; p++) {
    const x = p % width;
    const y = (p - x) / width;
    const off = ((BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16 - 0.5) * spread;
    const r = q(rgba[p * 4] + off);
    const g = q(rgba[p * 4 + 1] + off);
    const b = q(rgba[p * 4 + 2] + off);
    const key = (r << 12) | (g << 6) | b;
    let i = cache[key];
    if (i < 0) i = cache[key] = nearest(r * 4, g * 4, b * 4);
    out[p] = i;
  }
  return out;
}
