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
// The heat ramp of a thermal camera: near-black and deep indigo at the cold end, then violet,
// magenta, red and orange, up to a white-hot core. One chunk per band keeps the cold end dark and
// indigo, so the picture's own hues never stand in for the ramp.
vec3 iron(float x) {
  x = clamp(x, 0.0, 1.0);
  vec3 col = vec3(0.02, 0.00, 0.04);
  col = mix(col, vec3(0.16, 0.01, 0.30), smoothstep(0.00, 0.16, x));
  col = mix(col, vec3(0.47, 0.02, 0.44), smoothstep(0.16, 0.32, x));
  col = mix(col, vec3(0.80, 0.05, 0.13), smoothstep(0.32, 0.48, x));
  col = mix(col, vec3(0.96, 0.30, 0.01), smoothstep(0.48, 0.64, x));
  col = mix(col, vec3(1.00, 0.62, 0.02), smoothstep(0.64, 0.80, x));
  col = mix(col, vec3(1.00, 0.92, 0.42), smoothstep(0.80, 0.93, x));
  col = mix(col, vec3(1.00, 0.99, 0.94), smoothstep(0.93, 1.00, x));
  return col;
}

// A tiny seven-segment glyph field, so the readout can print real degrees. Segment bits: a=1, b=2,
// c=4, d=8, e=16, f=32, g=64; the one extra glyph is C, for the unit.
float thBox(vec2 p, vec2 lo, vec2 hi, float s) {
  vec2 d = max(lo - p, p - hi);
  return 1.0 - smoothstep(0.0, s, max(d.x, d.y));
}
float thGlyph(vec2 p, int d) {
  p = (p - 0.09) / 0.82; // inset each glyph, so a gap separates digits and a lone 1 stays whole
  if (d == 1) p.x += 0.36; // a 1 is only a right column: centre it, so digits space evenly
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
  float s = 0.06;
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
    res = max(res, thGlyph(vec2(p.x - float(i) * 0.88, p.y), di) * show);
  }
  return res;
}
// How many digits a reading needs, so a small number never prints a leading zero.
float thDigits(float v) {
  v = floor(v + 0.5);
  return v >= 99.5 ? 3.0 : (v >= 9.5 ? 2.0 : 1.0);
}
float thRing(vec2 p, float r, float w) {
  return 1.0 - smoothstep(w, w + 0.02, abs(length(p) - r));
}
// A small solid diamond: the hotspot's marker, replacing a bulky letter prefix.
float thMark(vec2 p) {
  return 1.0 - smoothstep(0.26, 0.40, abs(p.x) + abs(p.y));
}
// A temperature in degrees: its digits, a degree ring and the unit C.
float thTemp(vec2 p, float v) {
  float n = thDigits(v);
  float wnum = (n - 1.0) * 0.88 + 0.82;
  float s = thNum(p, v, n);
  s = max(s, thRing(p - vec2(wnum + 0.26, 0.86), 0.12, 0.05));
  s = max(s, thGlyph(p - vec2(wnum + 0.54, 0.0), 10));
  return s;
}

