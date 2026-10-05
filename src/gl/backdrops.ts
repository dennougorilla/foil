// The backdrops other than the swirl (docs/backdrops.md), fetched when one is picked. Each is a
// fragment shader on the swirl's quad, drawn at a quarter of the frame's size and scaled up
// pixelated. They read the loop's place (uPhase, 0..1) and turn only whole turns in it, so a file
// closes without a seam; they are laid out round the card (uFocus, uCard) in card heights.
import { COMMON } from './common.ts';
import type { BackdropId } from '../backdrop';

const HEAD = /* glsl */ `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uPhase;   // place in the card's loop, 0..1
uniform vec3 uC0, uC1, uC2; // the finish's colors: dark, mid, light
uniform vec3 uColor;    // Plain's color
uniform vec2 uPointer;  // the page's pointer, 0..1 (0.5 in a file)
uniform vec2 uFocus;    // the card's middle, 0..1 with y up
uniform float uCard;    // the card's height over the frame's
out vec4 o;
${COMMON}
const float TAU = 6.28318530718;
// One backdrop pixel in card heights (set by cardSpace).
float PX;
// The card's frame: card heights round the card's middle, y up.
vec2 cardSpace() {
  PX = 1.0 / max(uCard * uRes.y, 1.0);
  return (gl_FragCoord.xy - uFocus * uRes) * PX + (uPointer - 0.5) * 0.06;
}
// k whole turns in one loop, starting a fraction o of a turn in.
float wave(float k, float o) { return sin(TAU * (uPhase * k + o)); }
// Rounds to steps of 1/n through a 4x4 ordered dither, so a gradient turns into pixel art, not bands.
vec3 poster(vec3 c, float n) {
  ivec2 q = ivec2(gl_FragCoord.xy) & 3;
  int i = q.x + q.y * 4;
  const float B[16] = float[16](0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.);
  return floor(c * n + (B[i] + 0.5) / 16.0) / n;
}
`;

const shader = (body: string) => `${HEAD}\nvoid main() {\n${body}\n}\n`;

