// Rainy Window (94): the picture seen through a fogged window on a rainy day. Spliced into the
// card shader after TOUCH_GLSL, so heatAt and printHeat (here: where the glass was wiped) are in
// scope. Its drops run on cycles an exported loop holds a whole number of times.
//
// No imports: the tests load this file directly with Node.

export const RAIN_SHADER = 94;

export const RAIN_GLSL = /* glsl */ `
// A period near \`want\` seconds that the loop holds a whole number of times (live: \`want\`).
float rnPeriod(float want) { return uLoop > 0.0 ? uLoop / max(1.0, floor(uLoop / want + 0.5)) : want; }

// One drop of water on the glass, \`d\` from its centre (card units, y down), radius r. \`stretch\`
// draws its top out into a tail, as a running drop's. Returns its slope (d / r), how much of the
// pixel it covers, and a soft ring around it where it has soaked up the fog.
vec4 rnDrop(vec2 d, float r, float stretch, float px) {
  float up = max(-d.y / r, 0.0);
  d.x *= 1.0 + up * (stretch - 1.0) * 0.8;
  d.y = d.y < 0.0 ? d.y / stretch : d.y * 0.92;
  float len = length(d);
  return vec4(d / r, smoothstep(r, r - 1.5 * px, len), smoothstep(r * 1.9, r, len));
}

// How far a drop has run down its column at phase s: in short jerks with rests between, as water
// sticks to the glass and lets go.
float rnSlide(float s, float jerks) {
  float st = s * jerks;
  return mix((floor(st) + smoothstep(0.0, 0.35, fract(st))) / jerks, s, 0.3);
}

vec3 rnFace(vec2 uv, float lod) {
  vec4 f = face(clamp(uv, 0.002, 0.998), lod);
  return f.rgb / max(f.a, 1e-4);
}

vec3 rain(vec3 c, vec2 uv, vec2 t, float L, float lod, float art) {
  // Wipes live on the card itself; the tuned pattern space only moves the drops.
  vec2 cuv = tuneFaceUv(uv);
  float px = max(length(fwidth(uv * uCardK)), 1e-4);
  // The glass sits a little in front of the picture, so tilting slides the water over it.
  vec2 g = uv * uCardK + t * 0.012;
  // A wipe clears the glass with a ragged edge; a fingertip only thins the fog in the shape of its print.
  float gloss;
  float wipe = smoothstep(0.03, 0.5, heatAt(cuv) + (vnoise(g * 16.0) - 0.5) * 0.05);
  wipe = max(wipe, smoothstep(0.05, 0.35, printHeat(cuv, gloss)) * 0.45);

  vec2 nrm = vec2(0.0);  // slope of the water over this point, 0 at a drop's centre, 1 at its rim
  float water = 0.0;     // covered by a drop
  float dr = 0.0;        // that drop's radius
  float near = 0.0;      // close to a drop, where it has soaked up the fog
  float trail = 0.0;     // swept clear by a drop that ran past

  // Beads resting on the glass: a few big ones and a scatter of small ones, on offset grids so no
  // rows show, gathered in loose clusters with bare glass between. A wipe takes them away.
  float crowd = smoothstep(0.25, 0.75, vnoise(g * 2.2 + 7.0));
  for (int i = 0; i < 2; i++) {
    float fi = float(i);
    float cell = 0.12 - fi * 0.07;
    vec2 q = g / cell + fi * vec2(0.5, 0.37);
    vec2 id = floor(q) + fi * 31.0;
    if (hash12(id + 5.3) > (0.04 + fi * 0.06) + crowd * (0.16 + fi * 0.18)) continue;
    float h = hash12(id);
    float r = mix(0.08, 0.36, h * h * h);
    vec2 at = r + (1.0 - 2.0 * r) * hash22(id + 1.7);
    vec4 b = rnDrop((fract(q) - at) * cell, r * cell, 1.1, px) * vec4(1.0, 1.0, 1.0 - wipe, 1.0 - wipe);
    if (b.z > water) { water = b.z; nrm = b.xy; dr = r * cell; }
    near = max(near, b.w);
  }

  // Drops running down in columns, each once a cycle, wiping a trail clear and leaving small beads in it.
  float P = rnPeriod(6.0);
  float H = uCardK.y + 0.3;
  for (int k = 0; k < 2; k++) {
    float fk = float(k);
    float W = 0.2 - fk * 0.07;
    float x = g.x / W + fk * 0.5;
    float col = floor(x);
    float hc = hash12(vec2(col, 11.0 + fk * 7.0));
    // Some columns stay dry; the rest run at their own phase, the drop off the card a quarter of the cycle.
    if (hc < 0.25 + fk * 0.2) continue;
    float s = fract(uTime / P + hc * 3.7) / 0.75;
    float yd = -0.15 + rnSlide(s, 5.0 + floor(hc * 4.0)) * H;
    float seed = col * 3.7 + fk * 13.0;
    // The path wanders a little sideways; the trail follows it.
    float wx = col + 0.5 + (vnoise(vec2(g.y * 6.0, seed)) - 0.5) * 0.55;
    float dx = (x - wx) * W;
    float r = (0.028 - fk * 0.009) * (0.8 + 0.4 * hc);
    vec4 b = rnDrop(vec2((x - (col + 0.5 + (vnoise(vec2(yd * 6.0, seed)) - 0.5) * 0.55)) * W, g.y - yd), r, 1.7, px);
    if (b.z > water) { water = b.z; nrm = b.xy; dr = r; }
    near = max(near, b.w);
    float above = yd - g.y;
    // The trail narrows as it ages and breaks where the water ran out.
    float fade = step(0.0, above) * smoothstep(0.9, 0.05, above) * smoothstep(0.25, 0.5, vnoise(vec2(g.y * 9.0, seed + 3.0)));
    trail = max(trail, fade * smoothstep(r * (0.35 + 0.4 * fade), r * 0.2, abs(dx)));
    // Beads it left behind, shrinking as the trail gets older.
    float cy = floor(g.y / 0.032);
    float hb = hash12(vec2(col + fk * 50.0, cy));
    float by = (cy + 0.5) * 0.032 + (hb - 0.5) * 0.012;
    float rb = (0.004 + 0.006 * hb) * smoothstep(0.6, 0.1, yd - by) * step(by, yd - r);
    if (hb > 0.35 && rb > 0.0) {
      float bx = col + 0.5 + (vnoise(vec2(by * 6.0, seed)) - 0.5) * 0.55 + (hb - 0.5) * 0.2;
      vec4 tb = rnDrop(vec2((x - bx) * W, g.y - by), rb, 1.0, px);
      if (tb.z > water) { water = tb.z; nrm = tb.xy; dr = rb; }
    }
  }

  // Fog: the picture behind it soft, lifted and milky, thicker towards the bottom and uneven.
  // Two rings of taps on the face's mipmaps, the outer one turned, so the blur is round and smooth.
  float spread = 0.6 + 0.3 * vnoise(g * 2.0 + 9.0);
  float bl = max(lod, 2.1 + spread);
  vec2 o1 = vec2(0.007, 0.003) * spread / uCardK;
  vec2 o2 = vec2(-o1.y, o1.x);
  vec2 o3 = (o1 + o2) * 1.4;
  vec2 o4 = (o1 - o2) * 1.4;
  vec3 blur = (rnFace(uv + o1, bl) + rnFace(uv - o1, bl) + rnFace(uv + o2, bl) + rnFace(uv - o2, bl)) * 0.15
            + (rnFace(uv + o3, bl + 0.5) + rnFace(uv - o3, bl + 0.5) + rnFace(uv + o4, bl + 0.5) + rnFace(uv - o4, bl + 0.5)) * 0.1;
  vec3 milk = vec3(0.7, 0.77, 0.85) * (0.58 + 0.45 * luma(blur));
  vec3 fogged = mix(blur, milk, 0.42) + vec3(0.03, 0.04, 0.06);
  float fog = 0.7 + 0.3 * vnoise(g * 1.6 + 4.0) + 0.1 * smoothstep(0.55, 1.0, uv.y);
  // Water a wipe pushed aside gathers along its edge; drops and their trails have soaked the fog up.
  fog = clamp(fog, 0.0, 1.0) * (1.0 - 0.88 * wipe) + wipe * (1.0 - wipe) * 0.4;
  fog *= (1.0 - trail * 0.3) * (1.0 - near * 0.4);
  fog *= mix(0.12, 1.0, art);

  // The fog itself is a mist of tiny droplets, each lit on the side towards the light.
  vec2 hv = (uLight - cuv) * uCardK + t * 0.25;
  vec2 ld = hv / (length(hv) + 0.35);
  vec2 mq = g / 0.008;
  vec2 mid = floor(mq);
  vec2 mf = fract(mq) - 0.25 - 0.5 * hash22(mid);
  float mr = 0.16 + 0.14 * hash12(mid + 3.0);
  float mist = smoothstep(mr, mr * 0.6, length(mf)) * smoothstep(0.004, 0.0015, px);
  float lit = dot(mf / mr, ld);

  vec3 col = mix(c, fogged, fog);
  col += mist * fog * (vec3(0.9, 0.95, 1.0) * max(lit, 0.0) * 0.06 - 0.01);

  // Through a drop the picture is sharp, magnified like a lens at the middle and bent round at the rim.
  vec2 off = -nrm * dr * (0.35 + 0.6 * dot(nrm, nrm));
  vec3 seen = rnFace(uv + off / uCardK, lod);
  // Water gathers the light around it, so even over a dark picture a drop never goes black.
  seen = mix(seen, max(seen, fogged * 0.9), 0.6);
  float rn = length(nrm);
  float rim = smoothstep(0.82, 1.0, rn);
  vec2 hp = ld * 0.5;
  float spec = exp(-dot(nrm - hp * 1.3, nrm - hp * 1.3) / 0.015) + 0.15 * exp(-dot(nrm - hp * 0.6, nrm - hp * 0.6) / 0.2);
  float caustic = smoothstep(0.2, 0.9, dot(nrm, -ld)) * smoothstep(1.0, 0.7, rn);
  // Clear water: a thin dark edge (deepest at the top, where it bends the most), the sky's pale
  // reflection along its upper rim,
  // light gathered on the far side and a sharp highlight.
  vec3 drop = seen * (1.0 - rim * (0.12 + 0.25 * max(-nrm.y, 0.0)));
  drop += vec3(0.8, 0.86, 0.92) * smoothstep(0.55, 1.0, -nrm.y) * smoothstep(1.0, 0.8, rn) * 0.1;
  // A bead too small to show a highlight of its own only glints faintly, so the glass never turns into a star field.
  drop += (seen * 0.35 + 0.05) * caustic + vec3(0.95, 0.98, 1.0) * spec * 0.75 * smoothstep(0.003, 0.016, dr);
  return mix(col, drop, water);
}
`;
