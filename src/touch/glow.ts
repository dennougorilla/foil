// The Glow finish: glow-in-the-dark ink over the art, seen in a dim room. Spliced into CARD_FS
// after TOUCH_GLSL, so heatAt (here: the light the ink has stored) and the shared helpers are in scope.

export const GLOW_GLSL = /* glsl */ `
uniform vec3 uLamp;   // the light shining on the card now: centre uv, strength

// The ink's own light: pale yellow-green, paler where it is charged hardest, never white.
vec3 phosphor(float e) {
  return mix(vec3(0.46, 0.9, 0.28), vec3(0.78, 1.0, 0.54), smoothstep(0.15, 0.95, e));
}

vec3 glow(vec3 c, vec2 uv, float L, float art) {
  // The stored light lives on the card itself; the tuned pattern space only moves the pigment's grain.
  vec2 cuv = tuneFaceUv(uv);
  float q = heatAt(cuv);
  // Halation: a bright patch bleeds softly into the dark around it.
  float halo = 0.0;
  for (int i = 0; i < 6; i++) {
    float a = float(i) * 1.0472 + 0.4;
    halo += heatAt(cuv + vec2(cos(a), sin(a) * 0.714) * 0.032);
  }
  halo /= 6.0;

  // The room is dim: the art sits darker and cooler, colours muted, but every part of it still reads.
  vec3 night = mix(vec3(L), c, 0.65) * vec3(0.8, 0.88, 1.0);
  night = night * 0.36 + 0.012;
  // No light reaches the corners quite as well as the middle.
  float room = 1.0 - 0.35 * smoothstep(0.25, 0.75, length((uv - vec2(0.5, 0.45)) * vec2(1.0, 0.75)));

  // The pigment is a layer of fine crystals, each glowing a little brighter or dimmer.
  float grain = hash12(floor(uv * vec2(180.0, 252.0)));
  float clump = vnoise(uv * vec2(24.0, 33.6));
  // The ink took the print where the picture is light, so the glow draws the picture itself.
  float pigment = mix(0.12, 1.0, smoothstep(0.04, 0.8, L));
  // Freshly charged ink glows evenly up to a fairly clear edge where the light stopped. As it dies
  // away the glow draws back into the crystals that hold the most light, so an old afterglow
  // glimmers grain by grain where a fresh one is smooth.
  float fresh = 1.0 - exp(-q * 3.6);
  float speck = smoothstep(0.85 - fresh * 1.25, 1.0 - fresh * 0.7, grain);
  float e = min(fresh * pigment * (0.45 + 0.55 * speck + 0.1 * clump), 1.0);
  vec3 col = night * room + phosphor(e) * e * 0.92;
  col += vec3(0.48, 0.92, 0.3) * (1.0 - exp(-halo * 2.0)) * 0.08;

  // The lamp: a small violet-white pool that shows the art as it is and charges the ink under it.
  // Once it moves on, only the green it left behind remains.
  vec2 ld = (cuv - uLamp.xy) * vec2(1.0, 1.4);
  float r2 = dot(ld, ld);
  float beam = uLamp.z * exp(-r2 / 0.012);
  vec3 lit = c * vec3(0.92, 0.9, 1.05) + vec3(0.12, 0.08, 0.26);
  col = mix(col, lit, beam * 0.9);
  col += vec3(0.85, 0.82, 1.0) * uLamp.z * exp(-r2 / 0.0016) * 0.22 + vec3(0.32, 0.2, 0.6) * uLamp.z * exp(-r2 / 0.05) * 0.14;

  // The frame is lit by the same dim room and carries a thinner coat of the ink.
  vec3 frame = c * 0.5 * mix(room, 1.0, 0.5) + phosphor(e) * e * 0.4;
  return mix(frame, col, art);
}
`;
