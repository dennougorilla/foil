// GLSL sources. Every effect is written from scratch for this project.
import { TUNE_GLSL } from '../tune/glsl';
import { LETTERING_GLSL } from '../lettering';
import { RANGE_GLSL } from './range';
import type { FinishModule } from './finishes/types';

const COMMON = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x),
             mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return v;
}
vec3 hsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}
vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);
}
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
vec3 screen(vec3 a, vec3 b) { return 1.0 - (1.0 - a) * (1.0 - b); }
// Cell noise: x = distance to nearest seed, y = to second nearest, zw = nearest cell id.
vec4 voronoi(vec2 p) {
  vec2 ip = floor(p), fp = fract(p);
  float d1 = 9.0, d2 = 9.0; vec2 id = vec2(0);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 b = vec2(x, y);
    vec2 r = b + hash22(ip + b) - fp;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; id = ip + b; } else if (d < d2) { d2 = d; }
  }
  return vec4(sqrt(d1), sqrt(d2), id);
}
`;

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
  float D = max(uSize.y, 120.0) * 3.2;
  float w = (D - p.z) / D;
  vec2 s = uCenter + uShift + p.xy / w;
  vec2 ndc = vec2(s.x / uRes.x * 2.0 - 1.0, 1.0 - s.y / uRes.y * 2.0);
  gl_Position = vec4(ndc * w, 0.0, w);
  vUv = mix(uUvRect.xy, uUvRect.zw, aPos + 0.5);
  vShade = p.z / (uSize.y * uScale);
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
uniform float uPixel;      // pixel columns across the card, 0 = off
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
uniform float uPlate;      // 0 = blank the nameplate (tiny hand cards)
uniform float uLoop;       // length of an exported loop in shader seconds; 0 on the live stage
out vec4 o;
${COMMON}
${TUNE_GLSL}
${RANGE_GLSL}

vec4 face(vec2 uv, float lod) { return textureLod(uFace, tuneFaceUv(uv), lod); }

vec3 foil(vec3 c, vec2 uv, vec2 t, float L) {
  vec2 p = (uv - 0.5) * vec2(1.0, 1.4);
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
  vec2 g = uv * vec2(26.0, 36.4);
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
  vec4 v = voronoi(uv * vec2(11.0, 15.4));
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
/** How much of a light motion's band or spot (see ExportView in tune/model.ts) falls here, 0..1+. */
float motionLit(vec2 uv) {
  vec2 q = (uv - 0.5) * vec2(1.0, 1.4);
  float d = dot(q, vec2(cos(uBeam.z), sin(uBeam.z))) - uBeam.x;
  // A light bar: a flat core with soft edges, and a thin second bar trailing it.
  float band = (smoothstep(uBeam.y, uBeam.y * 0.4, abs(d)) + 0.65 * smoothstep(uBeam.y * 0.35, 0.0, abs(d + uBeam.y * 2.2))) * uBeam.w;
  // A stage spot: round, with a soft falloff and no rim.
  float r = length((uv - uLight) * vec2(1.0, 1.4)) / uSpot.x;
  float spot = (1.0 - smoothstep(0.35, 1.0, r)) * uSpot.y;
  return max(band, spot);
}
void main() {
  if (!gl_FrontFacing) {
    vec2 buv = vec2(1.0 - vUv.x, vUv.y);
    vec4 b = texture(uBack, buv);
    if (uShadow > 0.5) { o = vec4(0.0, 0.0, 0.0, b.a * 0.45 * uAlpha); return; }
    // The back's foil pixels (alpha 254, see src/card/back.ts) catch a band of light that steps
    // across them, one pixel of the back at a time, as the card tilts and turns.
    float foil = b.a > 0.99 ? clamp((1.0 - b.a) * 255.0, 0.0, 1.0) : 0.0;
    float a = b.a > 0.99 ? 1.0 : b.a;
    vec2 cell = floor(buv * vec2(90.0, 126.0));
    float sweep = dot(cell, vec2(0.8, 0.6) / 90.0) - (uTilt.x * 0.45 + uTilt.y * 0.3) - vShade * 1.5;
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
  // Only the art window is pixelated; the frame and nameplate stay crisp.
  float inArt = texture(uMask, vUv).r;
  if (uPixel > 0.5 && inArt > 0.5) {
    vec2 grid = vec2(uPixel, floor(uPixel * 1.4 + 0.5));
    uv = (floor(uv * grid) + 0.5) / grid;
    lod = max(log2(uFaceTexels / uPixel) - 0.5, 0.0);
  }
  vec4 base = face(uv, lod);
  if (uShadow > 0.5) { o = vec4(0.0, 0.0, 0.0, base.a * 0.45 * uAlpha); return; }
  if (base.a < 0.002) discard;
  vec3 c = base.rgb / max(base.a, 1e-4);
  vec3 m = texture(uMask, uv).rgb;
  if (uPlate < 0.5 && uv.y > 0.885 && m.b < 0.5 && m.r < 0.5) {
    // At thumbnail size the name is unreadable noise; paint plain frame instead.
    vec4 f = face(vec2(0.04, 0.5), 0.0);
    c = f.rgb / max(f.a, 1e-4);
  }
  float L = luma(c);
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
  if (e == 5 || e == 4 || e == 12 || e == 24 || e == 26 || e == 72 || e == 80 || e == 82) amt = uIntensity; // these cover the frame in full (Blacklight's lamp lights it as fully as the art)
  if (e == 13 || e == 18) amt *= m.r; // facets and the cosmos foil stay in the art window
  amt *= 1.0 - m.b; // the ink outline always stays ink
  float sel = foilRange(uv, L);
  amt *= sel;
  // A light motion's band or spot: the finish blazes where it falls and fades into the shade elsewhere.
  // It falls on the art in full and on the paper border at half, so the border never flares white.
  float lit = motionLit(uv) * mix(0.5, 1.0, m.r);
  float shade = uDim * (1.0 - min(lit, 1.0));
  amt *= 1.0 - shade;
  col = mix(c, col, amt);
  col += (col - c) * lit * 0.6 * sel;
  // The light falls on the whole card, its glossy surface showing a faint sheen where it is brightest.
  // The shade is a cool night blue rather than grey.
  col *= (1.0 + lit * 0.3) * mix(vec3(1.0), vec3(0.3, 0.33, 0.47), shade);
  col += uTLight * lit * lit * 0.06;
  col = lettering(col, uv, uTilt);
  // Specular hotspot that follows the light.
  float spec = 0.0;
  if (e == 72) {
    // An ultraviolet lamp casts no white glare; its beam is drawn by the finish.
  } else if (e != 0) {
    float d = length((uv - uLight) * vec2(1.0, 1.4));
    // Glow's room is dim, so only a faint glare reaches it.
    spec = tuneGlare(d, 1.35, 3.0, 0.32 * uIntensity * (e == 70 ? 0.35 : 1.0)) * (1.0 - 0.6 * uSpot.y); // a spot lights the foil, not a glare
    if (e == 82) spec *= 0.3; // a soft glare, so it never washes out the Fireworks sparks
  } else {
    float d = length((uv - uLight) * vec2(1.0, 1.4));
    spec = tuneGlare(d, 1.6, 4.0, 0.1);
  }
  // Glare and glitter belong to the finish, so they stay inside the chosen Foil area.
  col += spec * uTLight * sel;
  if (e != 0) col += tuneGlitter(uv, uTilt) * uIntensity * tuneGlitterArea(e, m) * sel;
  // Under a light motion's band or spot the brights roll off instead of clipping to flat white.
  col -= max(col - 0.82, 0.0) * 0.55 * min(lit * 2.0, 1.0);
  // Tilting away darkens a touch; tilting towards brightens.
  col *= 1.0 + clamp(vShade, -0.25, 0.25) * 0.8;
  if (uPixel > 0.5 && inArt > 0.5) col = floor(col * 18.0 + 0.5) / 18.0;
  col = showRange(col, uv, sel);
  if (uGlint > -1.0) {
    // Stepped on a coarse pixel grid, like the rest of the page: a bright bar with a thin one trailing.
    vec2 g = floor(vUv * vec2(60.0, 84.0)) / vec2(60.0, 84.0);
    float d = g.x * 0.8 + g.y * 0.6 - uGlint;
    float streak = step(abs(d), 0.045) + step(abs(d + 0.11), 0.012) * 0.7;
    col = mix(col, vec3(1.0, 0.98, 0.9), streak * 0.6);
  }
  if (uStar.z > 0.0) {
    // A four-point star on the same coarse pixels as the card back, its arms growing with its power.
    vec2 q = ((floor(vUv * vec2(90.0, 126.0)) + 0.5) / vec2(90.0, 126.0) - uStar.xy) * vec2(1.0, 1.4);
    float arm = 0.36 * uStar.z;
    float rays = max(step(abs(q.x), 0.006) * smoothstep(arm, 0.0, abs(q.y)), step(abs(q.y), 0.006) * smoothstep(arm, 0.0, abs(q.x)));
    // Short diagonal rays and a 3 × 3 core while it is bright.
    rays = max(rays, step(abs(q.x - q.y), 0.008) * smoothstep(arm * 0.35, 0.0, abs(q.x)) + step(abs(q.x + q.y), 0.008) * smoothstep(arm * 0.35, 0.0, abs(q.x)));
    float core = step(max(abs(q.x), abs(q.y)), 0.012 * step(0.4, uStar.z));
    float halo = exp(-dot(q, q) / 0.004) * 0.45;
    col = mix(col, vec3(1.0, 0.98, 0.9) * uTLight, clamp((max(rays, core) + halo) * uStar.z, 0.0, 1.0));
  }
  col = mix(col, vec3(1.0), uFlash);
  o = vec4(clamp(col, 0.0, 1.0) * base.a, base.a) * uAlpha;
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
