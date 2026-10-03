// Fine-tuning for light and motion. Shared by every finish, the live stage and the exporters.
// The defaults reproduce the look FOIL had before these controls existed, so leaving the
// "More" drawer closed changes nothing.

export type LightMode = 'pointer' | 'orbit' | 'fixed';
export type IdleMode = 'none' | 'sway' | 'spin' | 'breathe';
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
export const IDLE_MODES: IdleMode[] = ['none', 'sway', 'spin', 'breathe'];
export const METALS: Metal[] = ['gold', 'silver'];

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** Fills gaps and drops nonsense from a saved tune, so older or hand-edited storage still loads. */
export function sanitizeTune(raw: unknown): Tune {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out = { ...TUNE_DEFAULTS };
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

// ---------- Exported clips ----------

export interface LoopPose {
  rx: number;
  ry: number;
  rz: number;
  /** Vertical bob in px of a 900px-tall frame. */
  dy: number;
  scale: number;
  tilt: [number, number];
  light: [number, number];
}

const smooth = (u: number) => u * u * (3 - 2 * u);

/**
 * One full turn per 2π of `a`, holding on each face and flipping quickly between them. A
 * weightless card vanishes edge-on, so poses within ~17° of edge-on are skipped: at flip speed
 * the jump is invisible, and no exported frame ever comes out empty.
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

/** How many motion cycles fit in one loop: whole numbers only, so the clip loops seamlessly. */
export const loopCycles = (t: Tune) => (t.speed <= 0 ? 0 : Math.max(1, Math.round(t.speed)));

/**
 * The card's pose at loop position p∈[0,1) for GIF and video. With the defaults this is the
 * orbit FOIL always exported: one gentle sway with the light sweeping round.
 */
export function loopPose(t: Tune, p: number): LoopPose {
  const a = p * Math.PI * 2 * loopCycles(t);
  const k = t.tiltMax / TUNE_DEFAULTS.tiltMax;
  let rx = 0;
  let ry = 0;
  let rz = 0;
  let dy = 0;
  let scale = 1;
  if (t.idle === 'sway') {
    rx = Math.sin(a) * 0.22 * k;
    ry = Math.cos(a) * 0.3 * k;
    rz = Math.sin(a) * 0.03;
    dy = Math.sin(a * 2) * 8;
  } else if (t.idle === 'spin') {
    // Hold on the face, flip to the back, hold, flip home.
    ry = flipTurn(a);
    rx = Math.sin(a) * 0.08 * k;
  } else if (t.idle === 'breathe') {
    scale = 1 + Math.sin(a) * 0.035;
    rx = Math.sin(a) * 0.06 * k;
    dy = -Math.sin(a) * 6;
  }
  // The sheen keeps sweeping even when the card holds still, so a clip never looks frozen.
  // It follows the sway's own path, independent of the tilt limit.
  let tilt: [number, number] =
    t.idle === 'sway'
      ? [(Math.cos(a) * 0.3) / 0.32, (Math.sin(a) * 0.22) / 0.28]
      : [Math.cos(a) * 0.9, Math.sin(a) * 0.9];
  let light: [number, number] = [0.5 - Math.cos(a) * 0.3, 0.4 - Math.sin(a) * 0.25];
  if (t.light === 'orbit') light = [0.5 + Math.cos(a) * 0.34, 0.5 + Math.sin(a) * 0.36];
  else if (t.light === 'fixed') light = fixedLight(t.lightAngle);
  if (t.speed <= 0) {
    // Speed zero: a still card with its light where the stage would show it.
    tilt = [0.35, -0.25];
    light = t.light === 'fixed' ? fixedLight(t.lightAngle) : [0.32, 0.22];
  }
  return { rx, ry, rz, dy, scale, tilt, light };
}
