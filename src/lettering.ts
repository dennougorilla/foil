// Lettering finishes: how the card's name is printed — plain ink, debossed,
// embossed, hot-foil stamped or spot-UV varnished.
//
// The face canvas still carries the name's colour. Alongside it this module
// keeps a "lettering map" the size of the face (r: glyph coverage, g: a softened
// height field) that the card shader turns into normals, so the relief and the
// metal catch the same light and tilt as the rest of the card — on screen and
// in every export.

import { createTexture, hexToRgb, uploadTexture, type Program } from './gl/gl';

export type LetterStyle = 'ink' | 'deboss' | 'emboss' | 'foil' | 'spot';
export type FoilTone = 'gold' | 'silver' | 'rose' | 'copper' | 'rainbow' | 'custom';
/** 'auto' follows the frame's own ink; 'none' prints no ink at all (blind press, clear varnish). */
export type LetterInk = 'auto' | 'none' | `#${string}`;

export interface Lettering {
  style: LetterStyle;
  ink: LetterInk;
  foil: FoilTone;
  /** Used when foil is 'custom'. */
  foilColor: string;
  /** Relief height / press depth, 0..1. */
  depth: number;
  /** How glossy the raised or stamped surface is, 0..1. */
  gloss: number;
}

export const LETTER_STYLES: LetterStyle[] = ['ink', 'deboss', 'emboss', 'foil', 'spot'];
export const FOIL_TONES: FoilTone[] = ['gold', 'silver', 'rose', 'copper', 'rainbow', 'custom'];

export const DEFAULT_LETTERING: Lettering = {
  style: 'ink',
  ink: 'auto',
  foil: 'gold',
  foilColor: '#7fd6ff',
  depth: 0.55,
  gloss: 0.7,
};

/** Shadow and highlight tones of each foil. Rainbow is drawn in the shader. */
export const FOIL_RAMP: Record<Exclude<FoilTone, 'custom'>, [string, string]> = {
  gold: ['#5c3405', '#ffd76e'],
  silver: ['#3d464e', '#f4f7fa'],
  rose: ['#7a3c40', '#ffc6b8'],
  copper: ['#5e2810', '#ffa86a'],
  rainbow: ['#5a4a8a', '#f2f0ff'],
};

const HEX = /^#[0-9a-f]{6}$/i;
const clamp01 = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : d);

/** Accepts anything (old saves, hand-edited storage) and returns a valid lettering. */
export function normalizeLettering(x: unknown): Lettering {
  const o = (x && typeof x === 'object' ? x : {}) as Partial<Record<keyof Lettering, unknown>>;
  const d = DEFAULT_LETTERING;
  return {
    style: LETTER_STYLES.includes(o.style as LetterStyle) ? (o.style as LetterStyle) : d.style,
    ink: o.ink === 'auto' || o.ink === 'none' || (typeof o.ink === 'string' && HEX.test(o.ink)) ? (o.ink as LetterInk) : d.ink,
    foil: FOIL_TONES.includes(o.foil as FoilTone) ? (o.foil as FoilTone) : d.foil,
    foilColor: typeof o.foilColor === 'string' && HEX.test(o.foilColor) ? o.foilColor : d.foilColor,
    depth: clamp01(o.depth, d.depth),
    gloss: clamp01(o.gloss, d.gloss),
  };
}

/** Which tuning controls make sense for a style. */
export const STYLE_CONTROLS: Record<LetterStyle, { ink: boolean; blind: boolean; foil: boolean; depth: boolean; gloss: boolean }> = {
  ink: { ink: true, blind: false, foil: false, depth: false, gloss: false },
  deboss: { ink: true, blind: true, foil: false, depth: true, gloss: false },
  emboss: { ink: true, blind: true, foil: false, depth: true, gloss: true },
  foil: { ink: false, blind: false, foil: true, depth: true, gloss: true },
  spot: { ink: true, blind: true, foil: false, depth: true, gloss: true },
};

