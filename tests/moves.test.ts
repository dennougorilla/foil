// What each motion does (docs/motion.md): the ones that show the foil through the tilt, through
// the light, and the showpieces. Run with `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loopView, PERIOD, TUNE_DEFAULTS, type IdleMode, type Tune } from '../src/tune/model.ts';
import '../src/tune/moves.ts';

const close = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps;
const view = (idle: IdleMode, p: number, t: Partial<Tune> = {}) => loopView({ ...TUNE_DEFAULTS, ...t, idle }, p);
const sample = (m: IdleMode, n = 600) => Array.from({ length: n }, (_, i) => view(m, i / n));

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
  const dt = PERIOD.jelly / ps.length;
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

test('the Light motions keep the card still and facing', () => {
  for (const m of ['beam', 'spotlight', 'flare'] as const)
    for (let i = 0; i < 120; i++) {
      const p = view(m, i / 120).pose;
      assert.ok(Math.max(Math.abs(p.rx), Math.abs(p.ry), Math.abs(p.rz)) < 0.06, `${m} turns the card too far`);
      assert.ok(p.dx === 0 && p.dy === 0 && p.spin === 0 && p.scale === 1, `${m} moves the card`);
    }
});

test('Light bar carries a band right across the card; Spotlight circles it; Flare ends its run in a star', () => {
  const along = (m: IdleMode, f: (v: ReturnType<typeof view>) => number) => sample(m, 200).map(f);
  const lit = along('beam', (v) => (v.pose.beam![3] > 0.5 ? v.pose.beam![0] : NaN)).filter((v) => !Number.isNaN(v));
  assert.ok(Math.min(...lit) < -0.8 && Math.max(...lit) > 0.8, 'the band does not cross the whole card');
  assert.ok(Math.max(...along('beam', (v) => v.pose.dim!)) > 0.2, 'the room never dims for the band');
  const ang = along('spotlight', (v) => Math.atan2(v.light[1] - 0.5, v.light[0] - 0.5));
  const turned = ang.slice(1).reduce((a, v, i) => a + Math.atan2(Math.sin(v - ang[i]), Math.cos(v - ang[i])), 0);
  assert.ok(Math.abs(Math.abs(turned) - Math.PI * 2) < 0.2, `the spot goes ${turned} rad round`);
  assert.ok(Math.min(...along('spotlight', (v) => v.pose.spot![1])) > 0.5 && Math.min(...along('spotlight', (v) => v.pose.dim!)) > 0.3, 'no spot in a dim room');
  const star = along('flare', (v) => v.pose.star![2]);
  const run = along('flare', (v) => v.pose.beam![3]);
  const peak = star.indexOf(Math.max(...star));
  assert.ok(star[peak] > 0.8, 'no star');
  assert.ok(run.findIndex((v) => v > 0.5) < peak, 'the star comes before the run');
  assert.ok(star.filter((v) => v > 0.05).length < 100, 'the star stays too long');
});

test('Sweep, Figure 8 and Glint keep the card settled and move the sheen and the light a long way', () => {
  for (const m of ['sweep', 'figure8', 'glint'] as const) {
    const a = view(m, 0);
    let tiltSpan = 0;
    let lightSpan = 0;
    let maxTurn = 0;
    for (let i = 0; i < 200; i++) {
      const v = view(m, i / 200);
      tiltSpan = Math.max(tiltSpan, Math.hypot(v.tilt[0] - a.tilt[0], v.tilt[1] - a.tilt[1]));
      lightSpan = Math.max(lightSpan, Math.hypot(v.light[0] - a.light[0], v.light[1] - a.light[1]));
      maxTurn = Math.max(maxTurn, Math.abs(v.pose.rx), Math.abs(v.pose.ry), Math.abs(v.pose.rz) * 4);
    }
    assert.ok(tiltSpan > 1.5, `${m}: the sheen hardly travels (${tiltSpan})`);
    assert.ok(lightSpan > 0.4, `${m}: the light hardly moves (${lightSpan})`);
    assert.ok(maxTurn < 0.5, `${m}: the card swings too far to look settled (${maxTurn})`);
  }
  // Glint tips into its flash once a loop, a streak of light crossing as it does.
  const g = sample('glint', 300).map((v) => v.pose);
  assert.ok(g.some((p) => p.flash > 0.05) && g.some((p) => p.glint > -1), 'Glint has no flash or streak');
});
