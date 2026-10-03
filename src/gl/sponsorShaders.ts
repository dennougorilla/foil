// Sponsor-only finishes. Spliced into CARD_FS after COMMON, so hash/fbm/voronoi are in scope.
// Shader indices start at 40 to stay clear of the regular editions.

export const SPONSOR_GLSL = /* glsl */ `
vec3 kintsugi(vec3 c, vec2 uv, vec2 t, float L) {
  // Glazed ceramic: the art goes a little chalky and warm, as if fired.
  vec3 glaze = mix(c, vec3(L) * vec3(1.04, 0.98, 0.9), 0.28) * 0.88;
  // Breaks: warped cell borders, a few wide seams that branch into hairlines.
  vec2 w = uv * vec2(1.0, 1.4);
  w += (vec2(fbm(uv * 3.5), fbm(uv * 3.5 + 7.3)) - 0.5) * 0.22;
  vec4 v1 = voronoi(w * 3.6);
  vec4 v2 = voronoi(w * 9.0 + 3.1);
  float d1 = v1.y - v1.x;
  float d2 = v2.y - v2.x;
  float wide = 0.028 + 0.03 * vnoise(uv * 24.0);
  float seam = smoothstep(wide, wide * 0.35, d1);
  float hair = smoothstep(0.022, 0.006, d2) * step(0.5, hash12(v2.zw)) * smoothstep(0.35, 0.0, d1);
  float vein = max(seam, hair * 0.9);
  // The lacquer rim around each seam sits a touch darker, so the gold reads as raised.
  float rim = smoothstep(wide * 2.6, wide, d1) * (1.0 - seam);
  // Gold: a warm ramp along the seam, and a bead of light that runs along it as you tilt.
  vec3 gold = mix(vec3(0.62, 0.36, 0.08), vec3(1.0, 0.84, 0.42), 0.5 + 0.5 * sin(d1 * 70.0 + uv.y * 9.0 + t.x * 2.0));
  float run = smoothstep(0.72, 1.0, sin((uv.x * 0.8 + uv.y) * 6.0 - (t.x + t.y) * 3.4 - uTime * 0.7));
  gold += vec3(1.0, 0.95, 0.78) * run * 0.95;
  vec3 col = glaze * (1.0 - rim * 0.4);
  float sheen = smoothstep(0.84, 1.0, 0.5 + 0.5 * sin((uv.x - uv.y * 0.7) * 4.0 + (t.x - t.y) * 2.5));
  col += vec3(1.0, 0.97, 0.9) * sheen * 0.12;
  return mix(col, gold, vein);
}

vec3 opal(vec3 c, vec2 uv, vec2 t, float L) {
  // Play of colour: small flecks, each a tiny grating with its own grain. A fleck
  // only fires when you look at it from its angle, and its hue rolls across it.
  vec2 p = uv * vec2(1.0, 1.4);
  vec2 q = p * 9.0 + (vec2(vnoise(p * 4.0), vnoise(p * 4.0 + 5.2)) - 0.5) * 1.6;
  vec4 v = voronoi(q);
  vec2 id = v.zw;
  vec2 n = normalize(hash22(id) * 2.0 - 1.0 + 1e-3);
  vec2 local = (hash22(id + 3.0) - 0.5) * 0.3;
  float facing = sin(dot(n, t) * 2.6 + hash12(id + 2.0) * 6.28 + uTime * 0.2);
  float fire = smoothstep(0.3, 1.0, facing);
  float hue = fract(hash12(id + 7.0) + dot(q - floor(q) - local, n) * 0.22 + dot(n, t) * 0.12);
  // Soft-edged flecks that glow brightest at their heart, so the colour sits inside the stone.
  float body = smoothstep(0.75, 0.05, v.x) * smoothstep(0.0, 0.2, v.y - v.x);
  vec3 flash = hsv2rgb(vec3(hue, 0.72, 1.0)) * fire * (0.25 + 0.75 * body);
  // A milky, slightly blue body with a slow opalescent bloom that the fire glows through.
  vec3 milk = mix(c, vec3(0.8, 0.86, 0.95) * (0.5 + 0.55 * L), 0.42) * 0.92;
  milk += vec3(0.45, 0.6, 0.85) * (fbm(p * 2.5 + t * 0.15) - 0.4) * 0.22;
  return screen(milk, flash * 0.78);
}

vec3 eclipse(vec3 c, vec2 uv, vec2 t, float L) {
  // The art falls into night, lit only by the corona.
  vec3 col = c * vec3(0.3, 0.32, 0.48) * (0.55 + 0.6 * L);
  // The sun sits behind the card, so it slides against the tilt.
  vec2 ctr = vec2(0.5, 0.34) - t * vec2(0.035, 0.03);
  vec2 d = (uv - ctr) * vec2(1.0, 1.4);
  float r = length(d);
  float a = atan(d.y, d.x);
  float R = 0.14;
  float stream = fbm(vec2(a * 2.6, r * 3.0 - uTime * 0.12)) + 0.55 * fbm(vec2(a * 7.0 + 3.0, r * 8.0 - uTime * 0.22));
  float corona = exp(-max(r - R, 0.0) * 10.0 / (0.35 + stream)) * step(R, r);
  vec3 hot = mix(vec3(1.0, 0.42, 0.14), vec3(1.0, 0.94, 0.84), smoothstep(0.35, 1.0, corona));
  col += hot * corona * 1.05;
  // Chromosphere: a thin red-gold ring hugging the moon.
  col += vec3(1.0, 0.62, 0.42) * smoothstep(0.014, 0.0, abs(r - R)) * 0.9;
  // Diamond ring: one bead of sunlight on the rim, swinging round as you tilt.
  float ba = atan(t.y + 0.6, t.x + 0.0001) + uTime * 0.05;
  vec2 bead = vec2(cos(ba), sin(ba)) * R;
  // The moon: near black with the faintest earthshine of the picture, its limb
  // catching a little light on the side where the sun breaks through.
  float disc = smoothstep(R + 0.003, R - 0.003, r);
  float limb = smoothstep(R * 0.35, R, r);
  float side = 0.5 + 0.5 * dot(d / max(r, 1e-4), bead / R);
  vec3 moon = c * 0.16 + vec3(0.008, 0.008, 0.02) + vec3(0.16, 0.12, 0.1) * limb * limb * side * side;
  col = mix(col, moon, disc);
  vec2 bd = d - bead;
  float glow = exp(-length(bd) * 38.0);
  float flare = (smoothstep(0.006, 0.0, abs(bd.x)) * smoothstep(0.16, 0.0, abs(bd.y))
               + smoothstep(0.006, 0.0, abs(bd.y)) * smoothstep(0.22, 0.0, abs(bd.x)));
  col += vec3(1.0, 0.97, 0.9) * (glow * 1.4 + flare * 0.7);
  return col;
}

vec3 raden(vec3 c, vec2 uv, vec2 t, float L) {
  // Black lacquer with crushed shell inlaid wherever the picture is bright.
  vec3 lacquer = mix(c, vec3(0.03, 0.012, 0.018), 0.5);
  vec2 p = uv * vec2(1.0, 1.4);
  vec2 w = p + (vec2(vnoise(p * 6.0), vnoise(p * 6.0 + 9.0)) - 0.5) * 0.06;
  vec4 v = voronoi(w * 15.0);
  vec2 id = v.zw;
  float cut = smoothstep(0.012, 0.04, v.y - v.x);
  // Each chip of shell has growth lines running its own way, and its own lean.
  float ang = hash12(id) * 6.28;
  vec2 dir = vec2(cos(ang), sin(ang));
  float s = dot(p, dir) * 60.0 + vnoise(p * 18.0 + id) * 5.0;
  float film = fract(s * 0.035 + dot(t, dir) * 0.45 + hash12(id + 1.0) * 0.5 + uTime * 0.02);
  // Shell only shifts through teal, blue, violet and pink, never orange.
  vec3 nacre = hsv2rgb(vec3(mix(0.42, 0.98, film), 0.5, 1.0)) * (0.7 + 0.3 * sin(s * 2.2));
  float lean = 0.55 + 0.45 * sin(dot(hash22(id + 4.0) * 2.0 - 1.0, t) * 3.0 + hash12(id + 5.0) * 6.28);
  float shell = smoothstep(0.24, 0.6, L) * cut * 0.9;
  vec3 inlay = nacre * (0.45 + 0.7 * L) * (0.55 + 0.6 * lean);
  vec3 col = mix(lacquer, inlay, shell);
  // One long wet highlight across the lacquer.
  float gloss = smoothstep(0.86, 1.0, 0.5 + 0.5 * sin((uv.y * 1.4 + uv.x * 0.4) * 3.4 + (t.y + t.x) * 2.0));
  col += vec3(1.0, 0.96, 0.98) * gloss * 0.2 * (1.0 - shell * 0.6);
  return col;
}
`;

/** Continues the edition if/else chain in CARD_FS. */
export const SPONSOR_DISPATCH = /* glsl */ `
  else if (e == 40) col = kintsugi(c, uv, uTilt, L);
  else if (e == 41) col = opal(c, uv, uTilt, L);
  else if (e == 42) col = eclipse(c, uv, uTilt, L);
  // Raden inlays the art; the frame only takes a light coat so the nameplate stays readable.
  else if (e == 43) col = mix(c, raden(c, uv, uTilt, L), 0.4 + 0.6 * m.r);
`;
