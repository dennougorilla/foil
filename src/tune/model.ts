// Fine-tuning for light and motion. Shared by every finish, the live stage and the exporters.
// The defaults reproduce the look FOIL had before these controls existed, so leaving the
// "More" drawer closed changes nothing.

export type LightMode = 'pointer' | 'orbit' | 'fixed';
export type IdleMode =
  | 'none'
  | 'sway'
  | 'float'
  | 'pendulum'
  | 'breathe'
  | 'gyre'
  | 'lean'
  | 'jelly'
  | 'figure8'
  | 'wobble'
  | 'spin'
  | 'sweep'
  | 'beam'
  | 'spotlight'
  | 'flare'
  | 'reveal'
  | 'push'
  | 'pulse'
  | 'glint'
  | 'turn'
  | 'bounce';
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
  /** Size of the motion: 2 moves the card (and the light it steers) twice as far, 0 holds it still. */
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
export const METALS: Metal[] = ['gold', 'silver'];

export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

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

// ---------- Motion (the stage and exported loops) ----------
// One list of motions drives both: the card left alone on the stage is the preview of its GIF or
// APNG (docs/motion.md). Sway, the default, is here; the others arrive with moves.ts.

/**
 * Idle seconds in which every motion, the orbiting light and Blacklight's drifting lamp come round
 * together: each motion's own loop (PERIOD) divides it. The idle clock runs at the tune's speed.
 */
export const IDLE_CYCLE = 6;
const W = (Math.PI * 2) / IDLE_CYCLE;

export type MotionGroup = 'gentle' | 'tilt' | 'light' | 'show';

/** The motions in the order the tray and the Shine tab show them, None aside. */
export const MOTION_GROUPS: { id: MotionGroup; motions: IdleMode[] }[] = [
  { id: 'gentle', motions: ['sway', 'float', 'pendulum', 'breathe'] },
  { id: 'tilt', motions: ['gyre', 'lean', 'jelly', 'figure8', 'wobble', 'spin'] },
  { id: 'light', motions: ['sweep', 'beam', 'spotlight', 'flare'] },
  { id: 'show', motions: ['reveal', 'push', 'pulse', 'glint', 'turn', 'bounce'] },
];
export const IDLE_MODES: IdleMode[] = ['none', ...MOTION_GROUPS.flatMap((g) => g.motions)];
/** The order the tiles show in (and arrow keys walk): the groups in turn, None closing the first row. */
export const MOTION_ORDER: IdleMode[] = MOTION_GROUPS.flatMap((g, i) => (i ? g.motions : [...g.motions, 'none']));

/** Idle seconds of one loop of each motion: the length of its GIF at speed 1. */
export const PERIOD: Record<IdleMode, number> = {
  none: 6,
  sway: 6,
  float: 6,
  pendulum: 3,
  breathe: 6,
  gyre: 3,
  lean: 3,
  jelly: 3,
  figure8: 3,
  wobble: 6,
  spin: 6,
  sweep: 3,
  beam: 3,
  spotlight: 3,
  flare: 2,
  reveal: 3,
  push: 3,
  pulse: 2,
  glint: 3,
  turn: 6,
  bounce: 6,
};

/** The Light motions bring their own light, whatever the light setting. */
export const OWN_LIGHT: ReadonlySet<IdleMode> = new Set<IdleMode>(MOTION_GROUPS.find((g) => g.id === 'light')!.motions);
/** Motions that turn the card round; pointed at, it comes round to its face and waits. */
const TURNING: ReadonlySet<IdleMode> = new Set<IdleMode>(['spin', 'turn', 'reveal']);

/** A motion picked for exports in v0.13.0 (its saved `exportMotion`) as the card's motion; null for "As on screen". */
export function legacyMotion(raw: unknown): IdleMode | null {
  if (raw === 'showcase') return 'gyre';
  if (raw === 'moment') return 'glint';
  return raw !== 'none' && IDLE_MODES.includes(raw as IdleMode) ? (raw as IdleMode) : null;
}

/** The card's automatic motion at one moment: offsets in card heights, angles in radians. */
export interface IdlePose {
  dx: number;
  dy: number;
  rx: number;
  ry: number;
  rz: number;
  scale: number;
  /** Turntable angle of a turning motion, added on top of everything else. */
  spin: number;
  /** Extra sheen travel, in the same -1..1 units as the shader's tilt. */
  sheen: [number, number];
  /** A short white flash: a bounce landing. */
  flash: number;
  /** A streak of light crossing the face (see CardDraw.glint), below -1 when none. */
  glint: number;
  /** Where the light sits while nobody points at the card (card uv); opposite the lean when absent. */
  light?: [number, number];
  /** A band of light across the face (see CardDraw.beam): place, width, angle, power. */
  beam?: [number, number, number, number];
  /** A round spot of light centred on the light (see CardDraw.spot): radius, power. */
  spot?: [number, number];
  /** How far the face and the backdrop fall into shade away from the band or spot, 0..1. */
  dim?: number;
  /** A pixel star twinkling on the face (see CardDraw.star): x, y in card uv, power. */
  star?: [number, number, number];
}

