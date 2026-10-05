// One list of motions drives the stage and the exported loops, so a GIF or APNG moves exactly as
// the card does on screen (docs/motion.md). Run with `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  exportLoop,
  framePlan,
  IDLE_CYCLE,
  IDLE_MODES,
  IdleClock,
  idlePose,
  legacyMotion,
  LIGHT_MODES,
  lightAt,
  loopCycle,
  loopView,
  MOTION_GROUPS,
  OWN_LIGHT,
  PERIOD,
  sanitizeTune,
  TUNE_DEFAULTS,
  type IdlePose,
  type Tune,
} from '../src/tune/model.ts';
import '../src/tune/moves.ts';

const close = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps;
/** The pose's numbers, flattened (spin left out: compare it as an angle). */
const flat = (p: IdlePose) => ({
  dx: p.dx,
  dy: p.dy,
  rx: p.rx,
  ry: p.ry,
  rz: p.rz,
  scale: p.scale,
  sheen: p.sheen,
  flash: p.flash,
  glint: p.glint,
  beam: p.beam ?? [0, 0, 0, 0],
  spot: p.spot ?? [0, 0],
  dim: p.dim ?? 0,
  star: p.star ?? [0, 0, 0],
});
const diffOf = (a: Record<string, unknown>, b: Record<string, unknown>, eps = 1e-6) => {
  for (const k of Object.keys(a)) {
    const x = a[k];
    const y = b[k];
    if (Array.isArray(x)) {
      if (!x.every((v, i) => close(v as number, (y as number[])[i], eps))) return `${k}: ${x} vs ${y}`;
    } else if (!close(x as number, y as number, eps)) return `${k}: ${x} vs ${y}`;
  }
  return '';
};
const MOVING = IDLE_MODES.filter((m) => m !== 'none');

test('one list: twenty motions in four groups, plus None; Sway is the default', () => {
  assert.deepEqual(
    MOTION_GROUPS.map((g) => [g.id, g.motions]),
    [
      ['gentle', ['sway', 'float', 'pendulum', 'breathe']],
      ['tilt', ['gyre', 'lean', 'jelly', 'figure8', 'wobble', 'spin']],
      ['light', ['sweep', 'beam', 'spotlight', 'flare']],
      ['show', ['reveal', 'push', 'pulse', 'glint', 'turn', 'bounce']],
    ],
  );
  assert.deepEqual(IDLE_MODES, ['none', ...MOTION_GROUPS.flatMap((g) => g.motions)]);
  assert.equal(new Set(IDLE_MODES).size, 21);
  assert.equal(TUNE_DEFAULTS.idle, 'sway');
  for (const m of IDLE_MODES) assert.equal(sanitizeTune({ idle: m }).idle, m);
  // Merged away (docs/motion.md): Showcase into Gyre, Moment into Glint.
  for (const gone of ['showcase', 'moment', 'stage', 'twirl']) assert.equal(sanitizeTune({ idle: gone }).idle, TUNE_DEFAULTS.idle);
});

test('a motion picked for exports in v0.13.0 becomes the card motion of the same name', () => {
  assert.equal(legacyMotion('showcase'), 'gyre');
  assert.equal(legacyMotion('moment'), 'glint');
  for (const m of ['gyre', 'jelly', 'lean', 'sweep', 'figure8', 'reveal', 'push', 'pulse', 'beam', 'spotlight', 'flare']) assert.equal(legacyMotion(m), m);
  assert.equal(legacyMotion('stage'), null);
  assert.equal(legacyMotion(undefined), null);
  assert.equal(legacyMotion('nonsense'), null);
});

