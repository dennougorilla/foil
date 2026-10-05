// The motions made only for exported loops (Gyre, Jelly, Lean, Showcase, Sweep, Figure-8, Moment,
// Reveal, Push in, Heartbeat, Light bar, Spotlight, Flare): what the card and the light do at each
// point of the loop. Loaded with the exporters (docs/performance.md); their lengths stay in model.ts.
import { clamp, fixedLight, frac, loopView, REST_POSE, restLight, SHOW_MS, smooth, TUNE_DEFAULTS, type ExportMotion, type IdlePose, type LoopView, type Tune } from './model.ts';

export interface ExportView extends LoopView {
  /** Showcase's own drop shadow, in px of a 900 px tall frame; the stage's shadow when absent. */
  shadow?: [number, number];
  /** Blacklight's lamp, in turns into its sweep; drifting as on the stage when absent. */
  torch?: number;
  /** A light motion's band of light across the face (see CardDraw.beam): place, width, angle, power. */
  beam?: [number, number, number, number];
  /** A light motion's round spot of light centred on the light (see CardDraw.spot): radius, power. */
  spot?: [number, number];
  /** How far the face (and the backdrop) falls into shade away from the band or spot, 0..1. */
  dim?: number;
  /** A pixel star twinkling on the face (see CardDraw.star): x, y in card uv, power. */
  star?: [number, number, number];
}


/**
 * One full turn per 2π of `a`, holding on each face and flipping quickly between them. A
 * weightless card vanishes edge-on, so poses within ~17° of edge-on are skipped: at flip speed
 * the jump is invisible, and no exported frame ever comes out empty. (Showcase's Spin.)
 */
function flipTurn(a: number): number {
  const turns = Math.floor(a / (Math.PI * 2));
  const t = a / (Math.PI * 2) - turns;
  // Most of the loop on the face (the picture is what people share): the back and the two
  // flips together take about a fifth of it.
  const step = (from: number) => smooth(Math.min(1, Math.max(0, (t - from) / 0.08)));
  let ry = Math.PI * (step(0.5) + step(0.62));
  const EDGE = 0.3;
  const m = ry % Math.PI;
  if (Math.abs(m - Math.PI / 2) < EDGE) ry += (m < Math.PI / 2 ? -EDGE : EDGE) - (m - Math.PI / 2);
  return ry + turns * Math.PI * 2;
}

/** How many Showcase cycles fit in its loop: whole numbers only, so the clip loops seamlessly. */
const showCycles = (t: Tune) => (t.speed <= 0 ? 0 : Math.max(1, Math.round(t.speed)));

/**
 * Showcase: FOIL's export orbit up to v0.12, unchanged. With the defaults, one gentle sway with
 * the light sweeping round; Spin flips to the back and home; Breathe swells; any other idle motion
 * holds the card and sweeps the sheen round.
 */
function showcase(t: Tune, p: number): ExportView {
  const a = p * Math.PI * 2 * showCycles(t);
  const k = t.tiltMax / TUNE_DEFAULTS.tiltMax;
  const pose: IdlePose = { ...REST_POSE, sheen: [0, 0] };
  /** Vertical bob in px of a 900 px tall frame, whose card is 640 px tall. */
  let bob = 0;
  if (t.idle === 'sway') {
    pose.rx = Math.sin(a) * 0.22 * k;
    pose.ry = Math.cos(a) * 0.3 * k;
    pose.rz = Math.sin(a) * 0.03;
    bob = Math.sin(a * 2) * 8;
  } else if (t.idle === 'spin') {
    pose.ry = flipTurn(a);
    pose.rx = Math.sin(a) * 0.08 * k;
  } else if (t.idle === 'breathe') {
    pose.scale = 1 + Math.sin(a) * 0.035;
    pose.rx = Math.sin(a) * 0.06 * k;
    bob = -Math.sin(a) * 6;
  }
  pose.dy = bob / 640;
  // The sheen keeps sweeping even when the card holds still, so a clip never looks frozen.
  let tilt: [number, number] =
    t.idle === 'sway' ? [(Math.cos(a) * 0.3) / 0.32, (Math.sin(a) * 0.22) / 0.28] : [Math.cos(a) * 0.9, Math.sin(a) * 0.9];
  let light: [number, number] = [0.5 - Math.cos(a) * 0.3, 0.4 - Math.sin(a) * 0.25];
  if (t.light === 'orbit') light = [0.5 + Math.cos(a) * 0.34, 0.5 + Math.sin(a) * 0.36];
  else if (t.light === 'fixed') light = fixedLight(t.lightAngle);
  if (t.speed <= 0) {
    tilt = [0.35, -0.25];
    light = t.light === 'fixed' ? fixedLight(t.lightAngle) : [0.32, 0.22];
  }
  const shadow: [number, number] = [12 - (t.idle === 'spin' ? Math.sin(pose.ry) : pose.ry) * 18, 18 + pose.rx * 10];
  return { pose, tilt, light, shadow, torch: p * showCycles(t) };
}

