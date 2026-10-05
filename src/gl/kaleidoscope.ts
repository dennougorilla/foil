// Kaleidoscope: the picture seen down a kaleidoscope's tube. Spliced into CARD_FS after COMMON
// and TUNE_GLSL, so hash/luma/rgb2hsv and the tune uniforms are in scope.
//
// The tube stands over the middle of the art window. Its middle is a round window of clear glass
// where the picture stays as it is, so it still reads as the picture. Around it, mirrors fold one
// slice of the picture into KS_SLICES mirrored slices: each slice shows the same wedge of the art,
// every other one flipped, and each reflection a little darker than the one it came from. The
// mirrors' seams catch thin lines of light, and the tube's round brass rim closes the view, with
// the picture dimmed outside it.
// Tilting turns the pattern and slides the wedge the mirrors see across the picture, so it
// rebuilds itself as it turns, like turning the tube. Nothing here reads the clock, so it holds
// still under reduced motion and loops in exports.
export const KALEIDOSCOPE_GLSL = /* glsl */ `
const float KS_SLICES = 12.0;  // mirrored slices round the tube (six pairs of mirror images)
const float KS_CORE = 0.47;    // the clear window in the middle, as a share of the tube's radius
const float KS_RIM = 0.045;    // the rim's width, in units of the card's short side

// A point folded back into the box lo..hi, as if mirrors stood on its sides.
vec2 ksFold(vec2 p, vec2 lo, vec2 hi) {
  vec2 s = hi - lo;
  vec2 q = mod(p - lo, 2.0 * s);
  return lo + s - abs(q - s);
}

vec3 kaleidoscope(vec3 c, vec2 uv, vec2 t, float lod, float art) {
  // The tube's geometry in face uv, measured in units of the card's short side.
  vec2 ruv = tuneUnpattern(uv);
  vec2 mid = (uArt.xy + uArt.zw) * 0.5;
  vec2 hs = (uArt.zw - uArt.xy) * 0.5 * uCardK;
  float R = min(hs.x, hs.y) * 0.93;
  vec2 p = (ruv - mid) * uCardK;
  float r = length(p);
  float a = atan(p.y, p.x);
  float px = fwidth(r) + 1e-5; // one screen pixel, so the lines stay crisp at every size

  // Turning the tube: the pattern turns with the tilt, and the wedge the mirrors see turns the
  // other way and slides, so the pattern rebuilds rather than only rotating.
  float turn = t.x * 1.15 - t.y * 0.75;
  float see = 1.25 - t.x * 0.9 + t.y * 1.4;
  vec2 slide = vec2(t.x, -t.y) * R * 0.3;

  const float W = 6.2831853 / KS_SLICES;
  float aa = a - turn;
  float k = floor(aa / W);
  float f = aa - k * W;
  float flipped = mod(k, 2.0);
  if (flipped > 0.5) f = W - f;
  // The wedge the mirrors see starts inside the clear window, so it always crosses the edge of
  // whatever sits in the middle (the subject), and it is wider than the slice it fills (the
  // tube's lenses gather it in), so each slice carries more of the picture.
  float rs = r * 1.15 - KS_CORE * R * 0.55;
  float fs = see + f * 2.2;
  vec2 sp = slide + rs * vec2(cos(fs), sin(fs));
  vec2 suv = ksFold(mid + sp / uCardK, uArt.xy + 0.004, uArt.zw - 0.004);
  vec4 s = textureLod(uFace, suv, lod + 0.4);
  vec3 seen = s.rgb / max(s.a, 1e-4);
  // The bits in the tube are sharper than the picture: its local contrast is drawn out, so even
  // a soft photo folds into a crisp pattern.
  vec4 wide = textureLod(uFace, suv, lod + 3.5);
  seen = clamp(seen + (seen - wide.rgb / max(wide.a, 1e-4)) * 0.9, 0.0, 1.0);
  // Mirror glass: a little richer and brighter than paper, every reflection a little darker
  // and cooler than the one before.
  vec3 hsv = rgb2hsv(seen);
  hsv.y = clamp(hsv.y * 1.25 + 0.04, 0.0, 1.0);
  hsv.z = clamp(hsv.z * 1.06 + 0.03, 0.0, 1.0);
  seen = hsv2rgb(hsv) * mix(1.0, 0.86, flipped) * mix(vec3(1.0), vec3(0.95, 0.98, 1.04), flipped);
  // Each mirror faces its own way, so the slices facing the light brighten as the tube turns.
  vec2 lp = (uLight - mid) * uCardK;
  float lightAng = atan(lp.y, lp.x);
  float sliceAng = (k + 0.5) * W + turn;
  // Across each slice the mirror's face catches a little more light towards one edge.
  seen *= 0.94 + 0.12 * (f / W);
  seen *= 0.84 + 0.3 * pow(0.5 + 0.5 * cos(sliceAng - lightAng - t.x * 2.0 + t.y * 1.5), 2.0);

  // The clear window in the middle keeps the picture; its edge is a ring of glass.
  float core = KS_CORE * R;
  float inCore = 1.0 - smoothstep(core - px, core + px, r);
  vec3 col = mix(seen, c, inCore);
  // The glass ring: a dark groove outside, a bright line on its edge, brightest towards the light.
  float toLight = 0.5 + 0.5 * cos(a - lightAng);
  float ring = exp(-pow((r - core) / (px * 1.4 + 0.0025), 2.0));
  float groove = exp(-pow((r - core - 0.012) / 0.012, 2.0));
  col *= 1.0 - 0.35 * groove * (1.0 - inCore);
  col += uTLight * ring * (0.35 + 0.65 * toLight);

  // Light along the seams where two mirrors meet, a thin line growing brighter out from the
  // middle; a glint runs along each one as the tube turns.
  float seam = min(f, W - f) * r;
  float line = exp(-pow(seam / (px * 0.9 + 0.0012), 2.0));
  // Each seam has its own glint; the seam at f = 0 belongs to slice k, the other to k + 1.
  float mirror = k + step(0.5 * W, aa - k * W);
  float glint = pow(0.5 + 0.5 * cos(r / R * 9.0 - turn * 4.0 + mirror * W * 5.0 - see * 3.0), 6.0);
  float outward = smoothstep(core, core + 0.06, r);
  col += uTLight * line * outward * (0.28 + 1.1 * glint);
  col += uTLight * exp(-pow(seam / 0.02, 2.0)) * outward * glint * 0.12;

  // The tube's inside falls off to its rim, which is round brass catching the light on one side.
  float inTube = 1.0 - smoothstep(R - px, R + px, r);
  col *= 1.0 - 0.36 * smoothstep(R * 0.72, R, r) * (1.0 - inCore);
  // The rim's lip shades a thin band just inside it.
  col *= 1.0 - 0.45 * smoothstep(R - 0.03, R, r);
  float rimX = clamp((r - R) / KS_RIM, 0.0, 1.0);
  float onRim = smoothstep(R - px, R + px, r) * (1.0 - smoothstep(R + KS_RIM - px, R + KS_RIM + px, r));
  // Rounded across its width, so the light lands on a band along it.
  float bulge = sqrt(max(1.0 - pow(rimX * 2.0 - 1.0, 2.0), 0.0));
  float facing = 0.5 + 0.5 * cos(a - lightAng + t.x * 1.6 - t.y * 1.2);
  vec3 brass = mix(vec3(0.16, 0.11, 0.06), vec3(0.78, 0.6, 0.32), bulge * (0.25 + 0.75 * facing));
  brass += uTLight * pow(bulge, 12.0) * pow(facing, 3.0) * 0.8;
  // Fine knurling round the rim, catching the light in steps.
  brass *= 0.86 + 0.14 * step(0.5, fract(a * 60.0 / 6.2831853));
  // Outside the tube the picture lies in its shadow.
  vec3 outside = mix(vec3(luma(c)), c, 0.7) * mix(0.22, 0.55, smoothstep(0.0, 0.07, r - R - KS_RIM));
  vec3 kal = col * inTube + brass * onRim + outside * (1.0 - inTube) * (1.0 - onRim);
  return mix(c, kal, art);
}
`;
