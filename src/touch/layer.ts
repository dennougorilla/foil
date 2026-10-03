// Feeds a card's heat to the shader: one small float texture per heat source, re-uploaded only
// when that source has changed, plus the fingerprints as uniforms.
import { createTexture, type Program } from '../gl/gl';
import { HEAT_H, HEAT_W, type HeatSource } from './heat';

export class HeatLayer {
  /** Bound for every card without heat: reads as cold everywhere. */
  private none: WebGLTexture;
  private textures = new WeakMap<HeatSource, { tex: WebGLTexture; version: number }>();
  private prints = new Float32Array(12);

  constructor(private gl: WebGL2RenderingContext) {
    this.none = createTexture(gl, false);
  }

  bind(p: Program, unit: number, src: HeatSource | undefined): void {
    const { gl } = this;
    gl.activeTexture(gl.TEXTURE0 + unit);
    this.prints.fill(0);
    if (!src) gl.bindTexture(gl.TEXTURE_2D, this.none);
    else {
      let t = this.textures.get(src);
      if (!t) {
        t = { tex: createTexture(gl, false), version: -1 };
        this.textures.set(src, t);
      }
      gl.bindTexture(gl.TEXTURE_2D, t.tex);
      if (t.version !== src.version) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, HEAT_W, HEAT_H, 0, gl.RED, gl.FLOAT, src.data);
        t.version = src.version;
      }
      src.prints.slice(0, 3).forEach((q, i) => this.prints.set([q.u, q.v, q.angle, q.heat], i * 4));
    }
    gl.uniform1i(p.u.uHeat, unit);
    gl.uniform4fv(p.u.uPrints, this.prints);
  }
}