export const REST_POSE: IdlePose = { dx: 0, dy: 0, rx: 0, ry: 0, rz: 0, scale: 1, spin: 0, sheen: [0, 0], flash: 0, glint: -2 };

export const smooth = (u: number) => u * u * (3 - 2 * u);
export const frac = (v: number) => v - Math.floor(v);

/** One motion: its pose `s` idle seconds in, for a loop of `P` idle seconds. */
export type Move = (s: number, P: number) => IdlePose;

const sway: Move = (s) => {
  const a = W * s;
  return {
    ...REST_POSE,
    dy: Math.sin(a) * 0.012,
    rz: Math.sin(a + 0.9) * 0.022,
    rx: Math.sin(a + 2) * 0.05,
    ry: Math.cos(a) * 0.07 + Math.sin(2 * a) * 0.015,
    sheen: [Math.sin(a + 0.4) * 0.3, Math.cos(a + 1.1) * 0.3],
  };
};

const MOVES: Partial<Record<IdleMode, Move>> = { sway };
/** moves.ts hands its motions over here when it arrives. */
export const addMoves = (m: Partial<Record<IdleMode, Move>>) => void Object.assign(MOVES, m);
/** Whether the motion can be drawn yet (the card rests until it can). */
export const hasMove = (m: IdleMode) => m === 'none' || !!MOVES[m];
let moving: Promise<unknown> | null = null;
/** Fetches every motion but Sway (once). */
export function loadMoves(): Promise<unknown> {
  moving ??= import('./moves.ts');
  moving.catch(() => (moving = null));
  return moving;
}

/** Where the Size setting draws the light in to, at zero. */
const LIGHT_HOME: [number, number] = [0.5, 0.42];

/** The motion `s` idle seconds in, at the tune's size. Periodic in PERIOD (a turn adds whole turns). */
export function idlePose(t: Tune, s: number): IdlePose {
  const move = MOVES[t.idle];
  const p: IdlePose = move ? move(s, PERIOD[t.idle]) : { ...REST_POSE, sheen: [0, 0] };
  const k = t.idleAmp;
  if (k === 1) return p;
  // How far it moves (the card, and the light it steers), not how long it takes: a turn still goes all the way round.
  return {
    ...p,
    dx: p.dx * k,
    dy: p.dy * k,
    rx: p.rx * k,
    ry: p.ry * k,
    rz: p.rz * k,
    scale: 1 + (p.scale - 1) * k,
    sheen: [p.sheen[0] * k, p.sheen[1] * k],
    flash: p.flash * k,
    light: p.light && [LIGHT_HOME[0] + (p.light[0] - LIGHT_HOME[0]) * k, LIGHT_HOME[1] + (p.light[1] - LIGHT_HOME[1]) * k],
    beam: p.beam && [p.beam[0] * k, p.beam[1], p.beam[2], p.beam[3]],
  };
}

/** Idle seconds of one exported loop: the motion's own, or the whole cycle while the orbiting light or Blacklight's lamp goes round. */
export const loopCycle = (t: Tune, torch = false) => (torch || orbits(t) ? IDLE_CYCLE : PERIOD[t.idle]);

/** Where a turning motion next faces the viewer, in idle seconds; `s` itself when it already does. */
export function facingAt(t: Tune, s: number): number {
  if (!TURNING.has(t.idle)) return s;
  const turned = idlePose(t, s).spin / (Math.PI * 2);
  if (Math.abs(turned - Math.round(turned)) < 1e-6) return s;
  const P = PERIOD[t.idle];
  return Math.ceil(s / P) * P;
}

/** Position of the orbiting light in card uv, `s` idle seconds in. */
export const orbitLight = (s: number): [number, number] => [0.5 + Math.cos(W * s) * 0.34, 0.5 + Math.sin(W * s) * 0.36];

/** The light setting's orbit is on (the Light motions bring their own light instead). */
const orbits = (t: Tune) => t.light === 'orbit' && !OWN_LIGHT.has(t.idle);

/**
 * The sheen the card shows, from its rotation (`rx`, `ry`, spin left out), the motion's own
 * sheen and an orbiting light's.
 */
export function cardTilt(t: Tune, s: number, pose: IdlePose, rx: number, ry: number): [number, number] {
  const orbit = orbits(t) ? [Math.cos(W * s) * 0.6, Math.sin(W * s) * 0.6] : [0, 0];
  return [ry / 0.32 + pose.sheen[0] + orbit[0], rx / 0.28 + pose.sheen[1] + orbit[1]];
}

