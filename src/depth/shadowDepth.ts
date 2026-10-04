// Keeps the Shadowbox sheets (and the depth 3D Lenticular reads from them) in step with the
// picture. Work starts only once a finish that reads depth is chosen: the art window goes to the depth worker, which answers with a quick cut from colour
// and then, when the model can run, a better one. The sheets lie down while a new cut is made
// and stand up again when it lands.
import { ART, FACE_H, FACE_W } from '../card/face';
import type { CardRenderer } from '../gl/renderers';
import { editionById } from '../editions';
import type { Dict } from '../i18n';
import type { Store } from '../state';
import { colorLayers, type LayerMap } from './layers';
import { DepthPill } from './pill';
import type { CutReply, CutRequest } from './worker';

/** The art window as the worker sees it (portrait, multiples of 14 for the model). */
const W = 392;
const H = 518;
/** No sheets yet: the picture lies whole on the back wall. */
const EMPTY: LayerMap = { w: 1, h: 1, cuts: 0, data: new Uint8ClampedArray(4), plate: new Uint8ClampedArray(4) };
/** Shown with the data-saver offer; the CPU model's download. */
const MODEL_BYTES = 27258801;
/** How long the worker (and the model session in it) is kept after leaving a depth finish. */
const IDLE_MS = 30000;

export interface ShadowDepth {
  /** Call after the face is redrawn; `key` names the art (picture and crop), not the frame or name. */
  update(face: HTMLCanvasElement, key: string): void;
  /** The sheets for exports. */
  current(): LayerMap | undefined;
}

