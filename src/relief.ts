// Relief finish: the picture struck in metal like a proof coin.
//
// The subject stands up off a flat mirror field as a matte (frosted) relief: raised by a crisp
// step, cut into a few flat levels, its forms gently modelled and its line work sunk into
// grooves. The field mirrors a small studio (softbox, fill, strip light) that sweeps across as
// the card tilts, while the frosted subject answers the light steadily by its angle, so the two
// finishes play against each other the way they do on a coin. The picture's colour stays as a
// muted enamel in the subject's dark parts. The frame is stamped with dots, and the name is a
// mirror foil pressed into a matte plate.
//
// What the shader can't see from one pixel (where the subject is, its levels, how busy each area
// is, the picture's tonal range) comes from reliefMap.ts, run on the face whenever it changes.

import { ART, FACE_H, FACE_W } from './card/face';
import { createTexture, type Program } from './gl/gl';
import { reliefMap } from './reliefMap';

/** Face pixels per map cell. */
const CELL = 4;
const MAP_W = Math.round(FACE_W / CELL);
const MAP_H = Math.round(FACE_H / CELL);
/** The art window in cells, inset past its border and the shade along its top edge. */
const ART_CELLS = {
  x0: Math.ceil(ART.x / CELL) + 1,
  y0: Math.ceil((ART.y + 30) / CELL),
  x1: Math.floor((ART.x + ART.w) / CELL) - 1,
  y1: Math.floor((ART.y + ART.h) / CELL) - 1,
};

