// Jewel pack: Crystal, Opal, Raden and Kintsugi (the showpiece): precious things worked by hand.
// See docs/packs.md. Shader indices: Crystal 13, Kintsugi 40, Opal 41, Raden 43.
import type { FinishModule } from './types';

const GLSL = /* glsl */ `
// Set just before Raden runs: 1 inside the art window, 0 on the frame.
float artMask = 1.0;
vec3 kintsugi(vec3 c, vec2 uv, vec2 t, float L) {
  // The picture stays the subject: a few fine seams of gold mend it, and the
  // light that runs along them softens over the bright parts so it never flares there.
  float keep = smoothstep(0.45, 0.85, L);
  // Glazed ceramic: the art goes a touch warm, as if fired.
  vec3 glaze = mix(c, c * vec3(1.03, 0.99, 0.92), 0.5);
  // Breaks: warped cell borders, a handful of seams that branch into hairlines.
  vec2 w = uv * uCardK;
  vec2 tu = asTrading(uv);
  w += (vec2(fbm(tu * 3.0), fbm(tu * 3.0 + 7.3)) - 0.5) * 0.24;
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
  vec2 p = uv * uCardK;
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
  vec2 dm = p - uCardK * 0.5 + t * 0.35;
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
  vec2 p = uv * uCardK;
  vec4 s = shell(p, t, 15.0);
  // Fusaishiki: the picture is painted under the thin shell, so its hues glow through the
  // nacre while the shell's own colour and luster ride on top. Seen through shell, the
  // paint is soft, so it comes from a blurred copy of the picture.
  vec3 under = face(uv, 2.5).rgb * (0.45 + 0.75 * s.yzw);
  vec3 pearl = mix(under, s.yzw * (0.4 + 1.1 * L), 0.5) + s.yzw * 0.12 * L;
  float inlay = smoothstep(0.1, 0.38, L) * s.x;
  // Lacquer: deep black with a blurred hint of the picture under a wet gloss.
  vec3 lacquer = face(uv, 6.0).rgb * 0.1 + vec3(0.012, 0.008, 0.006);
  float gloss = smoothstep(0.7, 1.0, 0.5 + 0.5 * sin(dot(p, vec2(0.5, 1.0)) * 3.2 + (t.x + t.y) * 2.2));
  lacquer += vec3(0.9, 0.92, 1.0) * gloss * 0.07;
  // Off the art (the nameplate and the frame) only a thin coat of pearl, so the name stays readable.
  vec3 col = mix(screen(c, s.yzw * 0.14), mix(lacquer, pearl, inlay), artMask);
  // The outer frame band: a ribbon of shell set in lacquer. The nameplate stays paper.
  float edge = min(min(uv.x, 1.0 - uv.x) * uCardK.x, min(uv.y, 1.0 - uv.y) * uCardK.y);
  vec4 r = shell(p + 4.1, t, 15.0);
  vec3 ribbon = mix(vec3(0.015, 0.012, 0.01), r.yzw * 0.9, r.x);
  float frame = (1.0 - artMask) * (1.0 - smoothstep(0.058, 0.072, edge));
  return mix(col, ribbon, frame);
}
vec3 crystal(vec3 c, vec2 uv, vec2 t, float L, float lod) {
  // Triangular facets that each bend the picture a little and catch their own glint.
  vec2 p = uv * uCardK * 8.0;
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
`;

const DISPATCH = /* glsl */ `
  else if (e == 13) col = crystal(c, uv, uTilt, L, lod);
  // Gold seams stay off the nameplate so the title reads cleanly.
  else if (e == 40) col = mix(c, kintsugi(c, uv, uTilt, L), 0.25 + 0.75 * m.r);
  // The fire burns in the art; the frame and nameplate only take a glimmer of it.
  else if (e == 41) col = mix(c, opal(c, uv, uTilt, L), 0.3 + 0.7 * m.r);
  // Raden inlays the art; the frame only takes a light coat so the nameplate stays readable.
  else if (e == 43) { artMask = m.r; col = raden(c, uv, uTilt, L); }
`;

const finishes: FinishModule = { glsl: GLSL, dispatch: DISPATCH };
export default finishes;
