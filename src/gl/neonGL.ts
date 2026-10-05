// Neon's maps on the GPU: the sign laid out from each new face (see neonMap.ts), bound with the
// card's other textures. The stage and an export each run their own, from the same face, so the
// export shows the same tubes as the screen.
import { artOf } from '../card/face';
import type { Program } from './gl';
import { NEON_MAX_TUBES, NEON_REACH, neonDesign, neonPosts, neonTubeMap, neonWallMap, type NeonDesign } from './neonMap';

/** Face pixels per cell: of the picture the tubes are traced on, of the tube map, of the wall map. */
const READ_CELL = 4;
const TUBE_CELL = 3;
const WALL_CELL = 10;
/** The stage re-reads a changing face (crop drag, animated picture) at most this often. */
const LIVE_EVERY_MS = 160;
/** Room in the uniform arrays: the picture's tubes and the border. */
const SLOTS = NEON_MAX_TUBES + 1;
/** Room for posts (NEON_POSTS in the shader). */
const POSTS = 40;

function floatTexture(gl: WebGL2RenderingContext, texel: number[]): WebGLTexture {
  const t = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, 1, 1, 0, gl.RGBA, gl.FLOAT, new Float32Array(texel));
  return t;
}

export class NeonGL {
  private tube: WebGLTexture;
  private wall: WebGLTexture;
  private gas = new Float32Array(SLOTS * 3);
  private len = new Float32Array(SLOTS);
  private posts = new Float32Array(POSTS * 2);
  private info = [13.5, 0, -1, 0];
  private cells = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private read: Uint8ClampedArray | null = null;
  private pending: HTMLCanvasElement | null = null;
  private last = -Infinity;

  /** `live`: false for exports, which read every face they draw. */
  constructor(
    private gl: WebGL2RenderingContext,
    private live: boolean,
  ) {
    this.tube = floatTexture(gl, [NEON_REACH, 0, -1, 1]);
    this.wall = floatTexture(gl, [0, 0, 0, -1]);
    this.ctx = this.cells.getContext('2d', { willReadFrequently: true })!;
  }

  /** Notes a new face; it is read only once a Neon card is drawn with it (see bind). */
  setFace(face: HTMLCanvasElement): void {
    this.pending = face;
  }

  private refresh() {
    if (!this.pending) return;
    const now = performance.now();
    if (this.live && now < this.last + LIVE_EVERY_MS) return;
    this.analyse(this.pending);
    this.pending = null;
    this.last = now;
  }

  private analyse(face: HTMLCanvasElement) {
    const { ctx } = this;
    const w = Math.round(face.width / READ_CELL);
    const h = Math.round(face.height / READ_CELL);
    if (this.cells.width !== w || this.cells.height !== h) {
      this.cells.width = w;
      this.cells.height = h;
      this.read = null;
    }
    ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(face, 0, 0, w, h);
    const px = ctx.getImageData(0, 0, w, h).data;
    // Typing the name repaints the face but not the picture: keep the sign as it is.
    const art = artOf(face);
    const same = this.read && sameArt(this.read, px, w, art, face.width / w);
    this.read = px;
    if (same) return;
    const d = neonDesign(px, w, h, face.width, face.height, art);
    this.upload(d, face.width, face.height);
  }

  private upload(d: NeonDesign, fw: number, fh: number) {
    const { gl } = this;
    const tw = Math.ceil(fw / TUBE_CELL);
    const th = Math.ceil(fh / TUBE_CELL);
    gl.bindTexture(gl.TEXTURE_2D, this.tube);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, tw, th, 0, gl.RGBA, gl.FLOAT, neonTubeMap(d, tw, th, fw, fh));
    const ww = Math.ceil(fw / WALL_CELL);
    const wh = Math.ceil(fh / WALL_CELL);
    gl.bindTexture(gl.TEXTURE_2D, this.wall);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, ww, wh, 0, gl.RGBA, gl.FLOAT, neonWallMap(d, ww, wh, fw, fh));
    this.gas.fill(0);
    this.len.fill(1);
    d.tubes.forEach((t, i) => {
      this.gas.set(t.gas, i * 3);
      this.len[i] = t.len;
    });
    const posts = neonPosts(d).slice(0, POSTS * 2);
    this.posts.fill(0);
    this.posts.set(posts);
    this.info = [d.width, d.tubes.length, d.tubes.findIndex((t) => t.border), posts.length / 2];
  }

  /** The tube map goes on `unit`, the wall on `unit + 1`. `neon`: the card being drawn is Neon, so its maps must be current. */
  bind(p: Program, unit: number, neon: boolean): void {
    const { gl } = this;
    // On their own units: a refresh uploads and must not disturb the other textures.
    gl.activeTexture(gl.TEXTURE0 + unit);
    if (neon) this.refresh();
    gl.bindTexture(gl.TEXTURE_2D, this.tube);
    gl.uniform1i(p.u.uNeonMap, unit);
    gl.activeTexture(gl.TEXTURE0 + unit + 1);
    gl.bindTexture(gl.TEXTURE_2D, this.wall);
    gl.uniform1i(p.u.uNeonWall, unit + 1);
    gl.uniform3fv(p.u.uNeonGas, this.gas);
    gl.uniform1fv(p.u.uNeonLen, this.len);
    gl.uniform2fv(p.u.uNeonPost, this.posts);
    gl.uniform4f(p.u.uNeonInfo, this.info[0], this.info[1], this.info[2], this.info[3]);
  }
}

function sameArt(a: Uint8ClampedArray, b: Uint8ClampedArray, w: number, art: { x: number; y: number; w: number; h: number }, cell: number): boolean {
  if (a.length !== b.length) return false;
  const x0 = Math.max(0, Math.floor(art.x / cell));
  const x1 = Math.min(w, Math.ceil((art.x + art.w) / cell));
  const y0 = Math.max(0, Math.floor(art.y / cell));
  const y1 = Math.ceil((art.y + art.h) / cell);
  for (let y = y0; y < y1; y++) for (let i = (y * w + x0) * 4, end = (y * w + x1) * 4; i < end; i++) if (a[i] !== b[i]) return false;
  return true;
}
