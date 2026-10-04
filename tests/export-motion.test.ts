// Export-only motions: Showcase (the v0.12 export orbit, restored exactly) and three made for the foil.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXPORT_MOTIONS, exportLoop, exportView, fixedLight, TUNE_DEFAULTS, type Tune } from '../src/tune/model.ts';

const close = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps;

/** v0.12.0's loopPose, copied verbatim (src/tune/model.ts at acb4c1f), as the reference. */
function v012(t: Tune, p: number) {
  const smooth = (u: number) => u * u * (3 - 2 * u);
  const flipTurn = (a: number) => {
    const turns = Math.floor(a / (Math.PI * 2));
    const tt = a / (Math.PI * 2) - turns;
    const step = (from: number) => smooth(Math.min(1, Math.max(0, (tt - from) / 0.08)));
    let ry = Math.PI * (step(0.5) + step(0.62));
    const EDGE = 0.3;
    const m = ry % Math.PI;
    if (Math.abs(m - Math.PI / 2) < EDGE) ry += (m < Math.PI / 2 ? -EDGE : EDGE) - (m - Math.PI / 2);
    return ry + turns * Math.PI * 2;
  };
  const cycles = t.speed <= 0 ? 0 : Math.max(1, Math.round(t.speed));
  const a = p * Math.PI * 2 * cycles;
  const k = t.tiltMax / TUNE_DEFAULTS.tiltMax;
  let rx = 0, ry = 0, rz = 0, dy = 0, scale = 1;
  if (t.idle === 'sway') {
    rx = Math.sin(a) * 0.22 * k;
    ry = Math.cos(a) * 0.3 * k;
    rz = Math.sin(a) * 0.03;
    dy = Math.sin(a * 2) * 8;
  } else if (t.idle === 'spin') {
    ry = flipTurn(a);
    rx = Math.sin(a) * 0.08 * k;
  } else if (t.idle === 'breathe') {
    scale = 1 + Math.sin(a) * 0.035;
    rx = Math.sin(a) * 0.06 * k;
    dy = -Math.sin(a) * 6;
  }
  let tilt: [number, number] = t.idle === 'sway' ? [(Math.cos(a) * 0.3) / 0.32, (Math.sin(a) * 0.22) / 0.28] : [Math.cos(a) * 0.9, Math.sin(a) * 0.9];
  let light: [number, number] = [0.5 - Math.cos(a) * 0.3, 0.4 - Math.sin(a) * 0.25];
  if (t.light === 'orbit') light = [0.5 + Math.cos(a) * 0.34, 0.5 + Math.sin(a) * 0.36];
  else if (t.light === 'fixed') light = fixedLight(t.lightAngle);
  if (t.speed <= 0) {
    tilt = [0.35, -0.25];
    light = t.light === 'fixed' ? fixedLight(t.lightAngle) : [0.32, 0.22];
  }
  const shadow = [12 - (t.idle === 'spin' ? Math.sin(ry) : ry) * 18, 18 + rx * 10];
  return { rx, ry, rz, dy, scale, tilt, light, shadow, torch: p * cycles };
}

test('the export motions on offer', () => {
  assert.deepEqual(EXPORT_MOTIONS, ['stage', 'showcase', 'sweep', 'figure8', 'moment']);
});

test('Showcase is the v0.12 export motion, exactly', () => {
  for (const idle of ['sway', 'spin', 'breathe', 'none'] as const)
    for (const light of ['pointer', 'orbit', 'fixed'] as const)
      for (const speed of [0, 0.5, 1, 2.2])
        for (const tiltMax of [18, 30])
          for (let i = 0; i < 48; i++) {
            const t: Tune = { ...TUNE_DEFAULTS, idle, light, speed, tiltMax };
            const p = i / 48;
            const want = v012(t, p);
            const got = exportView(t, 'showcase', p);
            const ok =
              close(got.pose.rx, want.rx) && close(got.pose.ry + got.pose.spin, want.ry) && close(got.pose.rz, want.rz) && close(got.pose.dy * 640, want.dy) &&
              close(got.pose.scale, want.scale) && close(got.pose.dx, 0) && got.pose.flash === 0 && got.pose.glint < -1 &&
              got.tilt.every((v, j) => close(v, want.tilt[j])) && got.light.every((v, j) => close(v, want.light[j])) &&
              got.shadow!.every((v, j) => close(v, want.shadow[j])) && close(got.torch, want.torch);
            assert.ok(ok, `${idle}/${light}/${speed}/${tiltMax} at ${p}: ${JSON.stringify(got)} vs ${JSON.stringify(want)}`);
          }
  // Its loop: 2.4 s, or the animated picture's (v0.12's animLoop).
  assert.deepEqual(exportLoop(TUNE_DEFAULTS, undefined, 'showcase'), { loopMs: 2400, sourceSpan: 2400 });
  assert.deepEqual(exportLoop(TUNE_DEFAULTS, 900, 'showcase'), { loopMs: 1800, sourceSpan: 1800 });
  assert.deepEqual(exportLoop(TUNE_DEFAULTS, 9000, 'showcase'), { loopMs: 6000, sourceSpan: 9000 });
});

test('the foil motions close their loops, keep the card settled and move the light a lot', () => {
  for (const m of ['sweep', 'figure8', 'moment'] as const) {
    const t = TUNE_DEFAULTS;
    const a = exportView(t, m, 0);
    const b = exportView(t, m, 1);
    for (const k of ['rx', 'ry', 'rz', 'dx', 'dy', 'scale', 'flash'] as const) assert.ok(close(a.pose[k], b.pose[k], 1e-9), `${m}: ${k} jumps at the seam`);
    assert.ok(a.tilt.every((v, j) => close(v, b.tilt[j])) && a.light.every((v, j) => close(v, b.light[j])), `${m}: the light jumps at the seam`);
    let tiltSpan = 0;
    let lightSpan = 0;
    let maxTurn = 0;
    for (let i = 0; i < 200; i++) {
      const v = exportView(t, m, i / 200);
      tiltSpan = Math.max(tiltSpan, Math.hypot(v.tilt[0] - a.tilt[0], v.tilt[1] - a.tilt[1]));
      lightSpan = Math.max(lightSpan, Math.hypot(v.light[0] - a.light[0], v.light[1] - a.light[1]));
      maxTurn = Math.max(maxTurn, Math.abs(v.pose.rx), Math.abs(v.pose.ry), Math.abs(v.pose.rz) * 4);
    }
    assert.ok(tiltSpan > 1.5, `${m}: the sheen hardly travels (${tiltSpan})`);
    assert.ok(lightSpan > 0.4, `${m}: the light hardly moves (${lightSpan})`);
    assert.ok(maxTurn < 0.5, `${m}: the card swings too far to look settled (${maxTurn})`);
    const ms = exportLoop(t, undefined, m).loopMs;
    assert.ok(ms >= 2000 && ms <= 3000, `${m}: ${ms} ms loop`);
  }
});