test('each motion has its own loop, and every one divides the six-second cycle', () => {
  const want = { sway: 6, float: 6, pendulum: 3, breathe: 6, gyre: 3, lean: 3, jelly: 3, figure8: 3, wobble: 6, spin: 6, sweep: 3, beam: 3, spotlight: 3, flare: 2, reveal: 3, push: 3, pulse: 2, glint: 3, turn: 6, bounce: 6 };
  for (const [m, s] of Object.entries(want)) assert.equal(PERIOD[m as Tune['idle']], s, m);
  for (const m of IDLE_MODES) assert.ok(close(IDLE_CYCLE / PERIOD[m], Math.round(IDLE_CYCLE / PERIOD[m])), `${m} does not divide ${IDLE_CYCLE}`);
  const t = (idle: Tune['idle'], light: Tune['light'] = 'pointer') => ({ ...TUNE_DEFAULTS, idle, light });
  assert.equal(loopCycle(t('gyre')), 3);
  assert.equal(loopCycle(t('pulse')), 2);
  assert.equal(loopCycle(t('sway')), 6);
  // The orbiting light and Blacklight's lamp go round in six seconds, so the loop waits for them,
  assert.equal(loopCycle(t('gyre', 'orbit')), 6);
  assert.equal(loopCycle(t('pulse'), true), 6);
  // except where the motion brings its own light.
  assert.equal(loopCycle(t('beam', 'orbit')), 3);
  assert.equal(loopCycle(t('none')), 6);
});

test('every motion moves, and None holds still', () => {
  for (const idle of IDLE_MODES) {
    const t = { ...TUNE_DEFAULTS, idle };
    let travel = 0;
    let last = loopView(t, 0);
    for (let i = 1; i <= 240; i++) {
      const v = loopView(t, i / 240);
      const a = flat(v.pose);
      const b = flat(last.pose);
      for (const k of Object.keys(a) as (keyof typeof a)[]) {
        const x = a[k];
        const y = b[k];
        travel += Array.isArray(x) ? x.reduce((s, v, j) => s + Math.abs(v - (y as number[])[j]), 0) : Math.abs(x - (y as number));
      }
      travel += Math.abs(v.pose.spin - last.pose.spin) + Math.hypot(v.light[0] - last.light[0], v.light[1] - last.light[1]);
      last = v;
    }
    if (idle === 'none') assert.equal(travel, 0, 'None moved');
    else assert.ok(travel > 0.2, `${idle} barely moves (${travel})`);
  }
});

test('every motion closes on itself after one loop, without a jump at the seam', () => {
  for (const idle of IDLE_MODES)
    for (const light of LIGHT_MODES)
      for (const torch of [false, true]) {
        const t = { ...TUNE_DEFAULTS, idle, light };
        const a = loopView(t, 0, torch);
        const b = loopView(t, 1, torch);
        const turns = (b.pose.spin - a.pose.spin) / (Math.PI * 2);
        assert.ok(close(turns, Math.round(turns)), `${idle}: the turn does not end face on`);
        const diff = diffOf(flat(a.pose), flat(b.pose)) || diffOf({ tilt: a.tilt }, { tilt: b.tilt });
        assert.equal(diff, '', `${idle}/${light}/${torch} differs across the seam: ${diff}`);
        // A band of light may jump back while it is off the card.
        if (!(a.pose.beam && a.pose.beam[3] < 0.01)) assert.equal(diffOf({ light: a.light }, { light: b.light }), '', `${idle}/${light} light differs across the seam`);
        // The last frame before the seam is close to the first (no snap back).
        const c = loopView(t, 1 - 1 / 400, torch);
        const pick = (p: IdlePose) => ({ dx: p.dx, dy: p.dy, rx: p.rx, ry: p.ry, rz: p.rz, scale: p.scale });
        assert.equal(diffOf(pick(c.pose), pick(a.pose), 0.05), '', `${idle} jumps at the seam`);
      }
});

test('the stage left alone moves exactly as the exported loop at the same moment', () => {
  for (const idle of IDLE_MODES)
    for (const light of LIGHT_MODES)
      for (const speed of [0.5, 1, 2.35]) {
        const t: Tune = { ...TUNE_DEFAULTS, idle, light, speed };
        const live = new IdleClock();
        // A few seconds of frames at an uneven rate, as a browser gives them.
        let secs = 0;
        for (let i = 0; i < 300; i++) {
          const dt = i % 3 ? 1 / 60 : 1 / 30;
          live.step(dt, t, false, false);
          secs += dt;
        }
        const cycle = loopCycle(t);
        const p = ((secs * speed) / cycle) % 1;
        const want = loopView(t, p);
        const pose = live.pose(t);
        const tilt = live.tilt(t, pose, pose.rx, pose.ry);
        const got = { pose, tilt, light: live.light(t, pose, tilt, null) };
        const diff = diffOf(flat(want.pose), flat(got.pose)) || diffOf({ tilt: want.tilt, light: want.light }, { tilt: got.tilt, light: got.light });
        assert.equal(diff, '', `${idle}/${light} at speed ${speed}: ${diff}`);
        assert.ok(close(Math.cos(want.pose.spin), Math.cos(got.pose.spin)) && close(Math.sin(want.pose.spin), Math.sin(got.pose.spin)), `${idle} spin angle differs`);
      }
});