/**
 * The foil shines brightest as the angle of the light on it changes, so these move the sheen and
 * the light a long way while the card itself only leans, and so still looks settled.
 */
function foilShow(m: 'sweep' | 'figure8' | 'moment', t: Tune, p: number): ExportView {
  const a = p * Math.PI * 2;
  const pose: IdlePose = { ...REST_POSE, sheen: [0, 0] };
  let tilt: [number, number];
  let light: [number, number];
  if (m === 'sweep') {
    // The card holds almost square on; a band of light sweeps across it corner to corner and back.
    const s = -Math.cos(a);
    pose.ry = s * 0.07;
    pose.rx = Math.sin(a) * 0.03;
    tilt = [s * 1.7, s * 1.1];
    light = [0.5 - s * 0.45, 0.42 - s * 0.36];
  } else if (m === 'figure8') {
    // The card leans in a figure eight; the light goes round the other way, so it rakes the foil.
    pose.ry = Math.sin(a) * 0.3;
    pose.rx = Math.sin(2 * a) * 0.17;
    pose.rz = Math.sin(a) * 0.02;
    pose.dy = Math.sin(2 * a + 0.5) * 0.008;
    tilt = [(pose.ry / 0.32) * 1.7, (pose.rx / 0.28) * 1.7];
    light = [0.5 - Math.sin(a) * 0.38, 0.45 - Math.sin(2 * a) * 0.3];
  } else {
    // A moment: face on, then the card tips well over into a flash of light, holds, and settles back.
    const ease = (u: number) => smooth(Math.min(1, Math.max(0, u)));
    const e = p < 0.6 ? ease((p - 0.28) / 0.22) : 1 - ease((p - 0.66) / 0.26);
    const rest = Math.sin(a) * 0.02;
    pose.ry = e * 0.4 + rest;
    pose.rx = -e * 0.14 + Math.sin(2 * a) * 0.012;
    pose.rz = e * 0.03;
    pose.scale = 1 + e * 0.03;
    tilt = [-0.5 + e * 2.1 + rest * 5, 0.3 - e * 0.8];
    light = [0.3 + e * 0.5, 0.25 + e * 0.35];
    if (p > 0.44 && p < 0.62) {
      const q = (p - 0.44) / 0.18;
      pose.glint = -0.3 + 2 * q;
      pose.flash = 0.12 * Math.sin(Math.PI * q) ** 4;
    }
  }
  if (t.light === 'fixed') light = fixedLight(t.lightAngle);
  return { pose, tilt, light, torch: p };
}

/** 0 to 1, overshooting a little before it settles: a flip that snaps round. */
const overshoot = (u: number) => 1 + 2.2 * (u - 1) ** 3 + 1.2 * (u - 1) ** 2;
/** One heartbeat thump `x` seconds after it starts: a sharp rise and a soft fall, 1 at its peak. */
const thump = (x: number, rise: number) => (x > 0 ? (x / rise) * Math.exp(1 - x / rise) : 0);

