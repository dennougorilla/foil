// GLSL sources. Every effect is written from scratch for this project.
import { TUNE_GLSL } from '../tune/glsl';
import { LETTERING_GLSL } from '../lettering';
import { RANGE_GLSL } from './range';
import type { FinishModule } from './finishes/types';
import { COMMON } from './common';

export const QUAD_VS = /* glsl */ `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }
`;

/** Painted swirl backdrop. Rendered into a small canvas and upscaled with nearest filtering. */
export const BG_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uC0, uC1, uC2;
uniform vec2 uPointer;
uniform vec2 uFocus;    // swirl centre, 0..1 with y up
out vec4 o;
${COMMON}
void main() {
  vec2 frag = vUv * uRes;
  vec2 uv = (frag - uFocus * uRes) / uRes.y;
  uv += (uPointer - 0.5) * 0.06;
  float t = uTime * 0.11;
  float r = length(uv);
  float a = atan(uv.y, uv.x);
  // Spiral arms: angle winds with radius, then paint-like domain warping.
  float spin = a + r * 3.2 - t * 1.4;
  vec2 p = vec2(cos(spin), sin(spin)) * (0.6 + r * 1.6);
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    p += 0.22 * vec2(sin(p.y * 2.3 + t * (1.2 + fi * 0.3) + fi * 1.7),
                     cos(p.x * 2.1 - t * (1.0 + fi * 0.2) - fi));
  }
  float arms = sin(atan(p.y, p.x) * 2.0 + length(p) * 2.6 + fbm(p * 1.2 + t) * 1.8);
  float v = 0.5 + 0.5 * arms;
  // Three flat paint layers with a hard edge, like poster paint.
  vec3 col = uC0;
  col = mix(col, uC1, smoothstep(0.46, 0.5, v));
  col = mix(col, uC2, smoothstep(0.78, 0.81, v) * 0.85);
  // Darken towards the edges so the UI always sits on a calm field.
  // Calmer overall, so the card and labels always win against the backdrop.
  col *= mix(0.36, 0.78, smoothstep(1.15, 0.1, r));
  o = vec4(col, 1.0);
}
`;

export const CARD_VS = /* glsl */ `#version 300 es
in vec2 aPos;           // -0.5..0.5, y down
uniform vec2 uRes;      // canvas size in css px
uniform vec2 uCenter;   // card centre in css px
uniform vec2 uSize;     // card size in css px
uniform vec3 uRot;      // rx, ry, rz in radians
uniform float uScale;
uniform vec2 uShift;    // extra screen offset (shadow)
uniform vec4 uUvRect;   // the part of the face on this quad: x0, y0, x1, y1 (0, 0, 1, 1 = whole card)
out vec2 vUv;
out float vShade;
void main() {
  vec3 p = vec3(aPos * uSize * uScale, 0.0);
  float cz = cos(uRot.z), sz = sin(uRot.z);
  p.xy = mat2(cz, sz, -sz, cz) * p.xy;
  float cx = cos(uRot.x), sx = sin(uRot.x);
  p.yz = mat2(cx, sx, -sx, cx) * p.yz;
  float cy = cos(uRot.y), sy = sin(uRot.y);
  p.xz = mat2(cy, -sy, sy, cy) * p.xz;
  float D = max(max(uSize.x, uSize.y), 120.0) * 3.2;
  float w = (D - p.z) / D;
  vec2 s = uCenter + uShift + p.xy / w;
  vec2 ndc = vec2(s.x / uRes.x * 2.0 - 1.0, 1.0 - s.y / uRes.y * 2.0);
  gl_Position = vec4(ndc * w, 0.0, w);
  vUv = mix(uUvRect.xy, uUvRect.zw, aPos + 0.5);
  vShade = p.z / (max(uSize.x, uSize.y) * uScale);
}
`;

/**
 * The card shader: the core (helpers, tune, range, lettering) with the seven open finishes, plus one
 * pack's finishes when given. Each pack gets its own program, compiled only once it is needed.
 * The per-finish rules below (which ones cover the frame, Warmth tuning its own ink) name shader
 * indices from src/editions.ts and are harmless when that finish is not in the program.
 */
export const cardFs = (pack?: FinishModule) => /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
in float vShade;
uniform sampler2D uFace;
uniform sampler2D uMask;   // r: art window, g: frame, b: ink outline
uniform sampler2D uBack;
uniform int uEdition;
uniform float uIntensity;
uniform float uTime;
uniform float uPixel;      // pixel art: pixels across the card's short side, 0 = off (src/dot)
uniform vec2 uTilt;        // -1..1, drives sheen
uniform vec2 uLight;       // highlight position in card uv
uniform float uShadow;     // 1 = draw as drop shadow
uniform float uAlpha;
uniform float uFlash;      // white flash on juice
uniform float uGlint;      // a streak of light crossing the face: its place along the diagonal, below -1 when none
uniform vec4 uBeam;        // a band of light across the face: place, width, angle, power (0 = none)
uniform vec2 uSpot;        // a round spot of light on uLight: radius, power (0 = none)
uniform float uDim;        // how far the face falls into shade away from the band or spot
uniform vec3 uStar;        // a pixel star twinkling on the face: x, y, power (0 = none)
uniform float uFaceTexels; // face texture width in px
uniform vec2 uCardK;       // the face in units of its short side: (1, 1.4) on the trading card
uniform vec4 uArt;         // the art window in face uv: x0, y0, x1, y1 (it follows the shape and the layout)
// uv scaled so a pattern tuned on the trading card keeps its size in px on every shape.
vec2 asTrading(vec2 uv) { return uv * uCardK / vec2(1.0, 1.4); } // any shape
uniform float uPlate;      // 0 = blank the nameplate (tiny hand cards)
uniform float uLoop;       // length of an exported loop in shader seconds; 0 on the live stage
uniform float uLayer;      // 1 = layer 2's pass, drawn over the card in its own area (docs/layering.md)
uniform float uLayerK;     // layer 2's strength
uniform float uBlend;      // where layer 1 lies under it: 1 = add only layer 2's light, 0 = lay it over
uniform float uUnderOn;    // 0 when layer 1 is Base, so layer 2 is laid over everywhere
out vec4 o;
${COMMON}
${TUNE_GLSL}
${RANGE_GLSL}

/** The pixel art grid in columns and rows: square cells on any shape (dot/model.ts gridOf). */
vec2 pixelGrid() { return floor(uPixel * uCardK + 0.5); }

vec4 face(vec2 uv, float lod) { return textureLod(uFace, tuneFaceUv(uv), lod); }

vec3 foil(vec3 c, vec2 uv, vec2 t, float L) {
  vec2 p = (uv - 0.5) * uCardK;
  // Brushed metal: fine streaks along a diagonal, catching light as you tilt.
  float brush = vnoise(vec2(dot(p, vec2(0.7, 0.7)) * 6.0, dot(p, vec2(-0.7, 0.7)) * 260.0));
  float band = 0.5 + 0.5 * sin(dot(p, vec2(0.8, 0.6)) * 5.0 - (t.x + t.y) * 3.2);
  band = smoothstep(0.55, 1.0, band);
  float ring = 0.5 + 0.5 * sin(length(p - t * 0.3) * 30.0 - (t.x - t.y) * 4.0);
  vec3 steel = mix(vec3(0.1, 0.16, 0.34), vec3(0.78, 0.9, 1.0), L);
  vec3 col = mix(c, steel, 0.5);
  col += vec3(0.35, 0.6, 1.0) * (band * (0.35 + 0.45 * brush)) * (0.4 + 0.6 * L);
  col += vec3(0.2, 0.35, 0.8) * smoothstep(0.8, 1.0, ring) * 0.18;
  col += (brush - 0.5) * 0.08;
  return col;
}

vec3 holo(vec3 c, vec2 uv, vec2 t, float L) {
  vec2 g = uv * uCardK * 26.0;
  vec2 f = abs(fract(g) - 0.5);
  float lattice = smoothstep(0.38, 0.5, f.x + f.y);
  float hue = fract((uv.x * 0.7 + uv.y) * 1.3 + (t.x * 0.8 - t.y * 0.6) + (f.x - f.y) * 0.25);
  vec3 rainbow = hsv2rgb(vec3(hue, 0.7, 1.0));
  float band = pow(0.5 + 0.5 * sin((uv.x - uv.y * 0.8) * 9.0 + (t.x + t.y) * 6.0), 3.0);
  vec3 film = rainbow * (0.14 + 0.62 * band) * (0.82 + 0.18 * lattice);
  vec3 col = screen(c * 0.92, film);
  col = mix(col, col * vec3(1.08, 0.86, 0.92), 0.4);
  return col;
}

vec3 poly(vec3 c, vec2 uv, vec2 t, float L) {
  vec3 h = rgb2hsv(c);
  h.x = fract(h.x + uv.x * 0.35 + uv.y * 0.25 + t.x * 0.45 + t.y * 0.3);
  h.y = clamp(h.y * 1.35 + 0.2, 0.0, 1.0);
  h.z = clamp(h.z * 1.05 + 0.04, 0.0, 1.0);
  vec3 col = hsv2rgb(h);
  float sheen = smoothstep(0.75, 1.0, 0.5 + 0.5 * sin((uv.x + uv.y) * 6.0 - (t.x - t.y) * 5.0));
  return col + sheen * 0.22;
}

vec3 negative(vec3 c, vec2 uv, vec2 t, float L) {
  // Luminance flips, hue stays: darks glow, lights sink into violet ink.
  vec3 h = rgb2hsv(c);
  float v = 1.0 - L;
  vec3 col = hsv2rgb(vec3(h.x, h.y * 0.85, 1.0)) * v;
  col = mix(col, vec3(v) * vec3(0.55, 0.45, 0.85), 0.15);
  col *= vec3(0.9, 0.82, 1.1);
  col = clamp((col - 0.5) * 1.25 + 0.55, 0.0, 1.0); // more contrast so it reads as a rare, not a faded print
  float sweep = smoothstep(0.86, 1.0, 0.5 + 0.5 * sin((uv.x * 1.2 - uv.y) * 6.0 + (t.x + t.y) * 4.5));
  col += vec3(0.55, 0.4, 1.0) * sweep * 0.35;
  return col;
}


vec3 prism(vec3 c, vec2 uv, vec2 t, float L) {
  vec4 v = voronoi(uv * uCardK * 11.0);
  vec2 id = v.zw;
  float edge = 1.0 - smoothstep(0.0, 0.06, v.y - v.x);
  vec2 n = hash22(id * 1.7) * 2.0 - 1.0;
  float facing = 0.5 + 0.5 * sin(dot(n, t) * 4.0 + hash12(id) * 6.28);
  vec3 tint = hsv2rgb(vec3(fract(hash12(id + 3.1) + dot(n, t) * 0.4), 0.55, 1.0));
  vec3 col = screen(c * 0.92, tint * pow(facing, 2.0) * 0.55);
  col += vec3(0.85, 1.0, 1.0) * edge * (0.08 + 0.35 * facing);
  return col;
}


vec3 glitch(vec3 c, vec2 uv, vec2 t, float L, float lod) {
  float tick = floor(uTime * 9.0);
  float row = floor(uv.y * 26.0);
  float jump = step(0.86, hash12(vec2(row, tick)));
  float off = (hash12(vec2(row * 1.3, tick + 2.0)) - 0.5) * 0.08 * jump + t.x * 0.012;
  float r = face(uv + vec2(off + 0.012, 0.0), lod).r;
  float g = face(uv + vec2(off, 0.0), lod).g;
  float b = face(uv + vec2(off - 0.012, 0.0), lod).b;
  vec3 col = vec3(r, g, b);
  col = mix(col, col * vec3(0.55, 1.15, 0.7), 0.35);
  col *= 0.9 + 0.1 * step(0.5, fract(uv.y * 140.0));
  float blk = step(0.94, hash12(floor(uv * vec2(8.0, 18.0)) + tick));
  col = mix(col, vec3(0.36, 1.0, 0.55) * L + vec3(0.1, 0.0, 0.2), blk * 0.7);
  return col;
}
${LETTERING_GLSL}
${pack?.glsl ?? ''}
/** How much of a light motion's band or spot (see IdlePose in tune/model.ts) falls here, 0..1+. */
float motionLit(vec2 uv) {
  vec2 q = (uv - 0.5) * uCardK;
  float d = dot(q, vec2(cos(uBeam.z), sin(uBeam.z))) - uBeam.x;
  // A light bar: a flat core with soft edges, and a thin second bar trailing it.
  float band = (smoothstep(uBeam.y, uBeam.y * 0.4, abs(d)) + 0.65 * smoothstep(uBeam.y * 0.35, 0.0, abs(d + uBeam.y * 2.2))) * uBeam.w;
  // A stage spot: round, with a soft falloff and no rim.
  float r = length((uv - uLight) * uCardK) / uSpot.x;
  float spot = (1.0 - smoothstep(0.35, 1.0, r)) * uSpot.y;
  return max(band, spot);
}
void main() {
  if (!gl_FrontFacing) {
    vec2 buv = vec2(1.0 - vUv.x, vUv.y);
    // Under pixel art the back steps on the card's grid too.
    if (uPixel > 0.5) buv = (floor(buv * pixelGrid()) + 0.5) / pixelGrid();
    vec4 b = texture(uBack, buv);
    if (uShadow > 0.5) { o = vec4(0.0, 0.0, 0.0, b.a * 0.45 * uAlpha); return; }
    // The back's foil pixels (alpha 254, see src/card/back.ts) catch a band of light that steps
    // across them, one pixel of the back at a time, as the card tilts and turns.
    float foil = b.a > 0.99 ? clamp((1.0 - b.a) * 255.0, 0.0, 1.0) : 0.0;
    float a = b.a > 0.99 ? 1.0 : b.a;
    float cells = uPixel > 0.5 ? uPixel : 90.0; // one cell per back pixel, on any shape
    vec2 cell = floor(buv * uCardK * cells);
    float sweep = dot(cell, vec2(0.8, 0.6) / cells) - (uTilt.x * 0.45 + uTilt.y * 0.3) - vShade * 1.5;
    float wave = 0.5 + 0.5 * sin(sweep * 7.0);
    float glint = smoothstep(0.6, 1.0, wave) * (0.6 + 0.4 * hash12(cell));
    vec3 c = b.rgb / max(b.a, 1e-4);
    // The gold brightens and dims as a whole with the angle, and the band of light runs over it.
    c = mix(c, c * (0.8 + 0.55 * wave), foil);
    c += foil * glint * vec3(1.0, 0.93, 0.75);
    c *= 1.0 - clamp(-vShade, 0.0, 0.4);
    o = vec4(c * a, a) * uAlpha;
    return;
  }
  vec2 uv = vUv;
  float lod = 0.0;
  // Pixel art (src/dot): the face is already drawn on this grid; every pixel of the card reads its
  // cell's centre, so the finish's light steps in the same grain and the corners step too.
  if (uPixel > 0.5) uv = (floor(uv * pixelGrid()) + 0.5) / pixelGrid();
  vec4 base = face(uv, lod);
  if (uShadow > 0.5) { o = vec4(0.0, 0.0, 0.0, base.a * 0.45 * uAlpha); return; }
  if (base.a < 0.002) discard;
  vec3 c = base.rgb / max(base.a, 1e-4);
  vec3 m = texture(uMask, uv).rgb;
  if (uPlate < 0.5 && uArt.y * uCardK.y < 0.1 && (uv.y - uArt.w) * uCardK.y > 0.009 && m.b < 0.5 && m.r < 0.5) {
    // At thumbnail size the name is unreadable noise; paint plain frame instead.
    // (A trading card, whose art starts below its name bar, keeps its bars and boxes: they are what makes it one.)
    vec4 f = face(vec2(0.04 / uCardK.x, 0.5), 0.0);
    c = f.rgb / max(f.a, 1e-4);
  }
  float L = luma(c);
  // Layer 2's pass (docs/layering.md) draws only in its own area, at its strength; under is where
  // layer 1 lies beneath and only layer 2's light is to be added there.
  float range = foilRange(uv, L);
  float cover = 1.0;
  float under = 0.0;
  if (uLayer > 0.5) {
    cover = range * uLayerK;
    if (cover < 0.002) discard; // layer 2's pass
    under = uUnderOn * uBlend * areaOf(uRangeUnder, uRangeKeyUnder, uv, L);
  }
  float sel = uLayer > 0.5 ? 1.0 : range;
  vec3 col = c;
  int e = uEdition;
  // Finishes draw their pattern in tuned coordinates (zoom, rotation); the real uv comes back after.
  vec2 artUv = uv;
  uv = tunePattern(uv);
  tPattern = true;
  if (e == 1) col = foil(c, uv, uTilt, L);
  else if (e == 2) col = holo(c, uv, uTilt, L);
  else if (e == 3) col = poly(c, uv, uTilt, L);
  else if (e == 4) col = negative(c, uv, uTilt, L);
  else if (e == 6) col = prism(c, uv, uTilt, L);
  else if (e == 8) col = glitch(c, uv, uTilt, L, lod);
  ${pack?.dispatch ?? ''}
  tPattern = false;
  uv = artUv;
  // Warmth tunes its own ink (see touch/glsl.ts); Flip Lenticular shows two pictures, not a tint.
  if (e != 0 && e != 20 && e != 76) col = tuneColor(col, c);
  // Frame and outline get a slightly softer treatment than the art.
  float amt = uIntensity * mix(0.7, 1.0, m.r);
  if (e == 5 || e == 4 || e == 12 || e == 24 || e == 26 || e == 72 || e == 80 || e == 82 || e == 90) amt = uIntensity; // these cover the frame in full (Blacklight's lamp lights it as fully as the art)
  if (uLayer > 0.5) amt = uIntensity; // layer 2 often lies on the frame: in full there too
  if (e == 13 || e == 18) amt *= m.r; // facets and the cosmos foil stay in the art window
  amt *= 1.0 - m.b; // the ink outline always stays ink
  amt *= sel;
  // A light motion's band or spot: the finish blazes where it falls and fades into the shade elsewhere.
  // It falls on the art in full and on the paper border at half, so the border never flares white.
  float beamLit = motionLit(uv) * mix(0.5, 1.0, m.r);
  float dark = uDim * (1.0 - min(beamLit, 1.0));
  amt *= 1.0 - dark;
  col = mix(c, col, amt);
  col += (col - c) * beamLit * 0.6 * sel;
  // The light falls on the whole card, its glossy surface showing a faint sheen where it is brightest.
  // The shade is a cool night blue rather than grey.
  col *= (1.0 + beamLit * 0.3) * mix(vec3(1.0), vec3(0.3, 0.33, 0.47), dark);
  col += uTLight * beamLit * beamLit * 0.06;
  // Layer 2's light: what its finish adds to the plain picture (the lettering is layer 1's to draw).
  vec3 lit = max(col - c, 0.0);
  col = lettering(col, uv, uTilt);
  // Specular hotspot that follows the light.
  float spec = 0.0;
  if (e == 72) {
    // An ultraviolet lamp casts no white glare; its beam is drawn by the finish.
  } else if (e != 0) {
    float d = length((uv - uLight) * uCardK);
    // Glow's room is dim, so only a faint glare reaches it.
    spec = tuneGlare(d, 1.35, 3.0, 0.32 * uIntensity * (e == 70 ? 0.35 : 1.0)) * (1.0 - 0.6 * uSpot.y); // a spot lights the foil, not a glare
    if (e == 82) spec *= 0.3; // a soft glare, so it never washes out the Fireworks sparks
    if (e == 90) spec *= 0.4; // Chameleon's clear coat draws its own soft highlight
  } else {
    float d = length((uv - uLight) * uCardK);
    spec = tuneGlare(d, 1.6, 4.0, 0.1);
  }
  // Glare and glitter belong to the finish, so they stay inside the chosen Foil area.
  col += spec * uTLight * sel;
  vec3 glitter = e != 0 ? tuneGlitter(uv, uTilt) * uIntensity * tuneGlitterArea(e, m) * sel : vec3(0.0);
  col += glitter;
  lit += glitter;
  // Under a light motion's band or spot the brights roll off instead of clipping to flat white.
  col -= max(col - 0.82, 0.0) * 0.55 * min(beamLit * 2.0, 1.0);
  // Tilting away darkens a touch; tilting towards brightens.
  float shade = 1.0 + clamp(vShade, -0.25, 0.25) * 0.8;
  col *= shade;
  lit *= shade;
  // The light comes in a few levels, as a palette would.
  if (uPixel > 0.5) col = floor(col * 18.0 + 0.5) / 18.0;
  col = showRange(col, uv, range);
  if (uGlint > -1.0) {
    // Stepped on a coarse pixel grid, like the rest of the page: a bright bar with a thin one trailing.
    vec2 gs = uPixel > 0.5 ? pixelGrid() : uCardK * 60.0;
    vec2 g = floor(vUv * gs) / gs;
    float d = g.x * 0.8 + g.y * 0.6 - uGlint;
    float streak = step(abs(d), 0.045) + step(abs(d + 0.11), 0.012) * 0.7;
    col = mix(col, vec3(1.0, 0.98, 0.9), streak * 0.6);
  }
  if (uStar.z > 0.0) {
    // A four-point star on the same coarse pixels as the card back, its arms growing with its power.
    vec2 q = ((floor(vUv * uCardK * 90.0) + 0.5) / (uCardK * 90.0) - uStar.xy) * uCardK;
    float arm = 0.36 * uStar.z;
    float rays = max(step(abs(q.x), 0.006) * smoothstep(arm, 0.0, abs(q.y)), step(abs(q.y), 0.006) * smoothstep(arm, 0.0, abs(q.x)));
    // Short diagonal rays and a 3 × 3 core while it is bright.
    rays = max(rays, step(abs(q.x - q.y), 0.008) * smoothstep(arm * 0.35, 0.0, abs(q.x)) + step(abs(q.x + q.y), 0.008) * smoothstep(arm * 0.35, 0.0, abs(q.x)));
    float core = step(max(abs(q.x), abs(q.y)), 0.012 * step(0.4, uStar.z));
    float halo = exp(-dot(q, q) / 0.004) * 0.45;
    col = mix(col, vec3(1.0, 0.98, 0.9) * uTLight, clamp((max(rays, core) + halo) * uStar.z, 0.0, 1.0));
  }
  col = mix(col, vec3(1.0), uFlash);
  // Laid over: the finish with its alpha. Light only: added to what is beneath, which keeps its alpha.
  o = vec4(mix(clamp(col, 0.0, 1.0) * base.a, lit * base.a, under), mix(base.a, 0.0, under)) * uAlpha * cover;
}
`;

export const PARTICLE_VS = /* glsl */ `#version 300 es
in vec4 aP;    // x, y (css px), size, life 0..1
in vec3 aC;
uniform vec2 uRes;
uniform float uDpr;
out vec3 vC;
out float vLife;
void main() {
  vec2 ndc = vec2(aP.x / uRes.x * 2.0 - 1.0, 1.0 - aP.y / uRes.y * 2.0);
  gl_Position = vec4(ndc, 0.0, 1.0);
  gl_PointSize = aP.z * uDpr;
  vC = aC; vLife = aP.w;
}
`;

export const PARTICLE_FS = /* glsl */ `#version 300 es
precision mediump float;
in vec3 vC;
in float vLife;
out vec4 o;
void main() {
  float a = smoothstep(0.0, 0.25, vLife);
  o = vec4(vC * a, a);
}
`;
