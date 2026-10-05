// Feeds a card's heat to the shader: one small float texture per heat source, re-uploaded only
// when that source has changed, plus the fingerprints and the lamp as uniforms. Marble's field has
// two numbers a cell and goes to its own sampler (`sampler`), as a two-channel texture.
import { createTexture, type Program } from '../gl/gl';
import type { HeatSource } from './heat';

export class HeatLayer {
  /** Bound for every card without heat: reads as cold everywhere. */
  private none: WebGLTexture;
  private textures = new WeakMap<HeatSource, { tex: WebGLTexture; version: number }>();
  private prints = new Float32Array(12);

  constructor(
    private gl: WebGL2RenderingContext,
    private sampler = 'uHeat',
  ) {
    this.none = createTexture(gl, false);
  }

  bind(p: Program, unit: number, src: HeatSource | undefined): void {
    const { gl } = this;
    gl.activeTexture(gl.TEXTURE0 + unit);
    this.prints.fill(0);
    gl.uniform3fv(p.u.uLamp, src?.lamp ?? [0, 0, 0]);
    if (!src) gl.bindTexture(gl.TEXTURE_2D, this.none);
    else {
      let t = this.textures.get(src);
      if (!t) {
        t = { tex: createTexture(gl, false), version: -1 };
        this.textures.set(src, t);
      }
      gl.bindTexture(gl.TEXTURE_2D, t.tex);
      if (t.version !== src.version) {
        const rg = src.channels === 2;
        gl.texImage2D(gl.TEXTURE_2D, 0, rg ? gl.RG16F : gl.R16F, src.w, src.h, 0, rg ? gl.RG : gl.RED, gl.FLOAT, src.data);
        t.version = src.version;
      }
      src.prints.slice(0, 3).forEach((q, i) => this.prints.set([q.u, q.v, q.angle, q.heat], i * 4));
    }
    gl.uniform1i(p.u[this.sampler], unit);
    gl.uniform4fv(p.u.uPrints, this.prints);
  }
}