// A thermal camera's view: the picture's tones are temperatures, so the heat ramp replaces the
// picture's own hues rather than tinting them. Tilting slides the read hard — one way most of the
// scene cools to indigo while the picture's own bright end stays pinned in the orange and glows, the
// other pushes the mids up to orange and yellow. A soft knee keeps a hot core from flattening to a
// slab. The card's frame holds one family of iron tone across a soft gradient and a faint shimmer
// that answers the tilt. The camera's display — a graded scale with its low and high in degrees tied
// to the bar's ends, a reticle, brackets and a small hotspot marker — sits inside the art window,
// clear of the art's own bright spots and corner glyphs.
vec3 thermal(vec3 c, vec2 uv, vec2 t, float L, float lod) {
  float art = texture(uMask, uv).r; // the art window (its frame reads its own brightness below)
  // Detector blur: a hair of neighbour bleed so a lone hot pixel reads as a dot, not a cross.
  vec2 px = 0.4 / (uCardK * 150.0);
  float Ld = L;
  for (int i = 0; i < 4; i++) {
    vec2 o = i == 0 ? vec2(px.x, 0.0) : (i == 1 ? vec2(-px.x, 0.0) : (i == 2 ? vec2(0.0, px.y) : vec2(0.0, -px.y)));
    vec4 b = face(uv + o, lod + 1.0);
    Ld = max(Ld, luma(b.rgb / max(b.a, 1e-4)));
  }
  Ld = mix(L, Ld, 0.32);
  // The window the camera reads, in degrees; tilting slides it, so one way cools and one way warms.
  float wCenter = 31.0 + t.x * 15.0 + t.y * 6.0;
  float wSpan = 20.0;
  float wLo = wCenter - wSpan * 0.5;
  float wHi = wCenter + wSpan * 0.5;
  // The card's own idle lean is the neutral read, so a resting card still shows the plain thermal
  // view and only a real lean slides the window: the cool side drops the dim rest to indigo while the
  // picture's own hot end is floored orange and only the core glows; the warm side lifts the mids to
  // orange and yellow. The soft knee below compresses the top, keeping its gradation.
  float lean = t.x + t.y * 0.35 - 0.40;
  float wpos = smoothstep(0.08, 0.60, lean);
  float wneg = smoothstep(0.08, 0.60, -lean);
  float drift = fbm(asTrading(uv) * 2.4 + vec2(uTime * 0.02, -uTime * 0.013) + t * 0.5) - 0.5;
  // Sensor grain: fine and slightly irregular, never a blocky dither. A jittered grid keeps it from
  // lining up into rows, and a slow reseed makes it crawl like a warmed detector.
  vec2 gcell = uv * uCardK * 520.0;
  vec2 gjit = vec2(hash12(floor(gcell)), hash12(floor(gcell) + 7.3)) - 0.5;
  float grain = hash12(floor(gcell + gjit * 1.4) + floor(uTime * 24.0) * 0.37) - 0.5;
  float base = clamp(Ld + drift * 0.10 + grain * 0.035, 0.0, 1.0);
  float coolHeat = max(base - 0.30 * wneg, 0.0) / (1.0 - 0.15 * wneg);
  float warmHeat = 0.90 * (1.0 - exp(-5.0 * base)) / (1.0 - exp(-5.0));
  float heat = mix(mix(base, warmHeat, wpos), coolHeat, wneg);
  float core = smoothstep(0.55, 0.90, Ld); // the picture's own bright end
  heat = max(heat, core * 0.78);
  heat = 0.02 + heat * 0.98;    // a small detector floor over black
  // A soft knee, not a hard edge: above it the ramp compresses, so a hot core keeps its gradation
  // instead of clipping into one flat slab of white-hot.
  float knee = 0.72, over = 1.0 - knee;
  heat = heat < knee ? heat : knee + over * (1.0 - exp(-(heat - knee) / over));
  heat = clamp(heat, 0.0, 1.0);
  // The frame keeps one family of iron tone: a soft vertical gradient, a faint heat shimmer and a
  // touch of tilt, all well up the ramp so it never turns pink or magenta.
  float fgrad = 0.855 + (uv.y - 0.5) * 0.035 - (uv.x - 0.5) * 0.015;
  float shimmer = (fbm(asTrading(uv) * 3.0 + vec2(uTime * 0.03, -uTime * 0.02) + t * 0.7) - 0.5) * 0.09;
  float heatFrame = clamp(fgrad + shimmer + (wpos - wneg) * 0.035, 0.80, 0.90);
  heat = mix(heatFrame, heat, art);
  vec3 col = iron(heat);
  col += vec3(1.0, 0.97, 0.9) * smoothstep(0.90, 1.0, heat) * 0.24;
  // The cold end cools to indigo, never to the picture's own hue (so a red heart never turns magenta).
  col = mix(col, vec3(0.05, 0.06, 0.16), 0.20 * (1.0 - heat) * art);

  // The camera's display, inside the art window (q is centred on it, in card-short-side units).
  vec2 hk = (uArt.zw - uArt.xy) * 0.5 * uCardK;
  vec2 q = (uv - mix(uArt.xy, uArt.zw, 0.5)) * uCardK;
  q.y = -q.y; // card uv runs downward, so measure the display with y up
  float dh = hk.y * 0.077, dw = dh * 0.62; // readings ~30% smaller than before
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
  // Vertical temperature scale on the left, inset from the corner brackets: the ramp itself at low
  // opacity so it reads as a gradient on any background, with ticks and its low and high in degrees,
  // each tied to its end of the bar by a short tick.
  float sx = -hk.x * 0.62, sTop = hk.y * 0.42, sBot = -hk.y * 0.42;
  float bar = (1.0 - smoothstep(0.012, 0.014, abs(q.x - sx))) * step(sBot - 0.012, q.y) * step(q.y, sTop + 0.012);
  float g = clamp((q.y - sBot) / (sTop - sBot), 0.0, 1.0);
  float sp = (sTop - sBot) / 8.0;
  float near = abs(fract((q.y - sBot) / sp + 0.5) - 0.5) * sp;
  float ticks = (1.0 - smoothstep(0.0, 0.0022, near)) * step(abs(q.x - sx), 0.020) * step(sBot - 0.012, q.y) * step(q.y, sTop + 0.012);
  float endTx = sx + 0.010;
  float endTick = max(
    (1.0 - smoothstep(0.0016, 0.0026, abs(q.y - sTop))) * step(abs(q.x - endTx), 0.011),
    (1.0 - smoothstep(0.0016, 0.0026, abs(q.y - sBot))) * step(abs(q.x - endTx), 0.011));
  float mxLab = thTemp(vec2((q.x - (sx + 0.028)) / dw, (q.y - (sTop - dh * 0.5)) / dh), wHi);
  float mnLab = thTemp(vec2((q.x - (sx + 0.028)) / dw, (q.y - (sBot - dh * 0.5)) / dh), wLo);
  // Hotspot reading: a diamond marker and the peak in degrees, held low and left where the art is
  // quiet, clear of the bright spots and the art's own corner glyphs.
  float hx0 = -hk.x * 0.55, hy0 = -hk.y * 0.62;
  float hmark = thMark(vec2((q.x - hx0) / dh, (q.y - hy0) / dh));
  float hsLab = thTemp(vec2((q.x - (hx0 + 0.040)) / dw, (q.y - (hy0 - dh * 0.5)) / dh), wHi + 3.0);
  // The scale bar carries the heat ramp; the marks and readings are the display's cool white.
  float ui = max(max(ring, rcH), max(cdot, max(max(vArm, hArm), max(mxLab, mnLab))));
  col = mix(col, iron(g), bar * art * 0.5);
  col += vec3(0.86, 0.94, 1.0) * ui * art * (0.30 + 0.22 * heat);
  col += vec3(0.55, 0.85, 1.0) * max(ticks, endTick) * art * 0.32;
  col += vec3(1.0, 0.85, 0.55) * hmark * art * 0.7;
  col += vec3(0.9, 0.95, 1.0) * hsLab * art * 0.42;
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
