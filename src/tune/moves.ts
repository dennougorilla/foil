// Every motion but Sway (docs/motion.md): what the card and the light do `s` idle seconds into a
// loop of `P`. Fetched when one of them is picked (or was left picked) and with the exporters, so the
// first load carries only the default; the stage and the files read the same functions.
import { addMoves, clamp, frac, IDLE_CYCLE, REST_POSE, smooth, type IdlePose, type Move } from './model.ts';

const W = (Math.PI * 2) / IDLE_CYCLE;
const rest = (): IdlePose => ({ ...REST_POSE, sheen: [0, 0] });
/** Idle seconds into the current loop. */
const into = (s: number, P: number) => s - Math.floor(s / P) * P;

/** 0 to 1, overshooting a little before it settles: a flip that snaps round. */
const overshoot = (u: number) => 1 + 2.2 * (u - 1) ** 3 + 1.2 * (u - 1) ** 2;
/** One heartbeat thump `x` seconds after it starts: a sharp rise and a soft fall, 1 at its peak. */
const thump = (x: number, rise: number) => (x > 0 ? (x / rise) * Math.exp(1 - x / rise) : 0);

/** A pose whose sheen is set from the whole tilt it should show (the card's own lean taken out). */
function steered(p: IdlePose, tilt: [number, number], light: [number, number]): IdlePose {
  p.sheen = [tilt[0] - p.ry / 0.32, tilt[1] - p.rx / 0.28];
  p.light = light;
  return p;
}

// ---------- Gentle ----------

const float: Move = (s) => {
  // A slow hover: rising, the card tips back a little and comes closer.
  const a = W * s;
  const p = rest();
  const h = Math.sin(a) + Math.sin(2 * a + 0.6) * 0.2;
  p.dy = -h * 0.04;
  p.rx = Math.cos(a) * 0.08;
  p.ry = Math.sin(2 * a) * 0.03;
  p.rz = Math.sin(a + 1.3) * 0.02;
  p.scale = 1 + h * 0.02;
  p.sheen = [Math.sin(a + 0.5) * 0.2, -Math.cos(a) * 0.35];
  return p;
};

const pendulum: Move = (s) => {
  // Swinging from the middle of its top edge.
  const a = W * s;
  const p = rest();
  const th = Math.sin(2 * a) * 0.13;
  p.rz = th;
  p.dx = -Math.sin(th) * 0.5;
  p.dy = -(1 - Math.cos(th)) * 0.5;
  p.ry = Math.cos(2 * a) * 0.06;
  p.sheen = [(th / 0.13) * 0.45, 0];
  return p;
};

const breathe: Move = (s) => {
  const a = W * s;
  const p = rest();
  const b = Math.sin(a);
  p.scale = 1 + b * 0.05;
  p.dy = -b * 0.012;
  p.rx = b * 0.03;
  p.sheen = [Math.sin(a + 1) * 0.15, b * 0.4];
  return p;
};

// ---------- Tilt ----------

const gyre: Move = (s, P) => {
  // The face circles a wide ellipse (one way round, never through flat), so the glare travels
  // round the face, edge to edge; the card's middle drifts against it like a plate settling on a table.
  const g = (Math.PI * 2 * into(s, P)) / P;
  const p = rest();
  p.ry = Math.cos(g) * 0.26;
  p.rx = Math.sin(g) * 0.17;
  p.rz = Math.sin(g) * 0.02;
  p.dx = -Math.cos(g) * 0.01;
  p.dy = -Math.sin(g) * 0.008;
  p.sheen = [Math.cos(g) * 0.4, Math.sin(g) * 0.7];
  return p;
};

const lean: Move = (s, P) => {
  // A slow, deep tilt to one side that comes to rest and holds, then to the other: the light
  // sweeps the whole face and stops on each side.
  const v = into(s, P);
  const half = P / 2;
  const k = Math.floor(v / half);
  // A second's swing, then a held half second.
  const q = Math.min(v - k * half, 1);
  const side = k % 2 ? -1 : 1;
  const e = 2 * q * q * q * (q * (q * 6 - 15) + 10) - 1;
  const p = rest();
  p.ry = side * e * 0.36;
  p.rx = -Math.sin(Math.PI * q) * 0.07;
  p.dy = -Math.sin(Math.PI * q) * 0.01;
  p.sheen = [side * e * 0.5, 0];
  return p;
};

