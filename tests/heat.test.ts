// Run with `npm test` (Node's own test runner, which strips the types itself).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AutoTouch, cardPoint, cardUv, HeatField, pickSwipe, Swipe, SWIPES, swipeAt } from '../src/touch/heat.ts';

const at = (f: { data: Float32Array; w: number; h: number }, u: number, v: number) =>
  f.data[Math.min(f.h - 1, Math.floor(v * f.h)) * f.w + Math.min(f.w - 1, Math.floor(u * f.w))];
const total = (f: { data: Float32Array }) => f.data.reduce((a, b) => a + b, 0);

test('a stroke warms the card along its path and nowhere else', () => {
  const f = new HeatField();
  f.touch(0.2, 0.3, 0.8, 0.3, 1 / 60, true);
  assert.ok(at(f, 0.5, 0.3) > 0.1);
  assert.ok(at(f, 0.2, 0.3) > 0.1);
  assert.equal(at(f, 0.5, 0.8), 0);
});

test('cells are square on every shape, so a fingertip warms a round spot', () => {
  assert.deepEqual([new HeatField().w, new HeatField().h], [60, 84]);
  const wide = new HeatField('warmth', [1.4, 1]);
  assert.deepEqual([wide.w, wide.h], [84, 60]);
  for (let i = 0; i < 30; i++) wide.touch(0.5, 0.5, 0.5, 0.5, 1 / 60, true);
  // How far the warmth reaches across and down, in card widths of the short side.
  const reach = (du: number, dv: number) => {
    let n = 0;
    while (at(wide, 0.5 + du * n, 0.5 + dv * n) > 0.05) n++;
    return n;
  };
  const across = reach(1 / 84, 0);
  const down = reach(0, 1 / 60);
  assert.ok(across > 1 && Math.abs(across - down) <= 1, `${across} vs ${down}`);
});

test('holding still warms more than passing by, but never without limit', () => {
  const pass = new HeatField();
  pass.touch(0.5, 0.5, 0.5, 0.5, 1 / 60, true);
  const hold = new HeatField();
  for (let i = 0; i < 600; i++) hold.touch(0.5, 0.5, 0.5, 0.5, 1 / 60, true);
  assert.ok(at(hold, 0.5, 0.5) > at(pass, 0.5, 0.5));
  assert.ok(at(hold, 0.5, 0.5) <= 1.6);
});

test('a firm touch warms more than a hover', () => {
  const hover = new HeatField();
  const firm = new HeatField();
  for (let i = 0; i < 30; i++) {
    hover.touch(0.5, 0.5, 0.5, 0.5, 1 / 60, false);
    firm.touch(0.5, 0.5, 0.5, 0.5, 1 / 60, true);
  }
  assert.ok(at(firm, 0.5, 0.5) > at(hover, 0.5, 0.5));
});

test('heat spreads out and cools back to nothing', () => {
  const f = new HeatField();
  for (let i = 0; i < 60; i++) f.touch(0.5, 0.5, 0.5, 0.5, 1 / 60, true);
  // Spreading shows as the edge holding on better than the middle while everything cools.
  const edge = () => at(f, 0.5, 0.58) / at(f, 0.5, 0.5);
  const before = edge();
  const start = total(f);
  for (let i = 0; i < 60; i++) f.step(1 / 60);
  assert.ok(edge() > before, 'spreads');
  assert.ok(total(f) < start, 'cools');
  for (let i = 0; i < 60 * 40; i++) f.step(1 / 60);
  assert.ok(f.cold);
  assert.equal(total(f), 0);
});

test('a cold card does nothing: no new version to upload', () => {
  const f = new HeatField();
  const v = f.version;
  f.step(1 / 60);
  assert.equal(f.version, v);
  f.touch(0.5, 0.5, 0.5, 0.5, 1 / 60, false);
  assert.notEqual(f.version, v);
});

test('pressing leaves a fingerprint that fades after lifting; at most three stay', () => {
  const f = new HeatField();
  for (let i = 0; i < 30; i++) f.press(0.4, 0.4, 1 / 60);
  assert.equal(f.prints.length, 1);
  const strong = f.prints[0].heat;
  assert.ok(strong > 0.2);
  f.lift();
  f.step(1);
  assert.ok(f.prints[0].heat < strong);
  for (const u of [0.2, 0.5, 0.7]) {
    f.press(u, 0.6, 0.2);
    f.lift();
  }
  assert.equal(f.prints.length, 3);
  for (let i = 0; i < 60 * 40; i++) f.step(1 / 60);
  assert.equal(f.prints.length, 0);
});

