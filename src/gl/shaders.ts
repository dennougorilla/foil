// GLSL sources. Every effect is written from scratch for this project.
import { TUNE_GLSL } from '../tune/glsl';
import { LETTERING_GLSL } from '../lettering';
import { RANGE_GLSL } from './range';
import { SPONSOR_DISPATCH, SPONSOR_GLSL } from './sponsorShaders';
import { SHADOWBOX_GLSL } from './shadowboxShader';

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
  vUv = aPos + 0.5;
  vShade = p.z / (uSize.y * uScale);
}
`;

export const CARD_FS = /* glsl */ `#version 300 es
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
uniform float uFaceTexels; // face texture width in px
uniform float uPlate;      // 0 = blank the nameplate (tiny hand cards)
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

vec3 gold(vec3 c, vec2 uv, vec2 t, float L) {
  vec3 dark = vec3(0.22, 0.1, 0.02), mid = vec3(0.92, 0.62, 0.18), hi = vec3(1.0, 0.95, 0.72);
  vec3 ramp = L < 0.55 ? mix(dark, mid, L / 0.55) : mix(mid, hi, (L - 0.55) / 0.45);
  vec3 col = mix(ramp, c * vec3(1.0, 0.85, 0.55), 0.22);
  float sweep = smoothstep(0.78, 1.0, 0.5 + 0.5 * sin((uv.x + uv.y * 0.6) * 8.0 + (t.x + t.y) * 6.0));
  col += vec3(1.0, 0.9, 0.6) * sweep * 0.55;
  vec2 cell = floor(uv * vec2(90.0, 126.0));
  float g = hash12(cell);
  float tw = smoothstep(0.86, 1.0, sin(g * 40.0 + (t.x - t.y) * 9.0 + uTime * 0.8) * 0.5 + 0.5);
  col += vec3(1.0, 0.95, 0.8) * tw * step(0.93, g) * 0.8;
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

vec3 galaxy(vec3 c, vec2 uv, vec2 t, float L) {
  vec2 par = t * 0.08;
  float n = fbm(uv * 3.0 + par * 2.0 + uTime * 0.02);
  float n2 = fbm(uv * 5.0 - par * 3.0 + 4.0);
  vec3 nebula = mix(vec3(0.12, 0.05, 0.35), vec3(0.85, 0.25, 0.65), smoothstep(0.35, 0.75, n));
  nebula = mix(nebula, vec3(0.2, 0.55, 1.0), smoothstep(0.5, 0.85, n2) * 0.7);
  vec3 col = mix(c, c * 0.55 + nebula * 0.75, (1.0 - L) * 0.8 + 0.2);
  vec2 cell = floor((uv + par) * vec2(110.0, 154.0));
  float s = hash12(cell);
  float tw = 0.5 + 0.5 * sin(s * 50.0 + uTime * 2.2 + (t.x + t.y) * 6.0);
  col += vec3(1.0) * step(0.965, s) * tw * 1.1;
  // A few bright four-point stars that drift with parallax
  vec2 sp = (uv + par * 2.5) * vec2(7.0, 9.8);
  vec2 sc = floor(sp);
  vec2 so = fract(sp) - 0.25 - 0.5 * hash22(sc);
  float big = step(0.72, hash12(sc + 9.0));
  float cross = max(smoothstep(0.012, 0.0, abs(so.x)) * smoothstep(0.09, 0.0, abs(so.y)),
                    smoothstep(0.012, 0.0, abs(so.y)) * smoothstep(0.09, 0.0, abs(so.x)));
  float tw2 = 0.6 + 0.4 * sin(uTime * 3.0 + hash12(sc) * 30.0);
  col += vec3(0.85, 0.9, 1.0) * cross * big * tw2 * 1.2;
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

vec3 aurora(vec3 c, vec2 uv, vec2 t, float L) {
  // Vertical curtains whose hem ripples sideways; strongest near the top.
  // Two layers of folded curtains; the hem ripples sideways as you tilt.
  float wave = sin(uv.y * 4.0 + uTime * 0.35 + t.x * 1.5) * 0.08;
  float x = (uv.x + wave) * 9.0 + t.x * 1.6;
  float ray = fbm(vec2(x, uTime * 0.1 + t.y * 0.5));
  float ray2 = fbm(vec2(x * 0.5 + 11.0, uTime * 0.07));
  ray = smoothstep(0.3, 0.75, ray) * 0.75 + smoothstep(0.35, 0.8, ray2) * 0.5;
  float hem = 0.78 + 0.08 * sin(uv.x * 5.0 + uTime * 0.5 + t.y * 2.0) + 0.04 * sin(uv.x * 17.0 - uTime);
  float curtain = ray * smoothstep(hem, hem - 0.6, uv.y) * smoothstep(-0.05, 0.25, uv.y);
  // Green body, a violet fringe at the very top, teal where it fades out.
  vec3 tone = mix(vec3(0.18, 1.0, 0.58), vec3(0.72, 0.36, 1.0), smoothstep(0.72, 0.95, 1.0 - uv.y + ray * 0.1));
  tone = mix(tone, vec3(0.25, 0.8, 0.95), smoothstep(0.55, 0.85, uv.y));
  vec3 col = c * vec3(0.62, 0.7, 0.85);
  col = screen(col, tone * curtain * 1.15);
  col += tone * 0.2 * curtain;
  return col;
}

vec3 frost(vec3 c, vec2 uv, vec2 t, float L) {
  float edge = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y) * 1.4);
  float n = fbm(uv * 9.0 + 3.0);
  float reach = smoothstep(0.26, 0.02, edge + (n - 0.5) * 0.22);
  // Dendrite-like streaks: ridges of a stretched noise field.
  float ridge = 1.0 - abs(vnoise(uv * vec2(70.0, 98.0)) * 2.0 - 1.0);
  ridge = pow(ridge, 8.0);
  float ridge2 = pow(1.0 - abs(vnoise(uv.yx * vec2(38.0, 52.0) + 7.0) * 2.0 - 1.0), 10.0);
  vec3 cold = mix(vec3(L), c, 0.55) * vec3(0.82, 0.94, 1.12) + vec3(0.02, 0.05, 0.1);
  vec3 ice = vec3(0.86, 0.95, 1.0) + (ridge + ridge2) * 0.3;
  vec3 col = mix(cold, ice, reach * (0.55 + 0.35 * max(ridge, ridge2)));
  vec2 cell = floor(uv * vec2(70.0, 98.0));
  float s = hash12(cell);
  float glint = step(0.96, s) * smoothstep(0.6, 1.0, sin(s * 40.0 + (t.x - t.y) * 8.0) * 0.5 + 0.5);
  col += vec3(0.9, 0.97, 1.0) * glint * (0.3 + reach);
  return col;
}

