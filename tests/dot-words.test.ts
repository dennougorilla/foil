// Run with `npm test` (Node's own test runner, which strips the types itself).
// Words under pixel art (docs/features.md, Card → Pixel art): held back from the face that is shrunk
// to pixel art, and printed afterwards, crisp, on its grid.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { holdWord, holdWords, takeWords, type Word } from '../src/card/words.ts';
import { coverOf, EM_DOTS, glyphDot, inkDots, PAD, snap, snapStep, type RGBA } from '../src/dot/wordGrid.ts';
import { DOT_PRESETS, gridOf } from '../src/dot/model.ts';

const SRC = join(import.meta.dirname, '..', 'src');
const word = (text: string): Word => ({ text, font: '60px "DotGothic16"', size: 60, width: 300, x: 10, y: 20, align: 'left', fill: '#262d31', alpha: 1, edge: null, part: 'name' });

test('a face that holds its words keeps them off the face until they are taken', () => {
  const ctx = {};
  // Not holding: the painter prints the word itself.
  assert.equal(holdWord(ctx, word('A')), false);
  holdWords(ctx);
  assert.equal(holdWord(ctx, word('Name')), true);
  assert.equal(holdWord(ctx, word('Message')), true);
  assert.deepEqual(
    takeWords(ctx).map((w) => w.text),
    ['Name', 'Message'],
  );
  // Taken: the next face prints its words again.
  assert.equal(holdWord(ctx, word('B')), false);
  assert.deepEqual(takeWords(ctx), []);
});

