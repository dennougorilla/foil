// Run with `npm test` (Node's own test runner, which strips the types itself).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { artWindow, cardK, contain, exportFrame, FIT_MAX, fitArea, setFit, shapeById, shapeOf, SHAPES } from '../src/card/shape.ts';

const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test('the trading card leads, and every shape has the proportions it is named for', () => {
  assert.deepEqual(
    SHAPES.map((s) => s.id),
    ['card', 'wide', 'square', 'post', 'postWide', 'meishi', 'fit'],
  );
  const ratio = (id: Parameters<typeof shapeById>[0]) => shapeById(id).h / shapeById(id).w;
  near(ratio('card'), 88 / 63, 0.01);
  near(ratio('wide'), 5 / 7, 0.01);
  near(ratio('square'), 1);
  near(ratio('post'), 148 / 100, 0.01);
  near(ratio('postWide'), 100 / 148, 0.01);
  near(ratio('meishi'), 55 / 91, 0.01);
  // The trading card keeps the face it always had.
  assert.deepEqual([shapeById('card').w, shapeById('card').h], [900, 1260]);
});

test('every face has a short side of 900, so the frame keeps its size on every shape', () => {
  for (const s of SHAPES) assert.equal(Math.min(s.w, s.h), 900, s.id);
});

test('a saved shape that is not known starts over on the trading card', () => {
  assert.equal(shapeOf('wide'), 'wide');
  assert.equal(shapeOf('hexagon'), 'card');
  assert.equal(shapeOf(undefined), 'card');
  assert.equal(shapeOf(3), 'card');
});

test('Picture takes the picture\'s proportions, its short side 900, never past 1 : FIT_MAX', () => {
  assert.equal(shapeOf('fit'), 'fit');
  assert.equal(setFit(300, 600), true);
  assert.deepEqual([shapeById('fit').w, shapeById('fit').h], [900, 1800]);
  // The same proportions again change nothing.
  assert.equal(setFit(150, 300), false);
  setFit(1000, 500);
  assert.deepEqual([shapeById('fit').w, shapeById('fit').h], [1800, 900]);
  setFit(100, 1000);
  assert.deepEqual([shapeById('fit').w, shapeById('fit').h], [900, Math.round(900 * FIT_MAX)]);
  setFit(1000, 10);
  assert.deepEqual([shapeById('fit').w, shapeById('fit').h], [Math.round(900 * FIT_MAX), 900]);
  setFit(63, 88);
  near(shapeById('fit').h / shapeById('fit').w, 88 / 63, 0.01);
  setFit(900, 1260);
});

test('cardK is the face in units of its short side', () => {
  assert.deepEqual(cardK(900, 1260), [1, 1.4]);
  assert.deepEqual(cardK(1260, 900), [1.4, 1]);
  assert.deepEqual(cardK(900, 900), [1, 1]);
});

test('the art window keeps the same margins and nameplate on every shape; only it stretches', () => {
  const base = artWindow(900, 1260);
  near(base.x, 0.062 * 900);
  near(base.y, 0.062 * 900);
  near(base.w, 900 - 2 * 0.062 * 900);
  near(base.h, 1260 - 0.062 * 900 - 0.17 * 900);
  for (const s of SHAPES) {
    const a = artWindow(s.w, s.h);
    near(a.x, base.x);
    near(a.y, base.y);
    near(s.w - a.x - a.w, base.x);
    // The nameplate under the art is the same height everywhere.
    near(s.h - a.y - a.h, 1260 - base.y - base.h);
    assert.ok(a.w > 0 && a.h > 0.4 * s.h, s.id);
  }
});

test('fitArea gives a card the area of a 5:7 card of that height, never taller', () => {
  const t = fitArea(1.4, 520);
  near(t.w, (520 * 5) / 7);
  near(t.h, 520);
  const w = fitArea(5 / 7, 520);
  near(w.w * w.h, t.w * t.h);
  near(w.h / w.w, 5 / 7);
  near(w.w, 520);
  const sq = fitArea(1, 520);
  near(sq.w, sq.h);
  near(sq.w * sq.h, t.w * t.h);
  // A postcard is a touch taller than a trading card, so it is held to the same height.
  const post = fitArea(1.48, 520);
  near(post.h, 520);
  near(post.h / post.w, 1.48);
});

test('contain fits a card of any proportions inside a box', () => {
  assert.deepEqual(contain(1.4, 100, 100), { w: 100 / 1.4, h: 100 });
  assert.deepEqual(contain(0.5, 100, 100), { w: 100, h: 50 });
});

test('GIF and APNG frames keep the trading card exactly, and turn with the shape', () => {
  const gif = exportFrame(1.4, 480, 600);
  assert.deepEqual([gif.W, gif.H], [480, 600]);
  near(gif.ch, (640 * 600) / 900);
  near(gif.cw, (gif.ch * 5) / 7);
  const wide = exportFrame(5 / 7, 480, 600);
  assert.ok(wide.W > wide.H, 'a wide card makes a wide frame');
  const sq = exportFrame(1, 480, 600);
  assert.ok(Math.abs(sq.W - sq.H) <= 4, 'a square card makes a square frame');
  for (const s of SHAPES) {
    const f = exportFrame(s.h / s.w, 320, 400);
    // The same margin round the card as the trading card has.
    assert.ok(f.W - f.cw > 100 && f.H - f.ch > 100, s.id);
    assert.equal(f.W % 2, 0);
    assert.equal(f.H % 2, 0);
  }
});

// ---------- Shaders take the card's proportions from uCardK, never from literals ----------

const SRC = join(import.meta.dirname, '..', 'src');
const walk = (d: string): string[] => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));

test('no shader assumes the 5:7 card', () => {
  const bad: string[] = [];
  for (const f of walk(SRC).filter((f) => f.endsWith('.ts'))) {
    readFileSync(f, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (/any shape/.test(line)) return;
        const at = `${f.slice(SRC.length + 1)}:${i + 1}: ${line.trim()}`;
        for (const m of line.matchAll(/vec2\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*\)/g)) {
          const a = +m[1];
          const b = +m[2];
          if (a > 0 && b > 0 && (Math.abs(b / a - 1.4) < 0.015 || Math.abs(a / b - 1.4) < 0.015)) bad.push(at);
        }
        if (/\b0\.714\b|\b1260\.0\b|\/ 1\.4\b|\b1\.4 - |vec2\(\w+, \w+ \* 1\.4\)/.test(line)) bad.push(at);
      });
  }
  assert.deepEqual(bad, []);
});
