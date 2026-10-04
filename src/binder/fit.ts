// Fitting a card of any shape into a trading-card pocket: the thumbnail is cut to the card's own
// outline (whatever shape it was made in), then shrunk to fit the pocket without stretching.

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The smallest box holding every pixel more than barely visible (RGBA rows); the whole picture when none is. */
export function opaqueBounds(data: Uint8ClampedArray, w: number, h: number, min = 16): Box {
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] <= min) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      y1 = y;
    }
  }
  return x1 < 0 ? { x: 0, y: 0, w, h } : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** A w×h picture shrunk (never grown) to fit inside boxW×boxH, keeping its shape. */
export function fitIn(w: number, h: number, boxW: number, boxH: number): { w: number; h: number } {
  const k = Math.min(1, boxW / w, boxH / h);
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}
