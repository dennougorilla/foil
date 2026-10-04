// Fine-tuning for light and motion. Shared by every finish, the live stage and the exporters.
// The defaults reproduce the look FOIL had before these controls existed, so leaving the
// "More" drawer closed changes nothing.

export type LightMode = 'pointer' | 'orbit' | 'fixed';
export type IdleMode = 'none' | 'sway' | 'float' | 'pendulum' | 'wobble' | 'bounce' | 'glint' | 'spin' | 'turn' | 'breathe' | 'jelly' | 'lean' | 'gyre';
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
  /** Size of the idle motion: 2 sways (bobs, swings…) twice as far, 0 holds the card still. */
  idleAmp: number;
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
  idleAmp: 1,
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
  idleAmp: { min: 0, max: 2, step: 0.05 },
};

export const LIGHT_MODES: LightMode[] = ['pointer', 'orbit', 'fixed'];
export const IDLE_MODES: IdleMode[] = ['none', 'sway', 'float', 'pendulum', 'wobble', 'bounce', 'glint', 'spin', 'turn', 'breathe', 'jelly', 'lean', 'gyre'];
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

/** Motions that repeat sooner than the idle cycle, in idle seconds (each divides IDLE_CYCLE). */
const IDLE_PERIOD: Partial<Record<IdleMode, number>> = { jelly: 3, lean: 3, gyre: 3 };

/**
 * Idle seconds an exported loop covers: one repeat of the motion, or the whole idle cycle when an
 * orbiting light or Blacklight's drifting lamp (`torch`) has to come round too.
 */
export function loopCycle(t: Tune, torch = false): number {
  return t.light === 'orbit' || torch ? IDLE_CYCLE : (IDLE_PERIOD[t.idle] ?? IDLE_CYCLE);
}

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

/** The idle motion `s` idle seconds in. Periodic in loopCycle (spin and turn add whole turns). */
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
    case 'jelly': {
      // Balatro's hand card, flicked from one lean to the other: it overshoots and bounces like
      // jelly (a loose underdamped spring), squashing as it goes, and the bounce has barely died
      // down before the next flick. It sways a little all the while, so it never quite stops.
      const half = IDLE_PERIOD.jelly! / 2;
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
      const f = (Math.PI * 2 * s) / IDLE_PERIOD.jelly!;
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
      const half = IDLE_PERIOD.lean! / 2;
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
    case 'gyre': {
      // The face circles a wide ellipse (one way round, never through flat), so the glare travels
      // round the face, edge to edge; the card's middle drifts against it like a plate settling on a table.
      const g = (Math.PI * 2 * s) / IDLE_PERIOD.gyre!;
      p.ry = Math.cos(g) * 0.26;
      p.rx = Math.sin(g) * 0.17;
      p.rz = Math.sin(g) * 0.02;
      p.dx = -Math.cos(g) * 0.01;
      p.dy = -Math.sin(g) * 0.008;
      p.sheen = [Math.cos(g) * 0.4, Math.sin(g) * 0.7];
      break;
    }
  }
  const k = t.idleAmp;
  if (k !== 1) {
    // How far it moves, not how long it takes: a turn still goes all the way round.
    p.dx *= k;
    p.dy *= k;
    p.rx *= k;
    p.ry *= k;
    p.rz *= k;
    p.scale = 1 + (p.scale - 1) * k;
    p.sheen = [p.sheen[0] * k, p.sheen[1] * k];
    p.flash *= k;
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
 * Length of an exported loop and the source time it covers. With the stage's motion it is one idle cycle at the tune's
 * speed; an animated picture plays a whole number of its own loops inside it, sped up or slowed
 * a little to fit. At speed zero nothing moves on its own, so the picture alone sets the loop:
 * short ones play whole cycles, long ones are sped up to fit six seconds.
 */
export function exportLoop(t: Tune, sourceMs?: number, motion: ExportMotion = 'stage'): { loopMs: number; sourceSpan: number } {
  // The motions made for exports keep their own length, as v0.12's export did.
  if (motion !== 'stage') return sourceLoop(sourceMs, SHOW_MS[motion]);
  if (t.speed <= 0) return sourceLoop(sourceMs, 2400);
  const loopMs = Math.round((IDLE_CYCLE * 1000) / t.speed);
  return { loopMs, sourceSpan: sourceMs ? sourceMs * Math.max(1, Math.round(loopMs / sourceMs)) : loopMs };
}

// ---------- Export-only motions ----------

/**
 * The motion of an exported loop: the stage's own ('stage', the default), or one made only for
 * exports to show the foil off: Showcase (the orbit FOIL exported up to v0.12), Sweep, Figure-8
 * and Moment.
 */
export type ExportMotion = 'stage' | 'showcase' | 'sweep' | 'figure8' | 'moment';
export const EXPORT_MOTIONS: ExportMotion[] = ['stage', 'showcase', 'sweep', 'figure8', 'moment'];

export interface ExportView extends LoopView {
  /** Showcase's own drop shadow, in px of a 900 px tall frame; the stage's shadow when absent. */
  shadow?: [number, number];
  /** Blacklight's lamp, in turns into its sweep; drifting as on the stage when absent. */
  torch?: number;
}

/** Loop length of the motions made for exports at speed 1 (Showcase repeats round(speed) times in its 2.4 s). */
const SHOW_MS: Record<Exclude<ExportMotion, 'stage'>, number> = { showcase: 2400, sweep: 2400, figure8: 3000, moment: 3000 };

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

/** The card at loop position p∈[0,1) of an exported loop with the given motion. */
export function exportView(t: Tune, m: ExportMotion, p: number): ExportView {
  if (m === 'stage') return loopView(t, p);
  if (m === 'showcase') return showcase(t, p);
  return foilShow(m, t, p);
}

/**
 * The v0.12 loop for an animated source: short sources play whole cycles, long ones are sped up
 * to fit six seconds; without one, `fallbackMs`.
 */
function sourceLoop(sourceMs: number | undefined, fallbackMs: number): { loopMs: number; sourceSpan: number } {
  if (!sourceMs) return { loopMs: fallbackMs, sourceSpan: fallbackMs };
  const loopMs = Math.min(sourceMs * Math.ceil(1200 / sourceMs), 6000);
  return { loopMs, sourceSpan: sourceMs > 6000 ? sourceMs : loopMs };
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
 * by, so the stage left alone shows exactly the exported loop at `idleTime / loopCycle`.
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