vec3 magma(vec3 c, vec2 uv, vec2 t, float L) {
  vec4 v = voronoi(uv * vec2(6.0, 8.4) + vec2(0.0, 0.3));
  float crack = 1.0 - smoothstep(0.0, 0.09, v.y - v.x);
  float pulse = 0.65 + 0.35 * sin(uTime * 1.8 + hash12(v.zw) * 6.28 + (t.x + t.y) * 2.0);
  vec3 stone = c * vec3(0.5, 0.38, 0.34) + vec3(0.03, 0.01, 0.0);
  vec3 lava = mix(vec3(1.0, 0.25, 0.05), vec3(1.0, 0.85, 0.3), crack * pulse);
  vec3 col = mix(stone, lava, crack * (0.75 + 0.25 * pulse));
  // The brightest parts of the art glow like embers.
  col += vec3(1.0, 0.45, 0.1) * smoothstep(0.6, 0.95, L) * 0.55 * pulse;
  col += vec3(1.0, 0.5, 0.15) * smoothstep(0.25, 0.0, v.y - v.x) * 0.12;
  return col;
}

float dots(vec2 uv, float ang, float ink) {
  float s = sin(ang), co = cos(ang);
  vec2 p = mat2(co, -s, s, co) * (uv * vec2(1.0, 1.4)) * 62.0;
  vec2 f = fract(p) - 0.5;
  float r = sqrt(clamp(ink, 0.0, 1.0)) * 0.62;
  return smoothstep(r + 0.06, r - 0.06, length(f));
}

