// Supporter pack: Opal, Raden, Confetti, Fireworks and Kintsugi (the showpiece). See docs/packs.md.
// Shader indices start at 40 to stay clear of the regular editions; the celebration finishes use 80 and 82.
import type { FinishModule } from './types';

const GLSL = /* glsl */ `
// Set just before each supporter finish runs: 1 inside the art window, 0 on the frame.
float artMask = 1.0;
vec3 kintsugi(vec3 c, vec2 uv, vec2 t, float L) {
  // The picture stays the subject: a few fine seams of gold mend it, and the
  // light that runs along them softens over the bright parts so it never flares there.
  float keep = smoothstep(0.45, 0.85, L);
  // Glazed ceramic: the art goes a touch warm, as if fired.
  vec3 glaze = mix(c, c * vec3(1.03, 0.99, 0.92), 0.5);
  // Breaks: warped cell borders, a handful of seams that branch into hairlines.
  vec2 w = uv * vec2(1.0, 1.4);
  w += (vec2(fbm(uv * 3.0), fbm(uv * 3.0 + 7.3)) - 0.5) * 0.24;
  vec4 v1 = voronoi(w * 2.6);
  vec4 v2 = voronoi(w * 8.0 + 3.1);
  float d1 = v1.y - v1.x;
  float d2 = v2.y - v2.x;
  // As layer 2 on the frame (docs/layering.md) it mends it: no subject to spare there, and bolder seams.
  float rimOnly = uLayer > 0.5 ? 1.0 - texture(uMask, uv).r : 0.0;
  float wide = (0.014 + 0.018 * vnoise(uv * 24.0)) * (1.0 + 0.9 * rimOnly);
  float seam = (1.0 - smoothstep(wide * 0.3, wide, d1));
  float hair = (1.0 - smoothstep(0.004, 0.014, d2)) * step(0.65, hash12(v2.zw)) * (1.0 - smoothstep(0.0, 0.25, d1));
  float vein = max(seam, hair * 0.8);
  // A thin darker rim on each seam, so the gold reads as raised.
  float rim = (1.0 - smoothstep(wide, wide * 2.4, d1)) * (1.0 - seam);
  // Gold: a warm ramp along the seam, and a bead of light that runs along it as you tilt.
  vec3 gold = mix(vec3(0.62, 0.38, 0.1), vec3(0.98, 0.8, 0.4), 0.5 + 0.5 * sin(d1 * 70.0 + uv.y * 9.0 + t.x * 2.0));
  float run = smoothstep(0.75, 1.0, sin((uv.x * 0.8 + uv.y) * 6.0 - (t.x + t.y) * 3.4 - uTime * 0.7));
  gold += vec3(1.0, 0.93, 0.74) * run * 0.6 * (1.0 - keep * 0.8);
  // On a pale frame, a deeper gold so the seams still read against it.
  gold = mix(gold, gold * vec3(0.66, 0.46, 0.18), rimOnly * smoothstep(0.55, 0.85, L));
  // The seams stop where the bright subject begins, so the gold mends around it, never across it.
  // Judge brightness on a blurred copy of the art so dithering can't let a seam slip through.
  float Lb = luma(face(uv, 5.0).rgb);
  float around = max(1.0 - smoothstep(0.3, 0.45, max(L, Lb)), rimOnly);
  vec3 col = mix(c, glaze * (1.0 - rim * (0.3 + 0.35 * rimOnly)), around);
  return mix(col, gold, vein * (0.9 + 0.1 * rimOnly) * around);
}

vec3 opal(vec3 c, vec2 uv, vec2 t, float L) {
  // Precious opal: the picture lies in a milky or dark stone, and from deep inside it soft
  // patches of pure spectral colour well up. Each patch is a grating of its own: it flashes
  // on at its own angle, slides through the spectrum as the card turns, and sinks again.
  vec2 p = uv * vec2(1.0, 1.4);
  vec3 fire = vec3(0.0);
  for (int i = 0; i < 2; i++) {
    float fi = float(i);
    // The deeper layer is larger, softer and slides further against the tilt, so the two part.
    vec2 q = p * (6.0 - fi * 2.6) - t * (0.3 + fi * 0.5) + fi * 13.7;
    // A strong warp turns the cells into flames and blotches with no straight edges.
    q += (vec2(fbm(q * 0.45), fbm(q * 0.45 + 5.2)) - 0.5) * 2.2;
    vec4 v = voronoi(q);
    vec2 id = v.zw + fi * 31.0;
    float h = hash12(id);
    // Each patch flashes as the tilt crosses its own ridges of angle, so some are always lit,
    // and drifts a little on its own so a still card still breathes.
    vec2 n = (hash22(id * 1.3) * 2.0 - 1.0) * 2.4;
    float on = smoothstep(0.45, 0.95, 0.5 + 0.5 * cos(dot(t, n) * 1.6 + h * 6.28 + sin(uTime * 0.3 + h * 9.0) * 0.8));
    // Mostly greens and blues, sometimes violet, and often enough the prized red and orange.
    float hue = h < 0.36 ? h * 0.3 : 0.3 + (h - 0.36) * 0.55;
    hue += dot(t, n) * 0.05;
    // Inside a patch: a few soft flashes along its grain, and a pinfire of finer grains.
    vec2 g = normalize(hash22(id + 7.0) - 0.5);
    float rib = 0.65 + 0.35 * sin(dot(q, g) * 6.0 + fbm(q * 1.5) * 2.0 + dot(t, n) * 2.5);
    float pin = smoothstep(0.65, 1.0, vnoise(q * 9.0 + h * 40.0));
    // Fine flashes inside the patch: thin bright streaks across its grain that run as it turns.
    float streak = pow(0.5 + 0.5 * sin(dot(q, vec2(-g.y, g.x)) * 26.0 + fbm(q * 3.0) * 6.0 - dot(t, n) * 4.0), 8.0);
    // Each patch glows from its heart and fades out before its neighbour, the deeper ones softer.
    float body = 1.0 - smoothstep(0.32 + fi * 0.1, 0.56 + fi * 0.2, v.x);
    // Equal brightness across the spectrum, so a blue flash burns as bright as an orange one.
    vec3 spec = hsv2rgb(vec3(fract(hue), 0.85, 1.0));
    spec *= 0.62 / max(luma(spec), 0.3);
    float lit = mix(0.06, 1.0, on) * (0.65 + 0.35 * hash12(id + 2.0));
    fire += spec * lit * body * (rib + pin * 0.45 + streak * 0.9 * (1.0 - fi)) * (1.0 - fi * 0.4);
  }
  // A dark body (black opal) under the shadows, a milky one under the lights.
  vec3 stone = mix(vec3(0.015, 0.02, 0.045), vec3(0.9, 0.92, 0.96), smoothstep(0.12, 0.85, L));
  // The milk only clouds the lights a little, so the subject keeps its colour.
  vec3 veil = mix(c, stone, 0.5 - 0.22 * smoothstep(0.3, 0.8, L));
  // The fire burns from inside: brightest in the dark stone, held back over the subject,
  // which is either light or strongly coloured.
  float subject = max(smoothstep(0.2, 0.6, L), smoothstep(0.3, 0.65, rgb2hsv(c).y) * smoothstep(0.12, 0.3, L));
  fire *= 1.0 - 0.85 * subject;
  float f = min(max(fire.r, max(fire.g, fire.b)), 1.0);
  vec3 col = veil * (1.0 - 0.45 * f) + fire * 1.5;
  // A soft glow on the domed surface, sliding with the light.
  vec2 dm = p - vec2(0.5, 0.7) + t * 0.35;
  return col + vec3(0.92, 0.95, 1.0) * exp(-dot(dm, dm) * 5.0) * 0.08;
}

// Abalone nacre: the colours a shell layer runs through as the angle changes, in order:
// deep blue, teal, green, gold, pink, violet and back to blue.
vec3 nacre(float d) {
  float x = fract(d) * 6.0;
  vec3 a = vec3(0.16, 0.34, 0.95), b = vec3(0.1, 0.78, 0.8), g = vec3(0.42, 0.9, 0.5);
  vec3 au = vec3(1.0, 0.86, 0.48), pk = vec3(1.0, 0.52, 0.72), vi = vec3(0.56, 0.4, 1.0);
  return x < 1.0 ? mix(a, b, x) : x < 2.0 ? mix(b, g, x - 1.0) : x < 3.0 ? mix(g, au, x - 2.0)
    : x < 4.0 ? mix(au, pk, x - 3.0) : x < 5.0 ? mix(pk, vi, x - 4.0) : mix(vi, a, x - 5.0);
}

// Cracked shell laid on black lacquer: x = how much shell (0 in the seams), yzw = its colour.
vec4 shell(vec2 p, vec2 t, float cells) {
  vec4 v = voronoi(p * cells);
  vec2 id = v.zw;
  float h = hash12(id);
  // Each piece lies at its own angle, so it changes colour at its own moment as the card turns.
  vec2 n = hash22(id * 1.7) * 2.0 - 1.0;
  // Growth lines, the shell's own strata, run across each piece in their own direction.
  vec2 g = normalize(hash22(id + 3.3) - 0.5);
  float strata = sin(dot(p, g) * cells * 3.5 + fbm(p * cells * 0.6 + h * 20.0) * 5.0);
  float line = pow(abs(strata), 3.0);
  // The colour flows across the shell as a whole; each piece only nudges it.
  float flow = fbm(p * 2.2) * 0.7 + p.y * 0.3;
  float d = flow + 0.12 * h + 0.07 * strata + dot(t, vec2(0.5, 0.38) + n * 0.7);
  // Nacre has a silvery luster over its colour that rolls across as the card turns,
  // and its growth lines catch it as fine bright threads.
  float luster = smoothstep(0.55, 1.0, 0.5 + 0.5 * sin(dot(p, vec2(0.8, 0.6)) * 4.0 - dot(t, vec2(2.4, 1.8)) + h * 1.5));
  vec3 col = mix(nacre(d), vec3(0.97, 0.97, 1.0), 0.06 + 0.3 * luster + 0.4 * line) * (0.72 + 0.28 * strata);
  // A piece facing the light flashes white-hot.
  col += vec3(1.0, 0.97, 0.94) * pow(max(1.0 - length(t * 0.9 - n * 0.75), 0.0), 4.0) * 0.55;
  float seam = smoothstep(0.012, 0.04, v.y - v.x);
  return vec4(seam, col);
}

vec3 raden(vec3 c, vec2 uv, vec2 t, float L) {
  // Raden: the picture is inlaid in mother-of-pearl on black lacquer. Its light parts become
  // cracked shell, its shadows sink into the lacquer, and the shell runs through blue, green,
  // pink and gold as the card turns.
  vec2 p = uv * vec2(1.0, 1.4);
  vec4 s = shell(p, t, 15.0);
  // Fusaishiki: the picture is painted under the thin shell, so its hues glow through the
  // nacre while the shell's own colour and luster ride on top. Seen through shell, the
  // paint is soft, so it comes from a blurred copy of the picture.
  vec3 under = face(uv, 2.5).rgb * (0.45 + 0.75 * s.yzw);
  vec3 pearl = mix(under, s.yzw * (0.4 + 1.1 * L), 0.5) + s.yzw * 0.12 * L;
  float inlay = smoothstep(0.1, 0.38, L) * s.x;
  // Lacquer: deep black with a blurred hint of the picture under a wet gloss.
  vec3 lacquer = face(uv, 6.0).rgb * 0.1 + vec3(0.012, 0.008, 0.006);
  float gloss = smoothstep(0.7, 1.0, 0.5 + 0.5 * sin((uv.y * 1.4 + uv.x * 0.5) * 3.2 + (t.x + t.y) * 2.2));
  lacquer += vec3(0.9, 0.92, 1.0) * gloss * 0.07;
  // Off the art (the nameplate and the frame) only a thin coat of pearl, so the name stays readable.
  vec3 col = mix(screen(c, s.yzw * 0.14), mix(lacquer, pearl, inlay), artMask);
  // The outer frame band: a ribbon of shell set in lacquer. The nameplate stays paper.
  float edge = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y) * 1.4);
  vec4 r = shell(p + 4.1, t, 15.0);
  vec3 ribbon = mix(vec3(0.015, 0.012, 0.01), r.yzw * 0.9, r.x);
  float frame = (1.0 - artMask) * (1.0 - smoothstep(0.058, 0.072, edge));
  return mix(col, ribbon, frame);
}

// ---- Celebration finishes for birthday and greeting cards: Confetti (80) and Fireworks (82) ----
// Their motion runs on cycles that an exported loop holds a whole number of times, so a GIF or
// APNG closes on itself. Held still (uTime stays 0, or a PNG) each stops at a festive moment.
// Both keep the art readable and leave the name on the nameplate as it is.

// A period near \`want\` seconds that an exported loop holds a whole number of times (live: \`want\`).
float cePeriod(float want) { return uLoop > 0.0 ? uLoop / max(1.0, floor(uLoop / want + 0.5)) : want; }
// The cycle that \`x\` (counted in cycles) is in; an exported loop wraps it, so the loop repeats exactly.
float ceCycle(float x, float period) {
  return uLoop > 0.0 ? mod(floor(x), max(1.0, floor(uLoop / period + 0.5))) : floor(x);
}
mat2 ceRot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
float ceSeg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0));
}
// A four-point twinkle of reach r around q.
float ceStar(vec2 q, float r) {
  vec2 a = abs(q);
  float rays = max(smoothstep(r * 0.09, 0.0, a.x) * smoothstep(r, 0.0, a.y), smoothstep(r * 0.09, 0.0, a.y) * smoothstep(r, 0.0, a.x));
  return rays + smoothstep(r * 0.3, 0.0, length(q)) * 0.6;
}

// Gold, silver or rainbow foil; \`lit\` 0..1 is how squarely the piece faces the light.
vec3 cfFoil(float kind, float h, float lit) {
  if (kind < 0.36) return mix(vec3(0.78, 0.53, 0.14), vec3(1.0, 0.93, 0.62), lit);
  if (kind < 0.56) return mix(vec3(0.64, 0.68, 0.76), vec3(1.0), lit);
  vec3 rb = hsv2rgb(vec3(fract(h * 5.3 + lit * 0.3), 0.72, 1.0));
  return mix(rb * 0.78, mix(rb, vec3(1.0), 0.3), lit);
}
// Lays a foil piece over col (\`d\`: its distance), with a sheen that slides across it as the card tilts.
vec3 cfLay(vec3 col, vec2 pq, float d, float size, float kind, float h, float lit, vec2 t, float aa, float alpha) {
  float sheen = smoothstep(0.55, 1.0, sin(dot(pq, vec2(0.8, 0.6)) / size * 1.6 + dot(t, vec2(2.2, 1.6)) + h * 6.28));
  vec3 foil = cfFoil(kind, h, lit) + vec3(1.0, 0.98, 0.92) * sheen * 0.35;
  return mix(col, foil, clamp(0.5 - d / aa, 0.0, 1.0) * alpha);
}
// Each piece leans its own way, so as the card tilts they flash one at a time.
float cfLit(vec2 n, float h, vec2 t) { return pow(0.5 + 0.5 * sin(dot(n, t) * 3.4 + h * 6.2831), 2.0); }
// Signed distance (card widths) to a piece centred at q, in its own frame: a square, a dot or a curled ribbon.
float cfShape(vec2 q, float shape, float size, float h) {
  if (shape < 0.42) {
    vec2 d = abs(q) - vec2(size, size * 0.75);
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
  }
  if (shape < 0.72) return length(q) - size * 0.72;
  float len = size * 2.4, f = 1.9 / size;
  float x = clamp(q.x, -len, len);
  float y = sin(x * f + h * 6.2831) * size * 0.42;
  float dy = cos(x * f + h * 6.2831) * size * 0.42 * f;
  return length(vec2(q.x - x, (q.y - y) / sqrt(1.0 + dy * dy))) - size * 0.22;
}

vec3 confetti(vec3 c, vec2 uv, vec2 t, float art) {
  vec2 q = uv * vec2(1.0, 1.4); // card widths
  float aa = max(fwidth(q.x), 0.0005) * 1.2;
  vec3 col = c;
  // Stuck to the card: a scatter, thinner over the middle of the picture where a message or a
  // face usually sits, and none on the nameplate. Shadows first, so they never land on a piece.
  const float G = 6.0;
  vec2 base = floor(q * G - 0.5);
  for (int pass = 0; pass < 2; pass++) {
    for (int j = 0; j < 2; j++) for (int i = 0; i < 2; i++) {
      vec2 cell = base + vec2(i, j);
      vec2 cen = (cell + 0.5 + (hash22(cell + 2.7) - 0.5) * 0.3) / G;
      vec2 cuv = tuneFaceUv(cen / vec2(1.0, 1.4));
      float mid = length((cuv - vec2(0.5, 0.42)) * vec2(1.0, 1.4));
      float dens = mix(0.22, 0.85, smoothstep(0.2, 0.56, mid)) * step(cuv.y, 0.85);
      if (hash12(cell + 5.9) > dens) continue;
      float h = hash12(cell + 11.3);
      float shape = hash12(cell + 8.1);
      float size = shape < 0.72 ? 0.017 + 0.011 * h : 0.016 + 0.004 * h;
      mat2 R = ceRot(h * 18.85);
      if (pass == 0) {
        // Lifted a hair off the card: a soft shadow down and to the right.
        float ds = cfShape(R * (q - cen - vec2(0.004, 0.007)), shape, size, h);
        col *= 1.0 - 0.32 * clamp(0.5 - ds / (aa * 4.0), 0.0, 1.0);
      } else {
        float lit = cfLit(hash22(cell + 9.4) * 2.0 - 1.0, h, t);
        vec2 pq = R * (q - cen);
        col = cfLay(col, pq, cfShape(pq, shape, size, h), size, hash12(cell + 3.3), h, lit, t, aa, 1.0);
        col += vec3(1.0, 0.97, 0.9) * pow(lit, 6.0) * ceStar(q - cen, size * 3.4) * 1.2;
      }
    }
  }
  vec2 ruv = tuneFaceUv(uv);
  // Falling pieces slip behind the nameplate.
  float open = 1.0 - smoothstep(0.85, 0.875, ruv.y);
  // Drifting down: two layers of pieces that sway, spin and flip as they fall. Each column falls
  // a whole number of its own rows a cycle and repeats every that many rows, so the loop closes.
  float pf = fract(uTime / cePeriod(4.8) + 0.37);
  for (int l = 0; l < 2; l++) {
    float fl = float(l);
    float C = fl < 0.5 ? 7.0 : 4.5;
    vec2 gq = q * C;
    float cx = floor(gq.x);
    float rows = 2.0 + floor(hash12(vec2(cx, fl * 7.0 + 1.0)) * 3.0);
    float row = floor(gq.y - pf * rows);
    vec2 id = vec2(cx, mod(row, rows) + fl * 31.0);
    if (hash12(id + 6.6) > 0.5) continue;
    float h = hash12(id + 4.4);
    float ph = 6.2831853 * (pf * (1.0 + floor(h * 2.0)) + h);
    vec2 cen = vec2(cx + 0.5 + 0.2 * sin(ph), row + 0.5 + pf * rows);
    float flip = cos(ph * 2.0 + h * 3.0);
    vec2 pq = ceRot(h * 12.0 + ph * (h > 0.5 ? 1.0 : -1.0)) * ((gq - cen) / C);
    float squash = max(abs(flip), 0.18);
    pq.x /= squash;
    float shape = hash12(id + 8.8);
    float size = (fl < 0.5 ? 0.013 : 0.019) * (0.85 + 0.3 * hash12(id + 1.9));
    float d = cfShape(pq, shape, size, h) * squash;
    float lit = mix(cfLit(hash22(id + 2.2) * 2.0 - 1.0, h, t), 0.5 + 0.5 * flip, 0.6);
    col = cfLay(col, pq, d, size, hash12(id + 3.3), h, lit, t, aa, open);
  }
  // Now and then a popper goes off from a bottom corner of the picture (the corner alternates live).
  float Pp = cePeriod(7.2);
  float xp = (uTime + 0.22) / Pp;
  float tau = fract(xp) * Pp; // seconds since the pop
  float side = mod(ceCycle(xp, Pp), 2.0);
  vec2 corner = vec2(mix(0.1, 0.9, side), 1.2);
  vec2 aim = normalize(vec2(side > 0.5 ? -0.65 : 0.65, -1.0));
  float fade = 1.0 - smoothstep(1.7, 2.25, tau);
  col += vec3(1.0, 0.88, 0.55) * exp(-tau * 9.0) * ceStar(q - corner, 0.14) * art;
  if (fade > 0.0) {
    for (int i = 0; i < 24; i++) {
      float fi = float(i);
      vec2 hh = hash22(vec2(fi, 3.0 + side));
      float h = hash12(vec2(fi, 9.0 + side));
      vec2 dir = ceRot((hh.x - 0.5) * 1.2) * aim;
      float settle = max(tau - 0.4, 0.0);
      vec2 cen = corner + dir * (0.3 + 0.55 * hh.y) * (1.0 - exp(-tau * 6.0))
               + vec2(0.03 * sin(tau * 5.0 + h * 6.28) * smoothstep(0.3, 0.9, tau), 0.07 * settle * settle);
      float flip = cos(tau * (5.0 + 5.0 * h) + h * 6.0);
      float squash = max(abs(flip), 0.18);
      vec2 pq = ceRot(h * 6.0 + tau * (3.0 + 4.0 * h)) * (q - cen);
      pq.x /= squash;
      float shape = hash12(vec2(fi, 4.0 + side));
      float size = 0.016 + 0.01 * h;
      float d = cfShape(pq, shape, size, h) * squash;
      float lit = mix(cfLit(hh * 2.0 - 1.0, h, t), 0.5 + 0.5 * flip, 0.6);
      col = cfLay(col, pq, d, size, hash12(vec2(fi, 6.0)), h, lit, t, aa, fade * open);
    }
  }
  return col;
}

// The sparkler's path round the frame (card widths): mid-frame on the sides and the top, and
// low on the nameplate, under the name.
const vec2 FW_C = vec2(0.5, 0.7045);
const vec2 FW_H = vec2(0.461, 0.6655);
const float FW_R = 0.045;
vec2 fwPath(float s) {
  float a = FW_H.x - FW_R, b = FW_H.y - FW_R, qr = 1.5707963 * FW_R;
  float d = fract(s) * (4.0 * a + 4.0 * b + 4.0 * qr);
  if (d < a) return FW_C + vec2(d, -FW_H.y);
  d -= a;
  if (d < qr) { float an = -1.5707963 + d / FW_R; return FW_C + vec2(a, -b) + FW_R * vec2(cos(an), sin(an)); }
  d -= qr;
  if (d < 2.0 * b) return FW_C + vec2(FW_H.x, -b + d);
  d -= 2.0 * b;
  if (d < qr) { float an = d / FW_R; return FW_C + vec2(a, b) + FW_R * vec2(cos(an), sin(an)); }
  d -= qr;
  if (d < 2.0 * a) return FW_C + vec2(a - d, FW_H.y);
  d -= 2.0 * a;
  if (d < qr) { float an = 1.5707963 + d / FW_R; return FW_C + vec2(-a, b) + FW_R * vec2(cos(an), sin(an)); }
  d -= qr;
  if (d < 2.0 * b) return FW_C + vec2(-FW_H.x, b - d);
  d -= 2.0 * b;
  if (d < qr) { float an = 3.1415927 + d / FW_R; return FW_C + vec2(-a, -b) + FW_R * vec2(cos(an), sin(an)); }
  return FW_C + vec2(-a + d - qr, -FW_H.y);
}

// Firework colours: gold, silver, crimson and jade.
vec3 fwColor(float i) {
  i = mod(i, 4.0);
  return i < 0.5 ? vec3(1.0, 0.74, 0.28) : i < 1.5 ? vec3(0.84, 0.9, 1.0) : i < 2.5 ? vec3(1.0, 0.2, 0.28) : vec3(0.16, 1.0, 0.68);
}

// What a spark's rim takes out of the picture under it: only the channels its colour lacks, so over
// a bright picture the rim is tinted the spark's own colour instead of going brown or grey.
vec3 fwInk(vec3 col) { return 1.0 - col * col; }

// How far a burst reaches towards angle a (y down), 0..1: hearts and stars bend the ring into their shape.
float fwReach(float kind, float a) {
  if (kind == 2.0) {
    // A polar heart, point down, with its notch at the burst point.
    float s = -sin(a), c = cos(a);
    return (s * sqrt(abs(c)) / (s + 1.4) - 2.0 * s + 2.0) * 0.25;
  }
  if (kind == 4.0) {
    // A five-pointed star, one point up: where the ray meets the edge from a tip to the next notch.
    const float SEG = 1.2566371;
    float f = abs(mod(a + 1.5707963 + SEG * 0.5, SEG) - SEG * 0.5);
    vec2 e = 0.4 * vec2(cos(SEG * 0.5), sin(SEG * 0.5)) - vec2(1.0, 0.0);
    return e.y / (cos(f) * e.y - sin(f) * e.x);
  }
  return 1.0;
}

// One firework bursting at \`cen\` (card widths), \`u\` cycles after the burst (below zero its rocket
// is still climbing). Kinds: 0 willow, 1 chrysanthemum, 2 heart, 3 peony, 4 star, 5 small bursts.
// Adds its light to \`light\`; \`shade\` gathers the soft, tinted rim around each spark that lets it read
// over a bright picture.
void fwBurst(vec2 q, vec2 cen, float R, float u, float seed, float kind, vec3 colA, vec3 colB, vec2 t, inout vec3 light, inout vec3 shade) {
  vec3 white = vec3(1.0, 0.96, 0.88);
  if (u < 0.0) {
    // The climb: a hot head slowing as it rises to the burst point, trailing a fading streak.
    float k = -u / 0.18;
    vec2 head = cen + vec2(0.012 * sin(k * 7.0 + seed), 0.6 * k * k);
    vec2 ba = vec2(0.0, 0.05 + 0.14 * k);
    float h = clamp(dot(q - head, ba) / dot(ba, ba), 0.0, 1.0);
    float d = length(q - head - ba * h);
    float fall = (1.0 - h) * (1.0 - h);
    float core = smoothstep(0.007, 0.002, length(q - head));
    light += colA * (smoothstep(0.0045, 0.001, d) * fall + exp(-d / 0.01) * 0.2 * fall) + white * (core * 1.3 + smoothstep(0.002, 0.0, d) * fall * 0.6);
    shade = max(shade, smoothstep(0.014, 0.004, d) * fall * fwInk(colA));
    return;
  }
  vec2 off = q - cen;
  // The flash as it opens.
  float flash = exp(-u * 45.0);
  float r2 = dot(off, off);
  light += white * flash * (ceStar(off, 0.17) * 0.9 + exp(-r2 / 0.0025) * 0.9);
  shade = max(shade, vec3(flash * exp(-r2 / 0.012) * 0.45));
  if (kind == 5.0) {
    // Small bursts: five little silver pops, one after another, that crackle out.
    for (int m = 0; m < 5; m++) {
      float fm = float(m);
      float um = u - fm * 0.045;
      if (um < 0.0 || um > 0.32) continue;
      vec2 om = q - cen - (hash22(vec2(seed, fm)) - 0.5) * R * 1.5;
      float lm = 1.0 - smoothstep(0.12, 0.32, um);
      light += white * exp(-um * 50.0) * exp(-dot(om, om) / 0.0012);
      if (length(om) > R * 0.5) continue;
      float a = floor(atan(om.y, om.x) / 0.5235988 + 0.5) * 0.5235988;
      vec2 p = vec2(cos(a), sin(a)) * R * 0.32 * (1.0 - exp(-um * 18.0)) + vec2(0.0, 0.12 * um * um);
      float d = length(om - p);
      float crackle = step(0.3, hash12(vec2(a * 7.0 + fm * 13.0, floor(um * 80.0) + seed)));
      light += (colA * 1.2 + white * 0.3) * smoothstep(0.0045, 0.0012, d) * lm * crackle + colA * exp(-d / 0.012) * 0.12 * lm;
      shade = max(shade, smoothstep(0.012, 0.004, d) * lm * crackle * fwInk(colA));
    }
    return;
  }
  // Per kind: how hard it droops, how its trails are drawn, and when it fades.
  float grav = kind == 0.0 ? 0.62 : kind == 1.0 ? 0.25 : kind == 3.0 ? 0.18 : 0.06;
  float trail = kind == 0.0 ? 0.035 : kind == 1.0 ? 0.024 : 0.0; // cycles between trail samples; 0: grains only
  float fadeA = kind == 0.0 ? 0.45 : 0.3;
  float life = 1.0 - smoothstep(fadeA, kind == 0.0 ? 0.8 : 0.6, u);
  float sag = grav * u * u;
  // A faint wash of its colour bleeds round the burst while it burns, so it stands out over bright art.
  shade = max(shade, fwInk(colA) * life * 0.16 * smoothstep(R * 1.4, R * 0.3, length(off - vec2(0.0, sag * 0.5))));
  if (life <= 0.0 || length(off - vec2(0.0, sag * 0.5)) > R * 1.15 + sag + 0.04) return;
  bool shaped = kind == 2.0 || kind == 4.0;
  float rays = shaped ? 40.0 : 36.0;
  float sector = 6.2831853 / rays;
  int samples = kind == 0.0 ? 10 : kind == 1.0 ? 7 : 2;
  float dt = trail > 0.0 ? trail : 0.02;
  // A willow's sparks keep drifting outwards as they fall, so their trails bend into arcs.
  float drag = kind == 0.0 ? 4.5 : 11.0;
  for (int j = 0; j < 10; j++) {
    if (j >= samples) break;
    float uj = u - float(j) * dt;
    if (uj < 0.0) break;
    float fresh = 1.0 - float(j) / float(samples);
    // Older parts of a trail are thinner and dimmer.
    float taper = fresh * fresh;
    vec2 v = off - vec2(0.0, grav * uj * uj);
    float a = atan(v.y, v.x) / sector - 0.5;
    float s0 = floor(a + 0.5);
    for (int k = 0; k < 2; k++) {
      float i = mod(s0 + (k == 0 ? 0.0 : (fract(a + 0.5) > 0.5 ? 1.0 : -1.0)), rays);
      float hi = hash12(vec2(i, seed));
      // Each spark has its own size and brightness, so a burst never reads as a string of beads.
      float hs = hash12(vec2(i, seed + 11.0));
      float bright = 0.45 + 1.1 * pow(hash12(vec2(i, seed + 13.0)), 2.0);
      float th = (i + 0.5 + (shaped ? 0.0 : (hi - 0.5) * 0.6)) * sector;
      float reach = shaped ? fwReach(kind, th) * (0.95 + 0.1 * hs) : 0.8 + 0.3 * hash12(vec2(seed, i + 7.0));
      vec2 dir = vec2(cos(th), sin(th)) * R * reach;
      vec2 pj = cen + vec2(0.0, grav * uj * uj) + dir * (1.0 - exp(-uj * drag));
      float d = length(q - pj);
      float w = 0.0022 + 0.0068 * hs * (trail > 0.0 ? taper : 1.0);
      // Chrysanthemum tips turn colour halfway; a willow's trail cools to orange.
      vec3 col = mix(colA, colB, smoothstep(0.14, 0.3, uj));
      if (kind == 0.0) col = mix(col, vec3(1.0, 0.42, 0.08), 1.0 - fresh);
      // Late on, the grains crackle on and off.
      float crackle = mix(1.0, step(0.4, hash12(vec2(i * 13.0 + float(j), floor(u * 60.0) + seed))), smoothstep(fadeA - 0.15, fadeA + 0.05, u));
      // A trail shows its head as a grain and only the odd glitter behind it.
      float on = trail <= 0.0 || j == 0 ? 1.0 : step(0.8, hash12(vec2(i * 7.0 + float(j), floor(u * 30.0) + seed))) * 0.6;
      // Foil grains: each ray leans its own way and flashes as the card tilts.
      vec2 n = hash22(vec2(i, seed + 3.0)) * 2.0 - 1.0;
      float lit = 0.6 + 0.9 * pow(0.5 + 0.5 * sin(dot(n, t) * 3.0 + hi * 6.2831), 4.0);
      float grain = smoothstep(w, w * 0.25, d) * fresh * crackle * on * bright;
      float halo = exp(-d / 0.012) * 0.2 * fresh * bright * on;
      float rim = smoothstep(w * 3.0, w * 0.9, d) * fresh * crackle * on;
      if (trail > 0.0) {
        // The streak it burnt on its way to the next grain, thinning with age.
        float un = min(uj + dt, u);
        float line = ceSeg(q, pj, cen + vec2(0.0, grav * un * un) + dir * (1.0 - exp(-un * drag)));
        float lw = 0.0008 + 0.0026 * taper;
        grain += smoothstep(lw, lw * 0.3, line) * taper * (0.8 + 0.4 * bright);
        halo += exp(-line / 0.01) * 0.14 * taper;
        rim = max(rim, smoothstep(lw * 3.0, lw, line) * taper * 0.8);
      }
      light += (col * (grain * 1.2 + halo) + white * grain * 0.25 * fresh) * lit * life;
      shade = max(shade, rim * life * fwInk(col));
    }
  }
}

// The sparkler (senko hanabi) running round the frame: a hot bead, a long glowing fuse behind it
// and pine-needle sparks that crackle off it.
vec3 fwSparkler(vec2 q, float ps, float which, inout float soot) {
  float s = ps * 0.5 + which * 0.5 + 0.18;
  vec2 head = fwPath(s);
  float d = length(q - head);
  vec3 add = vec3(1.0, 0.97, 0.85) * smoothstep(0.011, 0.004, d) + vec3(1.0, 0.5, 0.12) * exp(-d / 0.016) * 0.8;
  soot = max(soot, exp(-d / 0.04));
  // The burnt fuse glows on behind it, cooling from orange to deep red.
  vec2 prev = head;
  for (int k = 1; k < 15; k++) {
    float age = float(k) / 15.0;
    vec2 p = fwPath(s - float(k) * 0.004);
    float e = ceSeg(q, p, prev);
    prev = p;
    float ember = (1.0 - age) * (1.0 - age);
    add += mix(vec3(1.0, 0.55, 0.15), vec3(0.8, 0.12, 0.04), age) * (smoothstep(0.003, 0.0008, e) * 1.1 + exp(-e / 0.01) * 0.12) * ember;
    soot = max(soot, smoothstep(0.012, 0.0, e) * (1.0 - age) * 0.5);
  }
  // Shorter needles under the name.
  float reach = mix(1.0, 0.45, smoothstep(1.3, 1.36, head.y));
  float tick = floor(ps * 90.0);
  for (int k = 0; k < 6; k++) {
    vec2 hk = hash22(vec2(float(k) + which * 17.0, tick));
    if (hk.y < 0.25) continue;
    float an = hk.x * 6.2831853;
    vec2 dir = vec2(cos(an), sin(an));
    float len = (0.025 + 0.055 * hk.y) * reach;
    float e = ceSeg(q, head + dir * 0.01, head + dir * len);
    vec2 mid = head + dir * len * 0.6;
    e = min(e, ceSeg(q, mid, mid + ceRot(hk.y > 0.6 ? 0.7 : -0.7) * dir * len * 0.4));
    add += vec3(1.0, 0.78, 0.38) * smoothstep(0.003, 0.0, e) * 1.1;
  }
  return add;
}

vec3 fireworks(vec3 c, vec2 uv, vec2 t, float art) {
  vec2 ruv = tuneFaceUv(uv);
  vec2 q = ruv * vec2(1.0, 1.4);
  // The picture stays as it is: the fireworks carry their own light, with a soft tinted rim and a
  // touch of shade around each burst so they read over bright art too.
  // Three bursts, unevenly staggered through a cycle, each a different kind; live, every cycle
  // brings other kinds, colours, sizes and places.
  float P = cePeriod(3.0);
  // Phased so a still card (time 0) shows a star and a willow, a PNG (1.7 s) a chrysanthemum and a
  // peony, and an exported loop a star, a willow and a heart.
  float x = uTime / P + 0.32;
  vec3 light = vec3(0.0);
  vec3 shade = vec3(0.0);
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    float xk = x + fk / 3.0 + 0.05 * sin(fk * 2.3);
    float idx = ceCycle(xk, P);
    // Every other kind of the list, so the three in a cycle always differ.
    float kind = mod(idx + fk * 2.0 + 4.0, 6.0);
    vec2 hh = hash22(vec2(idx * 3.1 + fk, 5.0));
    float slot = mod(fk + idx, 3.0);
    vec2 cen = vec2(0.24 + 0.26 * slot + (hh.x - 0.5) * 0.12, 0.2 + 0.28 * hh.y);
    float size = 0.21 + 0.1 * hash12(vec2(idx, fk + 2.0));
    float R = kind == 0.0 ? size * 1.15 : kind == 2.0 || kind == 4.0 ? size * 0.85 : size;
    // A heart hangs below its notch.
    if (kind == 2.0) cen.y -= R * 0.45;
    float ci = floor(hash12(vec2(idx, fk + 9.0)) * 4.0);
    vec3 colA = kind == 0.0 ? fwColor(ci < 3.0 ? 0.0 : 1.0) : kind == 2.0 ? fwColor(ci < 2.0 ? 2.0 : 0.0) : kind == 5.0 ? fwColor(1.0) : fwColor(ci);
    vec3 colB = kind == 1.0 ? fwColor(ci + 1.0 + floor(hh.x * 2.0)) : colA;
    fwBurst(q, cen, R, fract(xk) - 0.18, idx * 7.0 + fk, kind, colA, colB, t, light, shade);
  }
  // A few stars printed in foil on the dark parts of the picture; they glint as the card tilts.
  vec4 bl = face(uv, 4.0);
  float dark = 1.0 - smoothstep(0.25, 0.5, luma(bl.rgb / max(bl.a, 1e-4)));
  vec2 sg = q * 16.0;
  vec2 sc = floor(sg);
  float hs = hash12(sc + 4.2);
  if (hs > 0.84) {
    vec2 so = fract(sg) - 0.5 - (hash22(sc + 1.3) - 0.5) * 0.5;
    float lit = pow(0.5 + 0.5 * sin(dot(hash22(sc) * 2.0 - 1.0, t) * 3.4 + hs * 40.0), 6.0);
    light += vec3(1.0, 0.86, 0.52) * ceStar(so, 0.18 + 0.22 * lit) * (0.3 + 1.1 * lit) * dark;
  }
  // Lettering and the subject's outlines stay clear: where the picture has strong contrast, the
  // fireworks pass faintly behind it. Judged a few mip levels down, so dithering and pixel art
  // don't count as detail.
  float detail = abs(luma(face(uv, 3.0).rgb) - luma(face(uv, 5.5).rgb));
  float clear = 1.0 - 0.8 * smoothstep(0.1, 0.25, detail);
  light *= clear;
  shade *= clear;
  // The brighter the picture under a spark, the deeper its (thin) rim, so gold still shows on white.
  vec3 sky = c * (1.0 - min(shade * (0.4 + 0.6 * luma(c)), vec3(0.88))) + light;
  // The frame stays as printed, with the sparkler running round it.
  float ps = fract(uTime / cePeriod(4.8) + 0.1);
  float soot = 0.0;
  vec3 fuse = fwSparkler(q, ps, 0.0, soot) + fwSparkler(q, ps, 1.0, soot);
  return mix(c * (1.0 - 0.45 * soot), sky, art) + fuse;
}
`;

const DISPATCH = /* glsl */ `
  // Gold seams stay off the nameplate so the title reads cleanly.
  else if (e == 40) col = mix(c, kintsugi(c, uv, uTilt, L), 0.25 + 0.75 * m.r);
  // The fire burns in the art; the frame and nameplate only take a glimmer of it.
  else if (e == 41) col = mix(c, opal(c, uv, uTilt, L), 0.3 + 0.7 * m.r);
  // Raden inlays the art; the frame only takes a light coat so the nameplate stays readable.
  else if (e == 43) { artMask = m.r; col = raden(c, uv, uTilt, L); }
  else if (e == 80) col = confetti(c, uv, uTilt, m.r);
  else if (e == 82) col = fireworks(c, uv, uTilt, m.r);
`;

const finishes: FinishModule = { glsl: GLSL, dispatch: DISPATCH };
export default finishes;
