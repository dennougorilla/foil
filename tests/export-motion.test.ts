// Export-only motions: Showcase (the v0.12 export orbit, restored exactly) and the ones made to show the foil off.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXPORT_MOTIONS, exportLoop, fixedLight, TUNE_DEFAULTS, type ExportMotion, type Tune } from '../src/tune/model.ts';
import { exportView } from '../src/tune/exportMotion.ts';

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

test('the export motions on offer: As on screen stays first, Gyre comes next', () => {
  assert.deepEqual(EXPORT_MOTIONS, ['stage', 'gyre', 'jelly', 'lean', 'showcase', 'sweep', 'figure8', 'moment', 'reveal', 'push', 'pulse', 'beam', 'spotlight', 'flare']);
});

test('every motion made for exports closes its loop: no jump at the seam', () => {
  for (const m of EXPORT_MOTIONS.filter((m) => m !== 'stage' && m !== 'showcase'))
    for (const light of ['pointer', 'orbit', 'fixed'] as const) {
      const t: Tune = { ...TUNE_DEFAULTS, light };
      const a = exportView(t, m, 0);
      const b = exportView(t, m, 1);
      for (const k of ['rx', 'ry', 'rz', 'dx', 'dy', 'scale', 'flash'] as const) assert.ok(close(a.pose[k], b.pose[k], 1e-9), `${m}/${light}: ${k} jumps at the seam`);
      // Reveal comes round a whole turn.
      const turns = (b.pose.spin - a.pose.spin) / (Math.PI * 2);
      assert.ok(close(turns, Math.round(turns)), `${m}: turns part of a turn`);
      assert.ok(a.tilt.every((v, j) => close(v, b.tilt[j], 1e-9)), `${m}/${light}: the sheen jumps at the seam`);
      // A band of light may jump back while it is off the card.
      if (!(a.beam && a.beam[3] < 0.01)) assert.ok(a.light.every((v, j) => close(v, b.light[j], 1e-9)), `${m}/${light}: the light jumps at the seam`);
      // The last frame before the seam is close to the first: nothing snaps back.
      const c = exportView(t, m, 1 - 1 / 400);
      for (const k of ['rx', 'ry', 'rz', 'dx', 'dy', 'scale'] as const) assert.ok(close(c.pose[k], a.pose[k], 0.05), `${m}: ${k} snaps back at the seam`);
    }
});

test('the motions made for exports keep their own length at any speed', () => {
  const want = { gyre: 3, jelly: 3, lean: 3, reveal: 3, push: 3, pulse: 2, beam: 3, spotlight: 3, flare: 2 };
  for (const [m, secs] of Object.entries(want))
    for (const speed of [0, 0.5, 1, 2]) assert.equal(exportLoop({ ...TUNE_DEFAULTS, speed }, undefined, m as ExportMotion).loopMs, secs * 1000, `${m} at speed ${speed}`);
  // An animated picture is fitted into the loop as v0.12 did.
  assert.deepEqual(exportLoop(TUNE_DEFAULTS, 900, 'gyre'), { loopMs: 1800, sourceSpan: 1800 });
});

const sample = (m: ExportMotion, n = 600) => Array.from({ length: n }, (_, i) => exportView(TUNE_DEFAULTS, m, i / n));

test('Jelly overshoots each lean and wobbles before it settles', () => {
  const ps = sample('jelly').map((v) => v.pose);
  const peak = Math.max(...ps.map((p) => Math.abs(p.ry)));
  // The lean it settles on is where each half ends.
  const rest = Math.abs(ps[ps.length / 2 - 1].ry);
  assert.ok(rest > 0.12, `the lean is too shallow (${rest})`);
  assert.ok(peak > rest * 1.2, `no overshoot (${peak} vs ${rest})`);
  let turns = 0;
  for (let i = 2; i < ps.length / 2; i++) if (Math.sign(ps[i].ry - ps[i - 1].ry) !== Math.sign(ps[i - 1].ry - ps[i - 2].ry)) turns++;
  assert.ok(turns >= 3, `it does not wobble (${turns} turns)`);
});

test('Jelly flicks wide and is moving for nearly all of its loop', () => {
  const ps = sample('jelly').map((v) => v.pose);
  const peak = Math.max(...ps.map((p) => Math.abs(p.ry)));
  assert.ok(peak > (18 * Math.PI) / 180, `the flick is small (${((peak * 180) / Math.PI).toFixed(1)} degrees)`);
  const dt = 3 / ps.length;
  let still = 0;
  for (let i = 1; i < ps.length; i++) if (Math.hypot(ps[i].ry - ps[i - 1].ry, ps[i].rx - ps[i - 1].rx, ps[i].rz - ps[i - 1].rz) / dt < 0.06) still++;
  assert.ok(still / ps.length < 0.1, `it holds still for ${Math.round((still / ps.length) * 100)}% of the loop`);
});

