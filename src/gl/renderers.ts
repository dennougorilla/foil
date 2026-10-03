import { BG_FS, CARD_FS, CARD_VS, PARTICLE_FS, PARTICLE_VS, QUAD_VS } from './shaders';
import { createProgram, createTexture, hexToRgb, quadBuffer, uploadTexture, type Program } from './gl';
import { applyTune, TUNE_GL_DEFAULT, type TuneGl } from '../tune/model';
import { LetteringGL } from '../lettering';
import { RangeLayer } from './range';
import { ReliefGL } from '../relief';

export type RGB = [number, number, number];

export interface BackgroundFrame {
  time: number;
  colors: [RGB, RGB, RGB];
  pointer: [number, number];
  focus?: [number, number];
}

/** Full-viewport swirl. Rendered at a fraction of the screen size, then upscaled pixelated by CSS. */
export class BackgroundRenderer {
  readonly gl: WebGL2RenderingContext;
  private p: Program;
  private vao: WebGLVertexArrayObject;

  constructor(readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error('webgl2');
    this.gl = gl;
    this.p = createProgram(gl, QUAD_VS, BG_FS);
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    quadBuffer(gl, 1);
    const loc = this.p.attr('aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  }

  resize(w: number, h: number): void {
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  render(f: BackgroundFrame): void {
    const { gl, p } = this;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(p.prog);
    gl.bindVertexArray(this.vao);
    gl.uniform2f(p.u.uRes, this.canvas.width, this.canvas.height);
    gl.uniform1f(p.u.uTime, f.time);
    gl.uniform3fv(p.u.uC0, f.colors[0]);
    gl.uniform3fv(p.u.uC1, f.colors[1]);
    gl.uniform3fv(p.u.uC2, f.colors[2]);
    gl.uniform2f(p.u.uPointer, f.pointer[0], f.pointer[1]);
    const focus = f.focus ?? [0.5, 0.5];
    gl.uniform2f(p.u.uFocus, focus[0], focus[1]);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
}

export interface CardDraw {
  cx: number;
  cy: number;
  w: number;
  h: number;
  rx: number;
  ry: number;
  rz: number;
  scale: number;
  edition: number;
  intensity: number;
  pixel: number;
  tilt: [number, number];
  light: [number, number];
  alpha: number;
  flash: number;
  shadow: [number, number];
  /** Draw the nameplate text; off for thumbnail-sized cards. */
  plate?: boolean;
  /** 0..1: overlay showing where the finish lands. */
  rangeView?: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  decay: number;
  color: RGB;
}

/** Draws cards (front, back, shadow) and pixel particles into a transparent canvas. */
export class CardRenderer {
  readonly gl: WebGL2RenderingContext;
  private card: Program;
  private parts: Program;
  private cardVao: WebGLVertexArrayObject;
  private partVao: WebGLVertexArrayObject;
  private partBuf: WebGLBuffer;
  private partData = new Float32Array(7 * 512);
  private face: WebGLTexture;
  private mask: WebGLTexture;
  private back: WebGLTexture;
  private lettering: LetteringGL;
  private faceTexels = 1;
  private relief: ReliefGL;
  /** Where on the face the finish applies. */
  readonly range: RangeLayer;
  cssW = 1;
  cssH = 1;
  dpr = 1;
  /** Fine-tuning shared by every card this renderer draws. */
  tune: TuneGl = TUNE_GL_DEFAULT;

  /** `settled`: for exports, so passing moments (the lettering's stamp) are never captured. */
  constructor(readonly canvas: HTMLCanvasElement | OffscreenCanvas, opts: { preserve?: boolean; settled?: boolean } = {}) {
    const gl = canvas.getContext('webgl2', {
      antialias: true,
      alpha: true,
      premultipliedAlpha: true,
      preserveDrawingBuffer: !!opts.preserve,
    }) as WebGL2RenderingContext | null;
    if (!gl) throw new Error('webgl2');
    this.gl = gl;
    this.card = createProgram(gl, CARD_VS, CARD_FS);
    this.parts = createProgram(gl, PARTICLE_VS, PARTICLE_FS);

    this.cardVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.cardVao);
    quadBuffer(gl, 0.5);
    const a = this.card.attr('aPos');
    gl.enableVertexAttribArray(a);
    gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);

    this.partVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.partVao);
    this.partBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.partBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.partData.byteLength, gl.DYNAMIC_DRAW);
    const ap = this.parts.attr('aP');
    const ac = this.parts.attr('aC');
    gl.enableVertexAttribArray(ap);
    gl.vertexAttribPointer(ap, 4, gl.FLOAT, false, 28, 0);
    gl.enableVertexAttribArray(ac);
    gl.vertexAttribPointer(ac, 3, gl.FLOAT, false, 28, 16);
    gl.bindVertexArray(null);

    this.face = createTexture(gl, true);
    this.mask = createTexture(gl, false);
    this.back = createTexture(gl, true);
    this.lettering = new LetteringGL(gl, opts.settled);
    this.relief = new ReliefGL(gl, !opts.settled);
    this.range = new RangeLayer(gl);
  }