test('a hand on the card takes the light; the Light motions give it back when let go', () => {
  const hand: [number, number] = [0.9, 0.1];
  for (const idle of ['sway', 'spotlight', 'beam'] as const) {
    const t = { ...TUNE_DEFAULTS, idle };
    const v = loopView(t, 0.3);
    assert.deepEqual(lightAt(t, 1, v.pose, v.tilt, hand), hand, `${idle}: the light is not under the hand`);
  }
  // A fixed or orbiting light stays where the setting puts it, as it always has.
  const fixed = { ...TUNE_DEFAULTS, light: 'fixed' as const };
  const v = loopView(fixed, 0.3);
  assert.notDeepEqual(lightAt(fixed, 1, v.pose, v.tilt, hand), hand);
  // The Light motions bring their own light whatever the setting.
  for (const idle of OWN_LIGHT)
    for (const light of LIGHT_MODES) {
      const a = loopView({ ...TUNE_DEFAULTS, idle }, 0.4);
      const b = loopView({ ...TUNE_DEFAULTS, idle, light }, 0.4);
      assert.deepEqual([b.tilt, b.light], [a.tilt, a.light], `${idle} under ${light}`);
    }
});

test('held (a drag) the motion eases out; reduced motion stops it at once', () => {
  for (const idle of ['pendulum', 'spotlight'] as const) {
    const t = { ...TUNE_DEFAULTS, idle };
    const amount = (p: IdlePose) => Math.abs(p.rz) + Math.abs(p.ry) + (p.dim ?? 0) + (p.spot?.[1] ?? 0);
    const live = new IdleClock();
    for (let i = 0; i < 40; i++) live.step(1 / 60, t, false, false);
    const free = amount(live.pose(t));
    assert.ok(free > 0.01, `${idle} is not moving`);
    live.step(1 / 60, t, false, true, true);
    assert.ok(amount(live.pose(t)) > 0.5 * free, `a drag snapped ${idle} away`);
    for (let i = 0; i < 120; i++) live.step(1 / 60, t, false, true, true);
    assert.ok(amount(live.pose(t)) < 1e-3, `${idle} did not settle while held`);
    const still = new IdleClock();
    for (let i = 0; i < 60; i++) still.step(1 / 60, t, false, false);
    still.step(1 / 60, t, true, false);
    const p = still.pose(t);
    assert.ok(p.rz === 0 && p.dx === 0 && p.dy === 0 && p.spin === 0 && !p.dim && !p.spot?.[1], `reduced motion still moves ${idle}`);
  }
});

test('a turning card being pointed at turns on to face the viewer, then waits', () => {
  for (const idle of ['spin', 'turn', 'reveal'] as const) {
    const t = { ...TUNE_DEFAULTS, idle };
    for (const start of [100, 140, 200]) {
      const live = new IdleClock();
      for (let i = 0; i < start; i++) live.step(1 / 60, t, false, false);
      for (let i = 0; i < 400; i++) live.step(1 / 60, t, false, true);
      const p = live.pose(t);
      assert.ok(close(Math.cos(p.spin), 1, 1e-4), `${idle} did not come round to the face (${p.spin})`);
    }
  }
});