/** The pose of a card-moving export motion `s` seconds into its loop of `P` seconds. */
function cardPose(m: 'gyre' | 'jelly' | 'lean' | 'reveal' | 'push' | 'pulse', s: number, P: number): IdlePose {
  const p: IdlePose = { ...REST_POSE, sheen: [0, 0] };
  const u = s / P;
  switch (m) {
    case 'gyre': {
      // The face circles a wide ellipse (one way round, never through flat), so the glare travels
      // round the face, edge to edge; the card's middle drifts against it like a plate settling on a table.
      const g = Math.PI * 2 * u;
      p.ry = Math.cos(g) * 0.26;
      p.rx = Math.sin(g) * 0.17;
      p.rz = Math.sin(g) * 0.02;
      p.dx = -Math.cos(g) * 0.01;
      p.dy = -Math.sin(g) * 0.008;
      p.sheen = [Math.cos(g) * 0.4, Math.sin(g) * 0.7];
      break;
    }
    case 'jelly': {
      // Balatro's hand card, flicked from one lean to the other: it overshoots and bounces like
      // jelly (a loose underdamped spring), squashing as it goes, and the bounce has barely died
      // down before the next flick. It sways a little all the while, so it never quite stops.
      const half = P / 2;
      const k = Math.floor(s / half);
      const v = s - k * half;
      const side = k % 2 ? -1 : 1;
      const Z = 2.4;
      const F = Math.PI * 2 * 1.5;
      const spring = (v: number) => Math.exp(-Z * v) * (Math.cos(F * v) + (Z / F) * Math.sin(F * v));
      // What is left of the bounce is taken out by the end, so each flick starts from rest.
      const fade = smooth(v / half);
      const rest = spring(v) - spring(half) * fade;
      const kick = Math.exp(-Z * v) * Math.sin(F * v) * (1 - fade);
      const f = Math.PI * 2 * u;
      p.ry = side * 0.17 * (1 - 2 * rest) + Math.sin(f + 0.8) * 0.02;
      p.rz = -side * kick * 0.09 + Math.sin(f) * 0.015;
      p.rx = -kick * 0.08 + Math.cos(f) * 0.05;
      p.dy = -kick * kick * 0.05 + Math.sin(f) * 0.008;
      p.scale = 1 + kick * 0.05;
      // The light runs further than the card turns while it bounces.
      p.sheen = [side * kick * 0.6, 0];
      break;
    }
    case 'lean': {
      // A slow, deep tilt to one side that comes to rest and holds, then to the other: the light
      // sweeps the whole face and stops on each side.
      const half = P / 2;
      const k = Math.floor(s / half);
      // A second's swing, then a held half second.
      const q = Math.min(s - k * half, 1);
      const side = k % 2 ? -1 : 1;
      const e = 2 * q * q * q * (q * (q * 6 - 15) + 10) - 1;
      p.ry = side * e * 0.36;
      p.rx = -Math.sin(Math.PI * q) * 0.07;
      p.dy = -Math.sin(Math.PI * q) * 0.01;
      p.sheen = [side * e * 0.5, 0];
      break;
    }
    case 'reveal': {
      // Face up and quiet (the light off to one side), it turns away to its back, crouches for an
      // instant, then flips round with a snap, the edge catching the light; as it lands the light
      // runs right across the foil and leaves it quiet again.
      const AWAY = 0.3;
      const BACK = 0.4;
      const FLIP = 0.43;
      const LAND = 0.58;
      const RUN = 0.54;
      const DONE = 0.74;
      let turn = 0;
      if (u >= AWAY && u < BACK) turn = Math.PI * smooth((u - AWAY) / (BACK - AWAY));
      else if (u >= BACK && u < FLIP) {
        turn = Math.PI;
        p.scale = 1 - Math.sin((Math.PI * (u - BACK)) / (FLIP - BACK)) * 0.015;
      } else if (u >= FLIP && u < LAND) {
        const q = (u - FLIP) / (LAND - FLIP);
        turn = Math.PI * (1 + overshoot(q));
        p.scale = 1 + Math.sin(Math.PI * q) * 0.06;
        p.dy = -Math.sin(Math.PI * q) * 0.03;
      } else if (u >= LAND) turn = Math.PI * 2;
      p.spin = turn;
      // The light rests off one side, is led to the other while the card is turned, and runs across as it lands.
      const run = u < AWAY ? 1 : u < RUN ? 1 - 2 * smooth((u - AWAY) / (RUN - AWAY)) : u < DONE ? -1 + 2 * smooth((u - RUN) / (DONE - RUN)) : 1;
      const pass = u >= RUN && u < DONE ? Math.sin((Math.PI * (u - RUN)) / (DONE - RUN)) : 0;
      p.sheen = [Math.sin(p.spin) * 1.0 + run * 1.6, -pass * 0.35];
      p.ry = pass * 0.05;
      p.rx = Math.sin(Math.PI * 2 * u) * 0.02;
      break;
    }
    case 'push': {
      // A slow move in from far off to one side: the card swings round to face the camera as it
      // arrives, the light crosses it as it does, it holds still and quiet, then steps back.
      const IN = 0.62;
      const HOLD = 0.82;
      const e = u < IN ? (1 - Math.cos((Math.PI * u) / IN)) / 2 : u < HOLD ? 1 : 1 - smooth((u - HOLD) / (1 - HOLD));
      const far = 1 - e;
      // The light crosses as it arrives and waits off the far side; it is led back while the card is far and turned.
      const light = u < 0.44 ? -1 : u < 0.7 ? -1 + 2 * smooth((u - 0.44) / 0.26) : u < HOLD ? 1 : 1 - 2 * smooth((u - HOLD) / (1 - HOLD));
      p.scale = 0.84 + e * 0.28;
      p.dx = -far * 0.07;
      p.dy = far * 0.03 - e * 0.02;
      p.rx = far * 0.1;
      p.ry = far * 0.36;
      p.rz = -far * 0.04;
      p.sheen = [light * 1.6, -Math.sin((Math.PI * (light + 1)) / 2) * 0.3];
      break;
    }
    case 'pulse': {
      // A heartbeat, twice a loop: a strong lub and a softer dub. Each lub swells the card and, a
      // moment after, sends one sweep of light across the foil, from the right on one beat and from
      // the left on the next; between beats the light waits off the side and the card is still.
      const beat = s / (P / 2);
      const x = frac(beat);
      const side = Math.floor(beat) % 2 ? -1 : 1;
      const b = thump(x, 0.035) + thump(x - 0.17, 0.04) * 0.4;
      const sweep = smooth(Math.min(1, Math.max(0, (x - 0.03) / 0.3)));
      p.scale = 1 + b * 0.14;
      p.dy = -b * 0.012;
      p.rx = b * 0.06;
      p.ry = side * b * 0.06;
      p.sheen = [side * (1.6 - 3.2 * sweep), -Math.sin(Math.PI * sweep) * 0.4];
      break;
    }
  }
  return p;
}