vec3 halftone(vec3 c, vec2 uv, vec2 t, float L) {
  vec2 mis = t * 0.0025; // a little misregistration as you tilt
  vec3 ink = 1.0 - c;
  float k = min(ink.r, min(ink.g, ink.b));
  vec3 cmy = (ink - k) / max(1.0 - k, 1e-3);
  float dc = dots(uv + mis, 0.26, cmy.r);
  float dm = dots(uv - mis, 1.31, cmy.g);
  float dy = dots(uv, 0.0, cmy.b);
  float dk = dots(uv, 0.79, k * 1.1);
  vec3 paper = vec3(0.98, 0.95, 0.87);
  vec3 col = paper;
  col *= 1.0 - dc * vec3(0.9, 0.0, 0.0) * 0.95;
  col *= 1.0 - dm * vec3(0.0, 0.85, 0.0) * 0.95;
  col *= 1.0 - dy * vec3(0.0, 0.0, 0.9) * 0.95;
  col *= 1.0 - dk * 0.88;
  return col;
}

vec3 crystal(vec3 c, vec2 uv, vec2 t, float L, float lod) {
  // Triangular facets that each bend the picture a little and catch their own glint.
  vec2 p = uv * vec2(8.0, 11.2);
  vec2 ip = floor(p), fp = fract(p);
  float upper = step(fp.x, fp.y);
  vec2 id = ip * 2.0 + upper;
  vec2 n = hash22(id + 4.0) * 2.0 - 1.0;
  vec3 bent = face(uv + n * 0.012, lod).rgb;
  float lit = pow(max(dot(normalize(vec3(n, 1.6)), normalize(vec3(t * 0.9, 1.0))), 0.0), 18.0);
  float line = min(min(fp.x, 1.0 - fp.y), abs(fp.x - fp.y) * 0.7071);
  float edge = 1.0 - smoothstep(0.0, 0.025, line);
  vec3 col = bent * (0.88 + 0.18 * n.x) + vec3(0.92, 0.96, 1.0) * lit * 0.6;
  col += vec3(1.0) * edge * (0.06 + 0.3 * lit);
  float disp = 0.04 * dot(n, t);
  col += hsv2rgb(vec3(fract(hash12(id) + disp), 0.4, 1.0)) * lit * 0.25;
  return col;
}

vec3 sakura(vec3 c, vec2 uv, vec2 t, float L) {
  vec3 col = mix(c, c * vec3(1.06, 0.9, 0.96) + vec3(0.05, 0.0, 0.03), 0.6);
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float scale = 4.0 + fi * 2.5;
    vec2 q = uv * vec2(scale, scale * 1.4);
    q += vec2(sin(uTime * 0.4 + fi * 2.0 + uv.y * 3.0) * 0.35, -uTime * (0.25 + fi * 0.08));
    q += t * (0.3 + fi * 0.25);
    vec2 cell = floor(q);
    vec2 f = fract(q) - 0.5;
    float h = hash12(cell + fi * 13.0);
    if (h < 0.62) continue;
    f -= (hash22(cell + fi) - 0.5) * 0.5;
    float a = h * 6.28 + uTime * (0.6 + h);
    f = mat2(cos(a), -sin(a), sin(a), cos(a)) * f;
    // Petal: a squashed teardrop with a notch at its tip.
    // Petal: a teardrop (round base, pointed top) with a notch cut into the tip.
    float sz = 0.2 * (1.0 - fi * 0.18);
    vec2 g = f / sz;
    float w = 0.62 * (1.0 - smoothstep(-0.9, 1.0, g.y)) + 0.18;
    float d = length(vec2(g.x / w, g.y)) - 1.0;
    d = max(d, -(length(g - vec2(0.0, 1.0)) - 0.28));
    float petal = smoothstep(0.08, -0.08, d);
    float vein = smoothstep(0.08, 0.0, abs(g.x)) * smoothstep(1.0, -0.6, g.y);
    vec3 pink = mix(vec3(0.98, 0.55, 0.7), vec3(1.0, 0.86, 0.9), smoothstep(-0.2, -0.9, d));
    pink = mix(pink, vec3(0.95, 0.45, 0.62), vein * 0.5);
    col = mix(col, pink, petal * (0.95 - fi * 0.15));
  }
  return col;
}
${LETTERING_GLSL}

