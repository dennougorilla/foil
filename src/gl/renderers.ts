import { BG_FS, cardFs, CARD_VS, PARTICLE_FS, PARTICLE_VS, QUAD_VS } from './shaders';
import { createTexture, hexToRgb, quadBuffer, startProgram, uploadTexture, type PendingProgram } from './gl';
import { applyTune, TUNE_GL_DEFAULT, type TuneGl } from '../tune/model';
import { LetteringGL } from '../lettering';
import { artOf } from '../card/face';
import { RangeLayer } from './range';
import type { HeatSource } from '../touch/heat';
import type { LayerMap } from '../depth/layers';
import type { PackId } from '../packs';
import { packModule, packOfShader } from './finishes/registry';
import type { FinishLayer } from './finishes/types';
import { cardK } from '../card/shape';
import type { QualityLevel } from '../quality';

export type RGB = [number, number, number];

/** One card program: the core with the open finishes, or the core with one pack's. */
interface CardProgram {
  pending: PendingProgram;
  layers: FinishLayer[];
  /** The frame (see begin) whose answer `ready` holds: each question is a round trip to the GPU process. */
  askedIn: number;
  ready: boolean;
}

export interface BackgroundFrame {
  time: number;
  colors: [RGB, RGB, RGB];
  pointer: [number, number];
  focus?: [number, number];
}

/** Full-viewport swirl. Rendered at a fraction of the screen size, then upscaled pixelated by CSS. */
export class BackgroundRenderer {
  readonly gl: WebGL2RenderingContext;
  private pending: PendingProgram;
  private vao: WebGLVertexArrayObject;
  /** On the page, the swirl compiles in the background and shows from the first frame it is ready; an export waits for it. */
  private live: boolean;

  constructor(readonly canvas: HTMLCanvasElement, opts: { live?: boolean } = {}) {
    this.live = !!opts.live;
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error('webgl2');
    this.gl = gl;
    this.pending = startProgram(gl, QUAD_VS, BG_FS, 'aPos');
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    quadBuffer(gl, 1);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  }

