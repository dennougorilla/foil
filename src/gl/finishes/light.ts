// Light pack: Galaxy, Aurora, Glow, Blacklight, Thermal and Shallows (the showpiece). See docs/packs.md.
import { SHALLOWS_GLSL } from '../shallows';
import { TOUCH_GLSL } from '../../touch/glsl';
import { GLOW_GLSL } from '../../touch/glow';
import { HeatLayer } from '../../touch/layer';
import { BLACKLIGHT_GLSL } from '../blacklight';
import type { FinishModule } from './types';

const finishes: FinishModule = {
  glsl: /* glsl */ `
vec3 galaxy(vec3 c, vec2 uv, vec2 t, float L) {
  vec2 par = t * 0.08;
  vec2 tu = asTrading(uv);
  float n = fbm(tu * 3.0 + par * 2.0 + uTime * 0.02);
  float n2 = fbm(tu * 5.0 - par * 3.0 + 4.0);
  vec3 nebula = mix(vec3(0.12, 0.05, 0.35), vec3(0.85, 0.25, 0.65), smoothstep(0.35, 0.75, n));
  nebula = mix(nebula, vec3(0.2, 0.55, 1.0), smoothstep(0.5, 0.85, n2) * 0.7);
  vec3 col = mix(c, c * 0.55 + nebula * 0.75, (1.0 - L) * 0.8 + 0.2);
  vec2 cell = floor((uv + par) * uCardK * 110.0);
  float s = hash12(cell);
  float tw = 0.5 + 0.5 * sin(s * 50.0 + uTime * 2.2 + (t.x + t.y) * 6.0);
  col += vec3(1.0) * step(0.965, s) * tw * 1.1;
  // A few bright four-point stars that drift with parallax
  vec2 sp = (uv + par * 2.5) * uCardK * 7.0;
  vec2 sc = floor(sp);
  vec2 so = fract(sp) - 0.25 - 0.5 * hash22(sc);
  float big = step(0.72, hash12(sc + 9.0));
  float cross = max(smoothstep(0.012, 0.0, abs(so.x)) * smoothstep(0.09, 0.0, abs(so.y)),
                    smoothstep(0.012, 0.0, abs(so.y)) * smoothstep(0.09, 0.0, abs(so.x)));
  float tw2 = 0.6 + 0.4 * sin(uTime * 3.0 + hash12(sc) * 30.0);
  col += vec3(0.85, 0.9, 1.0) * cross * big * tw2 * 1.2;
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
// The heat ramp of a thermal camera: cold black and deep blue, then violet, magenta, red and
// orange, up to a white-hot core. Built from one chunk per band, so the cold end stays clearly
// blue and the picture's own hues never stand in for the ramp.
vec3 iron(float x) {
  x = clamp(x, 0.0, 1.0);
  vec3 col = vec3(0.01, 0.00, 0.03);
  col = mix(col, vec3(0.02, 0.05, 0.32), smoothstep(0.00, 0.13, x));
  col = mix(col, vec3(0.20, 0.03, 0.55), smoothstep(0.13, 0.30, x));
  col = mix(col, vec3(0.62, 0.03, 0.44), smoothstep(0.30, 0.45, x));
  col = mix(col, vec3(0.86, 0.08, 0.08), smoothstep(0.45, 0.60, x));
  col = mix(col, vec3(0.98, 0.33, 0.01), smoothstep(0.60, 0.73, x));
  col = mix(col, vec3(1.00, 0.66, 0.02), smoothstep(0.73, 0.86, x));
  col = mix(col, vec3(1.00, 0.92, 0.40), smoothstep(0.86, 0.95, x));
  col = mix(col, vec3(1.00, 0.99, 0.95), smoothstep(0.95, 1.00, x));
  return col;
}

// A tiny seven-segment glyph field, so the readout can print real degrees. Segment bits: a=1, b=2,
// c=4, d=8, e=16, f=32, g=64; the extra glyphs are C (for the unit) and H (the hotspot mark).
float thBox(vec2 p, vec2 lo, vec2 hi, float s) {
  vec2 d = max(lo - p, p - hi);
  return 1.0 - smoothstep(0.0, s, max(d.x, d.y));
}
float thGlyph(vec2 p, int d) {
  int m = 0;
  if (d == 0) m = 63;
  else if (d == 1) m = 6;
  else if (d == 2) m = 91;
  else if (d == 3) m = 79;
  else if (d == 4) m = 102;
  else if (d == 5) m = 109;
  else if (d == 6) m = 125;
  else if (d == 7) m = 7;
  else if (d == 8) m = 127;
  else if (d == 9) m = 111;
  else if (d == 10) m = 57;  // C
  else if (d == 11) m = 118; // H
  float s = 0.10;
  float g = 0.0;
  g = max(g, thBox(p, vec2(0.16, 0.88), vec2(0.84, 1.00), s) * float((m >> 0) & 1));
  g = max(g, thBox(p, vec2(0.88, 0.52), vec2(1.00, 0.88), s) * float((m >> 1) & 1));
  g = max(g, thBox(p, vec2(0.88, 0.12), vec2(1.00, 0.48), s) * float((m >> 2) & 1));
  g = max(g, thBox(p, vec2(0.16, 0.00), vec2(0.84, 0.12), s) * float((m >> 3) & 1));
  g = max(g, thBox(p, vec2(0.00, 0.12), vec2(0.12, 0.48), s) * float((m >> 4) & 1));
  g = max(g, thBox(p, vec2(0.00, 0.52), vec2(0.12, 0.88), s) * float((m >> 5) & 1));
  g = max(g, thBox(p, vec2(0.16, 0.44), vec2(0.84, 0.56), s) * float((m >> 6) & 1));
  return clamp(g, 0.0, 1.0);
}
// An n-digit number (n up to 3) left-aligned in p's cell grid, each cell one unit wide.
float thNum(vec2 p, float v, float n) {
  v = floor(v + 0.5);
  float res = 0.0;
  for (int i = 0; i < 3; i++) {
    float show = step(float(i), n - 0.5);
    int di = int(mod(floor(v / pow(10.0, n - 1.0 - float(i))), 10.0));
    res = max(res, thGlyph(vec2(p.x - float(i), p.y), di) * show);
  }
  return res;
}
float thRing(vec2 p, float r, float w) {
  return 1.0 - smoothstep(w, w + 0.02, abs(length(p) - r));
}
// A temperature in degrees: its digits, a degree ring and the unit C.
float thTemp(vec2 p, float v, float n) {
  float s = thNum(p, v, n);
  s = max(s, thRing(p - vec2(n + 0.22, 0.86), 0.12, 0.05));
  s = max(s, thGlyph(p - vec2(n + 0.50, 0.0), 10));
  return s;
}

// A thermal camera's view: the picture's tones are temperatures, so the heat ramp replaces the
// picture's own hues rather than tinting them. The detector reads hot dots as one warm blob and the
// window shift has a soft shoulder, so tilting slides the range without blowing the picture out, and
// the camera's own display — a graded scale with its low/high degrees, a reticle, brackets and a
// hotspot reading — sits inside the art window.
vec3 thermal(vec3 c, vec2 uv, vec2 t, float L, float lod) {
  // Detector blur: neighbouring hot pixels merge into a blob instead of scattering into dots.
  vec2 px = 1.4 / (uCardK * 150.0);
  float Ld = L;
  for (int i = 0; i < 4; i++) {
    vec2 o = i == 0 ? vec2(px.x, 0.0) : (i == 1 ? vec2(-px.x, 0.0) : (i == 2 ? vec2(0.0, px.y) : vec2(0.0, -px.y)));
    vec4 b = face(uv + o, lod + 1.4);
    Ld = max(Ld, luma(b.rgb / max(b.a, 1e-4)));
  }
  Ld = mix(L, Ld, 0.7);
  // The window the camera reads, in degrees; tilting slides it slowly.
  float wCenter = 31.0 - t.x * 7.0 - t.y * 3.0;
  float wSpan = 20.0;
  float wLo = wCenter - wSpan * 0.5;
  float wHi = wCenter + wSpan * 0.5;
  float gain = 1.0 + t.x * 0.08 + t.y * 0.04;
  float bias = t.x * 0.04 + t.y * 0.02;
  float drift = fbm(asTrading(uv) * 2.4 + vec2(uTime * 0.02, -uTime * 0.013) + t * 0.5) - 0.5;
  float grain = hash12(floor(uv * uCardK * 260.0) + floor(uTime * 14.0) * 0.37) - 0.5;
  float heat = clamp(Ld * gain + bias + drift * 0.10 + grain * 0.035, 0.0, 1.0);
  heat = pow(heat, 0.82);       // lift the cold end so dark subjects stay legible
  heat = 0.05 + heat * 0.95;    // a small detector floor over black
  heat = heat - 0.16 * smoothstep(0.80, 1.0, heat); // soft shoulder: only a true core blooms
  heat = clamp(heat, 0.0, 1.0);
  vec3 col = iron(heat);
  col += vec3(1.0, 0.97, 0.9) * smoothstep(0.90, 1.0, heat) * 0.30;
  // A hint of the picture's own colour survives in the cold end, so it reads as a lens, not a print.
  col = mix(col, col * (0.72 + 0.55 * c), 0.10 * (1.0 - heat));

  // The camera's display, inside the art window (q is centred on it, in card-short-side units).
  vec2 hk = (uArt.zw - uArt.xy) * 0.5 * uCardK;
  vec2 q = (uv - mix(uArt.xy, uArt.zw, 0.5)) * uCardK;
  q.y = -q.y; // card uv runs downward, so measure the display with y up
  float art = texture(uMask, uv).r;
  float dh = hk.y * 0.11, dw = dh * 0.62;
  float w = 0.003;
  // Reticle at the centre: a ring, four short arms and a centre dot.
  float rc = 0.026, arm = 0.020;
  float ring = thRing(q, rc, 0.0016);
  float rcH = (1.0 - smoothstep(0.0016, 0.003, abs(q.y))) * step(rc * 1.2, abs(q.x)) * step(abs(q.x), rc * 1.2 + arm)
            + (1.0 - smoothstep(0.0016, 0.003, abs(q.x))) * step(rc * 1.2, abs(q.y)) * step(abs(q.y), rc * 1.2 + arm);
  float cdot = 1.0 - smoothstep(0.004, 0.006, length(q));
  // Corner brackets, as if the frame is being tracked.
  float bx = hk.x * 0.86, by = hk.y * 0.88, len = min(hk.x, hk.y) * 0.15;
  float vArm = (1.0 - smoothstep(0.0, w, abs(abs(q.x) - bx))) * step(abs(abs(q.y) - by), len);
  float hArm = (1.0 - smoothstep(0.0, w, abs(abs(q.y) - by))) * step(abs(abs(q.x) - bx), len);
  // Vertical temperature scale on the left: a graded translucent bar with ticks and its readings.
  float sx = -hk.x * 0.80, sTop = hk.y * 0.54, sBot = -hk.y * 0.54;
  float bar = (1.0 - smoothstep(0.012, 0.014, abs(q.x - sx))) * step(sBot - 0.012, q.y) * step(q.y, sTop + 0.012);
  float g = clamp((q.y - sBot) / (sTop - sBot), 0.0, 1.0);
  float sp = (sTop - sBot) / 8.0;
  float near = abs(fract((q.y - sBot) / sp + 0.5) - 0.5) * sp;
  float ticks = (1.0 - smoothstep(0.0, 0.0022, near)) * step(abs(q.x - sx), 0.020) * step(sBot - 0.012, q.y) * step(q.y, sTop + 0.012);
  float mxLab = thTemp(vec2((q.x - (sx + 0.026)) / dw, (q.y - (sTop + 0.010)) / dh), wHi, 2.0);
  float mnLab = thTemp(vec2((q.x - (sx + 0.026)) / dw, (q.y - (sBot - dh - 0.010)) / dh), wLo, 2.0);
  // Hotspot reading: a small panel, an H mark and the peak temperature in three digits.
  float hx0 = hk.x * 0.30, hy0 = -hk.y * 0.80, hw = hk.x * 0.66, hh = dh * 1.35;
  float panel = thBox(q, vec2(hx0, hy0), vec2(hx0 + hw, hy0 + hh), 0.006);
  float hsLab = thGlyph(vec2((q.x - (hx0 + 0.018)) / dw, (q.y - (hy0 + dh * 0.18)) / dh), 11);
  hsLab = max(hsLab, thTemp(vec2((q.x - (hx0 + 0.018 + dw * 0.80)) / dw, (q.y - (hy0 + dh * 0.18)) / dh), wHi + 3.0, 3.0));
  // The scale bar carries the heat ramp; the marks, labels and panel are the display's cool white.
  float ui = max(max(ring, rcH), max(cdot, max(max(vArm, hArm), max(mxLab, mnLab))));
  col += iron(g) * bar * 0.55;
  col += vec3(0.86, 0.94, 1.0) * ui * art * (0.42 + 0.34 * heat);
  col += vec3(0.55, 0.85, 1.0) * ticks * art * 0.5;
  col = mix(col, col * 0.45 + vec3(0.02, 0.05, 0.10), panel * art * 0.6);
  col += vec3(1.0, 0.85, 0.55) * hsLab * art * 0.62;
  return col;
}

${SHALLOWS_GLSL}
${TOUCH_GLSL}
${GLOW_GLSL}
${BLACKLIGHT_GLSL}
`,
  dispatch: /* glsl */ `
  else if (e == 7) col = galaxy(c, uv, uTilt, L);
  else if (e == 9) col = aurora(c, uv, uTilt, L);
  else if (e == 96) col = thermal(c, uv, uTilt, L, lod);
  else if (e == 17) col = shallows(c, uv, uTilt, L, lod, m.r);
  else if (e == 70) col = glow(c, uv, L, m.r);
  else if (e == 72) col = blacklight(c, uv, L, lod, m);
`,
  // Glow keeps the light shone on it in a touch field, like Warmth's heat (see touch/).
  layers: (gl) => {
    const heat = new HeatLayer(gl);
    return [{ bind: (p, d) => heat.bind(p, 6, d.heat) }];
  },
};
export default finishes;
