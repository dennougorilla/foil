// The card's idle motion on the stage and in exported loops come from one function, so a GIF or
// APNG moves exactly as the card did on screen. Run with `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exportLoop, framePlan, IDLE_CYCLE, IDLE_MODES, IdleClock, idleCycle, idlePose, LIGHT_MODES, loopView, restLight, sanitizeTune, TUNE_DEFAULTS, type Tune } from '../src/tune/model.ts';

const close = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps;
const poseClose = (a: Record<string, unknown>, b: Record<string, unknown>, eps = 1e-6) => {
  for (const k of Object.keys(a)) {
    const x = a[k];
    const y = b[k];
    if (Array.isArray(x)) {
      if (!x.every((v, i) => close(v as number, (y as number[])[i], eps))) return `${k}: ${x} vs ${y}`;
    } else if (!close(x as number, y as number, eps)) return `${k}: ${x} vs ${y}`;
  }
  return '';
};

test('the idle motions on offer, the ones asked for among them', () => {
  for (const m of ['none', 'sway', 'float', 'pendulum', 'wobble', 'bounce', 'glint', 'spin', 'turn', 'breathe', 'sweep', 'spotlight', 'flare']) {
    assert.ok(IDLE_MODES.includes(m as Tune['idle']), `${m} missing`);
    assert.equal(sanitizeTune({ idle: m }).idle, m);
  }
  assert.equal(sanitizeTune({ idle: 'twirl' }).idle, TUNE_DEFAULTS.idle);
});

test('every idle motion moves, and none holds still', () => {
  for (const idle of IDLE_MODES) {
    const t = { ...TUNE_DEFAULTS, idle };
    let travel = 0;
    let last = idlePose(t, 0);
    for (let i = 1; i <= 240; i++) {
      const p = idlePose(t, (i / 240) * idleCycle(t));
      travel += Math.abs(p.dx - last.dx) + Math.abs(p.dy - last.dy) + Math.abs(p.rx - last.rx) + Math.abs(p.ry - last.ry) + Math.abs(p.rz - last.rz);
      travel += Math.abs(p.scale - last.scale) + Math.abs(p.spin - last.spin) + Math.abs(p.sheen[0] - last.sheen[0]) + Math.abs(p.sheen[1] - last.sheen[1]) + Math.abs(p.flash - last.flash) + Math.abs(p.glint - last.glint);
      last = p;
    }
    if (idle === 'none') assert.equal(travel, 0, 'none moved');
    else assert.ok(travel > 0.2, `${idle} barely moves (${travel})`);
  }
});

test('every idle motion closes on itself after one cycle, without a jump at the seam', () => {
  for (const idle of IDLE_MODES)
    for (const light of LIGHT_MODES) {
      const t = { ...TUNE_DEFAULTS, idle, light };
      const a = loopView(t, 0);
      const b = loopView(t, 1);
      const spinTurns = (b.pose.spin - a.pose.spin) / (Math.PI * 2);
      assert.ok(close(spinTurns, Math.round(spinTurns)), `${idle}: the turn does not end face on`);
      const diff = poseClose({ ...a.pose, spin: 0 }, { ...b.pose, spin: 0 });
      assert.equal(diff, '', `${idle}/${light} pose differs across the seam: ${diff}`);
      assert.equal(poseClose({ tilt: a.tilt, light: a.light }, { tilt: b.tilt, light: b.light }), '', `${idle}/${light} light differs across the seam`);
      // The last frame before the seam is close to the first (no snap back).
      // A flash, a streak or a star may end the loop; a band of light may jump back while it is off the card.
      const c = loopView(t, 1 - 1 / 400);
      const calm = (q: typeof a.pose) => ({ ...q, spin: 0, flash: 0, glint: 0, star: [0, 0, 0], ...(q.beam[3] < 0.01 ? { beam: [0, 0, 0, 0], light: null } : {}) });
      assert.equal(poseClose(calm(c.pose), calm(a.pose), 0.05), '', `${idle} jumps at the seam`);
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
        const p = ((secs * speed) / idleCycle(t)) % 1;
        const want = loopView(t, p);
        const pose = live.pose(t);
        const tilt = live.tilt(t, pose, pose.rx, pose.ry);
        const got = { pose, tilt, light: live.light(t, restLight(tilt), pose) };
        const diff = poseClose({ ...want.pose, spin: 0 }, { ...got.pose, spin: 0 }, 1e-6) || poseClose({ tilt: want.tilt, light: want.light }, { tilt: got.tilt, light: got.light }, 1e-6);
        assert.equal(diff, '', `${idle}/${light} at speed ${speed}: ${diff}`);
        assert.ok(close(Math.cos(want.pose.spin), Math.cos(got.pose.spin)) && close(Math.sin(want.pose.spin), Math.sin(got.pose.spin)), `${idle} spin angle differs`);
      }
});

