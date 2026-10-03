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

/** Separable box blur, run three times: close to a Gaussian, and works where ctx.filter doesn't (Safari). */
function blur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  let a = src;
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

function paintMap(W: number, H: number, text: string, font: string, x: number, y: number, size: number, radius: number) {
  const key = [W, H, text, font, x, y, radius].join('\u0000');
  if (key === mapKey) return;
  mapKey = key;
  if (map.width !== W || map.height !== H) {
    map.width = glyphs.width = W;
    map.height = glyphs.height = H;
  }
  bevel = radius;
  mapCtx.fillStyle = '#000';
  mapCtx.fillRect(0, 0, W, H);
  glyphCtx.clearRect(0, 0, W, H);
  glyphCtx.font = font;
  glyphCtx.textBaseline = 'middle';
  glyphCtx.fillStyle = '#fff';
  glyphCtx.fillText(text, x, y);
  const pad = radius * 3 + 2;
  const rx = Math.max(0, Math.floor(x - pad));
  const ry = Math.max(0, Math.floor(y - size * 0.75 - pad));
  const rw = Math.min(W - rx, Math.ceil(glyphCtx.measureText(text).width + pad * 2));
  const rh = Math.min(H - ry, Math.ceil(size * 1.5 + pad * 2));
  if (rw <= 0 || rh <= 0) {
    mapVersion++;
    return;
  }
  const src = glyphCtx.getImageData(rx, ry, rw, rh).data;
  const cover = new Float32Array(rw * rh);
  for (let i = 0; i < cover.length; i++) cover[i] = src[i * 4 + 3] / 255;
  // Box radius per pass so three passes span roughly the requested bevel.
  const soft = blur(cover, rw, rh, Math.max(1, Math.round(radius / 1.8)));
  const out = mapCtx.createImageData(rw, rh);
  for (let i = 0; i < cover.length; i++) {
    out.data[i * 4] = Math.round(cover[i] * 255);
    // Lift the softened field so stroke centres reach full height.
    out.data[i * 4 + 1] = Math.round(Math.min(1, soft[i] * 1.3) * 255);
    out.data[i * 4 + 3] = 255;
  }
  mapCtx.putImageData(out, rx, ry);
  mapVersion++;
}

/**
 * Paints the name onto the face in the finish's flat colour and refreshes the
 * lettering map. Call with the context's font already set.
 */
export function paintLettering(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, frameInk: string): void {
  const fill = letterFill(active, frameInk);
  ctx.textBaseline = 'middle';
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fillText(text, x, y);
  }
  const size = parseFloat(/(\d+(?:\.\d+)?)px/.exec(ctx.font)?.[1] ?? '40');
  // A narrow bevel: the pixel font's strokes are only ~6 texels wide at face size.
  paintMap(ctx.canvas.width, ctx.canvas.height, text, ctx.font, x, y, size, Math.max(1.5, size * 0.032));
}

// ---------- GL side ----------

const STYLE_INDEX: Record<LetterStyle, number> = { ink: 0, deboss: 1, emboss: 2, foil: 3, spot: 4 };

/** Owns one renderer's copy of the lettering map and feeds the shader its uniforms. */
export class LetteringGL {
  private tex: WebGLTexture;
  private version = -1;

  constructor(private gl: WebGL2RenderingContext) {
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
    const [lo, hi] = foilRamp(l);
    gl.uniform1i(p.u.uTextMap, unit);
    gl.uniform1i(p.u.uTextStyle, STYLE_INDEX[l.style]);
    gl.uniform3fv(p.u.uTextLo, hexToRgb(lo));
    gl.uniform3fv(p.u.uTextHi, hexToRgb(hi));
    gl.uniform1f(p.u.uTextRainbow, l.style === 'foil' && l.foil === 'rainbow' ? 1 : 0);
    gl.uniform1f(p.u.uTextDepth, l.depth);
    gl.uniform1f(p.u.uTextGloss, l.gloss);
    gl.uniform1f(p.u.uTextBevel, bevel);
  }
}