function mixHex(a: string, b: string, k: number): string {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  const c = A.map((v, i) => Math.round((v + (B[i] - v) * k) * 255));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Shadow / highlight pair for the chosen foil. */
export function foilRamp(l: Lettering): [string, string] {
  if (l.foil !== 'custom') return FOIL_RAMP[l.foil];
  return [mixHex(l.foilColor, '#000000', 0.55), mixHex(l.foilColor, '#ffffff', 0.6)];
}

/** The flat colour the name gets on the face canvas (what you'd see with no light at all). */
export function letterFill(l: Lettering, frameInk: string): string | null {
  if (l.style === 'foil') {
    const [lo, hi] = foilRamp(l);
    return mixHex(lo, hi, 0.55);
  }
  if (l.ink === 'auto' || (l.ink === 'none' && !STYLE_CONTROLS[l.style].blind)) return frameInk;
  return l.ink === 'none' ? null : l.ink;
}

// ---------- Active finish ----------
// One finish is active at a time; the face painter and every renderer (live
// stage and exporters alike) read it, so exports always match the preview.

let active: Lettering = { ...DEFAULT_LETTERING };
export const setLettering = (l: Lettering) => (active = l);
export const getLettering = () => active;

// ---------- Per piece of text ----------
// Each piece (the name, the type line, the message) is printed in the card's
// lettering unless it has its own print: only the style and the foil colour,
// so depth, gloss and ink stay shared and the panel stays one set of controls.

export type TextField = 'name' | 'type' | 'message';
export const TEXT_FIELDS: TextField[] = ['name', 'type', 'message'];
export interface FieldPrint {
  style: LetterStyle;
  foil: FoilTone;
}
/** Only the pieces with their own print; the rest follow the card's lettering. */
export type FieldPrints = Partial<Record<TextField, FieldPrint>>;

/** Accepts anything stored and keeps only valid prints of known pieces. */
export function normalizeFieldPrints(x: unknown): FieldPrints {
  const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
  const out: FieldPrints = {};
  for (const f of TEXT_FIELDS) {
    const v = o[f] as Partial<FieldPrint> | undefined;
    if (v && LETTER_STYLES.includes(v.style as LetterStyle) && FOIL_TONES.includes(v.foil as FoilTone)) out[f] = { style: v.style!, foil: v.foil! };
  }
  return out;
}

let prints: FieldPrints = {};
export const setFieldPrints = (p: FieldPrints) => (prints = p);
/** The lettering a piece of text is printed in: the card's, with its own style and foil if it has them. */
export function letteringOf(f: TextField): Lettering {
  const own = prints[f];
  return own ? { ...active, style: own.style, foil: own.foil } : active;
}

// ---------- Lettering map ----------

// Sized to the face on first paint (card/face imports this module, so no size constants here).
const map = document.createElement('canvas');
const mapCtx = map.getContext('2d', { willReadFrequently: true })!;
const glyphs = document.createElement('canvas');
const glyphCtx = glyphs.getContext('2d', { willReadFrequently: true })!;
let mapKey = '';
let mapVersion = 0;
/** Bevel radius in face pixels; the shader needs it to scale slopes. */
let bevel = 1;
/** How far the deboss/emboss plate reaches past the ink, plus its bevel, in face pixels. */
let plateBevel = 1;
/** Centre of the printed text in face uv (y down): the message when there is one, else the name. */
let textCenter: [number, number] = [0.3, 0.94];
/** Left and right edge of all the printed text in face uv. */
let textSpan: [number, number] = [0.1, 0.5];
/** A row of bare stock just above the name, in face uv, for foil not yet laid. */
let stockY = 2;
/** The piece of text the still pose aims at (the message when there is one). */
let hero: TextField = 'name';
/** Each piece's box in the map (x0, y0, x1, y1 in uv; off the face when it has no text), in TEXT_FIELDS order. */
const fieldBoxes = new Float32Array(12).fill(-1);

// ---------- Stamp moment ----------
// Picking a style presses the die once: relief overshoots and settles, and foil
// is laid down left to right behind a bright sweep.

const STAMP_MS = 560;
let stampAt = -Infinity;
/** Plays the stamp on the live card (skipped when motion is reduced). */
export function stamp(): void {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  stampAt = performance.now();
}

/** Grows a coverage mask by r texels (a square max filter, separable). */
function dilate(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let m = 0;
      for (let i = Math.max(0, x - r); i <= Math.min(w - 1, x + r); i++) m = Math.max(m, src[y * w + i]);
      tmp[y * w + x] = m;
    }
  for (let x = 0; x < w; x++)
    for (let y = 0; y < h; y++) {
      let m = 0;
      for (let i = Math.max(0, y - r); i <= Math.min(h - 1, y + r); i++) m = Math.max(m, tmp[i * w + x]);
      out[y * w + x] = m;
    }
  return out;
}