test('the automatic stroke loops seamlessly', () => {
  const a = new AutoTouch();
  const b = new AutoTouch();
  for (const p of [0, 0.3, 0.7]) {
    a.at(3 + p);
    b.at(4 + p);
    let diff = 0;
    for (let i = 0; i < a.data.length; i++) diff = Math.max(diff, Math.abs(a.data[i] - b.data[i]));
    assert.ok(diff < 0.01, `phase ${p}: ${diff}`);
    assert.equal(a.prints.length, b.prints.length);
  }
  assert.ok(total(a) > 1, 'something is drawn');
});

test('a stroke first asked for late in a session catches up in a few loops, not all of them', () => {
  const a = new AutoTouch();
  const b = new AutoTouch();
  a.at(3.3);
  const t0 = performance.now();
  b.at(5000.3);
  const ms = performance.now() - t0;
  let diff = 0;
  for (let i = 0; i < a.data.length; i++) diff = Math.max(diff, Math.abs(a.data[i] - b.data[i]));
  assert.ok(diff < 0.01, `differs by ${diff}`);
  assert.equal(a.prints.length, b.prints.length);
  assert.ok(ms < 1000, `took ${ms.toFixed(0)} ms`);
});

test('the automatic stroke is the same however the loop is sampled', () => {
  const a = new AutoTouch();
  const b = new AutoTouch();
  a.at(2.5);
  for (let p = 0; p <= 2.5; p += 0.05) b.at(p);
  b.at(2.5);
  assert.deepEqual(Array.from(a.data), Array.from(b.data));
});

test('a point on the screen maps back to the spot of the tilted card under it', () => {
  const pose = { cx: 400, cy: 300, w: 360, h: 504, rx: 0.2, ry: -0.3, rz: 0.1, scale: 1.04 };
  for (const [u, v] of [
    [0.5, 0.5],
    [0.1, 0.2],
    [0.85, 0.9],
  ]) {
    const [x, y] = cardPoint(u, v, pose);
    const [u2, v2] = cardUv(x, y, pose);
    assert.ok(Math.abs(u2 - u) < 1e-6 && Math.abs(v2 - v) < 1e-6, `${u},${v} -> ${u2},${v2}`);
  }
  const flat = { ...pose, rx: 0, ry: 0, rz: 0, scale: 1 };
  assert.deepEqual(cardPoint(0, 0, flat), [400 - 180, 300 - 252]);
});

test('a swipe plays out on its own: a warm line, then a print, then it is done', () => {
  const f = new HeatField();
  const swipe = new Swipe(f, SWIPES[0]);
  let t = 0;
  while (swipe.step(1 / 60)) {
    f.step(1 / 60);
    t += 1 / 60;
    assert.ok(t < 5, 'ends');
  }
  const [u, v] = swipeAt(SWIPES[0], 0.5);
  assert.ok(at(f, u, v) > 0.1, 'warm along the line');
  assert.equal(f.prints.length, 1, 'one print');
  assert.ok(f.prints[0].heat > 0.3);
});

test('the automatic loop starts and ends on a card that has all but cooled', () => {
  const a = new AutoTouch();
  a.at(3);
  assert.ok(Math.max(...a.data) < 0.12, `peak ${Math.max(...a.data)}`);
  a.at(3.3);
  assert.ok(Math.max(...a.data) > 0.5, 'warm mid-loop');
});

test('the swipe goes where the picture is busiest', () => {
  const W = 20;
  const H = 28;
  const busy = (cu: number, cv: number) => {
    const d = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) d[y * W + x] = Math.exp(-((x / W - cu) ** 2 + ((y / H - cv) * 1.4) ** 2) * 30);
    return d;
  };
  const passes = (shape: (typeof SWIPES)[number], cu: number, cv: number) => {
    let best = 9;
    for (let s = 0; s <= 1; s += 0.02) {
      const [u, v] = swipeAt(shape, s);
      best = Math.min(best, Math.hypot(u - cu, (v - cv) * 1.4));
    }
    return best;
  };
  for (const [cu, cv] of [
    [0.25, 0.25],
    [0.75, 0.25],
    [0.5, 0.65],
  ]) {
    const shape = pickSwipe(busy(cu, cv), W, H);
    assert.ok(passes(shape, cu, cv) < 0.12, `${cu},${cv}`);
  }
  // Every swipe and its press stay on the art.
  for (const shape of SWIPES) {
    for (let s = 0; s <= 1; s += 0.1) {
      const [u, v] = swipeAt(shape, s);
      assert.ok(u > 0.06 && u < 0.94 && v > 0.05 && v < 0.86, `${u},${v}`);
    }
    assert.ok(shape.press[0] > 0.12 && shape.press[0] < 0.88 && shape.press[1] > 0.1 && shape.press[1] < 0.8);
  }
});
