// Run with `npm test` (Node's own test runner, which strips the types itself).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_THICKNESS, DEPTH_RANGE, depthAt, pliesOf, presetOf, REST_TURN, sanitizeThickness, slabOf, slabPose, sliderOf, THICKNESS_IDS, THICKNESS_PRESETS } from '../src/card/thickness.ts';

const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test('four presets, thin to acrylic, each growing thicker; thin is the default', () => {
  assert.deepEqual(THICKNESS_IDS, ['thin', 'board', 'chunky', 'acrylic']);
  const depths = THICKNESS_IDS.map((id) => THICKNESS_PRESETS[id].depth);
  for (let i = 1; i < depths.length; i++) assert.ok(depths[i] > depths[i - 1]);
  assert.deepEqual(DEFAULT_THICKNESS, THICKNESS_PRESETS.thin);
  assert.equal(THICKNESS_PRESETS.acrylic.material, 'acrylic');
  // Every preset lies on its material's slider.
  for (const id of THICKNESS_IDS) {
    const t = THICKNESS_PRESETS[id];
    const [a, b] = DEPTH_RANGE[t.material];
    assert.ok(t.depth >= a && t.depth <= b, id);
  }
});

test('a saved thickness that does not fit starts over on the default, and a depth is kept on its slider', () => {
  assert.deepEqual(sanitizeThickness(undefined), DEFAULT_THICKNESS);
  assert.deepEqual(sanitizeThickness({ material: 'wood', depth: 0.02 }), DEFAULT_THICKNESS);
  assert.deepEqual(sanitizeThickness({ material: 'paper', depth: 'x' }), DEFAULT_THICKNESS);
  assert.deepEqual(sanitizeThickness({ material: 'paper', depth: 9 }), { material: 'paper', depth: DEPTH_RANGE.paper[1] });
  assert.deepEqual(sanitizeThickness({ material: 'acrylic', depth: 0.25 }), { material: 'acrylic', depth: 0.25 });
});

test('each preset shows as itself, and a paper depth in between as the nearest', () => {
  for (const id of THICKNESS_IDS) assert.equal(presetOf(THICKNESS_PRESETS[id]), id);
  assert.equal(presetOf({ material: 'paper', depth: 0.05 }), 'board');
  assert.equal(presetOf({ material: 'paper', depth: 0.14 }), 'chunky');
  assert.equal(presetOf({ material: 'acrylic', depth: 0.05 }), 'acrylic');
});

test('the slider and the depth answer each other', () => {
  for (const id of THICKNESS_IDS) {
    const t = THICKNESS_PRESETS[id];
    near(depthAt(t.material, sliderOf(t)), t.depth);
  }
  near(depthAt('paper', 0), DEPTH_RANGE.paper[0]);
  near(depthAt('paper', 2), DEPTH_RANGE.paper[1]);
});

test('the side shows more paper plies as the card thickens', () => {
  assert.equal(pliesOf(THICKNESS_PRESETS.thin.depth), 2);
  assert.ok(pliesOf(THICKNESS_PRESETS.chunky.depth) > pliesOf(THICKNESS_PRESETS.board.depth));
  assert.ok(pliesOf(1) <= 8);
});

test('a paper card keeps its size; an acrylic block takes the card place and the card shrinks into it', () => {
  const paper = slabOf(THICKNESS_PRESETS.board, 500);
  near(paper.depth, 22.5);
  assert.equal(paper.inner, 1);
  assert.equal(paper.margin, 0);
  const block = slabOf(THICKNESS_PRESETS.acrylic, 500);
  assert.ok(block.inner < 1);
  // The card and its margin on both sides fill the card's own short side.
  near(500 * block.inner + 2 * block.margin, 500);
});

test('the thick presets read at a glance: a side at least a tenth of the short side', () => {
  assert.ok(THICKNESS_PRESETS.chunky.depth >= 0.1);
  assert.ok(THICKNESS_PRESETS.acrylic.depth >= 0.15);
});

test('thin faces the viewer as before; chunky and acrylic rest turned and lean further', () => {
  const p = { rx: 0, ry: 0, cx: 7 };
  assert.deepEqual(slabPose(THICKNESS_PRESETS.thin, p), p);
  for (const id of ['chunky', 'acrylic'] as const) {
    const rest = slabPose(THICKNESS_PRESETS[id], p);
    near(rest.rx, REST_TURN.rx);
    near(rest.ry, REST_TURN.ry);
    assert.equal(rest.cx, 7);
    const leaning = slabPose(THICKNESS_PRESETS[id], { rx: 0, ry: 0.2 });
    assert.ok(leaning.ry - REST_TURN.ry > 0.25);
  }
  // Board turns part of the way.
  const board = slabPose(THICKNESS_PRESETS.board, p);
  assert.ok(board.ry < 0 && board.ry > REST_TURN.ry);
});

test('a whole turn stays a whole turn, so a turning motion still loops', () => {
  const a = slabPose(THICKNESS_PRESETS.chunky, { rx: 0, ry: 0.3 });
  const b = slabPose(THICKNESS_PRESETS.chunky, { rx: 0, ry: 0.3 + 2 * Math.PI });
  near(b.ry - a.ry, 2 * Math.PI);
});