const jelly: Move = (s, P) => {
  // Balatro's hand card, flicked from one lean to the other: it overshoots and bounces like jelly
  // (a loose underdamped spring), squashing as it goes, and the bounce has barely died down before
  // the next flick. It sways a little all the while, so it never quite stops.
  const u = into(s, P);
  const half = P / 2;
  const k = Math.floor(u / half);
  const v = u - k * half;
  const side = k % 2 ? -1 : 1;
  const Z = 2.4;
  const F = Math.PI * 2 * 1.5;
  const spring = (v: number) => Math.exp(-Z * v) * (Math.cos(F * v) + (Z / F) * Math.sin(F * v));
  // What is left of the bounce is taken out by the end, so each flick starts from rest.
  const fade = smooth(v / half);
  const settle = spring(v) - spring(half) * fade;
  const kick = Math.exp(-Z * v) * Math.sin(F * v) * (1 - fade);
  const f = (Math.PI * 2 * u) / P;
  const p = rest();
  p.ry = side * 0.17 * (1 - 2 * settle) + Math.sin(f + 0.8) * 0.02;
  p.rz = -side * kick * 0.09 + Math.sin(f) * 0.015;
  p.rx = -kick * 0.08 + Math.cos(f) * 0.05;
  p.dy = -kick * kick * 0.05 + Math.sin(f) * 0.008;
  p.scale = 1 + kick * 0.05;
  // The light runs further than the card turns while it bounces.
  p.sheen = [side * kick * 0.6, 0];
  return p;
};

const figure8: Move = (s, P) => {
  // The card leans in a figure eight; the light goes round the other way, so it rakes the foil.
  const a = (Math.PI * 2 * into(s, P)) / P;
  const p = rest();
  p.ry = Math.sin(a) * 0.3;
  p.rx = Math.sin(2 * a) * 0.17;
  p.rz = Math.sin(a) * 0.02;
  p.dy = Math.sin(2 * a + 0.5) * 0.008;
  return steered(p, [(p.ry / 0.32) * 1.7, (p.rx / 0.28) * 1.7], [0.5 - Math.sin(a) * 0.38, 0.45 - Math.sin(2 * a) * 0.3]);
};

const wobble: Move = (s) => {
  // Balatro's restless card: quick, jittery rocking on three axes that never settles.
  const a = W * s;
  const p = rest();
  p.rz = Math.sin(4 * a) * 0.03 + Math.sin(9 * a + 1) * 0.012;
  p.rx = Math.sin(5 * a + 0.5) * 0.08;
  p.ry = Math.sin(3 * a + 2) * 0.1 + Math.sin(7 * a) * 0.03;
  p.dy = Math.sin(6 * a) * 0.005;
  return p;
};

const spin: Move = (s) => {
  const a = W * s;
  const p = rest();
  p.spin = a;
  p.rx = Math.sin(a) * 0.08;
  p.sheen = [Math.sin(a) * 0.6, 0];
  return p;
};

// ---------- Light ----------

const sweep: Move = (s, P) => {
  // The card holds almost square on; a band of light sweeps across it corner to corner and back.
  const a = (Math.PI * 2 * into(s, P)) / P;
  const k = -Math.cos(a);
  const p = rest();
  p.ry = k * 0.07;
  p.rx = Math.sin(a) * 0.03;
  return steered(p, [k * 1.7, k * 1.1], [0.5 - k * 0.45, 0.42 - k * 0.36]);
};

