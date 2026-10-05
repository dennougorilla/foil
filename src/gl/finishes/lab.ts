// Lab pack (provisional, review-v015): the finishes added after v0.14 and not yet released, gathered
// in one pack so they can be tried together (Chameleon, Rainy Window and Marble are in Metal and
// Nature since v0.15.0). Where each one finally goes is the owner's call. See docs/packs.md.
import { NEON_GLSL } from '../neon';
import { NeonGL } from '../neonGL';
import { LIQUID_METAL_GLSL, LiquidMetalLayer } from '../liquidMetal';
import { MIRRORBALL_GLSL, MIRRORBALL_SHADER } from '../mirrorball';
import { MirrorRoom } from '../mirrorRoom';
import { ENGRAVING_GLSL } from '../engraving';
import type { FinishModule } from './types';

const NEON = 92;

const finishes: FinishModule = {
  glsl: /* glsl */ `
${NEON_GLSL}
${LIQUID_METAL_GLSL}
${MIRRORBALL_GLSL}
${ENGRAVING_GLSL}
`,
  dispatch: /* glsl */ `
  else if (e == 92) col = neon(c, uv, uTilt, L, m.r);
  else if (e == 98) col = liquidMetal(c, uv, uTilt, L, lod, m.r);
  else if (e == 104) col = mirrorball(c, uv, artUv, uTilt, lod, m.r);
  else if (e == 106) col = engraving(c, uv, uTilt, L, lod, m);
`,
  // Liquid Metal's ripples are a touch field of their own (see touch/), on unit 10.
  // Mirror Ball throws spots of light round the room behind the card, where there is one.
  // Neon lays its sign out from each new face (see neonGL.ts), on units 12 and 13.
  layers: (gl, live) => {
    const liquid = new LiquidMetalLayer(gl);
    const neon = new NeonGL(gl, live);
    let room: MirrorRoom | null = null;
    return [
      { bind: (p, d) => liquid.bind(p, 10, d.heat) },
      { setFace: (face) => neon.setFace(face), bind: (p, d) => neon.bind(p, 12, d.edition === NEON) },
      {
        after: (view, d, time) => {
          if (d.edition !== MIRRORBALL_SHADER || !d.room) return;
          (room ??= new MirrorRoom(gl, live)).draw(view, d, time);
        },
      },
    ];
  },
};
export default finishes;