export function mountShadowDepth(o: {
  store: Store;
  cards: CardRenderer;
  slot: HTMLElement;
  dict: () => Dict;
  /** The picture is animated, so a cut from one frame must not paint pixels into the others. */
  animated: () => boolean;
}): ShadowDepth {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
  let allowModel = !saveData;
  let worker: Worker | null = null;
  let face: HTMLCanvasElement | null = null;
  /** The art on the card, the art being cut for it, and the art whose sheets are up. */
  let latest = '';
  let wanted = '';
  let shown = '';
  let shownSource: 'color' | 'model' | null = null;
  let map: LayerMap | undefined;
  let sent = { id: 0, key: '' };
  let timer = 0;
  let idle = 0;
  /** A model cut is on its way; the worker stays until it lands. */
  let awaiting = false;
  const cuts = new Map<string, LayerMap>();
  const active = () => editionById(o.store.get().edition).depth === true;
  const pill = new DepthPill(o.slot, o.dict, () => {
    allowModel = true;
    wanted = shown = '';
    if (face) update(face, latest);
  });
  const pixels = document.createElement('canvas');
  pixels.width = W;
  pixels.height = H;
  const px = pixels.getContext('2d', { willReadFrequently: true })!;

  // ---------- The sheets standing up ----------
  let rise = 1;
  let anim = 0;
  const setRise = (v: number) => {
    rise = v;
    o.cards.layersRise = v;
  };
  /** Eases the sheets to `to` (lying down quickly, standing up with a little overshoot). */
  function riseTo(to: number, ms: number): Promise<void> {
    const token = ++anim;
    if (reduced.matches) {
      setRise(to);
      return Promise.resolve();
    }
    const from = rise;
    const t0 = performance.now();
    return new Promise((done) => {
      const step = (now: number) => {
        if (token !== anim) return done();
        const p = Math.min(1, (now - t0) / ms);
        const up = 1 + 2.2 * (p - 1) ** 3 + 1.2 * (p - 1) ** 2;
        setRise(from + (to - from) * (to > from ? up : p * p));
        if (p < 1) requestAnimationFrame(step);
        else done();
      };
      requestAnimationFrame(step);
    });
  }

  async function show(next: LayerMap, source: 'color' | 'model', key: string) {
    // A colour cut never replaces the model's cut of the same art.
    if (key === shown && shownSource === 'model' && source === 'color') return;
    if (map && key === shown) await riseTo(0, 160);
    if (key !== wanted) return;
    // The very first sheets stand up from flat.
    if (!map) setRise(0);
    map = next;
    shown = key;
    shownSource = source;
    o.cards.setLayers(next, !o.animated());
    await riseTo(1, 650);
  }

  // ---------- The worker ----------
  function startWorker(): Worker | null {
    try {
      const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<CutReply>) => onReply(e.data);
      w.onerror = (e) => {
        console.warn('depth: worker failed', e.message);
        w.terminate();
        worker = null;
        awaiting = false;
        allowModel = false;
        if (active()) pill.failed();
        // Carry on with the colour cut, here.
        if (face) void show(colorLayers(artPixels(face), W, H), 'color', wanted);
      };
      return w;
    } catch {
      return null;
    }
  }

  function onReply(m: CutReply) {
    if (m.id !== sent.id) return;
    // The chip speaks only while a depth finish is on the card; replies landing after it left stay quiet.
    const speak = active();
    if (m.type === 'layers') {
      if (m.source === 'model') {
        awaiting = false;
        cuts.set(sent.key, m.map);
        // A few recent pictures stay cut, so flipping back is instant.
        if (cuts.size > 4) cuts.delete(cuts.keys().next().value!);
        if (speak) pill.done();
      }
      void show(m.map, m.source, sent.key);
    } else if (m.type === 'download') {
      if (speak) pill.download(m.loaded, m.total);
    } else if (m.type === 'running') {
      if (speak) pill.running();
    } else {
      // Once the model has failed, the colour cut carries on without asking again this visit.
      awaiting = false;
      allowModel = false;
      if (speak) pill.failed();
    }
  }

  /** Lets the worker go a while after the depth finishes are left, freeing the model session it holds. */
  function retire() {
    if (active() || !worker) return;
    if (awaiting) {
      idle = window.setTimeout(retire, IDLE_MS);
      return;
    }
    worker.terminate();
    worker = null;
  }

  function artPixels(f: HTMLCanvasElement): Uint8ClampedArray {
    px.imageSmoothingQuality = 'high';
    px.drawImage(f, (ART.x / FACE_W) * f.width, (ART.y / FACE_H) * f.height, (ART.w / FACE_W) * f.width, (ART.h / FACE_H) * f.height, 0, 0, W, H);
    return px.getImageData(0, 0, W, H).data;
  }

  function send() {
    if (!face) return;
    const key = wanted;
    const done = cuts.get(key);
    if (done) {
      void show(done, 'model', key);
      return;
    }
    const rgba = artPixels(face);
    clearTimeout(idle);
    worker ??= startWorker();
    if (!worker) {
      // No workers: the colour cut, here and now.
      void show(colorLayers(rgba, W, H), 'color', key);
      return;
    }
    sent = { id: sent.id + 1, key };
    const req: CutRequest = { id: sent.id, rgba, w: W, h: H, model: allowModel };
    worker.postMessage(req, [rgba.buffer]);
    awaiting = allowModel;
    if (saveData && !allowModel) pill.offer(MODEL_BYTES);
  }

  function update(f: HTMLCanvasElement, key: string) {
    face = f;
    latest = key;
    if (!active()) {
      pill.hide();
      clearTimeout(idle);
      if (worker) idle = window.setTimeout(retire, IDLE_MS);
      // Cuts of an earlier picture must not sit on this one (the hand still shows the finish).
      if (map && key !== shown) {
        map = undefined;
        shown = wanted = '';
        o.cards.setLayers(EMPTY);
      }
      return;
    }
    if (key === wanted) return;
    if (key === shown) {
      // Back to the art that is already cut (a crop nudged and returned).
      wanted = key;
      clearTimeout(timer);
      void riseTo(1, 400);
      return;
    }
    wanted = key;
    // The sheets lie down while the picture moves under them, and stand again once it settles.
    if (map) void riseTo(0, 160);
    clearTimeout(timer);
    timer = window.setTimeout(send, map ? 180 : 0);
  }

  // Exports only take sheets cut for the art they show.
  return { update, current: () => (shown === latest ? map : undefined) };
}