/** How dark a Light motion's dim room makes the backdrop behind the card (0..1 black), on the stage and in a file. */
export const roomShade = (dim: number) => Math.min(0.88, dim * 1.15);

/** Where the light sits when nobody points at the card: opposite the way it leans. */
export const restLight = (tilt: [number, number]): [number, number] => [0.5 - tilt[0] * 0.35, 0.4 - tilt[1] * 0.3];

/**
 * The light on the card `s` idle seconds in. `hand` is where a pointer or finger on the card puts it
 * (null in a file, and on the stage while nobody touches the card). A fixed or orbiting light keeps
 * to the setting, except under the Light motions, which bring their own.
 */
export function lightAt(t: Tune, s: number, pose: IdlePose, tilt: [number, number], hand: [number, number] | null): [number, number] {
  if (!OWN_LIGHT.has(t.idle)) {
    if (t.light === 'fixed') return fixedLight(t.lightAngle);
    if (t.light === 'orbit') return orbitLight(s);
  }
  return hand ?? pose.light ?? restLight(tilt);
}

// ---------- Exported loops ----------

export interface LoopView {
  /** Idle seconds into the motion. */
  s: number;
  pose: IdlePose;
  tilt: [number, number];
  light: [number, number];
}

/** The card at loop position p∈[0,1) of a GIF or APNG: the stage left alone, one loop long. */
export function loopView(t: Tune, p: number, torch = false): LoopView {
  const s = t.speed > 0 ? p * loopCycle(t, torch) : 0;
  const pose = idlePose(t, s);
  const tilt = cardTilt(t, s, pose, pose.rx, pose.ry);
  return { s, pose, tilt, light: lightAt(t, s, pose, tilt, null) };
}

/**
 * Length of an exported loop and the source time it covers: one loop of the motion at the tune's
 * speed. An animated picture plays a whole number of its own loops inside it, sped up or slowed a
 * little to fit. At speed zero nothing moves on its own, so the picture alone sets the loop: short
 * ones play whole cycles, long ones are sped up to fit six seconds.
 */
export function exportLoop(t: Tune, sourceMs?: number, torch = false): { loopMs: number; sourceSpan: number } {
  if (t.speed <= 0) {
    if (!sourceMs) return { loopMs: 2400, sourceSpan: 2400 };
    const loopMs = Math.min(sourceMs * Math.ceil(1200 / sourceMs), 6000);
    return { loopMs, sourceSpan: sourceMs > 6000 ? sourceMs : loopMs };
  }
  const loopMs = Math.round((loopCycle(t, torch) * 1000) / t.speed);
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
 * by, so the stage left alone shows exactly the exported loop at `idleTime / loopCycle`.
 */
export class IdleClock {
  idleTime = 0;
  /** Turntable angle of a turning motion right now (0 when the motion does not turn). */
  spinAngle = 0;
  /** How much of the motion shows: it eases out while the card is held and back in after. */
  private weight = 1;

  /**
   * `still` is reduced motion: nothing moves on its own. `facing` (the pointer is on the card) brings
   * a turning card round to its face and keeps it there. `held` (dragged, or held flat for the
   * brush) also faces it, and eases the motion out until it is let go.
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
    } else if (!held && !(facing && face === this.idleTime && TURNING.has(t.idle))) {
      this.idleTime += dt * t.speed;
    }
    this.spinAngle = idlePose(t, this.idleTime).spin;
  }

  /** The motion now. */
  pose(t: Tune): IdlePose {
    const p = idlePose(t, this.idleTime);
    const w = this.weight;
    if (w === 1) return p;
    return {
      ...p,
      dx: p.dx * w,
      dy: p.dy * w,
      rx: p.rx * w,
      ry: p.ry * w,
      rz: p.rz * w,
      scale: 1 + (p.scale - 1) * w,
      sheen: [p.sheen[0] * w, p.sheen[1] * w],
      flash: p.flash * w,
      glint: w > 0.5 ? p.glint : -2,
      beam: p.beam && [p.beam[0], p.beam[1], p.beam[2], p.beam[3] * w],
      spot: p.spot && [p.spot[0], p.spot[1] * w],
      dim: p.dim && p.dim * w,
      star: p.star && [p.star[0], p.star[1], p.star[2] * w],
    };
  }

  /** The sheen for a card turned by `rx`, `ry` (spin left out) with this pose. */
  tilt = (t: Tune, pose: IdlePose, rx: number, ry: number) => cardTilt(t, this.idleTime, pose, rx, ry);

  /** Light position in card uv; `hand` is where a pointer on the card puts it (see lightAt). */
  light = (t: Tune, pose: IdlePose, tilt: [number, number], hand: [number, number] | null) => lightAt(t, this.idleTime, pose, tilt, hand);
}
