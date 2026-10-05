// Marble: ink floating on water over the picture, between Japanese suminagashi (rings of sumi
// spreading from a few drops) and European marbled paper (colours combed into feathered veins).
// Spliced into CARD_FS after the shared helpers and the tune, so hash/vnoise/fbm, tuneFaceUv,
// uTime, uLoop, uCardK and uLight are in scope. Every uniform of its own starts with uMarble.
//
// The ink is a pattern of rings around fixed drops, read at a displaced point: first where touch
// carried the ink (uMarbleFlow, a field of offsets in card uv, src/touch/heat.ts), then a slow
// current that winds round once a loop, so the stage and a file close on the same frame.

export const MARBLE_GLSL = /* glsl */ `
uniform sampler2D uMarbleFlow;   // how far the ink was carried (card uv), rows top to bottom like uv

// A cubic B-spline through four bilinear taps, so a dragged line bends smoothly, never along the grid.
vec2 marbleFlow(vec2 uv) {
  vec2 res = vec2(textureSize(uMarbleFlow, 0));
  vec2 st = uv * res - 0.5;
  vec2 i = floor(st), f = st - i;
  vec2 f2 = f * f, f3 = f2 * f;
  vec2 w0 = (1.0 - 3.0 * f + 3.0 * f2 - f3) / 6.0;
  vec2 w1 = (4.0 - 6.0 * f2 + 3.0 * f3) / 6.0;
  vec2 w2 = (1.0 + 3.0 * f + 3.0 * f2 - 3.0 * f3) / 6.0;
  vec2 w3 = f3 / 6.0;
  vec2 g0 = w0 + w1, g1 = w2 + w3;
  vec2 h0 = (i - 0.5 + w1 / g0) / res;
  vec2 h1 = (i + 1.5 + w3 / g1) / res;
  return g0.y * (g0.x * texture(uMarbleFlow, h0).rg + g1.x * texture(uMarbleFlow, vec2(h1.x, h0.y)).rg)
       + g1.y * (g0.x * texture(uMarbleFlow, vec2(h0.x, h1.y)).rg + g1.x * texture(uMarbleFlow, h1).rg);
}

// The current: two layers of noise read along a circle, so it wanders and comes back once a loop.
vec2 marbleCurrent(vec2 p) {
  float ph = uTime / (uLoop > 0.0 ? uLoop : 12.0) * 6.2831853;
  vec2 o = vec2(cos(ph), sin(ph));
  vec2 a = vec2(vnoise(p * 1.3 + o * 0.55), vnoise(p * 1.3 + o.yx * 0.55 + 7.3)) - 0.5;
  vec2 b = vec2(vnoise(p * 2.9 - o * 0.4 + 3.1), vnoise(p * 2.9 + o * 0.4 + 11.7)) - 0.5;
  return a * 0.2 + b * 0.05;
}

// Distance to the drops, blended so neighbouring rings meet in smooth seams as real drops do.
float marbleRings(vec2 q) {
  vec2 h = uCardK * 0.5;
  float s = 0.0;
  s += exp(-6.0 * length(q - vec2(-0.45, -0.6) * h));
  s += exp(-6.0 * length(q - vec2(0.55, -0.2) * h)) * 0.8;
  s += exp(-6.0 * length(q - vec2(-0.25, 0.3) * h));
  s += exp(-6.0 * length(q - vec2(0.45, 0.75) * h)) * 0.9;
  s += exp(-6.0 * length(q - vec2(-0.6, 0.85) * h)) * 0.6;
  return -log(s) / 6.0;
}

vec3 marble(vec3 c, vec2 uv, vec2 t, float L, float art) {
  // Touch lives on the card itself; the tuned pattern space only moves the ink.
  vec2 cuv = tuneFaceUv(uv);
  // The ink floats a little above the picture, so tilting slides it over it.
  vec2 q = (uv - marbleFlow(cuv) - 0.5) * uCardK + t * 0.012;
  // The water has already carried the rings a long way before anyone looked: long, slow bends.
  q += (vec2(vnoise(q * 1.1 + 2.0), vnoise(q * 1.1 + 9.0)) - 0.5) * 0.55 + (vec2(vnoise(q * 2.6 + 4.0), vnoise(q * 2.6 + 13.0)) - 0.5) * 0.14;
  q += marbleCurrent(q);
  // Fine wobble: the lines are never quite smooth.
  q += (vec2(vnoise(q * 14.0), vnoise(q * 14.0 + 5.0)) - 0.5) * 0.006;
  // Each drop spread unevenly: lines crowd together in places and open out in others.
  float r = marbleRings(q) * 44.0;
  float s = r + sin(r * 0.37) * 1.0 + sin(r * 0.13 + 1.0) * 1.6;
  float n = floor(s);
  float f = s - n;
  // A drop of one ink leaves a few rings of it before the next ink takes over.
  float k = hash12(vec2(floor(n / 3.0), 3.7));
  // A line of ink, or now and then a wider ring of clear water between them.
  float on = step(0.14, hash12(vec2(n, 1.3)));
  float width = mix(0.32, 0.6, hash12(vec2(n, 9.1))) * on;
  float aa = fwidth(s) * 0.9 + 0.025;
  float band = smoothstep(0.0, aa, f) * (1.0 - smoothstep(width - aa, width, f));
  // Ink gathers at the rim of each line and thins inside it, and the dispersant opens tiny pores.
  float mid = abs(f / max(width, 1e-3) - 0.5) * 2.0;
  float pores = smoothstep(0.1, 0.0, voronoi(q * 90.0).x) * 0.3;
  float dense = clamp(0.7 + 0.3 * mid - pores, 0.0, 1.0);
  float a = band * dense;
  // Sumi drinks the light and leaves only a shadow of the picture; indigo and red ochre stain it.
  vec3 ink = k < 0.66 ? c * 0.16 + vec3(0.025, 0.025, 0.04)
           : k < 0.88 ? c * 0.3 + vec3(0.06, 0.15, 0.4)
           : k < 0.97 ? c * 0.3 + vec3(0.5, 0.1, 0.07)
           : c * 0.3 + vec3(0.62, 0.45, 0.14);
  vec3 col = mix(c, ink, a * 0.82);
  // The water between the lines leaves the picture a touch paler, like paper under a wash.
  col = mix(col, 1.0 - (1.0 - c) * 0.86, (1.0 - band) * 0.5);
  // The wet surface: the lines' edges catch the light as the card tilts, like oil on still water.
  vec2 g = vec2(dFdx(a), dFdy(a)) / max(fwidth(q.x) + fwidth(q.y), 1e-4);
  float lean = dot(normalize(g + 1e-5), normalize(vec2(t.x, -t.y) + vec2(0.35, -0.5)));
  float sheen = smoothstep(0.2, 1.0, lean) * clamp(length(g) * 0.01, 0.0, 1.0);
  col += vec3(0.78, 0.84, 1.0) * sheen * 0.16;
  // Thick sumi has a bronze-blue lustre that sweeps across with the tilt, so it shows even over a dark picture.
  float lustre = smoothstep(0.35, 0.95, 0.5 + 0.5 * sin(dot(q, vec2(2.2, 1.4)) - (t.x + t.y) * 2.4));
  col += vec3(0.36, 0.42, 0.6) * a * step(k, 0.66) * (0.1 + 0.2 * lustre);
  // On the frame the ink lies thinner.
  return mix(mix(c, col, 0.75), col, art);
}
`;
