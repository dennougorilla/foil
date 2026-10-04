// Blacklight: fluorescent ink hidden in the print, shown only inside an ultraviolet lamp's circle.
// Spliced into CARD_FS after COMMON and TUNE_GLSL, so hash/vnoise/luma/rgb2hsv, tuneFaceUv and
// uLight are in scope. uLight is the lamp: the stage puts it under the pointer or lets it drift
// along torchAt, and exports sweep it along torchAt (src/gl/torch.ts).

export const BLACKLIGHT_GLSL = /* glsl */ `
// The lamp's power, 0..1.
uniform float uUvLamp;
const vec2 BL_ASPECT = vec2(1.0, 1.4);
// Where the seal is printed, in card uv: on the lamp's drift, low on the art.
const vec2 BL_SEAL = vec2(0.62, 0.56);
// Lamp radius in card widths.
const float BL_R = 0.27;
// The three fluorescent inks.
const vec3 BL_PINK = vec3(1.0, 0.16, 0.6);
const vec3 BL_YELLOW = vec3(0.9, 1.0, 0.12);
const vec3 BL_CYAN = vec3(0.1, 0.9, 1.0);

// k in turns: pink, yellow, cyan, each held for a while with a short blend between.
vec3 blInk(float k) {
  float x = fract(k) * 3.0;
  float f = smoothstep(0.7, 1.0, fract(x));
  if (x < 1.0) return mix(BL_PINK, BL_YELLOW, f);
  if (x < 2.0) return mix(BL_YELLOW, BL_CYAN, f);
  return mix(BL_CYAN, BL_PINK, f);
}

vec3 blFace(vec2 p, float lod) {
  vec4 f = textureLod(uFace, p, lod);
  return f.rgb / max(f.a, 1e-4);
}

// How sharply the picture changes colour around p (face uv), over a reach of r texels.
float blEdge(vec2 p, float r, float lod) {
  vec2 ex = vec2(r / uFaceTexels, 0.0);
  vec2 ey = vec2(0.0, r / uFaceTexels / 1.4);
  vec3 gx = blFace(p + ex, lod) - blFace(p - ex, lod);
  vec3 gy = blFace(p + ey, lod) - blFace(p - ey, lod);
  return sqrt(dot(gx, gx) + dot(gy, gy));
}

float blSeg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
}

// Distance to the strokes of letter i of "FOIL·" in a glyph one unit tall (y up).
float blGlyph(float i, vec2 g) {
  if (i < 0.5) return min(blSeg(g, vec2(0.0), vec2(0.0, 1.0)), min(blSeg(g, vec2(0.0, 1.0), vec2(0.5, 1.0)), blSeg(g, vec2(0.0, 0.52), vec2(0.38, 0.52))));
  if (i < 1.5) return abs(length((g - vec2(0.27, 0.5)) / vec2(0.27, 0.5)) - 1.0) * 0.3;
  if (i < 2.5) return blSeg(g, vec2(0.2, 0.0), vec2(0.2, 1.0));
  if (i < 3.5) return min(blSeg(g, vec2(0.0), vec2(0.0, 1.0)), blSeg(g, vec2(0.0), vec2(0.48, 0.0)));
  return length(g - vec2(0.15, 0.5)) - 0.05;
}

// FOIL letters: x counts glyph cells along the line, y runs up a glyph from 0 to 1. Letters
// under about four pixels tall would only shimmer, so they fade out.
float blLetters(float x, float y) {
  float px = fwidth(y);
  vec2 g = vec2(fract(x) * 0.8 - 0.14, y);
  float d = (y < -0.2 || y > 1.2) ? 1.0 : blGlyph(mod(floor(x), 5.0), g);
  return (1.0 - smoothstep(0.06, 0.06 + px * 1.2, d)) * (1.0 - smoothstep(0.15, 0.25, px));
}

// One line of microtext: s runs along the line, t is the distance down from the letters' top,
// both in card widths.
float blText(float s, float t) {
  const float H = 0.017;
  return blLetters(s / H / 0.8, 1.0 - t / H);
}

float blStar(vec2 p, float r, float rf) {
  const vec2 k1 = vec2(0.809016994, -0.587785252);
  const vec2 k2 = vec2(-k1.x, k1.y);
  p.x = abs(p.x);
  p -= 2.0 * max(dot(k1, p), 0.0) * k1;
  p -= 2.0 * max(dot(k2, p), 0.0) * k2;
  p.x = abs(p.x);
  p.y -= r;
  vec2 ba = rf * vec2(-k1.y, k1.x) - vec2(0.0, 1.0);
  float h = clamp(dot(p, ba) / dot(ba, ba), 0.0, r);
  return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y);
}

// The hidden seal of authenticity: a star in two rings with FOIL running round between them.
// q is card widths from its centre (y down).
float blSeal(vec2 q) {
  float r = length(q);
  float px = fwidth(r);
  float rings = (1.0 - smoothstep(0.0022, 0.0022 + px, abs(r - 0.112))) + (1.0 - smoothstep(0.0016, 0.0016 + px, abs(r - 0.077)));
  float text = blLetters(atan(q.y, q.x) / 6.2831853 * 35.0, 1.0 - (0.105 - r) / 0.021);
  float sd = blStar(vec2(q.x, -q.y), 0.055, 0.45);
  float star = (1.0 - smoothstep(0.0, px * 1.5, abs(sd) - 0.0022)) + (1.0 - smoothstep(0.0, px, sd)) * 0.35;
  return min(rings + text + star, 1.0);
}

// FOIL microtext round the frame, like security paper: one line running all the way round,
// a little in from the edge, with the letters' tops to the edge. q in card widths.
float blMicro(vec2 q) {
  float dl = q.x, dr = 1.0 - q.x, dt = q.y, db = 1.4 - q.y;
  float m = min(min(dl, dr), min(dt, db));
  if (m == dt) return blText(q.x, dt - 0.0225);
  if (m == dr) return blText(q.y, dr - 0.0225);
  if (m == db) return blText(1.0 - q.x, db - 0.0225);
  return blText(1.4 - q.y, dl - 0.0225);
}

// The art engraved in fine parallel lines, thicker where the picture is brighter (b, 0..1).
float blEngrave(vec2 uv, float b) {
  float f = dot(uv * BL_ASPECT, vec2(0.5, 0.866)) * 120.0;
  float w = fwidth(f);
  float hw = mix(0.04, 0.22, b);
  return (1.0 - smoothstep(hw - w * 0.5, hw + w * 0.5, abs(fract(f) - 0.5))) * (1.0 - smoothstep(0.3, 0.5, w));
}

// Fluorescent fibres in the paper: short curled threads in the three inks.
float blFibres(vec2 uv, out vec3 tint) {
  vec2 p = uv * BL_ASPECT * 9.0;
  vec2 ip = floor(p);
  float px = fwidth(p.x);
  float best = 0.0;
  tint = BL_PINK;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 id = ip + vec2(x, y);
    if (hash12(id + 41.0) < 0.7) continue;
    float a = hash12(id + 13.0) * 6.2831853;
    vec2 q = mat2(cos(a), -sin(a), sin(a), cos(a)) * (p - id - hash22(id + 7.0));
    float len = 0.22 + 0.25 * hash12(id + 3.0);
    q.y -= (hash12(id + 5.0) - 0.5) * 1.8 * q.x * q.x;
    float d = length(vec2(max(abs(q.x) - len, 0.0), q.y));
    float f = (1.0 - smoothstep(px * 0.3, px * 1.1, d)) * (1.0 - 0.6 * smoothstep(len * 0.5, len, abs(q.x)));
    if (f > best) {
      best = f;
      tint = blInk(hash12(id + 19.0));
    }
  }
  return best;
}

/** uv is pattern uv (the engraving and the fibres follow the tune's pattern size and angle); m is the face mask. */
vec3 blacklight(vec3 c, vec2 uv, float L, float lod, vec3 m) {
  vec2 ruv = tuneFaceUv(uv);
  float d = length((ruv - uLight) * BL_ASPECT);
  // The beam: a soft-edged disc, hottest in the middle, and a faint spill of violet around it.
  float beam = 1.0 - smoothstep(BL_R * 0.84, BL_R, d);
  float spill = 1.0 - smoothstep(BL_R * 0.9, BL_R * 1.5, d);
  if (spill <= 0.0) return c;
  float uvLight = (beam * (0.8 + 0.2 * (1.0 - smoothstep(0.0, BL_R, d))) + spill * 0.06) * uUvLamp;
  beam *= uUvLamp;
  spill *= uUvLamp;

  float sat = (max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b))) / max(max(c.r, max(c.g, c.b)), 1e-3);
  // Under the lamp the picture stays, only dimmed a little and washed in violet, so the beam reads
  // as light falling on the card rather than a shadow; bright areas keep more of themselves, and
  // white paper fluoresces a cool blue.
  vec3 dark = c * mix(vec3(0.5, 0.43, 0.7), vec3(0.66, 0.6, 0.86), smoothstep(0.55, 1.0, L)) + vec3(0.04, 0.0, 0.1);
  dark += vec3(0.16, 0.22, 0.8) * smoothstep(0.5, 0.95, L) * (1.0 - smoothstep(0.12, 0.45, sat)) * 0.2;
  vec3 col = mix(c, dark, beam);
  // Just outside, the spill only tints the card.
  col = mix(col, col * vec3(0.9, 0.84, 1.04) + vec3(0.03, 0.0, 0.07), spill * (1.0 - beam) * 0.7);

  // Hidden ink printed along the picture's outlines, in an ink picked by the picture's own hue.
  // Read at a coarse scale, so it traces shapes rather than texture, dithering or noise; only
  // inside the art window, so its own border never lights up as a band.
  const vec2 BL_IN = vec2(0.022, 0.022 / 1.4);
  float inArt = min(min(texture(uMask, ruv + BL_IN).r, texture(uMask, ruv - BL_IN).r),
                    min(texture(uMask, ruv + vec2(BL_IN.x, -BL_IN.y)).r, texture(uMask, ruv - vec2(BL_IN.x, -BL_IN.y)).r));
  float line = smoothstep(0.2, 0.45, blEdge(ruv, 2.5, lod + 2.2)) * inArt;
  float halo = smoothstep(0.08, 0.3, blEdge(ruv, 9.0, lod + 4.2)) * inArt;
  vec3 blur = blFace(ruv, lod + 4.0);
  vec3 hsv = rgb2hsv(blur);
  vec3 ink = blInk(hsv.x * smoothstep(0.08, 0.3, hsv.y) + vnoise(ruv * vec2(2.2, 3.1)) * 0.8);
  vec3 glow = ink * (line * 1.35 + halo * 0.18);
  // Under them the art itself, engraved in the same ink.
  float art = m.r;
  float b = smoothstep(0.04, 0.75, luma(blFace(ruv, lod + 1.5)));
  glow += ink * blEngrave(uv, b) * (0.16 + 0.2 * b) * art;
  // The seal, the one mark that is there to be found.
  glow += BL_PINK * blSeal((ruv - BL_SEAL) * BL_ASPECT) * 0.95 * art;
  // FOIL microtext round the frame, faint behind the name; fibres everywhere.
  float plate = smoothstep(0.865, 0.885, ruv.y);
  glow += BL_YELLOW * blMicro(ruv * BL_ASPECT) * (1.0 - art) * mix(0.55, 0.3, plate);
  vec3 tint;
  float fib = blFibres(uv, tint);
  glow += tint * fib * 0.6;
  // The lamp's reflector leaves a faint lavender ring at the edge of the beam.
  float ring = exp(-pow((d - BL_R * 0.9) / (BL_R * 0.07), 2.0));
  col += vec3(0.32, 0.18, 0.6) * ring * 0.14 * uUvLamp;
  return col + glow * uvLight;
}
`;
