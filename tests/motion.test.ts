// The card's idle motion on the stage and in exported loops come from one function, so a GIF or
// APNG moves exactly as the card did on screen. Run with `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exportLoop, framePlan, IDLE_CYCLE, IDLE_MODES, IdleClock, idlePose, LIGHT_MODES, loopView, restLight, sanitizeTune, TUNE_DEFAULTS, type Tune } from '../src/tune/model.ts';

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
  for (const m of ['none', 'sway', 'float', 'pendulum', 'wobble', 'bounce', 'glint', 'spin', 'turn', 'breathe']) {
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
      const p = idlePose(t, (i / 240) * IDLE_CYCLE);
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
      const c = loopView(t, 1 - 1 / 400);
      assert.equal(poseClose({ ...c.pose, spin: 0, flash: 0, glint: 0 }, { ...a.pose, spin: 0, flash: 0, glint: 0 }, 0.05), '', `${idle} jumps at the seam`);
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
        const p = ((secs * speed) / IDLE_CYCLE) % 1;
        const want = loopView(t, p);
        const pose = live.pose(t);
        const tilt = live.tilt(t, pose, pose.rx, pose.ry);
        const got = { pose, tilt, light: live.light(t, restLight(tilt)) };
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

test('the motion size scales every idle motion; zero holds the card still, a turn still turns', () => {
  for (const idle of IDLE_MODES) {
    const one = { ...TUNE_DEFAULTS, idle };
    for (const s of [0.7, 2.2, 4.1]) {
      const a = idlePose(one, s);
      const b = idlePose({ ...one, idleAmp: 2 }, s);
      const z = idlePose({ ...one, idleAmp: 0 }, s);
      for (const k of ['dx', 'dy', 'rx', 'ry', 'rz'] as const) {
        assert.ok(Math.abs(b[k] - 2 * a[k]) < 1e-12, `${idle}: ${k} not doubled`);
        assert.ok(z[k] === 0, `${idle}: ${k} moves at size zero`);
      }
      assert.ok(Math.abs(b.scale - 1 - 2 * (a.scale - 1)) < 1e-12, `${idle}: scale not doubled`);
      assert.equal(b.spin, a.spin, `${idle}: the size changed how far it turns`);
    }
  }
  assert.equal(sanitizeTune({ idleAmp: 5 }).idleAmp, 2);
  assert.equal(TUNE_DEFAULTS.idleAmp, 1);
});
