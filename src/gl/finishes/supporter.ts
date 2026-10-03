// Supporter pack: Opal, Raden and Kintsugi (the showpiece). See docs/packs.md.
// Shader indices start at 40 to stay clear of the regular editions.
import type { FinishModule } from './types';

const GLSL = /* glsl */ `
// Roughly the pixel size of the card art, so effects can land on the same grid.
const vec2 PIXEL_GRID = vec2(64.0, 89.6);
// Set just before each sponsor finish runs: 1 inside the art window, 0 on the frame.
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
  float wide = 0.014 + 0.018 * vnoise(uv * 24.0);
  float seam = (1.0 - smoothstep(wide * 0.3, wide, d1));
  float hair = (1.0 - smoothstep(0.004, 0.014, d2)) * step(0.65, hash12(v2.zw)) * (1.0 - smoothstep(0.0, 0.25, d1));
  float vein = max(seam, hair * 0.8);
  // A thin darker rim on each seam, so the gold reads as raised.
  float rim = (1.0 - smoothstep(wide, wide * 2.4, d1)) * (1.0 - seam);
  // Gold: a warm ramp along the seam, and a bead of light that runs along it as you tilt.
  vec3 gold = mix(vec3(0.62, 0.38, 0.1), vec3(0.98, 0.8, 0.4), 0.5 + 0.5 * sin(d1 * 70.0 + uv.y * 9.0 + t.x * 2.0));
  float run = smoothstep(0.75, 1.0, sin((uv.x * 0.8 + uv.y) * 6.0 - (t.x + t.y) * 3.4 - uTime * 0.7));
  gold += vec3(1.0, 0.93, 0.74) * run * 0.6 * (1.0 - keep * 0.8);
  // The seams stop where the bright subject begins, so the gold mends around it, never across it.
  // Judge brightness on a blurred copy of the art so dithering can't let a seam slip through.
  float Lb = luma(face(uv, 5.0).rgb);
  float around = 1.0 - smoothstep(0.3, 0.45, max(L, Lb));
  vec3 col = mix(c, glaze * (1.0 - rim * 0.3), around);
  return mix(col, gold, vein * 0.9 * around);
}

vec3 opal(vec3 c, vec2 uv, vec2 t, float L) {
  // Play of colour as broad bands of light drifting through the stone, not flecks:
  // the bands run diagonally, bend gently, and slide along as the light moves.
  vec2 g = (floor(uv * PIXEL_GRID) + 0.5) / PIXEL_GRID;
  vec2 p = g * vec2(1.0, 1.4);
  float warp = fbm(p * 1.8 + t * 0.1) * 1.4;
  float s = dot(p, vec2(0.62, 0.78)) * 3.2 + warp - (t.x + t.y) * 0.55 - uTime * 0.04;
  float band = pow(0.5 + 0.5 * sin(s * 6.2831), 2.0);
  vec3 spectral = hsv2rgb(vec3(fract(s * 0.5 + 0.55), 0.6, 1.0));
  // Milky depth first, then the colour tints the picture from within.
  vec3 milk = mix(c, vec3(0.82, 0.88, 0.96) * (0.45 + 0.6 * L), 0.12);
  vec3 col = mix(milk, milk * (0.5 + spectral * 0.85), band * 0.62);
  col += spectral * band * 0.12;
  return col;
}

vec3 raden(vec3 c, vec2 uv, vec2 t, float L) {
  // Mother-of-pearl: the picture stays as it is under a thin film whose colour
  // sways with the angle, and the frame turns to a band of pearl with fine growth lines.
  vec2 p = uv * vec2(1.0, 1.4);
  float edge = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y) * 1.4);
  // Over the picture: one smooth iridescent wash, no lines, a touch stronger in the shadows.
  // A smooth swing between teal and pink (no wrap-around, so no seams in the hue).
  float wash = 0.5 + 0.5 * sin((fbm(p * 1.6 + t * 0.25) * 1.4 + dot(t, vec2(0.3, 0.22)) + uv.y * 0.6) * 3.14159);
  vec3 film = hsv2rgb(vec3(mix(0.45, 0.92, wash), 0.42, 1.0));
  vec3 col = screen(c, film * (0.12 + 0.14 * (1.0 - L)));
  // On the frame: pearl, with growth lines running round the card.
  float lines = edge * 160.0 + vnoise(p * 30.0) * 1.5;
  float tint = 0.5 + 0.5 * sin((lines * 0.04 + dot(t, vec2(0.35, 0.25)) + fbm(p * 3.0) * 0.4) * 6.2831);
  vec3 nacre = hsv2rgb(vec3(mix(0.45, 0.92, tint), 0.42, 1.0)) * (0.86 + 0.14 * sin(lines * 2.0));
  vec3 pearl = mix(vec3(0.94, 0.93, 0.97), nacre, 0.7) * (0.84 + 0.2 * L);
  // The outer frame band only: the picture's border stays crisp and the nameplate stays paper.
  float frame = (1.0 - artMask) * (1.0 - smoothstep(0.058, 0.072, edge));
  col = mix(col, pearl, frame * 0.85);
  // A soft sheen that slides across as you tilt.
  float sheen = smoothstep(0.82, 1.0, 0.5 + 0.5 * sin((uv.y * 1.4 + uv.x * 0.5) * 3.2 + (t.x + t.y) * 2.2));
  col += vec3(1.0, 0.97, 1.0) * sheen * 0.1;
  return col;
}
`;

const DISPATCH = /* glsl */ `
  // Gold seams stay off the nameplate so the title reads cleanly.
  else if (e == 40) col = mix(c, kintsugi(c, uv, uTilt, L), 0.25 + 0.75 * m.r);
  else if (e == 41) col = opal(c, uv, uTilt, L);
  // Raden inlays the art; the frame only takes a light coat so the nameplate stays readable.
  else if (e == 43) { artMask = m.r; col = raden(c, uv, uTilt, L); }
`;

const finishes: FinishModule = { glsl: GLSL, dispatch: DISPATCH };
export default finishes;
