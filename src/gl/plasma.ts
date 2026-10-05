// Plasma: the card as a plasma ball. Lightning crackles out from an electrode at the card's middle
// and reaches for the pointer. Spliced into CARD_FS after COMMON and TUNE_GLSL, so vnoise, luma and
// tuneFaceUv are in scope. uPlasmaAim is where the lightning reaches: under the pointer on the
// stage, or Plasma's unseen finger in a file (plasmaFinger in src/gl/torch.ts).

export const PLASMA_GLSL = /* glsl */ `
// x, y: where the lightning reaches (face uv); z: how firmly it is held there (0 adrift, 1 held).
uniform vec3 uPlasmaAim;
const int PL_N = 6;
const float PL_TAU = 6.2831853;

// One loop of the finish's own motion: the export's, else the six-second idle cycle it closes on.
float plLoop() { return uLoop > 0.0 ? uLoop : 6.0; }

// Smooth noise in -1..1 along a strand (x), turning over in time on a circle, so it closes on the loop.
float plWiggle(float x, float seed, float turns, float a) {
  vec2 o = vec2(cos(a * turns), sin(a * turns)) * 1.3;
  return vnoise(vec2(x + seed * 7.3, seed * 3.1) + o) * 2.0 - 1.0;
}

// How far a strand of length len bends off its straight line at t (0..1 along it): pinned at both
// ends, a broad sway with irregular bends on it and a fine quick tremor. bow pushes it to one side.
float plBend(float t, float seed, float a, float len, float bow) {
  float off = 0.1 * plWiggle(t * 1.6, seed, 1.0, a)
            + 0.06 * plWiggle(t * 4.5, seed + 10.0, 3.0, a)
            + 0.02 * plWiggle(t * 13.0, seed + 20.0, 11.0, a) + bow;
  return off * pow(sin(3.14159265 * t), 0.75) * min(len, 0.6);
}

// Distance from q to the strand from A to B; t comes back as the place along it.
float plStrand(vec2 q, vec2 A, vec2 B, float seed, float a, float bow, out float t) {
  vec2 d = B - A;
  float len = max(length(d), 1e-3);
  vec2 t1 = d / len;
  t = clamp(dot(q - A, t1) / len, 0.0, 1.0);
  return length(q - (A + d * t + vec2(-t1.y, t1.x) * plBend(t, seed, a, len, bow)));
}

// The light of one strand at distance dl: a thin hot core (into core / coreCol) and a violet-to-pink
// glow (returned). w is the core's half width, b its brightness, t the place along it.
vec3 plLight(float dl, float w, float px, float b, float t, inout float core, inout vec3 coreCol) {
  float line = smoothstep(w + px, w * 0.25, dl) * b;
  core = max(core, line);
  coreCol += mix(vec3(0.85, 0.72, 1.0), vec3(1.0, 0.78, 0.94), t) * line;
  vec3 hot = mix(vec3(0.55, 0.24, 1.0), vec3(0.95, 0.26, 0.78), smoothstep(0.15, 0.95, t));
  return hot * (exp(-dl / 0.03) * 0.24 + exp(-dl / 0.009) * 0.4) * b;
}

/** uv is pattern uv. */
vec3 plasma(vec3 c, vec2 uv, float L) {
  vec2 k = uCardK;
  vec2 q = tuneFaceUv(uv) * k;
  float px = max(fwidth(q.x), 1e-4);
  float a = uTime / plLoop() * PL_TAU;
  // The electrode sits a little deeper than the print, so tilting shifts it.
  vec2 C = 0.5 * k - uTilt * 0.018;
  vec2 aim = uPlasmaAim.xy * k;
  float held = uPlasmaAim.z;
  // The glass is the art window when the electrode is in it (else the card, just inside the frame).
  vec2 lo = uArt.xy * k + 0.035;
  vec2 hi = uArt.zw * k - 0.035;
  if (any(lessThan(C, lo)) || any(greaterThan(C, hi))) {
    lo = vec2(0.07);
    hi = k - 0.07;
  }

  vec3 glow = vec3(0.0);
  float core = 0.0;
  vec3 coreCol = vec3(0.0);
  for (int i = 0; i < PL_N; i++) {
    float fi = float(i);
    // Adrift, each strand wanders round its own sixth of the ball, some reaching the glass, some not.
    float th = (fi + 0.5) / float(PL_N) * PL_TAU + 0.6 * sin(a + fi * 2.1) + 0.3 * sin(a * 2.0 + fi * 1.3);
    vec2 dir = vec2(cos(th), sin(th));
    vec2 wall = (mix(lo, hi, step(0.0, dir)) - C) / (abs(dir) + 1e-3) * (step(0.0, dir) * 2.0 - 1.0);
    float reach = max(min(wall.x, wall.y), 0.05) * (0.62 + 0.3 * fract(fi * 0.618 + 0.3) + 0.08 * sin(a * 3.0 + fi * 1.7));
    // Held, three strands gather on the finger (the first as the main bolt, the other two bowing
    // out to either side of it, so dark gaps stay between them); the rest wander on, shorter and dimmer.
    bool gather = i < 3;
    float pull = gather ? held : 0.0;
    vec2 E = mix(C + dir * reach * (1.0 - 0.3 * held * (1.0 - pull)), aim, pull);
    float bow = i == 1 ? 0.13 * pull : i == 2 ? -0.13 * pull : 0.0;
    float t;
    float dl = plStrand(q, C, E, fi, a, bow, t);
    float b = (i == 0 ? 1.0 + 0.8 * held : gather ? 1.0 - 0.15 * held : 1.0 - 0.5 * held) * (0.8 + 0.2 * sin(a * 11.0 + fi * 3.7) * sin(a * 7.0 + fi));
    // Thicker in places along its length and thinning to the tip; never under a pixel, so small
    // files keep their lightning.
    float w = mix(0.0036, 0.0012, t) * (0.7 + 0.6 * vnoise(vec2(t * 5.0, fi * 4.0) + vec2(cos(a), sin(a))));
    w = max(w * (i == 0 ? 1.0 + 0.9 * held : 1.0), px * 0.6);
    // Adrift, a strand fades out before the glass; held, it runs all the way to the finger. Its glow
    // thins near the electrode, where six of them would pile up into a white blot.
    float fade = mix(smoothstep(1.0, 0.75, t), 1.0, pull) * smoothstep(0.0, 0.4, t * length(E - C) / 0.25);
    glow += plLight(dl, w, px, b * fade, t, core, coreCol);

    // A short fork off the strand, at a place and to a side of its own, swinging as the strand does.
    float tf = 0.4 + 0.3 * fract(fi * 0.37 + 0.2);
    vec2 d = E - C;
    float len = max(length(d), 1e-3);
    vec2 t1 = d / len;
    vec2 F = C + d * tf + vec2(-t1.y, t1.x) * plBend(tf, fi, a, len, bow);
    float ang = (mod(fi, 2.0) * 2.0 - 1.0) * (0.55 + 0.25 * sin(a * 2.0 + fi));
    vec2 G = F + mat2(cos(ang), sin(ang), -sin(ang), cos(ang)) * t1 * len * (0.2 + 0.08 * sin(a * 3.0 + fi * 2.0));
    float tt;
    float df = plStrand(q, F, G, fi + 40.0, a, 0.0, tt);
    glow += plLight(df, max(w * 0.5 * (1.0 - tt), px * 0.45), px, b * fade * 0.35 * smoothstep(1.0, 0.5, tt), t, core, coreCol);
  }
  // The electrode: a white-hot bead in a violet bloom, breathing with the crackle.
  float rc = length(q - C);
  glow += vec3(0.5, 0.22, 1.0) * exp(-rc / 0.04) * 0.28 * (0.9 + 0.1 * sin(a * 9.0));
  float bead = smoothstep(0.011 + px, 0.006, rc);
  // Where the lightning meets the glass under the finger, a small pink-white spark.
  float rf = length(q - aim);
  glow += vec3(1.0, 0.4, 0.85) * (exp(-rf / 0.024) * 0.4 + exp(-rf / 0.007) * 0.9) * held;

  // Off the glass (the frame, the name) only a little of the light falls.
  vec2 out_ = max(uArt.xy * k - q, q - uArt.zw * k);
  float onGlass = mix(0.3, 1.0, smoothstep(0.03, 0.0, max(out_.x, out_.y)));
  glow *= onGlass;
  core *= onGlass;
  // The picture sits a little darker behind the glass, in a violet haze that thins to the edges.
  vec3 dark = c * mix(vec3(0.5, 0.44, 0.66), vec3(0.62, 0.56, 0.78), smoothstep(0.5, 1.0, L));
  dark += vec3(0.16, 0.05, 0.3) * exp(-rc / 0.45) * 0.35;
  // The lightning's glow lights the picture beneath it, and adds its own light on top.
  vec3 col = dark * (1.0 + luma(glow) * 1.4) + glow;
  col = mix(col, coreCol / max(core, 1e-3), clamp(core, 0.0, 1.0));
  col = mix(col, vec3(1.0, 0.95, 1.0), bead);
  return col;
}
`;
