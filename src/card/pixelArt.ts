// Pixel art (a picture of hard, coarse pixels) is enlarged with hard pixels, never blurred.
// Whatever turns a picture into pixel art (or brings one) only has to make it look like this.
//
// No imports: the tests load this file directly with Node.

interface Pixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** Larger pictures are never enlarged much, so they are not looked at. */
export const PIXEL_ART_MAX = 1024;

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

/**
 * Whether a picture is pixel art: a small one of few colours, or one made of square blocks of one
 * colour (pixel art already blown up), whatever the grid's offset.
 */
export function isPixelArt({ data, width: w, height: h }: Pixels): boolean {
  if (Math.max(w, h) > PIXEL_ART_MAX || !w || !h) return false;
  const px = new Uint32Array(data.buffer, data.byteOffset, w * h);
  // Every clear pixel is the same clear.
  const at = (i: number) => (data[i * 4 + 3] ? px[i] : 0);
  // The runs of one colour along rows and columns, leaving out those cut by the edge.
  let block = 0;
  let runs = 0;
  const scan = (lines: number, len: number, idx: (line: number, i: number) => number) => {
    for (let l = 0; l < lines; l++) {
      let start = 0;
      for (let i = 1; i <= len; i++) {
        if (i < len && at(idx(l, i)) === at(idx(l, i - 1))) continue;
        if (start > 0 && i < len) {
          block = gcd(block, i - start);
          runs++;
        }
        start = i;
      }
    }
  };
  scan(h, w, (y, x) => y * w + x);
  scan(w, h, (x, y) => y * w + x);
  if (block >= 2 && runs >= 16) return true;
  if (Math.max(w, h) > 256) return false;
  const colours = new Set<number>();
  for (let i = 0; i < w * h; i++) {
    colours.add(at(i));
    if (colours.size > 256) return false;
  }
  return colours.size > 1;
}