/** Separable box blur, run three times: close to a Gaussian, and works where ctx.filter doesn't (Safari). */
function blur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  // Work on a copy: the passes ping-pong between two buffers, and the caller still needs src.
  let a = src.slice();
  let b = new Float32Array(a.length);
  const pass = (from: Float32Array, to: Float32Array, horizontal: boolean) => {
    const n = horizontal ? w : h;
    const lines = horizontal ? h : w;
    const inv = 1 / (r * 2 + 1);
    for (let l = 0; l < lines; l++) {
      const at = (i: number) => (horizontal ? l * w + i : i * w + l);
      let acc = 0;
      for (let i = -r; i <= r; i++) acc += from[at(Math.min(n - 1, Math.max(0, i)))];
      for (let i = 0; i < n; i++) {
        to[at(i)] = acc * inv;
        acc += from[at(Math.min(n - 1, i + r + 1))] - from[at(Math.max(0, i - r))];
      }
    }
  };
  for (let k = 0; k < 3; k++) {
    pass(a, b, true);
    pass(b, a, false);
  }
  return a;
}

/** One line of text on the face. `y` is its vertical middle. */
export interface TextRun {
  part: TextField;
  text: string;
  font: string;
  size: number;
  x: number;
  y: number;
  /** The name only: a face row of bare stock just above it (foil sweeps in over it). */
  stock?: number;
  /** A freely placed piece is turned by `rot` radians about (cx, cy); x and y are before the turn. */
  rot?: number;
  cx?: number;
  cy?: number;
}

/** Turns a context about a run's pivot, if it has a turn. */
export function turnFor(ctx: CanvasRenderingContext2D, r: Pick<TextRun, 'rot' | 'cx' | 'cy'>) {
  if (!r.rot) return;
  ctx.translate(r.cx!, r.cy!);
  ctx.rotate(r.rot);
  ctx.translate(-r.cx!, -r.cy!);
}

type Box = { x0: number; y0: number; x1: number; y1: number };

/**
 * Redraws the lettering map from the face's text: each piece (the name, the
 * type line, the message) is worked on in its own box around its glyphs, and
 * the shader prints each box in that piece's own lettering.
 */
function paintMap(W: number, H: number, runs: TextRun[], radius: number) {
  const key = JSON.stringify([W, H, radius, runs]);
  if (key === mapKey) return;
  mapKey = key;
  if (map.width !== W || map.height !== H) {
    map.width = glyphs.width = W;
    map.height = glyphs.height = H;
  }
  bevel = radius;
  plateBevel = radius * 1.6;
  mapCtx.fillStyle = '#000';
  mapCtx.fillRect(0, 0, W, H);
  glyphCtx.clearRect(0, 0, W, H);
  glyphCtx.textBaseline = 'middle';
  glyphCtx.fillStyle = '#fff';
  const pad = radius * 5 + 2;
  const parts = new Map<TextField, Box>();
  for (const r of runs) {
    glyphCtx.font = r.font;
    glyphCtx.save();
    turnFor(glyphCtx, r);
    glyphCtx.fillText(r.text, r.x, r.y);
    glyphCtx.restore();
    const w = glyphCtx.measureText(r.text).width;
    let b = { x0: r.x, y0: r.y - r.size * 0.75, x1: r.x + w, y1: r.y + r.size * 0.75 };
    if (r.rot) {
      // The box that holds the turned line.
      const c = Math.cos(r.rot);
      const s = Math.sin(r.rot);
      const pts = [
        [b.x0, b.y0],
        [b.x1, b.y0],
        [b.x0, b.y1],
        [b.x1, b.y1],
      ].map(([x, y]) => [r.cx! + (x - r.cx!) * c - (y - r.cy!) * s, r.cy! + (x - r.cx!) * s + (y - r.cy!) * c]);
      b = { x0: Math.min(...pts.map((q) => q[0])), y0: Math.min(...pts.map((q) => q[1])), x1: Math.max(...pts.map((q) => q[0])), y1: Math.max(...pts.map((q) => q[1])) };
    }
    const p = parts.get(r.part);
    parts.set(r.part, p ? { x0: Math.min(p.x0, b.x0), y0: Math.min(p.y0, b.y0), x1: Math.max(p.x1, b.x1), y1: Math.max(p.y1, b.y1) } : b);
  }
  hero = parts.has('message') ? 'message' : 'name';
  const aim = parts.get(hero);
  const all = [...parts.values()];
  if (aim) textCenter = [(aim.x0 + aim.x1) / 2 / W, (aim.y0 + aim.y1) / 2 / H];
  if (all.length) textSpan = [Math.min(...all.map((b) => b.x0)) / W, Math.max(...all.map((b) => b.x1)) / W];
  const stock = runs.find((r) => r.stock !== undefined)?.stock;
  stockY = stock === undefined ? 2 : stock / H;
  fieldBoxes.fill(-1);
  TEXT_FIELDS.forEach((f, i) => {
    const b = parts.get(f);
    if (!b) return;
    const rx = Math.max(0, Math.floor(b.x0 - pad));
    const ry = Math.max(0, Math.floor(b.y0 - pad));
    const rw = Math.min(W - rx, Math.ceil(b.x1 - b.x0 + pad * 2));
    const rh = Math.min(H - ry, Math.ceil(b.y1 - b.y0 + pad * 2));
    if (rw <= 0 || rh <= 0) return;
    paintBox(rx, ry, rw, rh, radius);
    fieldBoxes.set([rx / W, ry / H, (rx + rw) / W, (ry + rh) / H], i * 4);
  });
  mapVersion++;
}

