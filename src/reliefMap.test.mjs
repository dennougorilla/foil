import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reliefMap } from './reliefMap.ts';

// The size the app analyses a card face at (4 face pixels per cell), so specks and edges have their real scale.
const W = 225;
const H = 315;
const ART = { x0: 15, y0: 22, x1: 210, y1: 275 };
const S = 225 / 60;

/** Paints in the coordinates of a 60×80 sketch, scaled up to the analysis grid. */
function image(paint) {
  const d = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const [r, g, b] = paint(Math.floor(x / S), Math.floor(y / S));
      d.set([r, g, b, 255], (y * W + x) * 4);
    }
  return d;
}
const noise = (x, y) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
/** Reads the map at a point of the 60×80 sketch. */
const channel = (m, x, y, c) => m.data[(Math.round((y + 0.5) * S) * W + Math.round((x + 0.5) * S)) * 4 + c];
const artCells = function* () {
  for (let y = ART.y0; y < ART.y1; y++) for (let x = ART.x0; x < ART.x1; x++) yield [x, y];
};
const cell = (m, x, y, c) => m.data[(y * W + x) * 4 + c];

test('a subject on a plain backdrop stands up, and the backdrop becomes the field', () => {
  // A soft sky gradient behind a busy, striped disc.
  const m = reliefMap(
    image((x, y) => {
      if (Math.hypot(x - 30, y - 42) < 15) return (x + y) % 4 < 2 ? [40, 30, 20] : [170, 120, 60];
      return [150 + y, 170 + y * 0.5, 225];
    }),
    W,
    H,
    ART,
  );
  assert.ok(channel(m, 30, 42, 0) > 200, 'the middle of the disc is subject');
  assert.ok(channel(m, 8, 8, 0) < 60, 'a top corner is field');
  assert.ok(channel(m, 50, 64, 0) < 60, 'sky low down, away from the disc, is field too');
});

test('small specks in the backdrop (stars, a bird) stay part of the field', () => {
  const m = reliefMap(
    image((x, y) => {
      if (Math.hypot(x - 30, y - 55) < 12) return (x + y) % 4 < 2 ? [40, 30, 20] : [170, 120, 60];
      if ((x === 14 || x === 15) && (y === 14 || y === 15)) return [255, 255, 255];
      return [40, 50 + y * 0.3, 110];
    }),
    W,
    H,
    ART,
  );
  assert.ok(channel(m, 14, 14, 0) < 60, 'the star is field');
  assert.ok(channel(m, 30, 55, 0) > 200, 'the big subject still stands');
});

test('a picture with no plain backdrop stays all subject', () => {
  const m = reliefMap(image((x, y) => [noise(x, y) * 255, noise(y, x) * 255, noise(x + 9, y) * 255]), W, H, ART);
  let field = 0;
  let n = 0;
  for (const [x, y] of artCells()) {
    n++;
    if (cell(m, x, y, 0) < 128) field++;
  }
  assert.ok(field / n < 0.1, `only ${((field / n) * 100).toFixed(0)}% should be field`);
});

test('the tonal range is measured, so a dark picture can be lifted', () => {
  const m = reliefMap(image((x) => Array(3).fill(5 + (x / 60) * 60)), W, H, ART);
  assert.ok(m.lo < 0.06, `lo ${m.lo}`);
  assert.ok(m.hi > 0.2 && m.hi < 0.3, `hi ${m.hi}`);
});

test('distinct tonal regions sit flat, each on its own level', () => {
  // A poster-like subject: four bands of tone with hard edges between them.
  const m = reliefMap(image((x) => Array(3).fill([30, 100, 170, 240][Math.min(3, Math.floor(x / 15))])), W, H, ART);
  const inside = (x) => {
    const v = new Set();
    for (let y = 10; y < 70; y++) v.add(channel(m, x, y, 1));
    return v;
  };
  for (const x of [5, 20, 35, 50]) assert.equal(inside(x).size, 1, `band at ${x} is flat`);
  const levels = [5, 20, 35, 50].map((x) => channel(m, x, 40, 1));
  assert.ok(levels.every((v, i) => i === 0 || v > levels[i - 1] + 40), `levels climb: ${levels}`);
});

test('soft shading never steps: levels only break where the picture has an edge', () => {
  // A smooth, busy-free tone ramp (like a cheek) beside a hard light/dark edge.
  const m = reliefMap(image((x, y) => Array(3).fill(y < 40 ? 40 + (x / 60) * 180 : x < 30 ? 40 : 220)), W, H, ART);
  // Along the soft ramp the level climbs in small steps; across the hard edge it jumps.
  let worst = 0;
  for (let x = ART.x0 + 4; x < ART.x1 - 4; x++) worst = Math.max(worst, Math.abs(cell(m, x + 1, 80, 1) - cell(m, x, 80, 1)));
  assert.ok(worst < 40, `the soft ramp jumps by ${worst} at most`);
  assert.ok(channel(m, 40, 60, 1) - channel(m, 20, 60, 1) > 150, 'the hard edge is a full step');
});

test('a dithered area sits on one level instead of a checkerboard of steps', () => {
  // Pixel-art dither: two neighbouring shades alternating cell by cell (a 1-pixel checker).
  const d = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const v = (Math.floor(x / 3) + Math.floor(y / 3)) % 2 ? 150 : 110;
      d.set([v, v, v, 255], (y * W + x) * 4);
    }
  const m = reliefMap(d, W, H, ART);
  const seen = new Set();
  for (let y = 60; y < 200; y++) for (let x = 40; x < 180; x++) seen.add(cell(m, x, y, 1));
  const values = [...seen];
  assert.ok(Math.max(...values) - Math.min(...values) < 24, `height spread ${Math.min(...values)}..${Math.max(...values)}`);
});

test('dense texture is marked so fine grooves can be calmed', () => {
  const m = reliefMap(
    image((x, y) => (x < 30 ? Array(3).fill(noise(x, y) * 255) : [120, 120, 120])),
    W,
    H,
    ART,
  );
  assert.ok(channel(m, 15, 40, 2) > 150, 'the noisy half is dense');
  assert.ok(channel(m, 48, 40, 2) < 40, 'the flat half is not');
});