  setFace(face: HTMLCanvasElement, mask: HTMLCanvasElement): void {
    uploadTexture(this.gl, this.face, face, true);
    uploadTexture(this.gl, this.mask, mask, false);
    this.relief.setFace(face);
    this.faceTexels = face.width;
  }

  setBack(back: TexImageSource): void {
    uploadTexture(this.gl, this.back, back, true);
  }

  resize(cssW: number, cssH: number, dpr: number): void {
    this.cssW = cssW;
    this.cssH = cssH;
    this.dpr = dpr;
    const w = Math.max(1, Math.round(cssW * dpr));
    const h = Math.max(1, Math.round(cssH * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  begin(): void {
    const { gl } = this;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    // Our y-down screen mapping flips winding, so the front face is clockwise.
    gl.frontFace(gl.CW);
  }

  drawCard(d: CardDraw, time: number): void {
    const { gl, card: p } = this;
    gl.useProgram(p.prog);
    gl.bindVertexArray(this.cardVao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.face);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.mask);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.back);
    gl.uniform1i(p.u.uFace, 0);
    gl.uniform1i(p.u.uMask, 1);
    gl.uniform1i(p.u.uBack, 2);
    this.lettering.bind(p, 3);
    gl.uniform2f(p.u.uRes, this.cssW, this.cssH);
    gl.uniform2f(p.u.uCenter, d.cx, d.cy);
    gl.uniform2f(p.u.uSize, d.w, d.h);
    gl.uniform3f(p.u.uRot, d.rx, d.ry, d.rz);
    gl.uniform1f(p.u.uScale, d.scale);
    gl.uniform1i(p.u.uEdition, d.edition);
    gl.uniform1f(p.u.uIntensity, d.intensity);
    gl.uniform1f(p.u.uTime, time);
    gl.uniform1f(p.u.uPixel, d.pixel);
    gl.uniform2f(p.u.uTilt, d.tilt[0], d.tilt[1]);
    gl.uniform2f(p.u.uLight, d.light[0], d.light[1]);
    gl.uniform1f(p.u.uAlpha, d.alpha);
    gl.uniform1f(p.u.uFlash, d.flash);
    gl.uniform1f(p.u.uFaceTexels, this.faceTexels);
    gl.uniform1f(p.u.uPlate, d.plate === false ? 0 : 1);
    applyTune(gl, p.u, this.tune);
    this.relief.bind(p, 5);
    this.range.bind(p, 4, d.rangeView ?? 0, time);

    // Hard pixel drop shadow first, then the card itself.
    gl.uniform1f(p.u.uShadow, 1);
    gl.uniform2f(p.u.uShift, d.shadow[0], d.shadow[1]);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.uniform1f(p.u.uShadow, 0);
    gl.uniform2f(p.u.uShift, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  drawParticles(list: Particle[]): void {
    if (!list.length) return;
    const { gl, parts: p } = this;
    const n = Math.min(list.length, 512);
    const data = this.partData;
    for (let i = 0; i < n; i++) {
      const q = list[i];
      const o = i * 7;
      data[o] = q.x;
      data[o + 1] = q.y;
      data[o + 2] = q.size;
      data[o + 3] = q.life;
      data[o + 4] = q.color[0];
      data[o + 5] = q.color[1];
      data[o + 6] = q.color[2];
    }
    gl.useProgram(p.prog);
    gl.bindVertexArray(this.partVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.partBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data.subarray(0, n * 7));
    gl.uniform2f(p.u.uRes, this.cssW, this.cssH);
    gl.uniform1f(p.u.uDpr, this.dpr);
    gl.drawArrays(gl.POINTS, 0, n);
  }
}

export { hexToRgb };
