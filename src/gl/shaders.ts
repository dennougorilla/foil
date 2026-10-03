// GLSL sources. Every effect is written from scratch for this project.

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
  col *= mix(0.42, 0.9, smoothstep(1.15, 0.1, r));
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

vec4 face(vec2 uv, float lod) { return textureLod(uFace, uv, lod); }

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
  vec2 p = uv * vec2(11.0, 15.4);
  vec2 ip = floor(p), fp = fract(p);
  float d1 = 9.0, d2 = 9.0; vec2 id = vec2(0);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 b = vec2(x, y);
    vec2 r = b + hash22(ip + b) - fp;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; id = ip + b; } else if (d < d2) { d2 = d; }
  }
  float edge = 1.0 - smoothstep(0.0, 0.06, sqrt(d2) - sqrt(d1));
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
  if (e == 1) col = foil(c, uv, uTilt, L);
  else if (e == 2) col = holo(c, uv, uTilt, L);
  else if (e == 3) col = poly(c, uv, uTilt, L);
  else if (e == 4) col = negative(c, uv, uTilt, L);
  else if (e == 5) col = gold(c, uv, uTilt, L);
  else if (e == 6) col = prism(c, uv, uTilt, L);
  else if (e == 7) col = galaxy(c, uv, uTilt, L);
  else if (e == 8) col = glitch(c, uv, uTilt, L, lod);
  // Frame and outline get a slightly softer treatment than the art.
  float amt = uIntensity * mix(0.7, 1.0, m.r);
  if (e == 5 || e == 4) amt = uIntensity;
  amt *= 1.0 - m.b; // the ink outline always stays ink
  col = mix(c, col, amt);
  // Specular hotspot that follows the light.
  float spec = 0.0;
  if (e != 0) {
    float d = length((uv - uLight) * vec2(1.0, 1.4));
    spec = pow(max(1.0 - d * 1.35, 0.0), 3.0) * 0.32 * uIntensity;
  } else {
    float d = length((uv - uLight) * vec2(1.0, 1.4));
    spec = pow(max(1.0 - d * 1.6, 0.0), 4.0) * 0.1;
  }
  col += spec;
  // Tilting away darkens a touch; tilting towards brightens.
  col *= 1.0 + clamp(vShade, -0.25, 0.25) * 0.8;
  if (uPixel > 0.5 && inArt > 0.5) col = floor(col * 18.0 + 0.5) / 18.0;
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