/** Coverage, softened height and the press plate of one box of the glyph canvas, into the map. */
function paintBox(rx: number, ry: number, rw: number, rh: number, radius: number) {
  const src = glyphCtx.getImageData(rx, ry, rw, rh).data;
  const cover = new Float32Array(rw * rh);
  for (let i = 0; i < cover.length; i++) cover[i] = src[i * 4 + 3] / 255;
  // Box radius per pass so three passes span roughly the requested bevel.
  const soft = blur(cover, rw, rh, Math.max(1, Math.round(radius / 1.8)));
  // Deboss and emboss dies are a little bigger than the printed letter, as on real
  // cards: the walls land on bare stock, so they read even around dark ink.
  const grow = Math.max(1, Math.round(radius * 1.2));
  const plate = blur(dilate(cover, rw, rh, grow), rw, rh, Math.max(1, Math.round(radius / 1.6)));
  const out = mapCtx.createImageData(rw, rh);
  for (let i = 0; i < cover.length; i++) {
    out.data[i * 4] = Math.round(cover[i] * 255);
    // Lift the softened field so stroke centres reach full height.
    out.data[i * 4 + 1] = Math.round(Math.min(1, soft[i] * 1.3) * 255);
    out.data[i * 4 + 2] = Math.round(Math.min(1, plate[i] * 1.15) * 255);
    out.data[i * 4 + 3] = 255;
  }
  mapCtx.putImageData(out, rx, ry);
}

/** The piece of text at a point of the face (uv), if any: what a tap on the card lands on. */
export function fieldAt([u, v]: [number, number]): TextField | null {
  // A finger is wider than a stroke, and the card is still bouncing from the tap: the nearest
  // piece within a little margin of its words counts.
  let best: TextField | null = null;
  let near = Infinity;
  TEXT_FIELDS.forEach((f, i) => {
    const [x0, y0, x1, y1] = fieldBoxes.subarray(i * 4, i * 4 + 4);
    if (x1 < 0) return;
    const d = Math.hypot(Math.max(x0 - u, 0, u - x1) / 0.12, Math.max(y0 - v, 0, v - y1) / 0.025);
    if (d <= 1 && d < near) {
      near = d;
      best = f;
    }
  });
  return best;
}

/** Paints a piece of text onto the face in its lettering's flat colour. Call with the context's font already set. */
export function paintLettering(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, frameInk: string, field: TextField = 'name'): void {
  const fill = letterFill(letteringOf(field), frameInk);
  ctx.textBaseline = 'middle';
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fillText(text, x, y);
  }
}

/** The name's size at which the bevel was tuned; the message shares the name's bevel. */
const NAME_SIZE = 60;

/**
 * Refreshes the lettering map from the text a face painter laid out (drawFace
 * returns it), so every printed word catches the light and tilt alike.
 */
export function setTextRuns(W: number, H: number, runs: TextRun[]): void {
  const name = runs.find((r) => r.part === 'name');
  // A narrow bevel: the pixel font's strokes are only ~6 texels wide at face size.
  // A die's bevel doesn't grow with its letters, so the message keeps the name's.
  paintMap(W, H, runs, Math.max(1.5, (name?.size ?? NAME_SIZE) * 0.032));
}

