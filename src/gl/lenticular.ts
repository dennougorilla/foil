// Lenticular (beta): a two-picture flip card under a sheet of fine vertical lenses. Spliced into
// CARD_FS after COMMON and TUNE_GLSL, so face/luma/tuneUnpattern/uLight are in scope.
//
// Under each lens lie thin strips of both pictures. The lens magnifies the strip that sits in
// the direction you look from: from the front (and tilted right) that is the front picture,
// tilted left the other one, as on a real two-picture flip card. Each lens spans a small range of view angles from one side to the other, so on
// the way between the two a part of every lens shows each picture: they mix in thin stripes,
// and as the view angle also changes a little across the card, the stripes sweep over it.
// Tilting along the lenses (up and down) never flips it. Each lens also shows its strip
// stretched across its width, which gives the picture a faint corduroy, and the ridges catch
// the light as a band of fine vertical glints.
// Nothing here reads the clock, so the finish moves only with the tilt: exports loop and
// reduced motion holds it still.

export const LENTICULAR_GLSL = /* glsl */ `
uniform sampler2D uFlip;  // the other picture, laid out like the face (art window only)
uniform float uFlip2;     // 1: the person chose one; 0: the front picture drawn in pencil

const float LT_LENSES = 76.0; // lenses across the card
// View angles in tilt units. The flip is done by a tilt of -0.45, which reduced motion (half
// the tilt) still reaches, and never starts on the right, where a PNG and a still GIF look from.
const float LT_FLIP = 0.28;   // the angle where a lens is half and half
const float LT_LENS = 0.14;   // range of angles one lens spans across its width
const float LT_CARD = 0.1;    // range of angles across the card (perspective)

vec4 flipFace(vec2 pv, float lod) { return textureLod(uFlip, tuneFaceUv(pv), lod); }

// Pencil hatching: strokes across d about every 14 face pixels, covering more of the paper the
// darker it is. Each stroke wobbles a little and breaks off here and there, as drawn by hand.
// Strokes thinner than a screen pixel fade to the tone they would average to.
float ltHatch(vec2 pv, vec2 d, float dark) {
  vec2 px = pv * vec2(900.0, 1260.0);
  float h = dot(px, d) / 14.0 + (vnoise(px / 60.0) - 0.5) * 0.7;
  float k = fwidth(h);
  float on = 1.0 - smoothstep(dark - k, dark + k, abs(fract(h) - 0.5) * 2.0);
  float along = dot(px, vec2(-d.y, d.x)) / 40.0;
  on *= smoothstep(0.22, 0.4, vnoise(vec2(along, floor(h) * 3.1)));
  return mix(on, dark * 0.7, smoothstep(0.25, 0.6, k));
}

// The front picture redrawn in pencil on paper: a line wherever a spot is darker than its
// surroundings (a difference of two blurred copies, so fine texture and dithering stay out),
// shaded with hatching in two directions for the darkest parts. The hatching is laid on at hv,
// the spot itself, so its strokes stay straight across the lenses.
vec3 ltPencil(vec2 pv, vec2 hv, float lod) {
  float near = luma(face(pv, lod + 1.0).rgb);
  float wide = luma(face(pv, lod + 3.0).rgb);
  float line = smoothstep(0.01, 0.045, wide - near);
  float dark = 1.0 - near;
  float shade = max(ltHatch(hv, vec2(0.7071, 0.7071), smoothstep(0.35, 0.85, dark) * 0.42),
                    ltHatch(hv, vec2(0.7071, -0.7071), smoothstep(0.72, 0.97, dark) * 0.36));
  vec3 paper = vec3(0.96, 0.94, 0.89);
  vec3 lead = vec3(0.2, 0.21, 0.25);
  vec3 col = mix(paper, lead, shade * 0.7 + smoothstep(0.2, 1.0, dark) * 0.12);
  return mix(col, lead, line * 0.9);
}

vec3 lenticular(vec3 c, vec2 uv, vec2 t, float lod, float art) {
  // Across the lenses, in pattern space, so Pattern size and angle reach them.
  float lx = (uv.x - 0.5) * LT_LENSES;
  float f = fract(lx);
  // Lenses narrower than about three pixels (the hand, small exports) fade to a plain crossfade.
  float detail = smoothstep(0.45, 0.25, fwidth(lx));
  float tilt = t.x * cos(uTAngle) + t.y * sin(uTAngle);
  vec2 ruv = tuneUnpattern(uv);

  // Both pictures as each lens shows them: its strip stretched across the lens.
  float sx = (floor(lx) + 0.5 + (f - 0.5) * 0.85) / LT_LENSES + 0.5;
  vec2 pv = vec2(mix(uv.x, sx, detail * art), uv.y);
  vec4 fa = face(pv, lod);
  vec3 a = mix(c, fa.rgb / max(fa.a, 1e-4), art);
  vec3 b;
  if (uFlip2 > 0.5) {
    vec4 fb = flipFace(pv, lod);
    b = fb.rgb / max(fb.a, 1e-4);
  } else {
    b = ltPencil(pv, uv, lod);
  }

  // Which picture this spot of this lens shows: the view angle, from the tilt, the spot's place
  // within its lens and the lens's place on the card.
  float view = -tilt + (f - 0.5) * LT_LENS * detail + (ruv.x - 0.5) * LT_CARD;
  float soft = mix(0.07, 0.015, detail);
  float w = smoothstep(LT_FLIP - soft, LT_FLIP + soft, view);
  vec3 col = mix(a, b, w * art);

  // The lens sheet: a slight lift of the blacks, a darker valley between lenses, and a glint on
  // each ridge facing the light, in a band level with it. The valleys stay faint from the front
  // and deepen on the way between the pictures, where the lenses are what you look at.
  col = col * 0.95 + 0.025;
  float edge = abs(f - 0.5) * 2.0;
  float between = 1.0 - abs(w * 2.0 - 1.0);
  col *= 1.0 - (0.05 + 0.12 * between) * edge * edge * edge * detail;
  float at = fract(0.5 + (uLight.x - ruv.x) * 0.9 + tilt * 0.35);
  float glint = exp(-pow((f - at) / 0.06, 2.0));
  float band = exp(-pow((ruv.y - uLight.y) * 2.4, 2.0));
  col += uTLight * glint * band * (0.28 + 0.4 * between) * detail;
  return col;
}
`;