const beam: Move = (s, P) => {
  // In a dim room, a broad bar of light (and a thin one after it) slides slowly from the top left
  // corner to the bottom right one at an even pace, showing the foil only where it falls. It is on
  // the card the whole loop: it fades in at one corner and out at the other. Its glare rides the
  // bar's upper end.
  const u = into(s, P) / P;
  const p = rest();
  const pos = -0.95 + 1.9 * u;
  const power = smooth(clamp(u / 0.08, 0, 1)) * smooth(clamp((1 - u) / 0.08, 0, 1));
  p.beam = [pos, 0.2, Math.atan2(0.6, 0.8), power];
  p.dim = 0.7;
  p.light = [0.95 + 0.8 * pos, 0.07 + (0.6 * pos) / 1.4]; // any shape: the glare only has to ride near the band's upper end
  // The sheen and a slight lean follow the band, so the finish's colours flow under it.
  const k = Math.sin(Math.PI * 2 * u);
  p.sheen = [k * 0.9, k * 0.4];
  p.ry = k * 0.03;
  p.rx = -k * 0.015;
  return p;
};

const spotlight: Move = (s, P) => {
  // A stage spot circles the art clockwise from the top in a dark room, staying off the nameplate.
  const o = (Math.PI * 2 * into(s, P)) / P - Math.PI / 2;
  const c = Math.cos(o);
  const n = Math.sin(o);
  const p = rest();
  p.light = [0.5 + c * 0.33, 0.42 + n * 0.25];
  p.spot = [0.42, 1];
  p.dim = 0.85;
  p.sheen = [-c * 0.9, -n * 0.9];
  p.ry = -c * 0.035;
  p.rx = n * 0.03;
  return p;
};

const flare: Move = (s, P) => {
  // A hard highlight runs up from the bottom left corner to the top right one in a blink and
  // leaves a star blooming where it went out; the light then drifts slowly back for the next run.
  // The card itself stays as it is: only the highlight and the star move.
  const u = into(s, P) / P;
  const RUN0 = 0.05;
  const RUN = 0.4;
  const r = clamp((u - RUN0) / RUN, 0, 1);
  const k = u < RUN0 + RUN ? -1 + 2 * smooth(r) : 1 - 2 * smooth((u - RUN0 - RUN) / (1 - RUN0 - RUN));
  const power = u > RUN0 && u < RUN0 + RUN ? 1.5 * Math.sin(Math.PI * r) ** 0.3 : 0;
  const p = rest();
  p.beam = [k * 0.95, 0.09, Math.atan2(-0.6, 0.8), power];
  p.dim = 0.2 * power;
  p.light = [0.5 + 0.55 * k, 0.35 - 0.3 * k];
  p.sheen = [-k * 0.35, k * 0.2];
  p.ry = -k * 0.02;
  p.rx = k * 0.012;
  const st = (u - 0.38) / 0.5;
  p.star = [0.84, 0.13, st <= 0 || st >= 1 ? 0 : st < 0.3 ? smooth(st / 0.3) : (1 - (st - 0.3) / 0.7) ** 2];
  return p;
};

// ---------- Showpiece ----------

const reveal: Move = (s, P) => {
  // Face up and quiet (the light off to one side), it turns away to its back, crouches for an
  // instant, then flips round with a snap, the edge catching the light; as it lands the light runs
  // right across the foil and leaves it quiet again.
  const u = into(s, P) / P;
  const AWAY = 0.3;
  const BACK = 0.4;
  const FLIP = 0.43;
  const LAND = 0.58;
  const RUN = 0.54;
  const DONE = 0.74;
  const p = rest();
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
  return p;
};

const push: Move = (s, P) => {
  // A slow move in from far off to one side: the card swings round to face the camera as it
  // arrives, the light crosses it as it does, it holds still and quiet, then steps back.
  const u = into(s, P) / P;
  const IN = 0.62;
  const HOLD = 0.82;
  const e = u < IN ? (1 - Math.cos((Math.PI * u) / IN)) / 2 : u < HOLD ? 1 : 1 - smooth((u - HOLD) / (1 - HOLD));
  const far = 1 - e;
  // The light crosses as it arrives and waits off the far side; it is led back while the card is far and turned.
  const light = u < 0.44 ? -1 : u < 0.7 ? -1 + 2 * smooth((u - 0.44) / 0.26) : u < HOLD ? 1 : 1 - 2 * smooth((u - HOLD) / (1 - HOLD));
  const p = rest();
  p.scale = 0.84 + e * 0.28;
  p.dx = -far * 0.07;
  p.dy = far * 0.03 - e * 0.02;
  p.rx = far * 0.1;
  p.ry = far * 0.36;
  p.rz = -far * 0.04;
  p.sheen = [light * 1.6, -Math.sin((Math.PI * (light + 1)) / 2) * 0.3];
  return p;
};