test('held (a drag) the idle motion eases out; reduced motion stops it at once', () => {
  const t = { ...TUNE_DEFAULTS, idle: 'pendulum' as const };
  const live = new IdleClock();
  for (let i = 0; i < 60; i++) live.step(1 / 60, t, false, false);
  const free = live.pose(t);
  assert.ok(Math.abs(free.rz) > 0.01, 'the pendulum is not swinging');
  live.step(1 / 60, t, false, true, true);
  const first = live.pose(t);
  assert.ok(Math.abs(first.rz) > 0.5 * Math.abs(free.rz), 'a drag snapped the swing away');
  for (let i = 0; i < 120; i++) live.step(1 / 60, t, false, true, true);
  assert.ok(Math.abs(live.pose(t).rz) < 1e-3, 'the swing did not settle while held');
  const still = new IdleClock();
  for (let i = 0; i < 60; i++) still.step(1 / 60, t, false, false);
  still.step(1 / 60, t, true, false);
  const p = still.pose(t);
  assert.ok(p.rz === 0 && p.dx === 0 && p.dy === 0 && p.spin === 0, 'reduced motion still moves the card');
});

test('a spinning card being pointed at turns on to face the viewer, then waits', () => {
  for (const idle of ['spin', 'turn'] as const) {
    const t = { ...TUNE_DEFAULTS, idle };
    const live = new IdleClock();
    for (let i = 0; i < 200; i++) live.step(1 / 60, t, false, false);
    for (let i = 0; i < 300; i++) live.step(1 / 60, t, false, true);
    const p = live.pose(t);
    assert.ok(close(Math.cos(p.spin), 1, 1e-4), `${idle} did not come round to the face (${p.spin})`);
  }
});

