// Fine-tuning for light and motion. Shared by every finish, the live stage and the exporters.
// The defaults reproduce the look FOIL had before these controls existed, so leaving the
// "More" drawer closed changes nothing.

export type LightMode = 'pointer' | 'orbit' | 'fixed';
export type IdleMode = 'none' | 'sway' | 'float' | 'pendulum' | 'wobble' | 'bounce' | 'glint' | 'spin' | 'turn' | 'breathe' | 'reveal' | 'push' | 'pulse';
/** The metal the Relief finish is struck in; other finishes ignore it. */
export type Metal = 'gold' | 'silver';

export interface Tune {
  /** Pattern zoom: 2 draws every finish's pattern twice as large. */
  scale: number;
  /** Pattern rotation, degrees. */
  angle: number;
  /** Hue shift applied to the finish (not the art), degrees. */
  hue: number;
  /** Saturation of the finish, 1 = as designed. */
  sat: number;
  /** Strength of the white glare hotspot. */
  glare: number;
  /** How tight the glare is: higher is a smaller, harder spot. */
  sharp: number;
  /** Colour temperature of the light (glare and sparkle), kelvin. */
  temp: number;
  /** Share of glitter flecks across the card, 0 = none. */
  sparkle: number;
  /** Size of each fleck. */
  sparkleSize: number;
  light: LightMode;
  /** Where a fixed light sits around the card, degrees clockwise from the top. */
  lightAngle: number;
  /** Speed of the finishes' own animation and of the automatic motion. */
  speed: number;
  /** Largest tilt the card reaches while you point at it, degrees. */
  tiltMax: number;
  idle: IdleMode;
  metal: Metal;
}

export type NumKey = { [K in keyof Tune]: Tune[K] extends number ? K : never }[keyof Tune];
export type ChoiceKey = 'light' | 'idle' | 'metal';

export const TUNE_DEFAULTS: Tune = {
  scale: 1,
  angle: 0,
  hue: 0,
  sat: 1,
  glare: 1,
  sharp: 1,
  temp: 6500,
  sparkle: 0,
  sparkleSize: 1,
  light: 'pointer',
  lightAngle: 320,
  speed: 1,
  tiltMax: 18,
  idle: 'sway',
  metal: 'gold',
};

export interface Range {
  min: number;
  max: number;
  step: number;
  /** Track drawn from the default outwards instead of from the left edge. */
  bipolar?: boolean;
}

export const RANGES: Record<NumKey, Range> = {
  scale: { min: 0.4, max: 3, step: 0.05 },
  angle: { min: -90, max: 90, step: 1, bipolar: true },
  hue: { min: -180, max: 180, step: 1, bipolar: true },
  sat: { min: 0, max: 2, step: 0.01 },
  glare: { min: 0, max: 3, step: 0.05 },
  sharp: { min: 0.3, max: 4, step: 0.05 },
  temp: { min: 2500, max: 10000, step: 100, bipolar: true },
  sparkle: { min: 0, max: 1, step: 0.01 },
  sparkleSize: { min: 0.5, max: 3, step: 0.05 },
  lightAngle: { min: 0, max: 359, step: 1 },
  speed: { min: 0, max: 3, step: 0.05 },
  tiltMax: { min: 0, max: 40, step: 1 },
};

export const LIGHT_MODES: LightMode[] = ['pointer', 'orbit', 'fixed'];
export const IDLE_MODES: IdleMode[] = ['none', 'sway', 'float', 'pendulum', 'wobble', 'bounce', 'glint', 'spin', 'turn', 'breathe', 'reveal', 'push', 'pulse'];
export const METALS: Metal[] = ['gold', 'silver'];

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/**
 * Fills gaps and drops nonsense from a saved tune, so hand-edited storage still loads. A tune
 * saved with a light mode that no longer exists (Gyro, before v0.10) is from an older shape and
 * starts over from the defaults.
 */
export function sanitizeTune(raw: unknown): Tune {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out = { ...TUNE_DEFAULTS };
  if (src.light !== undefined && !LIGHT_MODES.includes(src.light as LightMode)) return out;
  for (const k of Object.keys(RANGES) as NumKey[]) {
    const v = src[k];
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = clamp(v, RANGES[k].min, RANGES[k].max);
  }
  if (LIGHT_MODES.includes(src.light as LightMode)) out.light = src.light as LightMode;
  if (IDLE_MODES.includes(src.idle as IdleMode)) out.idle = src.idle as IdleMode;
  if (METALS.includes(src.metal as Metal)) out.metal = src.metal as Metal;
  return out;
}

