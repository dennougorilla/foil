// Stardust: rainbow star dust, confetti foil and starbursts over the art. Spliced into CARD_FS
// after COMMON, so hash/hsv2rgb/screen are in scope.

export const STARDUST_GLSL = /* glsl */ `
// Stardust's own clock: one beat about every 0.8 s, stretched a little in an export so its loop
// (uLoop) holds a whole number of beats and closes without a seam.
float sdPeriod() { return uLoop > 0.0 ? uLoop / max(1.0, floor(uLoop / 0.8 + 0.5)) : 0.8; }

// A four-point sparkle: a soft core and two thin rays. f is the offset from its centre.
float sdSparkle(vec2 f, float core, float len, float thin) {
  float r = length(f);
  float rays = exp(-abs(f.x) * thin) * exp(-abs(f.y) / len) + exp(-abs(f.y) * thin) * exp(-abs(f.x) / len);
  return exp(-r / core) + rays;
}

vec3 stardust(vec3 c, vec2 uv, vec2 t, float L) {
  // The art stays, a little deeper, so the grains of light can be the subject.
  vec2 p = uv * uCardK;
  vec3 col = c * 0.8 + vec3(0.02, 0.01, 0.06) * (1.0 - L);
  // A wide band of light rolls across as you tilt; every grain inside it fires harder.
  float sweep = smoothstep(0.3, 1.0, 0.5 + 0.5 * sin(dot(p, vec2(0.55, 0.83)) * 4.5 - (t.x + t.y) * 2.6));
  float drift = dot(p, vec2(0.6, 0.9)) * 0.7 + t.x * 0.5 - t.y * 0.4;
  col = screen(col, hsv2rgb(vec3(fract(drift), 0.6, 1.0)) * 0.1 * sweep);
  float T = uTime * 6.2831853 / sdPeriod();

  // Fine dust: one grain per cell, each a tiny facet that catches the light at its own angle.
  vec2 g = uv * uCardK * 110.0;
  vec2 cell = floor(g);
  float h = hash12(cell);
  vec2 n = hash22(cell + 11.1) * 2.0 - 1.0;
  vec2 f = fract(g) - 0.5 - (hash22(cell + 3.7) - 0.5) * 0.5;
  float catchL = pow(0.5 + 0.5 * cos(dot(n, t) * 5.0 + h * 6.2831), 6.0);
  float tw = 0.5 + 0.5 * sin(T * (1.0 + step(0.6, h)) + h * 40.0);
  float grain = smoothstep(0.3, 0.05, length(f)) * (0.6 + 0.8 * hash12(cell + 7.0));
  // Too small to draw one by one (a hand card): an even shimmer in their place.
  float fine = 1.0 - smoothstep(0.4, 0.9, fwidth(g.x));
  float lit = mix(0.12, grain * catchL * (0.4 + 0.6 * tw), fine) * (0.25 + 2.0 * sweep);
  vec3 tint = hsv2rgb(vec3(fract(h * 0.35 + drift + dot(n, t) * 0.25), 0.65, 1.0));
  col += tint * lit;

  // Confetti foil: square chips, each tipped its own way, flashing a colour as they face you.
  vec2 q = uv * uCardK * 34.0;
  vec2 qc = floor(q);
  float qh = hash12(qc + 41.0);
  if (qh > 0.55) {
    vec2 qf = fract(q) - 0.5 - (hash22(qc + 2.3) - 0.5) * 0.4;
    float a = qh * 37.0;
    qf = mat2(cos(a), -sin(a), sin(a), cos(a)) * qf;
    float s = 0.12 + 0.1 * hash12(qc + 9.0);
    float chip = smoothstep(s, s - 0.04, max(abs(qf.x), abs(qf.y)));
    vec2 qn = hash22(qc + 17.0) * 2.0 - 1.0;
    float facing = pow(0.5 + 0.5 * cos(dot(qn, t) * 3.5 + qh * 20.0), 3.0);
    vec3 hue = hsv2rgb(vec3(fract(qh * 3.0 + drift * 1.5 + dot(qn, t) * 0.4), 0.75, 1.0));
    col = mix(col, screen(col, hue * (0.25 + 0.9 * facing)), chip * (0.55 + 0.45 * sweep));
  }

  // Starbursts: a few big crosses that blaze when the angle is right, and pop on the beat.
  vec2 b = uv * uCardK * 5.0;
  vec2 bc = floor(b);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 id = bc + vec2(x, y);
    float bh = hash12(id + 63.0);
    if (bh < 0.35) continue;
    vec2 bf = b - id - 0.2 - 0.6 * hash22(id + 8.0);
    vec2 bn = hash22(id + 29.0) * 2.0 - 1.0;
    float aim = pow(0.5 + 0.5 * cos(dot(bn, t) * 3.0 + bh * 12.0), 10.0);
    float ph = fract(uTime / sdPeriod() + bh * 7.0);
    float pop = step(0.62, fract(bh * 13.0)) * smoothstep(0.0, 0.04, ph) * exp(-ph * 7.0);
    float on = max(aim, pop * 0.85) * (0.5 + 0.5 * sweep + 0.3 * aim);
    if (on < 0.01) continue;
    // The one that lines up with your view grows into a long cross.
    float size = 0.7 + 0.4 * on + 0.9 * aim;
    float burst = sdSparkle(bf, 0.035 * size, 0.32 * size, 220.0) + sdSparkle(mat2(0.7071, -0.7071, 0.7071, 0.7071) * bf, 0.01, 0.1 * size, 320.0) * 0.5;
    // White hot at the heart, a rainbow fringe out along the rays.
    vec3 fringe = hsv2rgb(vec3(fract(length(bf) * 3.0 + bh * 5.0 + drift), 0.55, 1.0));
    col += mix(vec3(1.0, 0.98, 0.92), fringe, smoothstep(0.02, 0.15, length(bf))) * burst * on * 1.6;
    col += fringe * exp(-length(bf) * 6.0) * on * 0.25;
  }
  return col;
}
`;