${SPONSOR_GLSL}
${SHADOWBOX_GLSL}
void main() {
  if (!gl_FrontFacing) {
    vec2 buv = vec2(1.0 - vUv.x, vUv.y);
    vec4 b = texture(uBack, buv);
    if (uShadow > 0.5) { o = vec4(0.0, 0.0, 0.0, b.a * 0.45 * uAlpha); return; }
    b.rgb *= 1.0 - clamp(-vShade, 0.0, 0.4);
    o = vec4(b.rgb * b.a, b.a) * uAlpha;
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
  else if (e == 5) col = gold(c, uv, uTilt, L);
  else if (e == 6) col = prism(c, uv, uTilt, L);
  else if (e == 7) col = galaxy(c, uv, uTilt, L);
  else if (e == 8) col = glitch(c, uv, uTilt, L, lod);
  else if (e == 9) col = aurora(c, uv, uTilt, L);
  else if (e == 10) col = frost(c, uv, uTilt, L);
  else if (e == 11) col = magma(c, uv, uTilt, L);
  else if (e == 12) col = halftone(c, uv, uTilt, L);
  else if (e == 13) col = crystal(c, uv, uTilt, L, lod);
  else if (e == 14) col = sakura(c, uv, uTilt, L);
  else if (e == 16) col = shadowbox(c, uv, uTilt, lod);
  ${SPONSOR_DISPATCH}
  tPattern = false;
  uv = artUv;
  if (e != 0) col = tuneColor(col, c);
  // Frame and outline get a slightly softer treatment than the art.
  float amt = uIntensity * mix(0.7, 1.0, m.r);
  if (e == 5 || e == 4 || e == 12) amt = uIntensity;
  if (e == 13) amt *= m.r; // facets only cut the art, never the nameplate
  amt *= 1.0 - m.b; // the ink outline always stays ink
  float sel = foilRange(uv, L);
  amt *= sel;
  col = mix(c, col, amt);
  col = lettering(col, uv, uTilt);
  // Specular hotspot that follows the light.
  float spec = 0.0;
  if (e != 0) {
    float d = length((uv - uLight) * vec2(1.0, 1.4));
    spec = tuneGlare(d, 1.35, 3.0, 0.32 * uIntensity);
  } else {
    float d = length((uv - uLight) * vec2(1.0, 1.4));
    spec = tuneGlare(d, 1.6, 4.0, 0.1);
  }
  // Glare and glitter belong to the finish, so they stay inside the chosen Foil area.
  col += spec * uTLight * sel;
  if (e != 0) col += tuneGlitter(uv, uTilt) * uIntensity * tuneGlitterArea(e, m) * sel;
  // Tilting away darkens a touch; tilting towards brightens.
  col *= 1.0 + clamp(vShade, -0.25, 0.25) * 0.8;
  if (uPixel > 0.5 && inArt > 0.5) col = floor(col * 18.0 + 0.5) / 18.0;
  col = showRange(col, uv, sel);
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