test('Lean tilts deep and holds still at each side', () => {
  const ps = sample('lean').map((v) => v.pose);
  const deep = Math.max(...ps.map((p) => Math.abs(p.ry)));
  assert.ok(deep > 0.3, `the lean is not deep (${deep})`);
  const held = ps.filter((p) => Math.abs(Math.abs(p.ry) - deep) < 0.01).length / ps.length;
  assert.ok(held > 0.2, `it does not hold its lean (${held})`);
});

test("Gyre's face circles an ellipse, never passing through flat", () => {
  const ps = sample('gyre').map((v) => v.pose);
  const r = ps.map((p) => Math.hypot(p.rx, p.ry));
  assert.ok(Math.min(...r) > 0.08, `it passes through flat (${Math.min(...r)})`);
  const wide = Math.max(...ps.map((p) => Math.abs(p.ry)));
  const tall = Math.max(...ps.map((p) => Math.abs(p.rx)));
  assert.ok(wide > tall * 1.4, `not an ellipse (${wide} by ${tall})`);
  // One way round: the angle of the lean only ever moves forward.
  let back = 0;
  for (let i = 1; i < ps.length; i++) {
    const d = Math.atan2(ps[i].rx, ps[i].ry) - Math.atan2(ps[i - 1].rx, ps[i - 1].ry);
    if (Math.sin(d) < 0) back++;
  }
  assert.equal(back, 0, 'it reverses');
});

test('Reveal starts on the face, shows the back, flips round, and the light runs across the foil as it lands', () => {
  const poses = sample('reveal', 300).map((v) => v.pose);
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
  const poses = sample('push', 300).map((v) => v.pose);
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
  const poses = sample('pulse', 400).map((v) => v.pose);
  const peaks = poses.map((p, i) => (i > 0 && i < poses.length - 1 && p.scale > poses[i - 1].scale && p.scale >= poses[i + 1].scale && p.scale > 1.02 ? p.scale : 0)).filter(Boolean);
  assert.equal(peaks.length, 4, `found ${peaks.length} beats (lub and dub, twice)`);
  assert.ok(peaks[0] > 1.12 && peaks[1] < peaks[0] - 0.05, `the lub does not stand out (${peaks})`);
  const halves = [poses.slice(0, 200), poses.slice(200)].map((h) => [h[0].sheen[0], h[150].sheen[0]]);
  assert.ok(halves[0][0] > 1 && halves[0][1] < -1 && halves[1][0] < -1 && halves[1][1] > 1, `the beats do not sweep from alternate sides (${halves})`);
});

const LIGHT_MOTIONS = ['beam', 'spotlight', 'flare'] as const;

test('the light motions keep the card still and facing, and own the light whatever the light setting', () => {
  for (const m of LIGHT_MOTIONS)
    for (let i = 0; i < 120; i++) {
      const v = exportView(TUNE_DEFAULTS, m, i / 120);
      const p = v.pose;
      assert.ok(Math.max(Math.abs(p.rx), Math.abs(p.ry), Math.abs(p.rz)) < 0.06, `${m} turns the card too far`);
      assert.ok(p.dx === 0 && p.dy === 0 && p.spin === 0 && p.scale === 1, `${m} moves the card`);
      for (const light of ['orbit', 'fixed'] as const) {
        const w = exportView({ ...TUNE_DEFAULTS, light }, m, i / 120);
        assert.deepEqual([w.tilt, w.light], [v.tilt, v.light], `${m} under ${light}`);
      }
    }
});

test('Light bar carries a band right across the card; Spotlight circles it; Flare ends its run in a star', () => {
  const along = (m: ExportMotion, f: (v: ReturnType<typeof exportView>) => number) => sample(m, 200).map(f);
  const lit = along('beam', (v) => (v.beam![3] > 0.5 ? v.beam![0] : NaN)).filter((v) => !Number.isNaN(v));
  assert.ok(Math.min(...lit) < -0.8 && Math.max(...lit) > 0.8, 'the band does not cross the whole card');
  assert.ok(Math.max(...along('beam', (v) => v.dim!)) > 0.2, 'the room never dims for the band');
  const ang = along('spotlight', (v) => Math.atan2(v.light[1] - 0.5, v.light[0] - 0.5));
  const turned = ang.slice(1).reduce((a, v, i) => a + Math.atan2(Math.sin(v - ang[i]), Math.cos(v - ang[i])), 0);
  assert.ok(Math.abs(Math.abs(turned) - Math.PI * 2) < 0.2, `the spot goes ${turned} rad round`);
  assert.ok(Math.min(...along('spotlight', (v) => v.spot![1])) > 0.5 && Math.min(...along('spotlight', (v) => v.dim!)) > 0.3, 'no spot in a dim room');
  const star = along('flare', (v) => v.star![2]);
  const run = along('flare', (v) => v.beam![3]);
  const peak = star.indexOf(Math.max(...star));
  assert.ok(star[peak] > 0.8, 'no star');
  assert.ok(run.findIndex((v) => v > 0.5) < peak, 'the star comes before the run');
  assert.ok(star.filter((v) => v > 0.05).length < 100, 'the star stays too long');
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