export const BACKDROP_FS: Record<Exclude<BackdropId, 'swirl'>, string> = {
  // A green felt card table: the lamp's pool round the card, a stitched mat round the play area and
  // the cloth darkening towards the rails. Still.
  felt: shader(/* glsl */ `
  vec2 p = cardSpace();
  // The lamp's wide oval pool, warm in its middle, falling off to near black towards the rails.
  float r = length(p * vec2(0.5, 0.78));
  float lamp = 1.0 - smoothstep(0.12, 1.25, r);
  vec3 col = mix(vec3(0.008, 0.035, 0.026), vec3(0.11, 0.36, 0.24), lamp * lamp);
  col += vec3(0.05, 0.045, 0.01) * exp(-r * r * 6.0);
  // The nap of the cloth: a grain in every pixel and soft patches where it was brushed.
  col *= (0.93 + 0.14 * hash12(floor(gl_FragCoord.xy))) * (0.88 + 0.24 * vnoise(p * 2.6 + 4.0));
  // The mat's stitched edge, a rounded box round the card.
  vec2 b = abs(p) - vec2(0.6, 0.74) + 0.14;
  float edge = length(max(b, 0.0)) + min(max(b.x, b.y), 0.0) - 0.14;
  float stitch = step(abs(edge), PX * 0.75) * step(2.0, mod(floor(gl_FragCoord.x) + floor(gl_FragCoord.y), 4.0));
  col = mix(col, col * 1.6 + 0.02, stitch * 0.7);
  o = vec4(poster(col, 40.0), 1.0);`),

  // A photo studio: a seamless paper sweep in deep grey that curves from the floor up into the wall
  // just under the card's foot, a wide soft spotlight on the paper behind it and its pool on the floor. Still.
  studio: shader(/* glsl */ `
  vec2 p = cardSpace();
  // The paper turns from floor to wall just under the card's foot.
  float y = p.y + 0.66;
  vec3 wall = mix(vec3(0.075, 0.078, 0.088), vec3(0.018, 0.019, 0.024), smoothstep(0.0, 1.8, y));
  vec3 ground = mix(vec3(0.085, 0.087, 0.094), vec3(0.025, 0.026, 0.03), smoothstep(0.0, -0.7, y));
  vec3 col = mix(ground, wall, smoothstep(-0.12, 0.12, y));
  // A wide soft spot on the paper behind the card, centred a little low ...
  vec2 s = (p - vec2(0.0, -0.08)) * vec2(0.62, 0.72);
  col += vec3(0.3, 0.29, 0.27) * exp(-dot(s, s) * 1.6) * smoothstep(-0.2, 0.1, y);
  // ... and its pool on the floor in front of the card.
  vec2 f = (p - vec2(0.0, -0.8)) * vec2(0.7, 2.6);
  col += vec3(0.2, 0.195, 0.185) * exp(-dot(f, f) * 1.4) * (1.0 - smoothstep(-0.1, 0.12, y));
  // The gloss where the floor turns up into the wall.
  col += vec3(0.03) * exp(-y * y * 60.0) * exp(-p.x * p.x * 0.5);
  o = vec4(poster(col, 40.0), 1.0);`),

  // Wine-red velvet gathered in soft folds under the card, as in a jeweller's showcase: the pile
  // catches the light where the cloth turns away, brightest round the card under a lamp. Still.
  velvet: shader(/* glsl */ `
  vec2 p = cardSpace();
  // Folds fanning out from a point below the card, wandering a little as they go.
  vec2 v = p - vec2(0.0, -1.5);
  float r = length(v);
  float a = atan(v.x, v.y) * 6.0 + sin(r * 2.2 + atan(v.x, v.y) * 3.0) * 0.8;
  // Broad soft folds: the pile glows across the whole turn of a fold, not in a thin streak.
  float sheen = (0.5 + 0.5 * cos(a)) * (0.85 + 0.15 * vnoise(p * 5.0));
  vec3 col = mix(vec3(0.1, 0.01, 0.03), vec3(0.42, 0.09, 0.16), sheen * sheen);
  // The fold's shadowed side.
  col *= 0.8 + 0.2 * sin(a);
  // One broad light from above, round the card.
  float l = length(p * vec2(0.55, 0.75) - vec2(0.0, 0.12));
  col *= mix(0.28, 1.2, exp(-l * l * 1.1));
  o = vec4(poster(col, 40.0), 1.0);`),

  // A dark room full of soft out-of-focus lights in the finish's colors, each circling once or twice
  // a loop and glowing brighter and dimmer.
  bokeh: shader(/* glsl */ `
  vec2 p = cardSpace();
  vec3 col = mix(vec3(0.01, 0.01, 0.018), uC0 * 0.6, exp(-dot(p, p) * 0.4));
  for (int i = 0; i < 28; i++) {
    float fi = float(i);
    vec2 h = hash22(vec2(fi, 3.7));
    // Denser near the card, so a narrow screen has lights too.
    vec2 u = h * 2.0 - 1.0;
    vec2 base = sign(u) * pow(abs(u), vec2(1.2)) * vec2(2.5, 1.2);
    float k = 1.0 + step(0.6, hash12(vec2(fi, 9.1)));
    float a = TAU * (uPhase * k * (mod(fi, 2.0) * 2.0 - 1.0) + h.x);
    vec2 c = base + vec2(cos(a), sin(a)) * 0.05;
    float rad = mix(0.1, 0.39, pow(hash12(vec2(fi, 1.3)), 1.5));
    float d = length(p - c) / rad;
    // A soft light: full in its middle, fading smoothly to nothing at its edge.
    float disc = 1.0 - smoothstep(0.15, 1.0, d);
    vec3 lc = mix(uC1, uC2, hash12(vec2(fi, 5.5)));
    lc = mix(lc / max(max(lc.r, lc.g), max(lc.b, 0.05)), vec3(1.0, 0.85, 0.6), 0.25);
    float glow = mix(0.12, 0.26, hash12(vec2(fi, 2.9))) * (0.75 + 0.25 * wave(k, h.y));
    col += lc * glow * disc;
  }
  o = vec4(poster(col, 40.0), 1.0);`),

  // A night sky: deep blue with a faint band of the Milky Way, pixel stars twinkling one to three
  // times a loop, and one shooting star crossing above the card.
  stars: shader(/* glsl */ `
  vec2 p = cardSpace();
  vec3 col = mix(vec3(0.04, 0.055, 0.13), vec3(0.008, 0.01, 0.035), smoothstep(-1.2, 1.2, p.y));
  float band = exp(-pow((p.y * 0.9 - p.x * 0.35 - 0.12) * 2.1, 2.0));
  col += mix(vec3(0.06, 0.05, 0.12), uC1 * 0.12, 0.35) * band * (0.35 + 0.9 * fbm(p * 3.0 + 2.0));
  // At most one star in a cell, lit on the one pixel it falls in; the brightest ones are crosses.
  const float CELL = 0.055;
  vec2 cell = floor(p / CELL);
  float h = hash12(cell + 11.0);
  if (h < 0.3 + band * 0.25) {
    vec2 s = (cell + 0.2 + 0.6 * hash22(cell)) * CELL;
    vec2 d = abs(p - s) / PX;
    float k = 1.0 + floor(hash12(cell + 5.0) * 3.0);
    float tw = 0.55 + 0.45 * wave(k, h * 7.0);
    float b = mix(0.3, 1.0, pow(hash12(cell + 2.0), 6.0)) * tw;
    vec3 sc = mix(vec3(0.72, 0.82, 1.0), vec3(1.0, 0.9, 0.74), hash12(cell + 9.0));
    float lit = step(max(d.x, d.y), 0.5);
    float arm = step(0.8, b) * step(min(d.x, d.y), 0.5) * step(max(d.x, d.y), 1.5) * 0.5;
    col = max(col, sc * b * max(lit, arm));
  }
  float t = (uPhase - 0.58) / 0.14;
  if (t > 0.0 && t < 1.0) {
    vec2 a = vec2(-1.25, 0.82), e = vec2(0.95, 0.58);
    vec2 dir = normalize(e - a);
    vec2 rel = p - mix(a, e, t);
    float along = dot(rel, -dir);
    float across = abs(dot(rel, vec2(-dir.y, dir.x)));
    float tail = step(0.0, along) * (1.0 - smoothstep(0.0, 0.42, along)) * step(across, PX * 0.6);
    col += vec3(1.0, 0.95, 0.85) * tail * sin(3.14159 * t);
  }
  o = vec4(poster(col, 40.0), 1.0);`),

  // Confetti in party colors falling on a dark wall, in two layers (the far one smaller and dimmer),
  // each strip swaying and turning over as it falls. A layer's column of pieces repeats every so many
  // cells, and it falls exactly that far in one loop.
  confetti: shader(/* glsl */ `
  vec2 p = cardSpace();
  vec3 col = mix(vec3(0.03, 0.026, 0.055), uC0 * 0.55 + 0.02, exp(-dot(p, p) * 0.6));
  const vec3 INK[6] = vec3[6](vec3(0.96, 0.76, 0.3), vec3(1.0, 0.42, 0.55), vec3(0.36, 0.82, 1.0), vec3(0.35, 0.94, 0.68), vec3(0.95, 0.93, 0.88), vec3(0.76, 0.55, 1.0));
  for (int l = 0; l < 2; l++) {
    float size = l == 0 ? 0.2 : 0.13;
    float rows = l == 0 ? 10.0 : 14.0;
    vec2 q = p / size;
    q.y += uPhase * rows;
    vec2 cell = floor(q);
    vec2 id = vec2(cell.x, mod(cell.y, rows)) + float(l) * 37.0;
    float h = hash12(id);
    if (h > 0.45) continue;
    vec2 j = hash22(id + 3.1) - 0.5;
    float k = 1.0 + floor(hash12(id + 7.0) * 2.0);
    vec2 f = fract(q) - 0.5 - j * 0.4 - vec2(wave(k, h) * 0.1, 0.0);
    // A strip lying one way or the other, turning over: its long side shrinks and grows.
    float turn = wave(k, j.x + 0.25);
    vec2 hs = j.y > 0.0 ? vec2(0.078 * max(abs(turn), 0.25), 0.045) : vec2(0.045, 0.078 * max(abs(turn), 0.25));
    vec2 e = abs(f) - hs;
    if (max(e.x, e.y) < 0.0) {
      vec3 ink = INK[int(h * 13.32)] * (l == 0 ? 0.85 : 0.42);
      // The underside shows darker as it turns.
      col = ink * (turn > 0.0 ? 1.0 : 0.62);
    }
  }
  o = vec4(poster(col, 40.0), 1.0);`),

  plain: shader(/* glsl */ `
  o = vec4(uColor, 1.0);`),

  // Only on the stage: a dark checkerboard says a file will be transparent here.
  clear: shader(/* glsl */ `
  ivec2 c = ivec2(floor(gl_FragCoord.xy / 3.0));
  o = vec4(((c.x + c.y) & 1) == 1 ? vec3(0.149, 0.173, 0.188) : vec3(0.125, 0.149, 0.165), 1.0);`),
};