/**
 * A still frame (PNG) freezes one light angle. Foil and spot UV only show at the
 * right one, so nudge the frozen tilt until their reflection band crosses the
 * middle of the message (or the name). Mirrors the band phases in the shader below.
 */
export function stillPose(tilt: [number, number], light: [number, number]): { tilt: [number, number]; light: [number, number] } {
  const s = letteringOf(hero).style;
  if (s !== 'foil' && s !== 'spot') return { tilt, light };
  const [cx, cy] = textCenter;
  const ty = tilt[1];
  // spot:  5u + 7v - 1.3 (3.4 tx + 2.2 ty) = pi/2 + 2pi k
  // foil:  9u + 13v + 3.2 tx + 2.4 ty      = pi/2 + 2pi k
  const solve = (k: number) =>
    s === 'spot'
      ? ((5 * cx + 7 * cy - Math.PI / 2 - 2 * Math.PI * k) / 1.3 - 2.2 * ty) / 3.4
      : (Math.PI / 2 + 2 * Math.PI * k - 9 * cx - 13 * cy - 2.4 * ty) / 3.2;
  let best = tilt[0];
  let gap = Infinity;
  for (let k = -6; k <= 6; k++) {
    const tx = solve(k);
    if (Math.abs(tx) <= 0.9 && Math.abs(tx - tilt[0]) < gap) {
      gap = Math.abs(tx - tilt[0]);
      best = tx;
    }
  }
  return { tilt: [best, ty], light };
}

// ---------- GL side ----------

const STYLE_INDEX: Record<LetterStyle, number> = { ink: 0, deboss: 1, emboss: 2, foil: 3, spot: 4 };

/** Owns one renderer's copy of the lettering map and feeds the shader its uniforms. */
export class LetteringGL {
  private tex: WebGLTexture;
  private version = -1;

  /** `settled` (exports) always draws the lettering at rest, never mid-stamp. */
  constructor(private gl: WebGL2RenderingContext, private settled = false) {
    this.tex = createTexture(gl, true);
  }

  bind(p: Program, unit: number): void {
    const { gl } = this;
    gl.activeTexture(gl.TEXTURE0 + unit);
    if (this.version !== mapVersion) {
      uploadTexture(gl, this.tex, map, true);
      this.version = mapVersion;
    } else {
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
    }
    const l = active;
    gl.uniform1i(p.u.uTextMap, unit);
    // With no ink the die is the letter itself, so counters (the holes in a, e, o) stay open.
    const blind = l.ink === 'none';
    const each = TEXT_FIELDS.map(letteringOf);
    gl.uniform4fv(p.u.uTextBox, fieldBoxes);
    gl.uniform1iv(p.u.uTextStyles, each.map((f) => STYLE_INDEX[f.style]));
    gl.uniform3fv(p.u.uTextLos, each.flatMap((f) => hexToRgb(foilRamp(f)[0])));
    gl.uniform3fv(p.u.uTextHis, each.flatMap((f) => hexToRgb(foilRamp(f)[1])));
    gl.uniform1fv(p.u.uTextRainbows, each.map((f) => (f.style === 'foil' && f.foil === 'rainbow' ? 1 : 0)));
    gl.uniform1fv(p.u.uTextBevels, each.map((f) => ((f.style === 'deboss' || f.style === 'emboss') && !blind ? plateBevel : bevel)));
    gl.uniform1f(p.u.uTextDepth, l.depth);
    gl.uniform1f(p.u.uTextGloss, l.gloss);
    gl.uniform1f(p.u.uTextBlind, blind ? 1 : 0);
    gl.uniform1f(p.u.uTextStamp, this.settled ? 1 : Math.min(1, (performance.now() - stampAt) / STAMP_MS));
    gl.uniform2f(p.u.uTextSpan, textSpan[0], textSpan[1]);
    // Bare stock just above the name, for foil that hasn't been laid down yet.
    gl.uniform1f(p.u.uTextStockY, stockY);
  }
}