export const isDefault = (t: Tune, k: keyof Tune) => t[k] === TUNE_DEFAULTS[k];

/** Keys that differ from the default. The light angle only counts while the light is fixed. */
export function changedKeys(t: Tune): (keyof Tune)[] {
  return (Object.keys(TUNE_DEFAULTS) as (keyof Tune)[]).filter(
    (k) => !isDefault(t, k) && (k !== 'lightAngle' || t.light === 'fixed'),
  );
}

// ---------- Light ----------

/** Approximate blackbody colour (Tanner Helland's fit), normalised so 6500K is white. */
function kelvin(k: number): [number, number, number] {
  const t = k / 100;
  const r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  return [clamp(r, 0, 255) / 255, clamp(g, 0, 255) / 255, clamp(b, 0, 255) / 255];
}

const WHITE = kelvin(6500);

export function lightColor(temp: number): [number, number, number] {
  if (temp === TUNE_DEFAULTS.temp) return [1, 1, 1];
  const c = kelvin(temp);
  const rgb = c.map((v, i) => v / WHITE[i]) as [number, number, number];
  // Keep the brightest channel at 1 so warm and cool read as tint, not as dimmer light.
  const m = Math.max(...rgb);
  return rgb.map((v) => v / m) as [number, number, number];
}

/** CSS colour for the swatch next to the temperature value. */
export const lightCss = (temp: number) =>
  `rgb(${lightColor(temp)
    .map((v) => Math.round(v * 255))
    .join(' ')})`;

/** Position of a fixed light in card uv (0..1, y down). */
export function fixedLight(deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [0.5 + Math.sin(a) * 0.34, 0.5 - Math.cos(a) * 0.36];
}

// ---------- Shader uniforms ----------

export interface TuneGl {
  scale: number;
  angle: number;
  hue: number;
  sat: number;
  glare: number;
  sharp: number;
  light: [number, number, number];
  sparkle: number;
  sparkleSize: number;
  /** 0 gold, 1 silver. */
  metal: number;
}

export function tuneGl(t: Tune): TuneGl {
  return {
    scale: t.scale,
    angle: (t.angle * Math.PI) / 180,
    hue: t.hue / 360,
    sat: t.sat,
    glare: t.glare,
    sharp: t.sharp,
    light: lightColor(t.temp),
    sparkle: t.sparkle,
    sparkleSize: t.sparkleSize,
    metal: METALS.indexOf(t.metal),
  };
}

export const TUNE_GL_DEFAULT = tuneGl(TUNE_DEFAULTS);

type Uniforms = Record<string, WebGLUniformLocation | null>;

/** Uploads the tune to the card program. Called on every card draw so no renderer is left unset. */
export function applyTune(gl: WebGL2RenderingContext, u: Uniforms, g: TuneGl): void {
  gl.uniform1f(u.uTScale, g.scale);
  gl.uniform1f(u.uTAngle, g.angle);
  gl.uniform1f(u.uTHue, g.hue);
  gl.uniform1f(u.uTSat, g.sat);
  gl.uniform1f(u.uTGlare, g.glare);
  gl.uniform1f(u.uTSharp, g.sharp);
  gl.uniform3f(u.uTLight, g.light[0], g.light[1], g.light[2]);
  gl.uniform1f(u.uTSparkle, g.sparkle);
  gl.uniform1f(u.uTSparkleSize, g.sparkleSize);
  gl.uniform1f(u.uTMetal, g.metal);
}

// ---------- Idle motion (the stage and exported loops) ----------

/**
 * Idle seconds in which every idle motion, the orbiting light and Blacklight's drifting lamp
 * come round once. The idle clock runs at the tune's speed, so at speed 1 that is six seconds,
 * and an exported loop is exactly one cycle: it moves as the stage does and closes without a seam.
 */
export const IDLE_CYCLE = 6;
const W = (Math.PI * 2) / IDLE_CYCLE;

/**
 * The showpieces made for a GIF come round faster: seconds per loop, each dividing IDLE_CYCLE so
 * the idle clock still closes on itself.
 */
const SHORT: Partial<Record<IdleMode, number>> = { reveal: 3, push: 3, pulse: 2 };
const period = (idle: IdleMode) => SHORT[idle] ?? IDLE_CYCLE;

