// Mirror Ball's spots of light round the room (the shaders and the timing are in mirrorball.ts).
import { quadBuffer, startProgram, type PendingProgram } from './gl';
import type { CardDraw } from './renderers';
import type { GlobeView } from './snowglobe';
import { ROOM_FS, ROOM_VS, roomLap, SPIN, twinkle } from './mirrorball';

/** The spots one renderer throws; made on first use. */
export class MirrorRoom {
  private prog: PendingProgram;
  private vao: WebGLVertexArrayObject;

  private gl: WebGL2RenderingContext;
  /** On the stage the pass waits for its program; an export compiles it on the spot. */
  private live: boolean;

  constructor(gl: WebGL2RenderingContext, live: boolean) {
    this.gl = gl;
    this.live = live;
    this.prog = startProgram(gl, ROOM_VS, ROOM_FS, 'aMbPos');
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    quadBuffer(gl, 1);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
  }

  /** Lights the room behind what is already drawn (it only adds where the canvas is still clear). */
  draw(view: GlobeView, d: CardDraw, time: number): void {
    if (this.live && !this.prog.done()) return;
    const { gl } = this;
    const p = this.prog.get();
    const loop = d.loop ?? 0;
    gl.useProgram(p.prog);
    gl.bindVertexArray(this.vao);
    gl.uniform2f(p.u.uMbRes, view.cssW, view.cssH);
    gl.uniform1f(p.u.uMbDpr, view.dpr);
    gl.uniform2f(p.u.uMbCenter, d.cx, d.cy);
    gl.uniform1f(p.u.uMbSize, d.h * d.scale);
    gl.uniform2f(p.u.uMbTilt, d.tilt[0], d.tilt[1]);
    const [at, fade] = roomLap(time, loop);
    gl.uniform1f(p.u.uMbTime, at);
    gl.uniform1f(p.u.uMbLoop, loop);
    gl.uniform1f(p.u.uMbFade, fade);
    gl.uniform1f(p.u.uMbSpin, SPIN);
    gl.uniform1f(p.u.uMbTwinkle, twinkle(loop));
    gl.uniform1f(p.u.uMbPower, Math.min(1, d.intensity) * d.alpha);
    gl.blendFuncSeparate(gl.ONE_MINUS_DST_ALPHA, gl.ONE, gl.ONE_MINUS_DST_ALPHA, gl.ONE);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(null);
  }
}
