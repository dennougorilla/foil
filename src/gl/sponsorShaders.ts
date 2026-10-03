// Sponsor-only finishes. Spliced into CARD_FS after COMMON, so hash/fbm/voronoi are in scope.
// Shader indices start at 40 to stay clear of the regular editions.

export const SPONSOR_GLSL = /* glsl */ `
// Roughly the pixel size of the card art, so effects can land on the same grid.
const vec2 PIXEL_GRID = vec2(64.0, 89.6);
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
  float seam = smoothstep(wide, wide * 0.3, d1);
  float hair = smoothstep(0.014, 0.004, d2) * step(0.65, hash12(v2.zw)) * smoothstep(0.25, 0.0, d1);
  float vein = max(seam, hair * 0.8);
  // A thin darker rim on each seam, so the gold reads as raised.
  float rim = smoothstep(wide * 2.4, wide, d1) * (1.0 - seam);
  // Gold: a warm ramp along the seam, and a bead of light that runs along it as you tilt.
  vec3 gold = mix(vec3(0.62, 0.38, 0.1), vec3(0.98, 0.8, 0.4), 0.5 + 0.5 * sin(d1 * 70.0 + uv.y * 9.0 + t.x * 2.0));
  float run = smoothstep(0.75, 1.0, sin((uv.x * 0.8 + uv.y) * 6.0 - (t.x + t.y) * 3.4 - uTime * 0.7));
  gold += vec3(1.0, 0.93, 0.74) * run * 0.6 * (1.0 - keep * 0.8);
  vec3 col = glaze * (1.0 - rim * 0.3);
  // Over the bright subject the seams thin to a hairline trace, so the gold mends around it.
  return mix(col, gold, vein * (0.9 - keep * 0.75));
}

vec3 opal(vec3 c, vec2 uv, vec2 t, float L) {
  // Play of colour inside the stone: soft patches deep in the picture warm to a
  // spectral hue when you look at them from their angle. The picture keeps its own colour.
  // Sampled on a coarse pixel grid so the colour sits in pixels, like the picture itself.
  vec2 g = (floor(uv * PIXEL_GRID) + 0.5) / PIXEL_GRID;
  vec2 p = g * vec2(1.0, 1.4);
  vec2 q = p * 6.0 + (vec2(vnoise(p * 3.0), vnoise(p * 3.0 + 5.2)) - 0.5) * 2.0;
  vec4 v = voronoi(q);
  vec2 id = v.zw;
  vec2 n = normalize(hash22(id) * 2.0 - 1.0 + 1e-3);
  float facing = sin(dot(n, t) * 2.6 + hash12(id + 2.0) * 6.28 + uTime * 0.2);
  float fire = smoothstep(-0.1, 0.9, facing);
  float hue = fract(hash12(id + 7.0) + dot(n, t) * 0.15 + v.x * 0.25);
  // No hard edges: each patch is a soft glow, strongest at its heart.
  float body = smoothstep(0.95, 0.1, v.x);
  vec3 spectral = hsv2rgb(vec3(hue, 0.8, 1.0));
  // The colour tints the picture from within (multiply), then a little glow on top.
  float k = fire * body;
  vec3 col = mix(c, c * (0.35 + spectral * 1.1), k * 0.85);
  col += spectral * k * k * 0.4;
  // A faint milky bloom drifting over the darker parts only.
  col += vec3(0.5, 0.62, 0.85) * (fbm(p * 2.5 + t * 0.15) - 0.45) * 0.12 * (1.0 - L);
  return col;
}

vec3 eclipse(vec3 c, vec2 uv, vec2 t, float L) {
  // The picture stays the subject: dusk only settles on its darker parts and
  // edges, while a small eclipse hangs in the upper corner and backlights it.
  vec2 q = (uv - 0.5) * vec2(1.0, 1.4);
  float keep = max(smoothstep(0.3, 0.68, L), smoothstep(0.55, 0.15, length(q)) * 0.6);
  vec3 col = mix(c * vec3(0.42, 0.44, 0.62), c * vec3(0.97, 0.96, 1.02), keep);
  // The sun sits behind the card, so it slides against the tilt.
  vec2 ctr = vec2(0.76, 0.17) - t * vec2(0.03, 0.025);
  vec2 d = (uv - ctr) * vec2(1.0, 1.4);
  float r = length(d);
  float a = atan(d.y, d.x);
  float R = 0.075;
  float stream = fbm(vec2(a * 2.6, r * 5.0 - uTime * 0.12)) + 0.55 * fbm(vec2(a * 7.0 + 3.0, r * 12.0 - uTime * 0.22));
  float corona = exp(-max(r - R, 0.0) * 16.0 / (0.35 + stream)) * step(R, r);
  vec3 hot = mix(vec3(1.0, 0.42, 0.14), vec3(1.0, 0.94, 0.84), smoothstep(0.35, 1.0, corona));
  // The corona brightens what is behind it rather than painting over it.
  col = screen(col, hot * corona * 0.95);
  // Its glow grazes the picture, warmest towards the sun.
  col += vec3(1.0, 0.55, 0.25) * exp(-r * 3.2) * (1.0 - keep * 0.5) * 0.2;
  // Chromosphere: a thin red-gold ring hugging the moon.
  col += vec3(1.0, 0.62, 0.42) * smoothstep(0.01, 0.0, abs(r - R)) * 0.9;
  // Diamond ring: one bead of sunlight on the rim, swinging round as you tilt.
  float ba = atan(t.y + 0.6, t.x + 0.0001) + uTime * 0.05;
  vec2 bead = vec2(cos(ba), sin(ba)) * R;
  // The moon: near black with a faint earthshine, its limb catching a little
  // light on the side where the sun breaks through.
  float disc = smoothstep(R + 0.003, R - 0.003, r);
  float limb = smoothstep(R * 0.35, R, r);
  float side = 0.5 + 0.5 * dot(d / max(r, 1e-4), bead / R);
  vec3 moon = c * 0.16 + vec3(0.008, 0.008, 0.02) + vec3(0.16, 0.12, 0.1) * limb * limb * side * side;
  col = mix(col, moon, disc);
  vec2 bd = d - bead;
  float glow = exp(-length(bd) * 50.0);
  float flare = (smoothstep(0.005, 0.0, abs(bd.x)) * smoothstep(0.1, 0.0, abs(bd.y))
               + smoothstep(0.005, 0.0, abs(bd.y)) * smoothstep(0.14, 0.0, abs(bd.x)));
  col += vec3(1.0, 0.97, 0.9) * (glow * 1.3 + flare * 0.6);
  return col;
}

vec3 raden(vec3 c, vec2 uv, vec2 t, float L) {
  // The picture stays the subject: its bright parts and centre keep their colour
  // under a thin pearl film, and only the shadows and edges turn to black lacquer
  // with cut shell inlaid.
  vec2 g = (floor(uv * PIXEL_GRID) + 0.5) / PIXEL_GRID;
  vec2 p = g * vec2(1.0, 1.4);
  float keep = max(smoothstep(0.24, 0.55, L), smoothstep(0.5, 0.12, length(p - vec2(0.5, 0.7))) * 0.7);
  vec2 w = p + (vec2(vnoise(p * 6.0), vnoise(p * 6.0 + 9.0)) - 0.5) * 0.06;
  vec4 v = voronoi(w * 30.0);
  vec2 id = v.zw;
  float cut = smoothstep(0.015, 0.05, v.y - v.x);
  // Each chip of shell has growth lines running its own way, and its own lean.
  float ang = hash12(id) * 6.28;
  vec2 dir = vec2(cos(ang), sin(ang));
  float s = dot(p, dir) * 60.0 + vnoise(p * 18.0 + id) * 5.0;
  float film = fract(s * 0.035 + dot(t, dir) * 0.45 + hash12(id + 1.0) * 0.5 + uTime * 0.02);
  // Shell only shifts through teal, blue, violet and pink, never orange.
  vec3 nacre = hsv2rgb(vec3(mix(0.42, 0.98, film), 0.5, 1.0)) * (0.7 + 0.3 * sin(s * 2.2));
  float lean = 0.55 + 0.45 * sin(dot(hash22(id + 4.0) * 2.0 - 1.0, t) * 3.0 + hash12(id + 5.0) * 6.28);
  // In the shadows: black lacquer that still shows the picture, with a sparse scatter of shell chips.
  vec3 lacquer = mix(c * 0.5, vec3(0.025, 0.01, 0.016), 0.55);
  // Shell only sits low in the picture and along its edges, never across the open sky.
  float edge = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
  float place = max(smoothstep(0.55, 0.8, uv.y), smoothstep(0.07, 0.02, edge));
  float chip = cut * step(0.72, hash12(id + 9.0)) * smoothstep(0.3, 0.12, L) * place;
  vec3 dark = mix(lacquer, nacre * (0.4 + 0.6 * lean) * 0.7, chip);
  // In the light: the picture itself, with a pearl film that shifts as you tilt.
  vec3 lit = screen(c, nacre * 0.2 * (0.4 + 0.6 * lean));
  vec3 col = mix(dark, lit, keep);
  // One long wet highlight across the lacquer.
  float gloss = smoothstep(0.86, 1.0, 0.5 + 0.5 * sin((uv.y * 1.4 + uv.x * 0.4) * 3.4 + (t.y + t.x) * 2.0));
  col += vec3(1.0, 0.96, 0.98) * gloss * 0.16 * (1.0 - keep * 0.5);
  return col;
}
`;

/** Continues the edition if/else chain in CARD_FS. */
export const SPONSOR_DISPATCH = /* glsl */ `
  // Gold seams stay off the nameplate so the title reads cleanly.
  else if (e == 40) col = mix(c, kintsugi(c, uv, uTilt, L), 0.25 + 0.75 * m.r);
  else if (e == 41) col = opal(c, uv, uTilt, L);
  else if (e == 42) col = eclipse(c, uv, uTilt, L);
  // Raden inlays the art; the frame only takes a light coat so the nameplate stays readable.
  else if (e == 43) col = mix(c, raden(c, uv, uTilt, L), 0.4 + 0.6 * m.r);
`;