/**
 * Idle seconds an exported loop covers: the motion's own period, or the whole idle cycle when the
 * light orbits or `whole` asks for it (Blacklight's lamp drifts once per idle cycle).
 */
export const loopCycle = (t: Tune, whole = false) => (whole || t.light === 'orbit' ? IDLE_CYCLE : period(t.idle));

/** Motions that turn the card round, and come back to its face once per period. */
const TURNING: IdleMode[] = ['spin', 'turn', 'reveal'];

/** The card's automatic motion at one moment: offsets in card heights, angles in radians. */
export interface IdlePose {
  dx: number;
  dy: number;
  rx: number;
  ry: number;
  rz: number;
  scale: number;
  /** Turntable angle of spin and turn, added on top of everything else. */
  spin: number;
  /** Extra sheen travel, in the same -1..1 units as the shader's tilt. */
  sheen: [number, number];
  /** A short white flash: a bounce landing. */
  flash: number;
  /** A streak of light crossing the face (see CardDraw.glint), below -1 when none. */
  glint: number;
}

const REST_POSE: IdlePose = { dx: 0, dy: 0, rx: 0, ry: 0, rz: 0, scale: 1, spin: 0, sheen: [0, 0], flash: 0, glint: -2 };

const smooth = (u: number) => u * u * (3 - 2 * u);
const frac = (v: number) => v - Math.floor(v);
/** 0 to 1, overshooting a little before it settles: a flip that snaps round. */
const overshoot = (u: number) => 1 + 2.2 * (u - 1) ** 3 + 1.2 * (u - 1) ** 2;
/** One heartbeat thump `x` seconds after it starts: a sharp rise and a soft fall, 1 at its peak. */
const thump = (x: number, rise: number) => (x > 0 ? (x / rise) * Math.exp(1 - x / rise) : 0);