const pulse: Move = (s, P) => {
  // A heartbeat, twice a loop: a strong lub and a softer dub. Each lub swells the card and, a moment
  // after, sends one sweep of light across the foil, from the right on one beat and from the left on
  // the next; between beats the light waits off the side and the card is still.
  const beat = into(s, P) / (P / 2);
  const x = frac(beat);
  const side = Math.floor(beat) % 2 ? -1 : 1;
  const b = thump(x, 0.035) + thump(x - 0.17, 0.04) * 0.4;
  const sweep = smooth(Math.min(1, Math.max(0, (x - 0.03) / 0.3)));
  const p = rest();
  p.scale = 1 + b * 0.14;
  p.dy = -b * 0.012;
  p.rx = b * 0.06;
  p.ry = side * b * 0.06;
  p.sheen = [side * (1.6 - 3.2 * sweep), -Math.sin(Math.PI * sweep) * 0.4];
  return p;
};

const glint: Move = (s, P) => {
  // Face on, then the card tips well over into a flash and a streak of light, holds, and settles back.
  const u = into(s, P) / P;
  const a = Math.PI * 2 * u;
  const ease = (v: number) => smooth(Math.min(1, Math.max(0, v)));
  const e = u < 0.6 ? ease((u - 0.28) / 0.22) : 1 - ease((u - 0.66) / 0.26);
  const sway = Math.sin(a) * 0.02;
  const p = rest();
  p.ry = e * 0.4 + sway;
  p.rx = -e * 0.14 + Math.sin(2 * a) * 0.012;
  p.rz = e * 0.03;
  p.scale = 1 + e * 0.03;
  if (u > 0.44 && u < 0.62) {
    const q = (u - 0.44) / 0.18;
    p.glint = -0.3 + 2 * q;
    p.flash = 0.12 * Math.sin(Math.PI * q) ** 4;
  }
  return steered(p, [-0.5 + e * 2.1 + sway * 5, 0.3 - e * 0.8], [0.3 + e * 0.5, 0.25 + e * 0.35]);
};

const turn: Move = (s) => {
  // Rests on its face, then one slow full turn.
  const u = frac(s / IDLE_CYCLE);
  const REST = 0.35;
  const q = u < REST ? 0 : (u - REST) / (1 - REST);
  const p = rest();
  p.spin = Math.PI * (1 - Math.cos(Math.PI * q)) + Math.floor(s / IDLE_CYCLE) * Math.PI * 2;
  p.rx = Math.sin(W * s) * 0.03;
  p.sheen = [Math.sin(p.spin) * 0.6, 0];
  return p;
};

const bounce: Move = (s) => {
  // Two hops a cycle, leaning one way then the other: a hop, a thud, a squash that settles, a crouch.
  const hop = s / (IDLE_CYCLE / 2);
  const u = frac(hop);
  const side = Math.floor(hop) % 2 ? -1 : 1;
  const AIR = 0.22;
  const LAND = 0.3;
  const p = rest();
  if (u < AIR) {
    const q = u / AIR;
    const h = 4 * q * (1 - q);
    p.dy = -h * 0.07;
    p.rz = side * Math.sin(Math.PI * q) * 0.05;
    p.scale = 1 + h * 0.02;
    p.sheen = [0, -h * 0.6];
  } else if (u < AIR + LAND) {
    const q = (u - AIR) / LAND;
    const k = (1 - q) ** 2;
    p.scale = 1 - Math.sin(q * Math.PI * 3) * 0.045 * k;
    p.dy = Math.sin(q * Math.PI * 3) * 0.006 * k;
    p.flash = 0.12 * (1 - q) ** 4;
  } else if (u > 0.85) {
    p.scale = 1 - Math.sin((Math.PI * (u - 0.85)) / 0.15) * 0.02;
  }
  return p;
};

addMoves({ float, pendulum, breathe, gyre, lean, jelly, figure8, wobble, spin, sweep, beam, spotlight, flare, reveal, push, pulse, glint, turn, bounce });