  resize(w: number, h: number): void {
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  /** What a still backdrop was last drawn with (size, colors, place), and the moment it holds. */
  private stillKey = '';
  private held: { time: number; pointer: [number, number] } | null = null;

  /**
   * Sizes and draws the backdrop for a window of w × h css px at a drawing level (src/quality.ts).
   * At a still level it holds its moment and is drawn again only when its size, colors or place
   * change, so any backdrop drawn here is light on a slow device without a light version of its own.
   */
  draw(f: BackgroundFrame, q: QualityLevel, w: number, h: number): void {
    this.resize(Math.ceil(w / q.bg), Math.ceil(h / q.bg));
    if (!q.still) {
      this.held = null;
      this.stillKey = '';
      this.render(f);
      return;
    }
    this.held ??= { time: f.time, pointer: f.pointer };
    // Settled to a 256th of a color step and a pixel of place is settled.
    const focus = f.focus ?? [0.5, 0.5];
    const key = [this.canvas.width, this.canvas.height, ...f.colors.flat().map((c) => Math.round(c * 256)), Math.round(focus[0] * this.canvas.width), Math.round(focus[1] * this.canvas.height)].join();
    if (key !== this.stillKey && this.render({ ...f, ...this.held })) this.stillKey = key;
  }

  /** Draws one frame; false while the program is still compiling (on the page). */
  render(f: BackgroundFrame): boolean {
    if (this.live && !this.pending.done()) return false;
    const { gl } = this;
    const p = this.pending.get();
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
    return true;
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
  /** Pixelate: cells across the card's short side in the art window only, 0 = off. */
  pixel: number;
  /** Pixel art: the whole face's grid across the short side (the face is already drawn on it), 0 or absent = off. */
  dot?: number;
  tilt: [number, number];
  light: [number, number];
  alpha: number;
  flash: number;
  /** A streak of light crossing the face, its place along the diagonal (about -0.2 to 1.6); none when absent. */
  glint?: number;
  /** A light motion's band of light across the face: place, width, angle (radians), power; none when absent. */
  beam?: [number, number, number, number];
  /** A light motion's round spot of light on `light`: radius, power; none when absent. */
  spot?: [number, number];
  /** How far the face falls into shade away from the band or spot, 0..1; 0 when absent. */
  dim?: number;
  /** A pixel star twinkling on the face: x, y in card uv, power; none when absent. */
  star?: [number, number, number];
  /** Offset of the hard drop shadow, or null for none. */
  shadow: [number, number] | null;
  /** Draw the nameplate text; off for thumbnail-sized cards. */
  plate?: boolean;
  /** 0..1: overlay showing where the finish lands. */
  rangeView?: number;
  /** Length of an exported loop in shader seconds, so a finish's own motion can close on itself; 0 or absent live. */
  loop?: number;
  /** Where the card was touched, for finishes that react to it. */
  heat?: HeatSource;
  /** Which face to draw (see setFace); the card's own when absent. */
  face?: string;
  /** The part of the face on this quad, x0, y0, x1, y1; the whole face when absent. */
  uv?: [number, number, number, number];
  /** Blacklight's lamp power, 0..1; full when absent. */
  lamp?: number;
  /** Layer 2, drawn over the card in its own area (docs/layering.md); none when absent. */
  layer?: LayerDraw;
  /** 2: draw this card in layer 2's area instead of layer 1's (the Finish area's proof of layer 2). */
  area?: 1 | 2;
}

export interface LayerDraw {
  /** Shader index of layer 2's finish. */
  edition: number;
  /** Where layer 1 lies beneath: add only layer 2's light, or lay it over. */
  light: boolean;
  /** 0..1. */
  strength: number;
  /** Layer 1 is a finish (not Base), so the blend applies where they overlap. */
  under: boolean;
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
  private programs = new Map<PackId | 'open', CardProgram>();
  /** The sparks' program compiles in the background; a burst waits for it. */
  private parts: PendingProgram;
  private cardVao: WebGLVertexArrayObject;
  private partVao: WebGLVertexArrayObject;
  private partBuf: WebGLBuffer;
  private partData = new Float32Array(7 * 512);
  /** Faces by name: the card's own ('card') and any other drawn with the same shader (a pack's wrapper). */
  private faces = new Map<string, { face: WebGLTexture; mask: WebGLTexture; texels: number; k: [number, number]; art: [number, number, number, number] }>();
  private cardFace: HTMLCanvasElement | null = null;
  private back: WebGLTexture;
  private lettering: LetteringGL;
  private live: boolean;
  private layers: WebGLTexture;
  private plate: WebGLTexture;
  private layerCuts = 0;
  /** Flip Lenticular's other picture, laid out like the face; `hasFlip` is off until one is chosen. */
  private flip: WebGLTexture;
  private hasFlip = false;
  /** Whether the back plate is painted (setLayers); off until a cut arrives, so a renderer without one (the pack opening, the deck builder) shows the picture. */
  private layerPlate = 0;
  /** 0..1: how far the Shadowbox sheets stand up, and how deep 3D Lenticular reads (both flatten while a new cut is made). */
  layersRise = 1;
  /** Where on the face the finish applies: layer 1's area, and layer 2's. */
  readonly range: RangeLayer;
  readonly range2: RangeLayer;
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
    this.live = !opts.settled;
    // The open finishes' program starts compiling now; a pack's when it is first asked for.
    this.program('open');
    this.parts = startProgram(gl, PARTICLE_VS, PARTICLE_FS, 'aP', 'aC');

    // Every card program pins aPos to location 0, so they share this VAO.
    this.cardVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.cardVao);
    quadBuffer(gl, 0.5);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.partVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.partVao);
    this.partBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.partBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.partData.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 28, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 28, 16);
    gl.bindVertexArray(null);

    this.back = createTexture(gl, true);
    this.layers = createTexture(gl, true);
    this.plate = createTexture(gl, true);
    this.flip = createTexture(gl, true);
    this.lettering = new LetteringGL(gl, opts.settled);
    this.range = new RangeLayer(gl);
    this.range2 = new RangeLayer(gl);
  }

  /** The program for a pack (or the open finishes), started on first ask; null until that pack's module has arrived. */
  private program(key: PackId | 'open'): CardProgram | null {
    let cp = this.programs.get(key);
    if (cp) return cp;
    const mod = key === 'open' ? undefined : packModule(key);
    if (key !== 'open' && !mod) return null;
    cp = { pending: startProgram(this.gl, CARD_VS, cardFs(mod), 'aPos'), layers: mod?.layers?.(this.gl, this.live) ?? [], askedIn: -1, ready: false };
    if (this.cardFace) for (const l of cp.layers) l.setFace?.(this.cardFace);
    this.programs.set(key, cp);
    return cp;
  }

  /**
   * Whether a card with this shader index can be drawn without stalling the frame. Asking starts
   * its program compiling (once its pack has arrived). Exports don't wait: they compile on the spot.
   */
  ready(shader: number): boolean {
    const cp = this.program(packOfShader(shader) ?? 'open');
    if (!cp) return false;
    if (!this.live) return true;
    // Every ask within one animation frame shares one answer (asking waits while the GPU process is
    // busy compiling); a frame clock runs while any program is still compiling.
    if (cp.askedIn !== this.frames) {
      cp.askedIn = this.frames;
      cp.ready = cp.pending.done();
      if (!cp.ready) this.countFrames();
    }
    return cp.ready;
  }

  /** Animation frames counted while a program compiles, so `ready` asks once per frame. */
  private frames = 0;
  private counting = false;

  private countFrames() {
    if (this.counting) return;
    this.counting = true;
    const step = () => {
      // Kept up while some program was asked this frame and is not ready; asking again restarts it.
      const waiting = [...this.programs.values()].some((p) => !p.ready && p.askedIn === this.frames);
      this.frames++;
      if (waiting) requestAnimationFrame(step);
      else this.counting = false;
    };
    requestAnimationFrame(step);
  }

  /**
   * `key`: 'card' is the card's own face; other names hold extra faces drawn with the same shader.
   * `k`: the face's proportions in units of its short side (see shape.ts), its own unless given
   * (a pack's wrapper is drawn as a trading card whatever its texture's size).
   */
  setFace(face: HTMLCanvasElement, mask: HTMLCanvasElement, key = 'card', k = cardK(face.width, face.height)): void {
    let f = this.faces.get(key);
    if (!f) {
      f = { face: createTexture(this.gl, true), mask: createTexture(this.gl, false), texels: 1, k, art: [0, 0, 1, 1] };
      this.faces.set(key, f);
    }
    uploadTexture(this.gl, f.face, face, true);
    uploadTexture(this.gl, f.mask, mask, false);
    f.texels = face.width;
    f.k = k;
    // The art window this face was painted with (its shape's, and the layout's), in face uv.
    const a = artOf(face);
    f.art = [a.x / face.width, a.y / face.height, (a.x + a.w) / face.width, (a.y + a.h) / face.height];
    if (key !== 'card') return;
    this.cardFace = face;
    for (const cp of this.programs.values()) for (const l of cp.layers) l.setFace?.(face);
  }

  /**
   * The Shadowbox sheets over the art window. Alpha carries depth (3D Lenticular reads only that), so it is never premultiplied.
   * `plate`: paint the cut pieces out of the back sheet (off for animated pictures, whose cut
   * comes from one frame and must not paint its pixels into the others).
   */
  setLayers(map: LayerMap, plate = true): void {
    const { gl } = this;
    for (const [t, data] of [[this.layers, map.data], [this.plate, map.plate]] as const) {
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, map.w, map.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
      gl.generateMipmap(gl.TEXTURE_2D);
    }
    this.layerCuts = map.cuts;
    this.layerPlate = plate ? 1 : 0;
  }

  /** Flip Lenticular's other picture (see drawFlip), or null to draw the front one in pencil. */
  setFlip(flip: HTMLCanvasElement | null): void {
    this.hasFlip = !!flip;
    if (flip) uploadTexture(this.gl, this.flip, flip, true);
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

  /**
   * Draws one card; returns false, drawing nothing, while its program is not ready (see ready).
   * Layer 2 is drawn over it in a second pass, once its own program is ready too.
   */
  drawCard(d: CardDraw, time: number): boolean {
    if (!this.ready(d.edition)) return false;
    this.pass(d, time, null);
    const l = d.layer;
    if (l && l.strength > 0 && this.ready(l.edition)) this.pass({ ...d, edition: l.edition, shadow: null, rangeView: 0 }, time, l);
    return true;
  }

  /** `layer`: this is layer 2's pass, in its own area over what is drawn. */
  private pass(d: CardDraw, time: number, layer: LayerDraw | null): void {
    const { gl } = this;
    const cp = this.program(packOfShader(d.edition) ?? 'open')!;
    const p = cp.pending.get();
    const f = this.faces.get(d.face ?? 'card');
    gl.useProgram(p.prog);
    gl.bindVertexArray(this.cardVao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, f?.face ?? null);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, f?.mask ?? null);
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
    gl.uniform1f(p.u.uDot, d.dot ?? 0);
    gl.uniform2f(p.u.uTilt, d.tilt[0], d.tilt[1]);
    gl.uniform2f(p.u.uLight, d.light[0], d.light[1]);
    gl.uniform1f(p.u.uAlpha, d.alpha);
    gl.uniform1f(p.u.uFlash, d.flash);
    gl.uniform1f(p.u.uGlint, d.glint ?? -2);
    const beam = d.beam ?? [0, 0.1, 0, 0];
    gl.uniform4f(p.u.uBeam, beam[0], beam[1], beam[2], beam[3]);
    const spot = d.spot ?? [0.3, 0];
    gl.uniform2f(p.u.uSpot, spot[0], spot[1]);
    gl.uniform1f(p.u.uDim, d.dim ?? 0);
    const star = d.star ?? [0, 0, 0];
    gl.uniform3f(p.u.uStar, star[0], star[1], star[2]);
    gl.uniform1f(p.u.uFaceTexels, f?.texels ?? 1);
    gl.uniform2f(p.u.uCardK, f?.k[0] ?? 1, f?.k[1] ?? 1.4);
    gl.uniform4fv(p.u.uArt, f?.art ?? [0, 0, 1, 1]);
    const uv = d.uv ?? [0, 0, 1, 1];
    gl.uniform4f(p.u.uUvRect, uv[0], uv[1], uv[2], uv[3]);
    gl.uniform1f(p.u.uPlate, d.plate === false ? 0 : 1);
    gl.uniform1f(p.u.uLoop, d.loop ?? 0);
    gl.uniform1f(p.u.uUvLamp, d.lamp ?? 1);
    gl.uniform1f(p.u.uLayer, layer ? 1 : 0);
    gl.uniform1f(p.u.uLayerK, layer?.strength ?? 1);
    gl.uniform1f(p.u.uBlend, layer?.light ? 1 : 0);
    gl.uniform1f(p.u.uUnderOn, layer?.under ? 1 : 0);
    applyTune(gl, p.u, this.tune);
    (layer || d.area === 2 ? this.range2 : this.range).bind(p, 4, d.rangeView ?? 0, time);
    if (layer) this.range.bindAs(p, 10, 'Under');
    for (const l of cp.layers) l.bind?.(p, d);
    gl.activeTexture(gl.TEXTURE7);
    gl.bindTexture(gl.TEXTURE_2D, this.layers);
    gl.uniform1i(p.u.uLayers, 7);
    gl.activeTexture(gl.TEXTURE8);
    gl.bindTexture(gl.TEXTURE_2D, this.plate);
    gl.uniform1i(p.u.uPlateBack, 8);
    gl.uniform1f(p.u.uLayerCuts, this.layerCuts);
    gl.uniform1f(p.u.uLayerRise, this.layersRise);
    gl.uniform1f(p.u.uPlateMix, this.layerPlate);
    gl.activeTexture(gl.TEXTURE9);
    gl.bindTexture(gl.TEXTURE_2D, this.flip);
    gl.uniform1i(p.u.uFlip, 9);
    gl.uniform1f(p.u.uFlip2, this.hasFlip ? 1 : 0);

    // Hard pixel drop shadow first, then the card itself.
    if (d.shadow) {
      gl.uniform1f(p.u.uShadow, 1);
      gl.uniform2f(p.u.uShift, d.shadow[0], d.shadow[1]);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    gl.uniform1f(p.u.uShadow, 0);
    gl.uniform2f(p.u.uShift, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    for (const l of cp.layers) l.after?.(this, d, time);
  }

  drawParticles(list: Particle[]): void {
    if (!list.length || !this.parts.done()) return;
    const { gl } = this;
    const p = this.parts.get();
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