/** The idle motion `s` idle seconds in. Periodic in IDLE_CYCLE (spin and turn add whole turns). */
export function idlePose(t: Tune, s: number): IdlePose {
  const a = W * s;
  const p: IdlePose = { ...REST_POSE, sheen: [0, 0] };
  switch (t.idle) {
    case 'sway':
      p.dy = Math.sin(a) * 0.012;
      p.rz = Math.sin(a + 0.9) * 0.022;
      p.rx = Math.sin(a + 2) * 0.05;
      p.ry = Math.cos(a) * 0.07 + Math.sin(2 * a) * 0.015;
      p.sheen = [Math.sin(a + 0.4) * 0.3, Math.cos(a + 1.1) * 0.3];
      break;
    case 'float': {
      // A slow hover: rising, the card tips back a little and comes closer.
      const h = Math.sin(a) + Math.sin(2 * a + 0.6) * 0.2;
      p.dy = -h * 0.04;
      p.rx = Math.cos(a) * 0.08;
      p.ry = Math.sin(2 * a) * 0.03;
      p.rz = Math.sin(a + 1.3) * 0.02;
      p.scale = 1 + h * 0.02;
      p.sheen = [Math.sin(a + 0.5) * 0.2, -Math.cos(a) * 0.35];
      break;
    }
    case 'pendulum': {
      // Swinging from the middle of its top edge, twice a cycle.
      const th = Math.sin(2 * a) * 0.13;
      p.rz = th;
      p.dx = -Math.sin(th) * 0.5;
      p.dy = -(1 - Math.cos(th)) * 0.5;
      p.ry = Math.cos(2 * a) * 0.06;
      p.sheen = [(th / 0.13) * 0.45, 0];
      break;
    }
    case 'wobble':
      // Balatro's restless card: quick, jittery rocking on three axes that never settles.
      p.rz = Math.sin(4 * a) * 0.03 + Math.sin(9 * a + 1) * 0.012;
      p.rx = Math.sin(5 * a + 0.5) * 0.08;
      p.ry = Math.sin(3 * a + 2) * 0.1 + Math.sin(7 * a) * 0.03;
      p.dy = Math.sin(6 * a) * 0.005;
      break;
    case 'bounce': {
      // Two hops a cycle, leaning one way then the other: a hop, a thud, a squash that settles, a crouch.
      const hop = s / (IDLE_CYCLE / 2);
      const u = frac(hop);
      const side = Math.floor(hop) % 2 ? -1 : 1;
      const AIR = 0.22;
      const LAND = 0.3;
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
      break;
    }
    case 'glint': {
      // A still card that a streak of light crosses twice a cycle, leaning into it; between passes the shine drifts back.
      const u = frac(s / (IDLE_CYCLE / 2));
      const PASS = 0.2;
      const across = u < PASS ? smooth(u / PASS) : 1 - smooth((u - PASS) / (1 - PASS));
      p.sheen = [-1.8 + 3.6 * across, -0.5 + across];
      if (u < PASS) {
        p.ry = Math.sin((Math.PI * u) / PASS) * 0.05;
        p.glint = -0.3 + 2 * (u / PASS);
      }
      break;
    }
    case 'spin':
      p.spin = a;
      p.rx = Math.sin(a) * 0.08;
      p.sheen = [Math.sin(a) * 0.6, 0];
      break;
    case 'turn': {
      // Rests on its face, then one slow full turn.
      const u = frac(s / IDLE_CYCLE);
      const REST = 0.35;
      const q = u < REST ? 0 : (u - REST) / (1 - REST);
      p.spin = Math.PI * (1 - Math.cos(Math.PI * q)) + Math.floor(s / IDLE_CYCLE) * Math.PI * 2;
      p.rx = Math.sin(a) * 0.03;
      p.sheen = [Math.sin(p.spin) * 0.6, 0];
      break;
    }
    case 'breathe': {
      const b = Math.sin(a);
      p.scale = 1 + b * 0.05;
      p.dy = -b * 0.012;
      p.rx = b * 0.03;
      p.sheen = [Math.sin(a + 1) * 0.15, b * 0.4];
      break;
    }
    case 'reveal': {
      // Face up and quiet (the light off to one side), it turns away to its back, crouches for an
      // instant, then flips round with a snap, the edge catching the light; as it lands the light
      // runs right across the foil and leaves it quiet again.
      const P = period('reveal');
      const u = frac(s / P);
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
      p.spin = turn + Math.floor(s / P) * Math.PI * 2;
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
      const u = frac(s / period('push'));
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
      const beat = s / (period('pulse') / 2);
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

/** Where a turning idle motion next faces the viewer, in idle seconds; `s` itself when it already does. */
export function facingAt(t: Tune, s: number): number {
  if (!TURNING.includes(t.idle)) return s;
  const turned = idlePose(t, s).spin / (Math.PI * 2);
  const P = period(t.idle);
  return Math.abs(turned - Math.round(turned)) < 1e-6 ? s : Math.ceil(s / P) * P;
}

/** Position of the orbiting light in card uv, `s` idle seconds in. */
export const orbitLight = (s: number): [number, number] => [0.5 + Math.cos(W * s) * 0.34, 0.5 + Math.sin(W * s) * 0.36];

/**
 * The sheen the card shows, from its rotation (`rx`, `ry`, spin left out), the idle motion's own
 * sheen and an orbiting light's.
 */
export function cardTilt(t: Tune, s: number, pose: IdlePose, rx: number, ry: number): [number, number] {
  const orbit = t.light === 'orbit' ? [Math.cos(W * s) * 0.6, Math.sin(W * s) * 0.6] : [0, 0];
  return [ry / 0.32 + pose.sheen[0] + orbit[0], rx / 0.28 + pose.sheen[1] + orbit[1]];
}

/** Where the light sits when nobody points at the card: opposite the way it leans. */
export const restLight = (tilt: [number, number]): [number, number] => [0.5 - tilt[0] * 0.35, 0.4 - tilt[1] * 0.3];

/** The light the tune asks for; `follow` is where the pointer (or the card's lean) puts it. */
export function tunedLight(t: Tune, s: number, follow: [number, number]): [number, number] {
  if (t.light === 'orbit') return orbitLight(s);
  if (t.light === 'fixed') return fixedLight(t.lightAngle);
  return follow;
}

// ---------- Exported clips ----------

export interface LoopView {
  pose: IdlePose;
  tilt: [number, number];
  light: [number, number];
}

/** The card at loop position p∈[0,1) of a GIF or APNG: the stage left alone, `cycle` idle seconds long. */
export function loopView(t: Tune, p: number, cycle = loopCycle(t)): LoopView {
  const s = p * cycle;
  const pose = idlePose(t, s);
  const tilt = cardTilt(t, s, pose, pose.rx, pose.ry);
  return { pose, tilt, light: tunedLight(t, s, restLight(tilt)) };
}

/**
 * Length of an exported loop and the source time it covers. It is one loop cycle (`loopCycle`,
 * `whole` as there) at the tune's speed; an animated picture plays a whole number of its own loops inside it, sped up or slowed
 * a little to fit. At speed zero nothing moves on its own, so the picture alone sets the loop:
 * short ones play whole cycles, long ones are sped up to fit six seconds.
 */
export function exportLoop(t: Tune, sourceMs?: number, whole = false): { loopMs: number; sourceSpan: number } {
  if (t.speed <= 0) {
    if (!sourceMs) return { loopMs: 2400, sourceSpan: 2400 };
    const loopMs = Math.min(sourceMs * Math.ceil(1200 / sourceMs), 6000);
    return { loopMs, sourceSpan: sourceMs > 6000 ? sourceMs : loopMs };
  }
  const loopMs = Math.round((loopCycle(t, whole) * 1000) / t.speed);
  return { loopMs, sourceSpan: sourceMs ? sourceMs * Math.max(1, Math.round(loopMs / sourceMs)) : loopMs };
}

/**
 * Frame delays (ms) for a loop: as many frames as fit at `minDelay`, at most `maxFrames`, each a
 * whole number of `unit`s (GIF counts in 10 ms), adding up to the loop exactly.
 */
export function framePlan(loopMs: number, minDelay: number, maxFrames: number, unit: number): number[] {
  const units = Math.round(loopMs / unit);
  const frames = Math.max(1, Math.min(maxFrames, Math.floor(loopMs / minDelay)));
  return Array.from({ length: frames }, (_, i) => (Math.round(((i + 1) * units) / frames) - Math.round((i * units) / frames)) * unit);
}

/**
 * The idle clock of the live stage, in idle seconds: what `idlePose` and an exported loop are timed
 * by, so the stage left alone shows exactly the exported loop at `idleTime / IDLE_CYCLE`.
 */
export class IdleClock {
  idleTime = 0;
  /** Turntable angle of spin and turn right now (0 when the motion does not turn). */
  spinAngle = 0;
  /** How much of the idle motion shows: it eases out while the card is held and back in after. */
  private weight = 1;

  /**
   * `still` is reduced motion: nothing moves on its own. `facing` (the pointer is on the card) brings
   * a turning card round to its face and keeps it there. `held` (dragged, or held flat for the
   * brush) also faces it, and eases the idle motion out until it is let go.
   */
  step(dt: number, t: Tune, still: boolean, facing: boolean, held = false) {
    const face = facingAt(t, this.idleTime);
    if (still) {
      this.weight = 0;
      this.idleTime = face;
      this.spinAngle = idlePose(t, face).spin;
      return;
    }
    this.weight += ((held ? 0 : 1) - this.weight) * (1 - Math.exp(-dt * 6));
    if ((facing || held) && face !== this.idleTime) {
      // Let go of a turn by easing forward to the next time the face looks straight on.
      this.idleTime += Math.min(face - this.idleTime, Math.max(dt * t.speed, (face - this.idleTime) * (1 - Math.exp(-dt * 5))));
      if (face - this.idleTime < 1e-3) this.idleTime = face;
    } else if (!held && !(facing && face === this.idleTime && TURNING.includes(t.idle))) {
      this.idleTime += dt * t.speed;
    }
    this.spinAngle = idlePose(t, this.idleTime).spin;
  }

  /** The idle motion now. */
  pose(t: Tune): IdlePose {
    const p = idlePose(t, this.idleTime);
    const w = this.weight;
    if (w === 1) return p;
    return {
      dx: p.dx * w,
      dy: p.dy * w,
      rx: p.rx * w,
      ry: p.ry * w,
      rz: p.rz * w,
      scale: 1 + (p.scale - 1) * w,
      spin: p.spin,
      sheen: [p.sheen[0] * w, p.sheen[1] * w],
      flash: p.flash * w,
      glint: w > 0.5 ? p.glint : -2,
    };
  }

  /** The sheen for a card turned by `rx`, `ry` (spin left out) with this idle pose. */
  tilt = (t: Tune, pose: IdlePose, rx: number, ry: number) => cardTilt(t, this.idleTime, pose, rx, ry);

  /** Light position in card uv. `follow` is where the pointer or the card's lean would put it. */
  light = (t: Tune, follow: [number, number]) => tunedLight(t, this.idleTime, follow);
}
