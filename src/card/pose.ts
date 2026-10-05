// From the screen to the card and back: where a point of the page falls on the card's face, for
// taps and touch, by the same projection as the card's vertex shader (CARD_VS).

/** Where the card is drawn: the same numbers the card's vertex shader gets (css px, radians). */
export interface CardPose {
  cx: number;
  cy: number;
  w: number;
  h: number;
  rx: number;
  ry: number;
  rz: number;
  scale: number;
}

/** The card's rotation (z, then x, then y, as in CARD_VS) applied to a point on its plane. */
function rotate(p: CardPose, x: number, y: number): [number, number, number] {
  const x1 = Math.cos(p.rz) * x - Math.sin(p.rz) * y;
  const y1 = Math.sin(p.rz) * x + Math.cos(p.rz) * y;
  const y2 = Math.cos(p.rx) * y1;
  const z2 = Math.sin(p.rx) * y1;
  return [Math.cos(p.ry) * x1 + Math.sin(p.ry) * z2, y2, -Math.sin(p.ry) * x1 + Math.cos(p.ry) * z2];
}

const depth = (p: CardPose) => Math.max(p.w, p.h, 120) * 3.2;

/** Screen position of card uv (u, v), y down. */
export function cardPoint(u: number, v: number, p: CardPose): [number, number] {
  const [x, y, z] = rotate(p, (u - 0.5) * p.w * p.scale, (v - 0.5) * p.h * p.scale);
  const w = (depth(p) - z) / depth(p);
  return [p.cx + x / w, p.cy + y / w];
}

/** The card uv under a screen position: the inverse of `cardPoint` (a ray meeting the card's plane). */
export function cardUv(sx: number, sy: number, p: CardPose): [number, number] {
  const D = depth(p);
  const a = rotate(p, 1, 0);
  const b = rotate(p, 0, 1);
  const qx = sx - p.cx;
  const qy = sy - p.cy;
  // D·(X·a + Y·b).xy = q·(D − (X·a + Y·b).z), linear in the plane coordinates X and Y.
  const m11 = D * a[0] + qx * a[2];
  const m12 = D * b[0] + qx * b[2];
  const m21 = D * a[1] + qy * a[2];
  const m22 = D * b[1] + qy * b[2];
  const det = m11 * m22 - m12 * m21;
  const X = (qx * D * m22 - m12 * qy * D) / det;
  const Y = (m11 * qy * D - m21 * qx * D) / det;
  return [X / (p.w * p.scale) + 0.5, Y / (p.h * p.scale) + 0.5];
}