/** Card-shader chunk. Expects COMMON helpers and the card uniforms (uLight, uPlate, uTime) above it. */
export const LETTERING_GLSL = /* glsl */ `
uniform sampler2D uTextMap;  // r: glyph coverage, g: softened height, b: deboss/emboss plate
// Per piece of text (name, type line, message): its box in uv (x0, y0, x1, y1) and its print.
uniform vec4 uTextBox[3];
uniform int uTextStyles[3];  // 0 ink, 1 deboss, 2 emboss, 3 foil stamp, 4 spot UV
uniform vec3 uTextLos[3], uTextHis[3];
uniform float uTextRainbows[3];
uniform float uTextBevels[3]; // bevel radius in map texels
uniform float uTextDepth;
uniform float uTextGloss;
uniform float uTextStamp;    // 0..1 progress of the stamp moment; 1 = at rest
uniform vec2 uTextSpan;      // the text's left and right edge in uv
uniform float uTextStockY;   // a row of bare stock just above the name
uniform float uTextBlind;    // 1 = no ink: presses use the letter itself as the die

float letterLod;  // set per pixel in lettering()
// The print of the piece of text under this pixel, set in lettering().
int tStyle;
vec3 tLo, tHi;
float tRainbow, tBevel;
int textField(vec2 uv) {
  for (int i = 0; i < 3; i++) {
    vec4 b = uTextBox[i];
    if (uv.x >= b.x && uv.x <= b.z && uv.y >= b.y && uv.y <= b.w) return i;
  }
  return -1;
}
// Presses use the wider plate; foil and varnish follow the letter itself.
float letterH(vec2 uv) {
  vec4 s = textureLod(uTextMap, uv, letterLod);
  return ((tStyle == 1 || tStyle == 2) && uTextBlind < 0.5) ? s.b : s.g;
}

// The die's footprint: the plate height cut at half, with a sub-texel soft edge.
float die(vec2 uv) { return smoothstep(0.4, 0.6, letterH(uv)); }

vec3 lettering(vec3 col, vec2 uv, vec2 t) {
  if (uPlate < 0.5) return col;
  vec2 texel = 1.0 / vec2(textureSize(uTextMap, 0));
  // Sample one screen pixel apart (at least one texel) so small cards don't shimmer.
  // Derivatives first: everything after may branch per pixel.
  vec2 e = max(texel, fwidth(uv));
  letterLod = max(log2(max(e.x / texel.x, e.y / texel.y)) - 0.5, 0.0);
  int field = textField(uv);
  if (field < 0) return col;
  tStyle = uTextStyles[field];
  if (tStyle == 0) return col;
  tLo = uTextLos[field];
  tHi = uTextHis[field];
  tRainbow = uTextRainbows[field];
  tBevel = uTextBevels[field];
  vec4 tm = textureLod(uTextMap, uv, letterLod);
  float cover = tm.r, h = ((tStyle == 1 || tStyle == 2) && uTextBlind < 0.5) ? tm.b : tm.g;
  // Only an embossed rim casts a shadow past its own soft edge.
  if (h < 0.002 && cover < 0.002 && tStyle != 2) return col;
  float hx = letterH(uv + vec2(e.x, 0.0)) - letterH(uv - vec2(e.x, 0.0));
  float hy = letterH(uv + vec2(0.0, e.y)) - letterH(uv - vec2(0.0, e.y));
  // Slope per texel, scaled so a full bevel reads as roughly 45 degrees at full depth.
  vec2 grad = vec2(hx / (e.x / texel.x), hy / (e.y / texel.y)) * 0.5 * tBevel;
  float sgn = (tStyle == 1 || tStyle == 3) ? -1.0 : 1.0; // deboss and foil press in
  float relief = tStyle == 3 ? 0.25 + 0.6 * uTextDepth : 0.15 + 1.6 * uTextDepth;
  if (tStyle == 4) relief = 0.1 + 0.5 * uTextDepth; // varnish is only a thin film
  // Stamp: the die bites deeper for a moment, then springs back to rest.
  float k = uTextStamp;
  relief *= 1.0 + 1.6 * sin(3.14159 * k) * (1.0 - k);
  // Where a sweep has reached across the name (foil goes down behind it).
  float sweepX = mix(uTextSpan.x - 0.04, uTextSpan.y + 0.04, smoothstep(0.0, 0.85, k));
  float laid = k >= 1.0 ? 1.0 : 1.0 - smoothstep(sweepX - 0.012, sweepX + 0.012, uv.x);
  float flare = k >= 1.0 ? 0.0 : exp(-pow((uv.x - sweepX) / 0.018, 2.0)) * (1.0 - k);
  vec3 N = normalize(vec3(-grad * sgn * relief, 1.0));
  // A point light at the hotspot, nudged to the upper left so relief always reads.
  vec2 lp = (uLight - uv) * uCardK;
  vec3 Ldir = normalize(vec3(lp * 1.5 + vec2(-0.22, -0.3), 0.5));
  vec3 V = normalize(vec3(-t.x * 0.35, -t.y * 0.35, 1.0));
  vec3 Hv = normalize(Ldir + V);
  float lam = dot(N, Ldir) - Ldir.z;   // change from a flat card
  float ndh = max(dot(N, Hv), 0.0);
  // Cast shadow: compare with the height a little towards the light.
  vec2 toward = normalize(Ldir.xy + 1e-4) * texel * tBevel * (0.6 + 0.8 * uTextDepth);
  float hl = letterH(uv + toward);

  // Light boost is gentler on bare stock than on the raised or sunk glyph itself.
  float shade = clamp(lam * 1.5, -0.5, 0.4);

  // Presses are drawn as hard pixel bevels, like the rest of the app: bands one
  // to three texels wide on the die's edge, never a soft blur. The bands turn
  // with the light, so tilting still moves them.
  vec2 dirL = normalize(Ldir.xy + 1e-4);
  // At least ~2 screen pixels, so the bevel still reads when the card is small.
  float bite = 1.0 + 1.6 * sin(3.14159 * k) * (1.0 - k);
  vec2 band = dirL * max(texel * (1.0 + 2.0 * uTextDepth), e * (1.4 + 1.2 * uTextDepth)) * bite;
  // With no ink the die is the bare letter, whose strokes are only a few pixels
  // wide on screen: thinner bands keep its lit and dark edges from cancelling.
  if (uTextBlind > 0.5) band *= 0.5;
  float d0 = die(uv);
  float nearLight = d0 * (1.0 - die(uv + band));  // die edge facing the light
  float farSide = d0 * (1.0 - die(uv - band));    // die edge facing away

  if (tStyle == 1) {
    // Deboss: a sunken trough. The wall nearest the light is in shadow, the far
    // wall is a lit lip, the floor a step darker. Nothing falls outside it.
    col *= 1.0 - (0.12 + 0.14 * uTextDepth) * d0;
    col *= 1.0 - (0.35 + 0.25 * uTextDepth) * nearLight;
    col = mix(col, vec3(1.0), (0.5 + 0.25 * uTextDepth) * farSide * (1.0 - nearLight));
  } else if (tStyle == 2) {
    // Emboss: a raised plateau, told in steps of brightness on the die itself
    // (lit edge > plateau > stock > far edge) plus only a one-band contact
    // shadow, so dense letters like 焼 or 峠 never smear into an offset copy.
    float contact = (1.0 - d0) * die(uv + band);
    col = mix(col, vec3(1.0), (0.2 + 0.14 * uTextDepth) * d0 * (1.0 - cover));
    col = mix(col, vec3(1.0), (0.45 + 0.2 * uTextDepth) * nearLight * (1.0 - farSide));
    col *= 1.0 - (0.38 + 0.2 * uTextDepth) * farSide * (1.0 - nearLight);
    col *= 1.0 - (0.18 + 0.1 * uTextDepth) * contact;
    col += pow(ndh, mix(10.0, 60.0, uTextGloss)) * uTextGloss * 0.25 * d0;
  } else if (tStyle == 3) {
    // Hot-foil: a mirror-like metal with a fine grain, pressed slightly into the card.
    // Grain fades out as the card shrinks, so small cards don't turn to dither noise.
    float fine = 1.0 / (1.0 + 2.5 * letterLod);
    float grain = (vnoise(uv * uCardK * 1100.0) - 0.5) * fine;
    float grain2 = (vnoise(asTrading(uv) * vec2(1540.0, 1100.0) + 7.0) - 0.5) * fine; // any shape: streaks as on the trading card
    vec3 Nf = normalize(N + vec3(grain, grain2, 0.0) * (0.04 + 0.08 * (1.0 - uTextGloss)));
    float nd = max(dot(Nf, Hv), 0.0);
    // Sweeping reflection band: the foil mirrors a bright room edge that slides as the card tilts.
    float ph = dot(uv, vec2(9.0, 13.0)) + dot(t, vec2(3.2, 2.4)) + dot(Nf.xy, vec2(4.0));
    float sheen = pow(0.5 + 0.5 * sin(ph), 3.0) + 0.45 * pow(0.5 + 0.5 * sin(ph * 2.3 + 1.7), 6.0);
    vec3 lo = tLo, hi = tHi;
    if (tRainbow > 0.5) {
      // Diffraction: fine slanted bands that each shift hue as the card tilts.
      float grating = sin(dot(uv, vec2(210.0, 90.0)) + dot(t, vec2(6.0, 4.0)));
      float hue = fract(uv.x * 1.8 + uv.y * 0.9 + dot(t, vec2(0.5, 0.35)) + dot(Nf.xy, vec2(0.5)) + grating * 0.12);
      vec3 rb = hsv2rgb(vec3(hue, 0.75, 1.0));
      lo = rb * 0.5 + vec3(0.04, 0.03, 0.08);
      hi = mix(rb, vec3(1.0), 0.3);
    }
    float x = clamp(0.18 + sheen * 0.7 + lam * 1.4 + grain * 0.07, 0.0, 1.0);
    // Metal is never mid-grey: push the ramp towards its ends.
    vec3 metal = mix(lo, hi, smoothstep(0.0, 1.0, x));
    metal += hi * pow(nd, mix(14.0, 140.0, uTextGloss)) * (0.5 + 0.9 * uTextGloss);
    // A bright glint along the band's crest reads as polished metal even on a small card.
    metal += hi * smoothstep(0.85, 1.0, sheen) * 0.35 * uTextGloss;
    // The press leaves a dark dent round every letter: a hard rim at least a
    // screen pixel wide, which keeps gold and silver legible on pale stock.
    vec2 rs = max(texel * 2.0, e * 1.3);
    float ring = max(max(textureLod(uTextMap, uv + vec2(rs.x, 0.0), letterLod).r, textureLod(uTextMap, uv - vec2(rs.x, 0.0), letterLod).r),
                     max(textureLod(uTextMap, uv + vec2(0.0, rs.y), letterLod).r, textureLod(uTextMap, uv - vec2(0.0, rs.y), letterLod).r));
    col *= 1.0 - (0.3 + 0.25 * uTextDepth) * ring * (1.0 - cover);
    col *= 1.0 + clamp(lam, -0.2, 0.15) * (1.0 - cover) * uTextDepth;
    metal += hi * flare * 1.6;
    if (laid < 1.0 && field == 0) {
      // Not yet stamped: the name is bare, faintly pressed stock. (The message
      // keeps its flat print until the foil reaches it.)
      vec4 st = face(vec2(uv.x, uTextStockY), 0.0);
      vec3 bare = st.rgb / max(st.a, 1e-4) * (1.0 + clamp(lam, -0.3, 0.2));
      col = mix(col, bare, cover * (1.0 - laid));
    }
    col = mix(col, metal, cover * laid);
  } else if (tStyle == 4) {
    // Spot UV: clear varnish exactly on the glyphs. Nearly invisible head-on,
    // a hard gloss when the angle is right.
    float glint = pow(ndh, mix(40.0, 260.0, uTextGloss));
    float sweep = pow(0.5 + 0.5 * sin(dot(uv * uCardK, vec2(5.0)) - dot(t, vec2(3.4, 2.2)) * 1.3), 2.0);
    // Varnish deepens what's under it and leaves a faint gloss, so even clear varnish on bare stock reads.
    col = mix(col, col * 0.86, cover * 0.8);
    col += vec3(0.05) * cover;
    // The sweep fades across each glyph so the varnish reads as a reflection, not paint.
    float gloss = glint * (0.4 + 0.6 * uTextGloss) + sweep * (0.12 + 0.18 * uTextGloss);
    // Capped, so clear varnish on pale stock reads as a sheen, never a blown-out blob.
    col = mix(col, vec3(0.97, 0.98, 1.0), min(cover * (gloss + flare * 0.9), 0.42));
    // The film's edge catches a hard one-pixel rim on the light side, even head-on.
    vec2 rimStep = dirL * max(texel * 1.5, e);
    float rim = cover * (1.0 - textureLod(uTextMap, uv + rimStep, letterLod).r);
    col = mix(col, vec3(1.0), min(rim * (0.25 + 0.35 * uTextGloss + 0.4 * sweep), 0.55));
    // The varnish's shadow-side rim: a faint dark line, so even clear varnish is findable head-on.
    float rimDark = cover * (1.0 - textureLod(uTextMap, uv - rimStep, letterLod).r);
    col *= 1.0 - 0.18 * rimDark;
  }
  return col;
}
`;
