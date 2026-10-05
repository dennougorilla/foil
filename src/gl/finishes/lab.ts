// Lab pack (provisional, review-v015): the nine finishes added after v0.14, gathered in one pack so
// they can be tried together. Where each one finally goes is the owner's call. See docs/packs.md.
import { CHAMELEON_GLSL } from '../chameleon';
import type { FinishModule } from './types';

const finishes: FinishModule = {
  glsl: /* glsl */ `
${CHAMELEON_GLSL}
`,
  dispatch: /* glsl */ `
  else if (e == 90) col = chameleon(c, uv, uTilt, L, m.r);
`,
};
export default finishes;