test('an exported loop is one loop of the motion at the set speed', () => {
  assert.deepEqual(exportLoop({ ...TUNE_DEFAULTS, speed: 1 }), { loopMs: 6000, sourceSpan: 6000 });
  assert.equal(exportLoop({ ...TUNE_DEFAULTS, speed: 2 }).loopMs, 3000);
  assert.equal(exportLoop({ ...TUNE_DEFAULTS, speed: 0.5 }).loopMs, 12000);
  assert.equal(exportLoop({ ...TUNE_DEFAULTS, idle: 'gyre' }).loopMs, 3000);
  assert.equal(exportLoop({ ...TUNE_DEFAULTS, idle: 'gyre', speed: 2 }).loopMs, 1500);
  assert.equal(exportLoop({ ...TUNE_DEFAULTS, idle: 'pulse', speed: 0.5 }).loopMs, 4000);
  assert.equal(exportLoop({ ...TUNE_DEFAULTS, idle: 'pulse' }, undefined, true).loopMs, 6000);
  // An animated picture plays whole loops inside it.
  const a = exportLoop({ ...TUNE_DEFAULTS, speed: 1 }, 700);
  assert.equal(a.loopMs, 6000);
  assert.equal(a.sourceSpan % 700, 0);
  assert.ok(Math.abs(a.sourceSpan - a.loopMs) <= 350, `the picture is retimed too far (${a.sourceSpan})`);
  assert.equal(exportLoop({ ...TUNE_DEFAULTS, speed: 1 }, 20000).sourceSpan, 20000);
  // At speed zero nothing moves on its own: the picture's timing sets the loop.
  assert.deepEqual(exportLoop({ ...TUNE_DEFAULTS, speed: 0 }, 900), { loopMs: 1800, sourceSpan: 1800 });
  assert.equal(exportLoop({ ...TUNE_DEFAULTS, idle: 'gyre', speed: 0 }).loopMs, 2400);
});

test('frame plans add up to the loop exactly and stay within their budget', () => {
  for (const loopMs of [1000, 2400, 6000, 12000, 120000]) {
    const gif = framePlan(loopMs, 50, 90, 10);
    assert.equal(gif.reduce((a, b) => a + b, 0), loopMs);
    assert.ok(gif.length <= 90 && gif.every((d) => d % 10 === 0 && d >= 50), `gif plan for ${loopMs}: ${gif.slice(0, 4)}`);
    const apng = framePlan(loopMs, 80, 60, 1);
    assert.equal(apng.reduce((a, b) => a + b, 0), loopMs);
    assert.ok(apng.length <= 60 && apng.every((d) => d >= 80), `apng plan for ${loopMs}`);
  }
});

test('the size scales every motion; zero holds the card and the light still, a turn still turns', () => {
  for (const idle of MOVING) {
    const one = { ...TUNE_DEFAULTS, idle };
    for (const s of [0.7, 1.3, 2.2, 4.1]) {
      const a = idlePose(one, s);
      const b = idlePose({ ...one, idleAmp: 2 }, s);
      const z = idlePose({ ...one, idleAmp: 0 }, s);
      for (const k of ['dx', 'dy', 'rx', 'ry', 'rz'] as const) {
        assert.ok(Math.abs(b[k] - 2 * a[k]) < 1e-12, `${idle}: ${k} not doubled`);
        assert.ok(z[k] === 0, `${idle}: ${k} moves at size zero`);
      }
      assert.ok(Math.abs(b.scale - 1 - 2 * (a.scale - 1)) < 1e-12, `${idle}: scale not doubled`);
      assert.equal(b.spin, a.spin, `${idle}: the size changed how far it turns`);
      if (a.beam) assert.ok(close(b.beam![0], 2 * a.beam[0], 1e-12) && z.beam![0] === 0, `${idle}: the band's travel does not follow the size`);
    }
    // At size zero the light stays put too.
    const z = { ...one, idleAmp: 0 };
    const lights = [0, 0.2, 0.45, 0.7].map((p) => loopView(z, p).light);
    if (z.light === 'pointer') assert.ok(lights.every((l) => close(l[0], lights[0][0]) && close(l[1], lights[0][1])), `${idle}: the light moves at size zero`);
  }
  assert.equal(sanitizeTune({ idleAmp: 5 }).idleAmp, 2);
  assert.equal(TUNE_DEFAULTS.idleAmp, 1);
});

test('at speed zero the stage holds still, and so does an exported loop', () => {
  for (const idle of MOVING) {
    const t = { ...TUNE_DEFAULTS, idle, speed: 0 };
    const a = loopView(t, 0);
    for (const p of [0.25, 0.5, 0.9]) assert.deepEqual(loopView(t, p), a, `${idle} moves at speed zero`);
  }
});