/**
 * Gyre, Jelly, Lean, Reveal, Push in and Heartbeat: the card moves and the sheen follows it, as on
 * the stage; the light sits opposite the lean (or where a fixed light puts it).
 */
function cardShow(m: 'gyre' | 'jelly' | 'lean' | 'reveal' | 'push' | 'pulse', t: Tune, p: number): ExportView {
  const P = SHOW_MS[m] / 1000;
  const pose = cardPose(m, p * P, P);
  const tilt: [number, number] = [pose.ry / 0.32 + pose.sheen[0], pose.rx / 0.28 + pose.sheen[1]];
  const light = t.light === 'fixed' ? fixedLight(t.lightAngle) : restLight(tilt);
  return { pose, tilt, light, torch: p };
}

/** Light bar, Spotlight and Flare: the card all but holds still and the light itself moves, in a dimmed room. */
function lightShow(m: 'beam' | 'spotlight' | 'flare', p: number): ExportView {
  const pose: IdlePose = { ...REST_POSE, sheen: [0, 0] };
  const v: ExportView = { pose, tilt: [0, 0], light: [0.5, 0.4], torch: p };
  if (m === 'beam') {
    // In a dim room, a broad bar of light (and a thin one after it) slides slowly from the top left
    // corner to the bottom right one at an even pace, showing the foil only where it falls. It is
    // on the card the whole loop: it fades in at one corner and out at the other. Its glare rides
    // the bar's upper end.
    const pos = -0.95 + 1.9 * p;
    const power = smooth(clamp(p / 0.08, 0, 1)) * smooth(clamp((1 - p) / 0.08, 0, 1));
    v.beam = [pos, 0.2, Math.atan2(0.6, 0.8), power];
    v.dim = 0.7;
    v.light = [0.95 + 0.8 * pos, 0.07 + (0.6 * pos) / 1.4]; // any shape: the glare only has to ride near the band's upper end
    // The sheen and a slight lean follow the band, so the finish's colours flow under it.
    const k = Math.sin(Math.PI * 2 * p);
    pose.sheen = [k * 0.9, k * 0.4];
    pose.ry = k * 0.03;
    pose.rx = -k * 0.015;
  } else if (m === 'spotlight') {
    // A stage spot circles the art clockwise from the top in a dark room, staying off the nameplate.
    const o = Math.PI * 2 * p - Math.PI / 2;
    const c = Math.cos(o);
    const n = Math.sin(o);
    v.light = [0.5 + c * 0.33, 0.42 + n * 0.25];
    v.spot = [0.42, 1];
    v.dim = 0.85;
    pose.sheen = [-c * 0.9, -n * 0.9];
    pose.ry = -c * 0.035;
    pose.rx = n * 0.03;
  } else {
    // A hard highlight runs up from the bottom left corner to the top right one in a blink and
    // leaves a star blooming where it went out; the light then drifts slowly back for the next run.
    // The card itself stays as it is: only the highlight and the star move.
    const RUN0 = 0.05;
    const RUN = 0.4;
    const r = clamp((p - RUN0) / RUN, 0, 1);
    const k = p < RUN0 + RUN ? -1 + 2 * smooth(r) : 1 - 2 * smooth((p - RUN0 - RUN) / (1 - RUN0 - RUN));
    const power = p > RUN0 && p < RUN0 + RUN ? 1.5 * Math.sin(Math.PI * r) ** 0.3 : 0;
    v.beam = [k * 0.95, 0.09, Math.atan2(-0.6, 0.8), power];
    v.dim = 0.2 * power;
    v.light = [0.5 + 0.55 * k, 0.35 - 0.3 * k];
    pose.sheen = [-k * 0.35, k * 0.2];
    pose.ry = -k * 0.02;
    pose.rx = k * 0.012;
    const st = (p - 0.38) / 0.5;
    v.star = [0.84, 0.13, st <= 0 || st >= 1 ? 0 : st < 0.3 ? smooth(st / 0.3) : (1 - (st - 0.3) / 0.7) ** 2];
  }
  v.tilt = [pose.ry / 0.32 + pose.sheen[0], pose.rx / 0.28 + pose.sheen[1]];
  return v;
}

/** The card at loop position p∈[0,1) of an exported loop with the given motion. */
export function exportView(t: Tune, m: ExportMotion, p: number): ExportView {
  if (m === 'stage') return loopView(t, p);
  if (m === 'showcase') return showcase(t, p);
  if (m === 'sweep' || m === 'figure8' || m === 'moment') return foilShow(m, t, p);
  if (m === 'beam' || m === 'spotlight' || m === 'flare') return lightShow(m, p);
  return cardShow(m, t, p);
}
