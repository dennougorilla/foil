// A small frame-rate meter for checking a device by hand: add ?fps=1 to the address. It shows the
// frames per second over the last second, the slowest frame of that second, the stage's drawing
// level, when the first card was drawn and each frame of the last second as a pixel bar, plus the
// GPU and memory the browser reports. Loaded only when asked for.

import './fpsMeter.css';
import { QUALITY_LEVELS } from './quality';

export interface MeterSource {
  /** The stage's drawing level (src/quality.ts), 0 at full quality. */
  readonly qualityLevel: number;
  /** When the card was first drawn (ms from navigation), 0 until then. */
  readonly firstCardAt: number;
}

/** The GPU's name as the browser gives it (Chrome on Android: "Adreno (TM) 619"), shortened, if it does. */
function gpuName(): string {
  const gl = (document.getElementById('cards') as HTMLCanvasElement | null)?.getContext('webgl2');
  const info = gl?.getExtension('WEBGL_debug_renderer_info');
  const name = gl ? String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER)) : '';
  // ANGLE wraps it: "ANGLE (Qualcomm, Adreno (TM) 619, OpenGL ES 3.2)", "ANGLE (NVIDIA, NVIDIA GeForce … (0x2208) Direct3D11 …, D3D11)".
  const inner = name.match(/^ANGLE \((.*)\)$/)?.[1].split(', ')[1] ?? name;
  return inner
    .replace(/\s*\(0x[0-9a-f]+\).*$/i, '')
    .replace(/\s+(Direct3D|OpenGL|Vulkan|Metal)\b.*$/i, '')
    .replace(/\s*\((TM|R)\)/gi, '');
}

/** Frame length (ms) at the graph's full height; the dotted line marks 30 fps. */
const GRAPH_MS = 50;
const SLOW_MS = 1000 / 30;

/** The last second's frames as pixel bars, newest on the right: green at a 60 Hz pace, gold down to 30 fps, red below. */
function draw(c: HTMLCanvasElement, times: number[]) {
  const w = c.clientWidth;
  const h = c.clientHeight;
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
  }
  const x = c.getContext('2d')!;
  x.clearRect(0, 0, w, h);
  const line = h - Math.round((SLOW_MS / GRAPH_MS) * h);
  x.fillStyle = 'rgba(245, 242, 234, 0.35)';
  for (let i = 0; i < w; i += 3) x.fillRect(i, line, 1, 1);
  times.slice(-Math.floor(w / 2)).forEach((t, i, all) => {
    x.fillStyle = t <= 17.5 ? '#3fc28f' : t <= SLOW_MS + 1 ? '#f2c14e' : '#ff5a4f';
    const bh = Math.max(1, Math.round((Math.min(t, GRAPH_MS) / GRAPH_MS) * h));
    x.fillRect(w - (all.length - i) * 2, h - bh, 1, bh);
  });
}

export function mountFpsMeter(src: MeterSource): void {
  const el = document.createElement('div');
  el.className = 'fps-meter';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML =
    '<b class="fps-n">--</b><span class="fps-u">fps</span>' +
    '<span class="fps-row fps-slow"></span><span class="fps-row fps-lv"></span><span class="fps-row fps-card"></span>' +
    '<canvas class="fps-row fps-graph"></canvas><span class="fps-row fps-dev"></span>';
  document.body.append(el);
  const [n, slow, lv, card, dev] = ['.fps-n', '.fps-slow', '.fps-lv', '.fps-card', '.fps-dev'].map((q) => el.querySelector<HTMLElement>(q)!);
  const graph = el.querySelector<HTMLCanvasElement>('.fps-graph')!;
  const memory = (navigator as { deviceMemory?: number }).deviceMemory;
  dev.textContent = [gpuName(), memory ? `RAM ${memory} GB` : ''].filter(Boolean).join(' · ');

  // Frame lengths of the last second; the text changes twice a second, so the meter costs next to nothing.
  const times: number[] = [];
  let last = 0;
  let shown = 0;
  const tick = (now: number) => {
    requestAnimationFrame(tick);
    if (last) times.push(now - last);
    last = now;
    let sum = times.reduce((a, b) => a + b, 0);
    while (sum > 1000 && times.length > 1) sum -= times.shift()!;
    if (now - shown < 500 || !times.length) return;
    shown = now;
    const fps = Math.round((times.length * 1000) / sum);
    n.textContent = String(fps);
    el.dataset.pace = fps >= 50 ? 'good' : fps >= 30 ? 'fair' : 'poor';
    slow.textContent = `slowest ${Math.round(Math.max(...times))} ms`;
    lv.textContent = `quality ${src.qualityLevel}/${QUALITY_LEVELS.length - 1}`;
    card.textContent = `1st card ${src.firstCardAt ? `${(src.firstCardAt / 1000).toFixed(1)} s` : '…'}`;
    draw(graph, times);
  };
  requestAnimationFrame(tick);
}