/** Card-shader chunk. Expects COMMON helpers and the card uniforms (uLight, uPlate, uTime) above it. */
export const LETTERING_GLSL = /* glsl */ `
uniform sampler2D uTextMap;  // r: glyph coverage, g: softened height
uniform int uTextStyle;      // 0 ink, 1 deboss, 2 emboss, 3 foil stamp, 4 spot UV
uniform vec3 uTextLo, uTextHi;
uniform float uTextRainbow;
uniform float uTextDepth;
uniform float uTextGloss;
uniform float uTextBevel;    // bevel radius in map texels

float letterLod;  // set per pixel in lettering()
float letterH(vec2 uv) { return textureLod(uTextMap, uv, letterLod).g; }

vec3 lettering(vec3 col, vec2 uv, vec2 t) {
  if (uTextStyle == 0 || uPlate < 0.5) return col;
  vec2 texel = 1.0 / vec2(textureSize(uTextMap, 0));
  // Sample one screen pixel apart (at least one texel) so small cards don't shimmer.
  // Derivatives first: everything after may branch per pixel.
  vec2 e = max(texel, fwidth(uv));
  letterLod = max(log2(max(e.x / texel.x, e.y / texel.y)) - 0.5, 0.0);
  vec4 tm = textureLod(uTextMap, uv, letterLod);
  float cover = tm.r, h = tm.g;
  // Only an embossed rim casts a shadow past its own soft edge.
  if (h < 0.002 && cover < 0.002 && uTextStyle != 2) return col;
  float hx = letterH(uv + vec2(e.x, 0.0)) - letterH(uv - vec2(e.x, 0.0));
  float hy = letterH(uv + vec2(0.0, e.y)) - letterH(uv - vec2(0.0, e.y));
  // Slope per texel, scaled so a full bevel reads as roughly 45 degrees at full depth.
  vec2 grad = vec2(hx / (e.x / texel.x), hy / (e.y / texel.y)) * 0.5 * uTextBevel;
  float sgn = (uTextStyle == 1 || uTextStyle == 3) ? -1.0 : 1.0; // deboss and foil press in
  float relief = uTextStyle == 3 ? 0.25 + 0.6 * uTextDepth : 0.15 + 1.6 * uTextDepth;
  if (uTextStyle == 4) relief = 0.1 + 0.5 * uTextDepth; // varnish is only a thin film
  vec3 N = normalize(vec3(-grad * sgn * relief, 1.0));
  // A point light at the hotspot, nudged to the upper left so relief always reads.
  vec2 lp = (uLight - uv) * vec2(1.0, 1.4);
  vec3 Ldir = normalize(vec3(lp * 1.5 + vec2(-0.22, -0.3), 0.5));
  vec3 V = normalize(vec3(-t.x * 0.35, -t.y * 0.35, 1.0));
  vec3 Hv = normalize(Ldir + V);
  float lam = dot(N, Ldir) - Ldir.z;   // change from a flat card
  float ndh = max(dot(N, Hv), 0.0);
  // Cast shadow: compare with the height a little towards the light.
  vec2 toward = normalize(Ldir.xy + 1e-4) * texel * uTextBevel * (0.6 + 0.8 * uTextDepth);
  float hl = letterH(uv + toward);

  // Light boost is gentler on bare stock than on the raised or sunk glyph itself.
  float shade = clamp(lam * 1.5, -0.5, 0.4);

  if (uTextStyle == 1) {
    // Deboss: the floor sits in shade, the wall nearest the light is in shadow, the far wall catches light.
    float shadow = max(h - hl, 0.0) * (0.35 + 0.6 * uTextDepth);
    col *= 1.0 - 0.1 * h * (0.4 + uTextDepth);
    col *= 1.0 + shade;
    col *= 1.0 - clamp(shadow, 0.0, 0.4);
  } else if (uTextStyle == 2) {
    // Emboss: lit shoulders, shaded far side, a soft shadow on the stock below.
    float shadow = max(hl - h, 0.0) * (0.3 + 0.5 * uTextDepth) * (1.0 - cover);
    col *= 1.0 + shade;
    col *= 1.0 - clamp(shadow, 0.0, 0.32);
    col += pow(ndh, mix(10.0, 60.0, uTextGloss)) * uTextGloss * 0.3 * smoothstep(0.2, 0.7, h);
  } else if (uTextStyle == 3) {
    // Hot-foil: a mirror-like metal with a fine grain, pressed slightly into the card.
    float grain = vnoise(uv * vec2(1100.0, 1540.0)) - 0.5;
    float grain2 = vnoise(uv * vec2(1540.0, 1100.0) + 7.0) - 0.5;
    vec3 Nf = normalize(N + vec3(grain, grain2, 0.0) * (0.06 + 0.14 * (1.0 - uTextGloss)));
    float nd = max(dot(Nf, Hv), 0.0);
    // Sweeping reflection band: the foil mirrors a bright room edge that slides as the card tilts.
    float ph = dot(uv, vec2(9.0, 13.0)) + dot(t, vec2(3.2, 2.4)) + dot(Nf.xy, vec2(4.0));
    float sheen = pow(0.5 + 0.5 * sin(ph), 3.0) + 0.45 * pow(0.5 + 0.5 * sin(ph * 2.3 + 1.7), 6.0);
    vec3 lo = uTextLo, hi = uTextHi;
    if (uTextRainbow > 0.5) {
      float hue = fract(uv.x * 1.8 + uv.y * 0.9 + dot(t, vec2(0.5, 0.35)) + dot(Nf.xy, vec2(0.5)));
      vec3 rb = hsv2rgb(vec3(hue, 0.75, 1.0));
      lo = rb * 0.5 + vec3(0.04, 0.03, 0.08);
      hi = mix(rb, vec3(1.0), 0.3);
    }
    float x = clamp(0.18 + sheen * 0.7 + lam * 1.4 + grain * 0.14, 0.0, 1.0);
    // Metal is never mid-grey: push the ramp towards its ends.
    vec3 metal = mix(lo, hi, smoothstep(0.0, 1.0, x));
    metal += hi * pow(nd, mix(14.0, 140.0, uTextGloss)) * (0.4 + 0.8 * uTextGloss);
    // The press leaves a dent: a thin shaded wall that keeps pale foils legible on pale stock.
    col *= 1.0 - (0.18 + 0.3 * uTextDepth) * h * (1.0 - cover);
    col *= 1.0 + clamp(lam, -0.2, 0.15) * (1.0 - cover) * uTextDepth;
    col = mix(col, metal, cover);
  } else if (uTextStyle == 4) {
    // Spot UV: clear varnish exactly on the glyphs. Nearly invisible head-on,
    // a hard gloss when the angle is right.
    float glint = pow(ndh, mix(40.0, 260.0, uTextGloss));
    float sweep = pow(0.5 + 0.5 * sin(dot(uv, vec2(5.0, 7.0)) - dot(t, vec2(3.4, 2.2)) * 1.3), 10.0);
    col = mix(col, col * 0.93, cover * 0.6);  // varnish deepens the ink a touch
    // The sweep fades across each glyph so the varnish reads as a reflection, not paint.
    float across = 0.6 + 0.4 * sin(dot(uv, vec2(60.0, -40.0)) + dot(t, vec2(4.0)));
    float gloss = glint * (0.4 + 0.6 * uTextGloss) + sweep * across * (0.12 + 0.3 * uTextGloss);
    col += vec3(0.95, 0.97, 1.0) * cover * gloss;
    col += vec3(1.0) * clamp(shade, 0.0, 0.4) * cover * (0.3 + sweep);
  }
  return col;
}
`;