test('every painter of the face holds its words back, and the face is converted without them', () => {
  const src = (f: string) => readFileSync(join(SRC, f), 'utf8');
  // The name, the type line and the trading card's text (paintLettering), the message and free pieces, the fine print.
  assert.match(src('lettering.ts'), /export function paintLettering[^]*?if \(holdWord\(ctx,/);
  assert.match(src('card/messageFace.ts'), /function outlined[^]*?holdWord\(ctx,/);
  assert.match(src('card/tcgFace.ts'), /const fine = [^]*?holdWord\(ctx,/);
  // Nothing else on the face prints text.
  for (const f of ['card/face.ts', 'card/tcgFace.ts', 'card/messageFace.ts']) {
    const calls = src(f).match(/\.(fillText|strokeText)\(/g) ?? [];
    const guarded = f === 'card/face.ts' ? 0 : f === 'card/tcgFace.ts' ? 1 : 4;
    assert.equal(calls.length, guarded, f);
  }
  // The face is painted holding its words, converted, then the words are printed on its grid.
  const main = src('main.ts');
  assert.match(main, /drawFace\(f, m, \{ \.\.\.spec, holdWords: hold \}\);\s*pixelArt\(f, keep, m\);\s*return hold && d && dot \? dot\.printWords\(f, words, d\.size\) : runs;/);
});

test('the letters’ dots split the grid’s pixels evenly, or the letters are a whole number of them tall', () => {
  for (const preset of Object.values(DOT_PRESETS)) {
    const g = gridOf(900, 1260, preset.size);
    const cell = 900 / g.w;
    for (const em of [24, 36, 50, 60, 74, 82, 110, 160]) {
      const dot = glyphDot(em, cell);
      assert.ok(dot > 0 && EM_DOTS * dot <= em + 1e-9, `${preset.size}: ${em} -> ${dot}`);
      const k = cell / dot;
      const tall = (EM_DOTS * dot) / cell;
      const onGrid = Math.abs(k - Math.round(k)) < 1e-6 || Math.abs(1 / k - Math.round(1 / k)) < 1e-6 || Math.abs(tall - Math.round(tall)) < 1e-6;
      assert.ok(onGrid, `${preset.size}: ${em} -> ${dot}`);
      // Never more than one grid pixel smaller than laid out (the letters a whole number of them tall).
      assert.ok(EM_DOTS * dot > em - cell - 1e-9, `${em} -> ${dot}`);
    }
  }
  // Chunky's name (60 face pixels, 12.5-pixel grid): four of the grid's pixels to the em, four dots to a pixel.
  assert.equal(glyphDot(60, 12.5), 12.5 / 4);
  // Fine's message (74 face pixels, a 7-pixel grid): ten of the grid's pixels tall, nearer its size than splitting them in two.
  assert.equal(glyphDot(74, 7), 70 / EM_DOTS);
});

test('a word’s letters sit on the grid: their corner is on a grid line, their dots on its splits', () => {
  const cell = 12.5;
  for (const em of [40, 60, 82]) {
    const dot = glyphDot(em, cell);
    const step = snapStep(dot, cell);
    for (const v of [3.3, 101.7, 487.25]) {
      const at = snap(v, step);
      assert.ok(Math.abs(at - v) <= step / 2 + 1e-9);
      // On a grid line, or on a split of one grid pixel into whole dots.
      const inCell = (at % cell) / dot;
      assert.ok(Math.abs(inCell - Math.round(inCell)) < 1e-6 || Math.abs(at / cell - Math.round(at / cell)) < 1e-6, `${em} ${v} -> ${at}`);
    }
  }
});

test('letters are inked dot by dot: hard dots, the edge and its drop round them, bold one dot wider', () => {
  const w = 7;
  const h = 7;
  const alpha = new Uint8ClampedArray(w * h * 4);
  // A soft-edged vertical stroke at x = 3, rows 2–4: the soft dots are left out.
  for (let y = 2; y <= 4; y++) {
    alpha[(y * w + 3) * 4 + 3] = 255;
    alpha[(y * w + 4) * 4 + 3] = 40;
  }
  const cover = coverOf(alpha, w, h);
  assert.deepEqual([...cover].map((v, i) => (v ? i : -1)).filter((i) => i >= 0), [2 * w + 3, 3 * w + 3, 4 * w + 3]);
  const fill: RGBA = [255, 255, 255, 255];
  const edge: RGBA = [22, 28, 31, 255];
  const drop: RGBA = [1, 2, 3, 255];
  const at = (d: Uint8ClampedArray, x: number, y: number) => [...d.subarray((y * w + x) * 4, (y * w + x) * 4 + 4)];
  const { rgba, glyph } = inkDots(cover, w, h, { fill, edge, drop, bold: false });
  assert.deepEqual(at(rgba, 3, 3), fill);
  assert.deepEqual(at(rgba, 2, 3), edge, 'the edge beside the stroke');
  assert.deepEqual(at(rgba, 3, 1), edge, 'and above it');
  assert.deepEqual(at(rgba, 3, 6), drop, 'the drop a dot under the edge');
  assert.deepEqual(at(rgba, 0, 0), [0, 0, 0, 0]);
  assert.equal(glyph.reduce((a, b) => a + b, 0), 3, 'the lettering map gets the letters alone');
  const bold = inkDots(cover, w, h, { fill, edge: null, drop: null, bold: true });
  assert.deepEqual(at(bold.rgba, 4, 3), fill, 'bold: a dot wider to the right');
  assert.deepEqual(at(bold.rgba, 2, 3), [0, 0, 0, 0], 'no edge on a plate');
  // No ink (a blind press): nothing printed, the letters still go to the lettering map.
  const blind = inkDots(cover, w, h, { fill: null, edge: null, drop: null, bold: false });
  assert.ok(blind.rgba.every((v) => v === 0));
  assert.equal(blind.glyph.reduce((a, b) => a + b, 0), 3);
  assert.equal(PAD, 2);
});

test('under pixel art the card shader reads the face and its lettering where they are, so the printed words stay crisp', () => {
  const sh = readFileSync(join(SRC, 'gl', 'shaders.ts'), 'utf8');
  assert.match(sh, /vec2 faceUv = uv;\s*if \(dotOn > 0\.5\) uv = \(floor\(uv \* pixelGrid\(\)\) \+ 0\.5\) \/ pixelGrid\(\);\s*vec4 base = face\(faceUv, lod\);/);
  assert.match(sh, /col = lettering\(col, faceUv, uTilt\);/);
});
