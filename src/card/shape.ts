// The shapes a card can take. Every face has a short side of 900 px, so the frame's line, margins,
// corner and nameplate keep their size on every shape and only the art window stretches.
//
// No imports: the tests load this file directly with Node.

export type ShapeId = 'card' | 'wide' | 'square' | 'post' | 'postWide' | 'meishi';

export interface Shape {
  id: ShapeId;
  /** Face size in px. */
  w: number;
  h: number;
  /** Its proportions or paper size, shown beside its name. */
  size: string;
}

/** The face's short side, in px. */
export const SHORT = 900;

export const SHAPES: Shape[] = [
  // A trading card, 63 × 88 (5 : 7).
  { id: 'card', w: 900, h: 1260, size: '63 × 88 mm' },
  // A greeting card on its side, 7 : 5.
  { id: 'wide', w: 1260, h: 900, size: '7 : 5' },
  { id: 'square', w: 900, h: 900, size: '1 : 1' },
  // A postcard, 100 × 148, upright and on its side.
  { id: 'post', w: 900, h: 1332, size: '100 × 148 mm' },
  { id: 'postWide', w: 1332, h: 900, size: '148 × 100 mm' },
  // A business card, 91 × 55, on its side.
  { id: 'meishi', w: 1489, h: 900, size: '91 × 55 mm' },
];

export const shapeById = (id: ShapeId): Shape => SHAPES.find((s) => s.id === id) ?? SHAPES[0];

/** A saved shape, or the trading card when it is not one. */
export const shapeOf = (v: unknown): ShapeId => SHAPES.find((s) => s.id === v)?.id ?? 'card';

/** The face in units of its short side: (1, 1.4) for the trading card. The shaders get it as uCardK. */
export function cardK(w: number, h: number): [number, number] {
  const s = Math.min(w, h);
  return [w / s, h / s];
}

/** The art window of a face, in face px: fixed margins and nameplate, the rest is art. */
export function artWindow(w: number, h: number) {
  const s = Math.min(w, h);
  const side = 0.062 * s;
  const bottom = 0.17 * s;
  return { x: side, y: side, w: w - side * 2, h: h - side - bottom };
}

/** A card of proportions `aspect` (height / width) with the area of a 5 : 7 card `h0` tall, never taller than it. */
export function fitArea(aspect: number, h0: number): { w: number; h: number } {
  let w = h0 * Math.sqrt(5 / 7 / aspect);
  let h = w * aspect;
  if (h > h0) {
    w *= h0 / h;
    h = h0;
  }
  return { w, h };
}

/** The largest card of proportions `aspect` inside a box. */
export function contain(aspect: number, bw: number, bh: number): { w: number; h: number } {
  return bw * aspect > bh ? { w: bh / aspect, h: bh } : { w: bw, h: bw * aspect };
}

/**
 * The frame of a GIF or APNG, `W0` × `H0` for the trading card: the card takes its shape at the
 * trading card's area and keeps the same margin round it, so a wide card makes a wide frame.
 * `cw` × `ch` is the card's size in it; even sizes keep encoders happy.
 */
export function exportFrame(aspect: number, W0: number, H0: number) {
  const ch0 = (640 * H0) / 900;
  const { w: cw, h: ch } = fitArea(aspect, ch0);
  const even = (v: number) => 2 * Math.round(v / 2);
  return { W: even(W0 - (ch0 * 5) / 7 + cw), H: even(H0 - ch0 + ch), cw, ch };
}