function sameArt(a: Uint8ClampedArray, b: Uint8ClampedArray): boolean {
  for (let y = ART_CELLS.y0; y < ART_CELLS.y1; y++)
    for (let i = (y * MAP_W + ART_CELLS.x0) * 4, end = (y * MAP_W + ART_CELLS.x1) * 4; i < end; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Phones and low-core machines skip the cast shadows and the line grooves. */
const LITE = (navigator.hardwareConcurrency || 8) <= 4 || matchMedia('(pointer: coarse)').matches;

/** The stage re-reads a changing face (crop drag, animated picture) at most this often. */
const LIVE_EVERY_MS = 120;

/** One renderer's relief map: worked out from each new face, then bound with the card's other textures. */
export class ReliefGL {
  private tex: WebGLTexture;
  private range: [number, number] = [0, 1];
  private cells = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private read: Uint8ClampedArray | null = null;
  private pending: HTMLCanvasElement | null = null;
  private last = -Infinity;

  /** `live`: false for exports, which always draw at full quality. */
  constructor(
    private gl: WebGL2RenderingContext,
    private live: boolean,
  ) {
    this.tex = createTexture(gl, false);
    this.cells.width = MAP_W;
    this.cells.height = MAP_H;
    this.ctx = this.cells.getContext('2d', { willReadFrequently: true })!;
    this.ctx.imageSmoothingQuality = 'high';
  }

  /** Notes a new face; it is read only once a Relief card is drawn with it (see bind). */
  setFace(face: HTMLCanvasElement): void {
    this.pending = face;
  }

  /**
   * Exports read every face they draw. The stage reads at most every LIVE_EVERY_MS (the latest
   * face wins), and skips the work when only the nameplate changed, as while typing.
   */
  private refresh() {
    if (!this.pending) return;
    const now = performance.now();
    if (this.live && now < this.last + LIVE_EVERY_MS) return;
    this.analyse(this.pending);
    this.pending = null;
    this.last = now;
  }

  private analyse(face: HTMLCanvasElement) {
    const { ctx, gl } = this;
    ctx.clearRect(0, 0, MAP_W, MAP_H);
    ctx.drawImage(face, 0, 0, MAP_W, MAP_H);
    const px = ctx.getImageData(0, 0, MAP_W, MAP_H).data;
    const prev = this.read;
    this.read = px;
    if (prev && sameArt(prev, px)) return;
    const m = reliefMap(px, MAP_W, MAP_H, ART_CELLS);
    this.range = [m.lo, m.hi];
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, MAP_W, MAP_H, 0, gl.RGBA, gl.UNSIGNED_BYTE, m.data);
  }

  /** `relief`: the card being drawn is Relief, so its map must be current. */
  bind(p: Program, unit: number, relief: boolean): void {
    const { gl } = this;
    // On its own unit first: a refresh uploads the map and must not disturb the other textures.
    gl.activeTexture(gl.TEXTURE0 + unit);
    if (relief) this.refresh();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.uniform1i(p.u.uReliefMap, unit);
    gl.uniform3f(p.u.uRelief, this.range[0], this.range[1], this.live && LITE ? 1 : 0);
  }
}

/** Card-shader chunk. Expects COMMON, the card uniforms, the tune chunk and the lettering map above it. */
export const RELIEF_GLSL = /* glsl */ `
uniform sampler2D uReliefMap;  // r: subject (1) or field (0), g: flat level, b: busy texture
uniform vec3 uRelief;          // xy: the picture's tonal range; z: 1 = lighter shading

// Heights in card widths: the subject's step off the field, its flat levels, the broad and the
// finer modelling of its forms, and the line work cut into it.
const float R_RAISE = 0.006;
const float R_PLAT = 0.006;
const float R_SWELL = 0.01;
const float R_FORM = 0.006;
const float R_LINE = 0.0045;

float reliefLum(vec2 p, float k) {
  vec4 f = textureLod(uFace, p, k);
  return luma(f.rgb / max(f.a, 1e-4));
}

// Tone at mip level k with its slope per uv. Central differences one texel of that level apart
// keep the slope continuous across texel borders, so the metal shows no square facets.
vec3 reliefTone(vec2 p, float k, vec2 texel) {
  vec2 d = texel * exp2(k);
  float l = reliefLum(p - vec2(d.x, 0.0), k), r = reliefLum(p + vec2(d.x, 0.0), k);
  float u = reliefLum(p - vec2(0.0, d.y), k), b = reliefLum(p + vec2(0.0, d.y), k);
  return vec3((l + r + u + b) * 0.25, (r - l) / (2.0 * d.x), (b - u) / (2.0 * d.y));
}

// Height only, for the shadow test.
float reliefHeightAt(vec2 p, float k, float gain) {
  vec4 r = texture(uReliefMap, p);
  return r.r * (R_RAISE + R_PLAT * r.g + R_SWELL * reliefLum(p, k) * gain);
}

// The studio as a polished face mirrors it: a room lit from above, a softbox up and left, a
// weaker fill opposite and a strip light, all within reach of the tilt so they sweep across.
// Silver sees a cool sky over a warm floor; gold turns both into its own colour.
vec3 reliefStudio(vec3 R, bool silver) {
  vec2 r2 = R.xy / max(R.z, 0.2);
  float up = smoothstep(0.45, -0.45, r2.y);
  // The softbox falls off softly, so it reads as a reflection sliding over the field, never a lit patch.
  vec2 b = (r2 - vec2(-0.16, -0.2)) * vec2(1.0, 0.8);
  float box = exp(-dot(b, b) / 0.03);
  float fill = 1.0 - smoothstep(0.12, 0.3, length(r2 - vec2(0.34, 0.3)));
  float strip = 1.0 - smoothstep(0.02, 0.11, abs(dot(r2, vec2(0.8, -0.6)) + 0.26));
  vec3 room = silver ? mix(vec3(0.24, 0.22, 0.2), vec3(0.5, 0.56, 0.64), up) : vec3(0.16 + 0.46 * up);
  return room + vec3((0.8 * box + 0.5 * strip) * uTGlare + 0.25 * fill);
}

// Highlights roll off instead of clipping, so a bright sweep never burns into a flat patch.
vec3 reliefShoulder(vec3 x) {
  return mix(x, 0.82 + 0.18 * (1.0 - exp(-(x - 0.82) / 0.18)), step(0.82, x));
}

vec3 relief(vec3 c, vec2 uv, vec2 t, float L, float lod, vec3 m) {
  bool silver = uTMetal > 0.5;
  bool lite = uRelief.z > 0.5;
  // The relief follows the picture, not the pattern: work in face coordinates.
  vec2 p = tuneFaceUv(uv);
  vec2 texel = 1.0 / vec2(textureSize(uFace, 0));
  vec2 fw = max(fwidth(vUv), texel * 0.25);
  // Face texels per screen pixel, as a mip level; pixelated art uses its block size.
  float px = max(log2(max(fw.x / texel.x, fw.y / texel.y)), lod);
  // Pattern size makes the modelling broader or finer; it never goes finer than the screen.
  vec3 k = max(vec3(max(px, 0.6), max(px, 0.8), max(px + 1.8, 3.0)) + log2(uTScale), 0.0);
  // Tones are read in the picture's own range, so a dark picture is lifted instead of crushed.
  float gain = 1.0 / max(uRelief.y - uRelief.x, 0.3);
  float Lk = clamp((L - uRelief.x) * gain, 0.0, 1.0);
  float art = m.r;

  // ---- Height (value, d/du, d/dv) ----
  vec2 mt = 1.0 / vec2(textureSize(uReliefMap, 0));
  vec4 rm = texture(uReliefMap, p);
  vec4 rx = (texture(uReliefMap, p + vec2(mt.x, 0.0)) - texture(uReliefMap, p - vec2(mt.x, 0.0))) / (2.0 * mt.x);
  vec4 ry = (texture(uReliefMap, p + vec2(0.0, mt.y)) - texture(uReliefMap, p - vec2(0.0, mt.y))) / (2.0 * mt.y);
  float S = rm.r;
  vec3 sub = vec3(R_RAISE + R_PLAT * rm.g, R_PLAT * rx.g, R_PLAT * ry.g) + R_SWELL * reliefTone(p, k.z, texel) * gain;
  vec3 fld = vec3(0.0);
  float groove = 0.0;
  if (!lite) {
    vec3 form = reliefTone(p, k.y, texel) * gain;
    // Features (an eye, a nose, a petal) are modelled too, except in busy texture.
    sub += R_FORM * (1.0 - 0.7 * rm.b) * form;
    vec3 d = reliefTone(p, k.x, texel) * gain - form;
    // Only real line work counts: faint grain (paper, noise) leaves the flats flat.
    float a = abs(d.x);
    d *= max(a - 0.05, 0.0) / max(a, 1e-4);
    // Dark lines sink, light detail stands only a little proud; both fade on a small card, and
    // busy texture (brushwork, dither) keeps only a whisper of them.
    float s = (d.x < 0.0 ? 1.0 : 0.35) * (1.0 - smoothstep(1.2, 2.2, px)) * (1.0 - 0.9 * rm.b);
    sub += R_LINE * s * d;
    // The field is only lightly engraved, so it stays a mirror.
    fld += R_LINE * 0.3 * s * d;
    groove = clamp(-d.x * 4.0, 0.0, 1.0) * s * S;
  }
  // Blend subject and field, plus the step between them.
  vec3 H = (mix(fld, sub, S) + vec3(0.0, (sub.x - fld.x) * vec2(rx.r, ry.r))) * art;
  vec2 slope = vec2(H.y, H.z / 1.4);  // per card width on both axes
  vec3 N = normalize(vec3(-slope, 1.0));

  // ---- Frame: a fine stamped dot texture (follows the pattern size and angle) ----
  float frame = (1.0 - m.r) * (1.0 - m.b);
  // The nameplate is a smooth matte plate so the name reads; the dots stamp the rest.
  // A trading card's bars and boxes all carry words, so everything off its art is plate.
  vec2 offArt = max(uArt.xy - p, p - uArt.zw);
  float band = uPlate < 0.5 ? 0.0 : uArt.y < 0.06 ? smoothstep(0.878, 0.886, p.y) : smoothstep(0.0, 0.006, max(offArt.x, offArt.y));
  {
    vec2 q = uv * vec2(1.0, 1.4) * 70.0;
    q.x += 0.5 * mod(floor(q.y), 2.0);  // offset rows: a staggered grid
    vec2 f = fract(q) - 0.5;
    // Each dot is a low dome; it fades to flat once the dots get close to a pixel apart.
    float see = 1.0 - smoothstep(0.25, 0.5, fw.x * 70.0);
    float dome = 1.0 - smoothstep(0.22, 0.36, length(f));
    N = normalize(mix(N, normalize(vec3(f / 0.36 * dome * 2.2 * see, 1.0)), frame * (1.0 - band)));
  }

  // ---- Light ----
  vec2 at = p * vec2(1.0, 1.4);
  // A point light at the hotspot, nudged up and left so the relief always reads (as the lettering).
  vec2 lp = (uLight - p) * vec2(1.0, 1.4);
  vec3 Ld = normalize(vec3(lp * 1.3 + vec2(-0.24, -0.32), 0.42));
  // The eye sits a few card widths out, so reflections slide across the card as it tilts.
  vec3 V = normalize(vec3(vec2(0.5, 0.7) - at - t * 1.25, 2.6));
  vec3 Hv = normalize(Ld + V);
  float lam = clamp(dot(N, Ld) * 1.15, 0.0, 1.0);

  // Cast shadow: is the relief higher a little towards the light than the light's slope allows?
  float shade = 1.0;
  if (!lite) {
    vec2 dir = normalize(Ld.xy + 1e-5);
    float tanE = Ld.z / max(length(Ld.xy), 1e-3);
    float h0 = reliefHeightAt(p, k.z, gain);
    float occ = 0.0;
    for (int i = 1; i <= 2; i++) {
      float dist = 0.006 * float(i);
      float hi = reliefHeightAt(p + dir * vec2(1.0, 1.0 / 1.4) * dist, k.z, gain);
      occ = max(occ, (hi - h0 - dist * tanE) / 0.0025);
    }
    shade = 1.0 - 0.4 * clamp(occ, 0.0, 1.0) * art;
  }

  // ---- Two finishes of one metal ----
  vec3 tone = silver ? vec3(0.88, 0.9, 0.93) : vec3(1.0, 0.74, 0.32);
  vec3 frosted = silver ? vec3(0.9, 0.9, 0.87) : vec3(1.0, 0.8, 0.45);
  vec3 deep = silver ? vec3(0.03, 0.04, 0.06) : vec3(0.1, 0.05, 0.015);
  // Frosted: answers the light by its angle, steady and soft; struck edges glint as it passes.
  float sharp = mix(60.0, 220.0, clamp(uTSharp / 2.0, 0.0, 1.0));
  float glint = pow(max(dot(reflect(-V, N), Ld), 0.0), sharp * 0.25) * smoothstep(0.3, 0.7, length(slope)) * 0.7 * uTGlare;
  float satin = 0.16 + 0.82 * pow(clamp(dot(N, Ld) * 0.5 + 0.5, 0.0, 1.0), 2.2) + 0.3 * pow(max(dot(N, Hv), 0.0), 8.0) * uTGlare;
  vec3 subj = frosted * (satin + glint) * (0.42 + 0.58 * Lk);
  // Mirror: the field shows the studio, with the picture behind it only faintly.
  vec3 field = tone * reliefStudio(reflect(-V, N), silver) * (0.65 + 0.35 * Lk);
  // Off the art window everything is frosted.
  float matte = mix(1.0, S, art);
  vec3 col = mix(field, subj, matte);
  // Enamel: the picture's colour, muted, settles in the subject's dark parts.
  vec3 cn = clamp((c - uRelief.x) * gain, 0.0, 1.0);
  vec3 enamel = mix(vec3(Lk), cn, silver ? 0.45 : 0.55) * mix(tone, vec3(1.0), 0.6) * (0.4 + 0.45 * lam);
  // Only well inside the subject, so the backdrop's colour never rims its outline.
  float inside = mix(1.0, smoothstep(0.6, 0.95, S), art);
  col = mix(col, enamel, (1.0 - smoothstep(0.15, 0.7, Lk)) * (silver ? 0.4 : 0.5) * inside);
  col *= shade;
  // Antiqued: the grooves hold a little darkness.
  col = mix(col, deep, groove * 0.5);
  // The nameplate is a darker matte plate, bead-blasted to a fine grain (gone on a small card),
  // so the mirror foil name stands off it.
  float grain = (hash12(floor(p / texel)) - 0.5) * 0.12 * (1.0 - smoothstep(0.3, 1.2, px));
  col *= (1.0 - 0.45 * band * frame) * (1.0 + grain * band * frame);
  col = reliefShoulder(col);
  // A trading card's panels stay printed paper and ink under a warm sheen, so their words read.
  if (uArt.y >= 0.06) col = mix(col, c * vec3(1.0, 0.95, 0.84), band * 0.8);

  // ---- Name: mirror foil pressed into the plate ----
  if (uPlate > 0.5 && uArt.y < 0.06 && p.y > 0.86) {
    vec2 tx = 1.0 / vec2(textureSize(uTextMap, 0));
    vec2 e = max(tx, fw);
    float cover = textureLod(uTextMap, p, 0.0).r;
    // The press leaves a dark dent round every letter.
    vec2 rs = max(tx * 2.5, fw * 1.4);
    float ring = max(max(textureLod(uTextMap, p + vec2(rs.x, 0.0), 0.0).r, textureLod(uTextMap, p - vec2(rs.x, 0.0), 0.0).r),
                     max(textureLod(uTextMap, p + vec2(0.0, rs.y), 0.0).r, textureLod(uTextMap, p - vec2(0.0, rs.y), 0.0).r));
    col *= 1.0 - 0.75 * ring * (1.0 - cover);
    // Bevelled strokes from the lettering's softened height.
    vec2 g = vec2(textureLod(uTextMap, p + vec2(e.x, 0.0), 0.0).g - textureLod(uTextMap, p - vec2(e.x, 0.0), 0.0).g,
                  textureLod(uTextMap, p + vec2(0.0, e.y), 0.0).g - textureLod(uTextMap, p - vec2(0.0, e.y), 0.0).g);
    vec3 Nn = normalize(vec3(-g * 1.5, 1.0));
    // A mirror, never darker than the plate: bands of reflection run along the letters as the card
    // tilts, and the bevels catch the light.
    float sheen = pow(0.5 + 0.5 * sin(dot(p, vec2(9.0, 13.0)) + dot(t, vec2(3.2, 2.4))), 3.0);
    vec3 leaf = tone * (0.62 + 0.45 * sheen + 0.3 * reliefStudio(reflect(-V, Nn), silver) + 0.35 * clamp(dot(Nn, Ld) - Ld.z, -0.5, 0.5));
    leaf += mix(tone, vec3(1.0), 0.5) * pow(max(dot(Nn, Hv), 0.0), sharp) * 0.8 * uTGlare;
    col = mix(col, reliefShoulder(leaf), cover);
  }

  // The card shader then mixes every finish in at 70% on the frame and adds a soft glare spot.
  // The metal covers the frame fully and already mirrors that light, so undo both here.
  float frameMix = mix(0.7, 1.0, m.r);
  float glare = tuneGlare(length((p - uLight) * vec2(1.0, 1.4)), 1.35, 3.0, 0.32);
  return c + (col - c - glare * uTLight) / frameMix;
}
`;
