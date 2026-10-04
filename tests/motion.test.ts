// The card's idle motion on the stage and in exported loops come from one function, so a GIF or
// APNG moves exactly as the card did on screen. Run with `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exportLoop, framePlan, IDLE_CYCLE, IDLE_MODES, IdleClock, idlePose, LIGHT_MODES, loopCycle, loopView, restLight, sanitizeTune, TUNE_DEFAULTS, type Tune } from '../src/tune/model.ts';

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
  for (const m of ['none', 'sway', 'float', 'pendulum', 'wobble', 'bounce', 'glint', 'spin', 'turn', 'breathe', 'reveal', 'push', 'pulse']) {
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
        const p = ((secs * speed) / loopCycle(t)) % 1;
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
  for (const idle of ['spin', 'turn', 'reveal'] as const) {
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

test('the showpieces loop in two or three seconds, inside the idle cycle', () => {
  const want = { reveal: 3, push: 3, pulse: 2 } as const;
  for (const [idle, secs] of Object.entries(want)) {
    const t = { ...TUNE_DEFAULTS, idle: idle as Tune['idle'] };
    assert.equal(loopCycle(t), secs);
    assert.equal(exportLoop(t).loopMs, secs * 1000);
    assert.equal(exportLoop({ ...t, speed: 2 }).loopMs, secs * 500);
    // An orbiting light, or a lamp that drifts once per idle cycle, needs the whole cycle.
    assert.equal(loopCycle({ ...t, light: 'orbit' }), IDLE_CYCLE);
    assert.equal(exportLoop(t, undefined, true).loopMs, IDLE_CYCLE * 1000);
    assert.equal(IDLE_CYCLE % secs, 0, `${idle} does not divide the idle cycle`);
    for (let s = 0; s < IDLE_CYCLE; s += 0.37) {
      const a = idlePose(t, s);
      const b = idlePose(t, s + secs);
      const turns = (b.spin - a.spin) / (Math.PI * 2);
      assert.ok(close(turns, Math.round(turns)), `${idle} turns part of a turn in one loop`);
      assert.equal(poseClose({ ...a, spin: 0 }, { ...b, spin: 0 }), '', `${idle} is not periodic in ${secs} s`);
    }
  }
  for (const idle of IDLE_MODES) if (!(idle in want)) assert.equal(loopCycle({ ...TUNE_DEFAULTS, idle }), IDLE_CYCLE, idle);
});

const sample = (idle: Tune['idle'], n = 300) => {
  const t = { ...TUNE_DEFAULTS, idle };
  return Array.from({ length: n }, (_, i) => idlePose(t, (i / n) * loopCycle(t)));
};

test('Reveal starts on the face, shows the back, flips round, and the light runs across the foil as it lands', () => {
  const poses = sample('reveal');
  assert.ok(close(Math.cos(poses[0].spin), 1), 'the loop does not open on the face');
  const back = poses.findIndex((p) => Math.cos(p.spin) < -0.99);
  assert.ok(back > 0, 'the back never shows');
  const landed = poses.findIndex((p, i) => i > back && Math.cos(p.spin) > 0.99);
  assert.ok(landed > back, 'it never comes back round');
  // From one side of the card to the other within a few tenths of a second of landing.
  const after = poses.slice(landed - 15, landed + 75).map((p) => p.sheen[0]);
  assert.ok(Math.min(...after) < -1 && Math.max(...after) > 1, `the light does not run across as it lands (${Math.min(...after)}..${Math.max(...after)})`);
  assert.ok(poses.every((p) => p.flash === 0 && p.glint < -1), 'no pasted-on flash or streak: the foil itself shines');
});

test('Push in moves in from far off to one side, swinging round to face the camera, the light crossing as it arrives', () => {
  const poses = sample('push');
  const sc = poses.map((p) => p.scale);
  assert.ok(Math.max(...sc) / Math.min(...sc) > 1.25, `the move in is too small (${Math.min(...sc)}..${Math.max(...sc)})`);
  const peak = sc.indexOf(Math.max(...sc));
  assert.ok(Math.abs(poses[0].ry) > 0.3 && Math.abs(poses[peak].ry) < 0.01, 'it does not swing round to face the camera');
  // The light passes the middle of the card (sheen 0) just as the card arrives.
  const mid = poses.findIndex((p, i) => i > 0 && p.sheen[0] >= 0 && poses[i - 1].sheen[0] < 0);
  assert.ok(Math.abs(mid - peak) < poses.length * 0.1, `the light crosses away from the arrival (${mid} vs ${peak})`);
  // It then holds still and quiet for a moment before stepping back.
  const held = poses.filter((p) => p.scale === sc[peak] && Math.abs(p.sheen[0]) === Math.max(...poses.map((q) => Math.abs(q.sheen[0])))).length;
  assert.ok(held > poses.length * 0.1, `no quiet hold on arrival (${held})`);
});

test('Heartbeat beats twice a loop, a strong lub and a softer dub, each sweeping the light across from its own side', () => {
  const poses = sample('pulse', 400);
  const peaks = poses.map((p, i) => (i > 0 && i < poses.length - 1 && p.scale > poses[i - 1].scale && p.scale >= poses[i + 1].scale && p.scale > 1.02 ? p.scale : 0)).filter(Boolean);
  assert.equal(peaks.length, 4, `found ${peaks.length} beats (lub and dub, twice)`);
  assert.ok(peaks[0] > 1.12 && peaks[1] < peaks[0] - 0.05, `the lub does not stand out (${peaks})`);
  const halves = [poses.slice(0, 200), poses.slice(200)].map((h) => [h[0].sheen[0], h[150].sheen[0]]);
  assert.ok(halves[0][0] > 1 && halves[0][1] < -1 && halves[1][0] < -1 && halves[1][1] > 1, `the beats do not sweep from alternate sides (${halves})`);
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