test('an exported loop is one idle cycle long at the set speed', () => {
  assert.deepEqual(exportLoop({ ...TUNE_DEFAULTS, speed: 1 }), { loopMs: IDLE_CYCLE * 1000, sourceSpan: IDLE_CYCLE * 1000 });
  assert.equal(exportLoop({ ...TUNE_DEFAULTS, speed: 2 }).loopMs, (IDLE_CYCLE * 1000) / 2);
  assert.equal(exportLoop({ ...TUNE_DEFAULTS, speed: 0.5 }).loopMs, IDLE_CYCLE * 2000);
  // An animated picture plays whole loops inside it.
  const a = exportLoop({ ...TUNE_DEFAULTS, speed: 1 }, 700);
  assert.equal(a.loopMs, IDLE_CYCLE * 1000);
  assert.equal(a.sourceSpan % 700, 0);
  assert.ok(Math.abs(a.sourceSpan - a.loopMs) <= 350, `the picture is retimed too far (${a.sourceSpan})`);
  assert.equal(exportLoop({ ...TUNE_DEFAULTS, speed: 1 }, 20000).sourceSpan, 20000);
  // At speed zero nothing moves on its own: the picture's timing sets the loop.
  assert.deepEqual(exportLoop({ ...TUNE_DEFAULTS, speed: 0 }, 900), { loopMs: 1800, sourceSpan: 1800 });
  assert.equal(exportLoop({ ...TUNE_DEFAULTS, speed: 0 }).loopMs, 2400);
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

const LIGHT_MOTIONS = ['sweep', 'spotlight', 'flare'] as const;

test('the light motions keep the card still and facing, and loop in two or three seconds', () => {
  assert.equal(idleCycle({ ...TUNE_DEFAULTS, idle: 'sweep' }), 3);
  assert.equal(idleCycle({ ...TUNE_DEFAULTS, idle: 'spotlight' }), 3);
  assert.equal(idleCycle({ ...TUNE_DEFAULTS, idle: 'flare' }), 2);
  assert.equal(idleCycle({ ...TUNE_DEFAULTS, idle: 'sway' }), IDLE_CYCLE);
  for (const idle of LIGHT_MOTIONS) {
    const t = { ...TUNE_DEFAULTS, idle };
    assert.equal(exportLoop(t).loopMs, idleCycle(t) * 1000);
    assert.equal(exportLoop({ ...t, speed: 2 }).loopMs, idleCycle(t) * 500);
    for (let i = 0; i < 120; i++) {
      const p = idlePose(t, (i / 120) * idleCycle(t));
      assert.ok(Math.max(Math.abs(p.rx), Math.abs(p.ry), Math.abs(p.rz)) < 0.06, `${idle} turns the card too far`);
      assert.ok(p.dx === 0 && p.dy === 0 && p.spin === 0 && p.scale === 1, `${idle} moves the card`);
      assert.ok(p.light, `${idle} leaves the light to the light setting`);
    }
  }
});

test('a light motion owns the light: the light setting changes nothing', () => {
  for (const idle of LIGHT_MOTIONS)
    for (const p of [0, 0.2, 0.45, 0.8]) {
      const want = loopView({ ...TUNE_DEFAULTS, idle }, p);
      for (const light of LIGHT_MODES) {
        const got = loopView({ ...TUNE_DEFAULTS, idle, light }, p);
        assert.equal(poseClose({ tilt: want.tilt, light: want.light }, { tilt: got.tilt, light: got.light }), '', `${idle} under ${light}`);
      }
    }
});

test('Sweep carries a band right across the card; Spotlight circles it; Flare ends its run in a star', () => {
  const along = (idle: Tune['idle'], f: (p: ReturnType<typeof idlePose>) => number) =>
    Array.from({ length: 200 }, (_, i) => f(idlePose({ ...TUNE_DEFAULTS, idle }, (i / 200) * idleCycle({ ...TUNE_DEFAULTS, idle }))));
  const lit = along('sweep', (p) => (p.beam[3] > 0.5 ? p.beam[0] : NaN)).filter((v) => !Number.isNaN(v));
  assert.ok(Math.min(...lit) < -0.8 && Math.max(...lit) > 0.8, 'the band does not cross the whole card');
  assert.ok(Math.max(...along('sweep', (p) => p.dim)) > 0.2, 'the room never dims for the band');
  const ang = along('spotlight', (p) => Math.atan2(p.light![1] - 0.5, p.light![0] - 0.5));
  const turned = ang.slice(1).reduce((a, v, i) => a + Math.atan2(Math.sin(v - ang[i]), Math.cos(v - ang[i])), 0);
  assert.ok(Math.abs(Math.abs(turned) - Math.PI * 2) < 0.2, `the spot goes ${turned} rad round`);
  assert.ok(Math.min(...along('spotlight', (p) => p.spot[1])) > 0.5 && Math.min(...along('spotlight', (p) => p.dim)) > 0.3, 'no spot in a dim room');
  const star = along('flare', (p) => p.star[2]);
  const run = along('flare', (p) => p.beam[3]);
  const peak = star.indexOf(Math.max(...star));
  assert.ok(star[peak] > 0.8, 'no star');
  assert.ok(run.findIndex((v) => v > 0.5) < peak, 'the star comes before the run');
  assert.ok(star.filter((v) => v > 0.05).length < 100, 'the star stays too long');
});

test('held, a light motion lets go of its light, beam, spot and star', () => {
  for (const idle of LIGHT_MOTIONS) {
    const t = { ...TUNE_DEFAULTS, idle };
    const live = new IdleClock();
    for (let i = 0; i < 40; i++) live.step(1 / 60, t, false, false);
    for (let i = 0; i < 180; i++) live.step(1 / 60, t, false, true, true);
    const p = live.pose(t);
    assert.ok(p.light === null && p.beam[3] < 1e-3 && p.spot[1] < 1e-3 && p.dim < 1e-3 && p.star[2] < 1e-3, `${idle} still lights the held card`);
  }
});
