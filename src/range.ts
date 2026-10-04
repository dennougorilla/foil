// The Foil range: which pixels of the card face take the finish.
// Region presets come from the face mask (and a re-render without text), the brush paints on top,
// and the brightness key is applied live in the shader so it follows animated sources.
import { drawFace, type FaceSpec } from './card/face';
import { RANGE_H, RANGE_W, type RangeSnapshot } from './gl/range';
import type { BrushMode, RangeRegion } from './featureState';
import type { Area } from './editions';

const N = RANGE_W * RANGE_H;
const UNDO_DEPTH = 24;
const SOFTNESS = 0.06;

interface Layers {
  add: Uint8Array;
  erase: Uint8Array;
}

const canvas2d = (w: number, h: number) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, x: c.getContext('2d', { willReadFrequently: true })! };
};

/** Scales a full-size face canvas down to the range grid and returns its pixels. */
function sample(src: HTMLCanvasElement, into = canvas2d(RANGE_W, RANGE_H)) {
  into.x.clearRect(0, 0, RANGE_W, RANGE_H);
  into.x.imageSmoothingQuality = 'high';
  into.x.drawImage(src, 0, 0, RANGE_W, RANGE_H);
  return into.x.getImageData(0, 0, RANGE_W, RANGE_H).data;
}

const smooth = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** The card's regions and tones, read from the face; shared by both layers' areas. */
export class RangeModel {
  private regions: Partial<Record<RangeRegion, Uint8Array>> = { all: new Uint8Array(N).fill(255), none: new Uint8Array(N) };
  /** Inside the card silhouette, outline excluded: what coverage is measured against. */
  private body = new Uint8Array(N).fill(1);
  private luma = new Uint8Array(N);
  private maskKey = '';
  private face: HTMLCanvasElement | null = null;
  private spec: FaceSpec | null = null;
  private textKey = '';
  private scratch = canvas2d(RANGE_W, RANGE_H);
  private blank = { face: document.createElement('canvas'), mask: document.createElement('canvas') };

  /** Range-texture rows per column over the same distance on the card: 1 on the trading card. */
  cellAspect = 1;

  /** Called after the live face is redrawn. Region masks are refreshed from it. */
  onFace(face: HTMLCanvasElement, mask: HTMLCanvasElement, spec: FaceSpec): void {
    this.face = face;
    this.spec = spec;
    this.cellAspect = (RANGE_H / RANGE_W) * (face.width / face.height);
    // The mask is pure geometry; only look at it again when the frame or the shape could have changed.
    const key = `${spec.frame}|${spec.frameColor ?? ''}|${spec.shape}`;
    if (key === this.maskKey) return;
    this.maskKey = key;
    const m = sample(mask, this.scratch);
    const art = new Uint8Array(N);
    const frame = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      const r = m[i * 4];
      const g = m[i * 4 + 1];
      const b = m[i * 4 + 2];
      art[i] = r;
      frame[i] = Math.max(0, g - r);
      this.body[i] = r + g > 127 && b < 128 ? 1 : 0;
    }
    this.regions.art = art;
    this.regions.frame = frame;
  }

  /**
   * Text is found by drawing the same face with its words blanked and keeping what differs,
   * so it follows whatever the card does with its lettering.
   */
  private textRegion(): Uint8Array {
    const { face, spec } = this;
    if (!face || !spec) return this.regions.all!;
    const { image, ...rest } = spec;
    void image;
    const key = JSON.stringify(rest);
    if (this.regions.text && key === this.textKey) return this.regions.text;
    drawFace(this.blank.face, this.blank.mask, { ...spec, name: ' ', message: { ...spec.message, text: '' }, cardType: '' });
    const a = sample(face, this.scratch).slice();
    const b = sample(this.blank.face, this.scratch);
    const out = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      const o = i * 4;
      const d = Math.max(Math.abs(a[o] - b[o]), Math.abs(a[o + 1] - b[o + 1]), Math.abs(a[o + 2] - b[o + 2]));
      out[i] = Math.min(255, d * 4);
    }
    // Grow by a pixel so thin strokes and antialiased edges are fully inside.
    const grown = new Uint8Array(N);
    for (let y = 0; y < RANGE_H; y++) {
      for (let x = 0; x < RANGE_W; x++) {
        let v = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= RANGE_H) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            if (xx >= 0 && xx < RANGE_W) v = Math.max(v, out[yy * RANGE_W + xx]);
          }
        }
        grown[y * RANGE_W + x] = v;
      }
    }
    this.regions.text = grown;
    this.textKey = key;
    return grown;
  }

  region(r: RangeRegion): Uint8Array {
    if (r === 'text') return this.textRegion();
    return this.regions[r] ?? this.regions.all!;
  }

  snapshot(a: Area, paint: Paint): RangeSnapshot {
    const reg = this.region(a.region);
    const { add, erase } = paint.layers;
    const data = new Uint8Array(N * 4);
    for (let i = 0; i < N; i++) {
      const o = i * 4;
      data[o] = reg[i];
      data[o + 1] = add[i];
      data[o + 2] = erase[i];
      data[o + 3] = 255;
    }
    return { data, lo: a.lo, hi: a.hi, invert: a.invert };
  }

  /** Reads the face's tones again (it may have changed since). */
  private readLuma() {
    if (!this.face) return;
    const px = sample(this.face, this.scratch);
    for (let i = 0; i < N; i++) this.luma[i] = Math.round(px[i * 4] * 0.299 + px[i * 4 + 1] * 0.587 + px[i * 4 + 2] * 0.114);
  }

  /** How much of pixel i the area takes, 0..1. Mirrors the shader. */
  private at(i: number, a: Area, reg: Uint8Array, paint: Paint): number {
    const L = this.luma[i] / 255;
    const k = (a.lo <= 0.001 ? 1 : smooth(a.lo - SOFTNESS, a.lo + SOFTNESS, L)) * (a.hi >= 0.999 ? 1 : 1 - smooth(a.hi - SOFTNESS, a.hi + SOFTNESS, L));
    let v = (reg[i] / 255) * k;
    if (a.invert) v = 1 - v;
    v = Math.max(v, paint.layers.add[i] / 255);
    return Math.min(v, 1 - paint.layers.erase[i] / 255);
  }

  /** Share of the card (outline excluded) that takes the finish, 0..1. */
  coverage(a: Area, paint: Paint): number {
    this.readLuma();
    const reg = this.region(a.region);
    let sum = 0;
    let n = 0;
    for (let i = 0; i < N; i++) {
      if (!this.body[i]) continue;
      sum += this.at(i, a, reg, paint);
      n++;
    }
    return n ? sum / n : 0;
  }

  /**
   * The area as a small picture, `w` × `h` (one value per cell, 0..255; -1 outside the card), for
   * the layer list's card diagrams.
   */
  map(a: Area, paint: Paint, w: number, h: number): Int16Array {
    this.readLuma();
    const reg = this.region(a.region);
    const out = new Int16Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let sum = 0;
        let peak = 0;
        let inCard = 0;
        // A few samples per cell, so thin parts (the name, a stroke) still show.
        for (let sy = 0; sy < 3; sy++) {
          for (let sx = 0; sx < 3; sx++) {
            const px = Math.min(RANGE_W - 1, Math.floor(((x + (sx + 0.5) / 3) / w) * RANGE_W));
            const py = Math.min(RANGE_H - 1, Math.floor(((y + (sy + 0.5) / 3) / h) * RANGE_H));
            const i = py * RANGE_W + px;
            if (!this.body[i]) continue;
            inCard++;
            const v = this.at(i, a, reg, paint);
            sum += v;
            peak = Math.max(peak, v);
          }
        }
        // A cell the area only grazes (a thin frame) still shows, a little dimmer.
        out[y * w + x] = inCard < 3 ? -1 : Math.round(Math.max(sum / inCard, peak * 0.75) * 255);
      }
    }
    return out;
  }

  /** Brightness distribution of the card body, normalised to its tallest bin. Valid after coverage(). */
  histogram(bins = 40): number[] {
    const h = new Array<number>(bins).fill(0);
    for (let i = 0; i < N; i++) if (this.body[i]) h[Math.min(bins - 1, Math.floor((this.luma[i] / 256) * bins))]++;
    // A light blur keeps pixel art (few exact tones) from reading as a comb of isolated spikes.
    const soft = h.map((v, i) => (h[i - 1] ?? v) * 0.25 + v * 0.5 + (h[i + 1] ?? v) * 0.25);
    const max = Math.max(1, ...soft);
    return soft.map((v) => v / max);
  }

}

/** One layer's brush strokes (painted in and out), with undo; kept in IndexedDB under `key`. */
export class Paint {
  layers: Layers = { add: new Uint8Array(N), erase: new Uint8Array(N) };
  private undoStack: Layers[] = [];
  private redoStack: Layers[] = [];
  /** Range-texture rows per column over the same distance on the card (RangeModel.cellAspect): 1 on the trading card. */
  cellAspect = 1;

  constructor(private key: string) {}

  get painted(): boolean {
    return this.layers.add.some((v) => v) || this.layers.erase.some((v) => v);
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  private copy(): Layers {
    return { add: this.layers.add.slice(), erase: this.layers.erase.slice() };
  }

  /** Call once before a stroke or a clear so it can be taken back. */
  checkpoint(): void {
    this.undoStack.push(this.copy());
    if (this.undoStack.length > UNDO_DEPTH) this.undoStack.shift();
    this.redoStack.length = 0;
  }

  undo(): boolean {
    const prev = this.undoStack.pop();
    if (!prev) return false;
    this.redoStack.push(this.copy());
    this.layers = prev;
    return true;
  }

  redo(): boolean {
    const next = this.redoStack.pop();
    if (!next) return false;
    this.undoStack.push(this.copy());
    this.layers = next;
    return true;
  }

  clear(): void {
    this.layers.add.fill(0);
    this.layers.erase.fill(0);
  }

  /**
   * One dab at (x, y) in range-texture pixels, `radius` of them across. The texture spans the face
   * whatever its shape, so its cells are square only on the trading card; the dab is stretched by
   * `cellAspect` to stay round on the card.
   */
  dab(x: number, y: number, radius: number, soft: number, mode: BrushMode): void {
    const into = mode === 'add' ? this.layers.add : this.layers.erase;
    const other = mode === 'add' ? this.layers.erase : this.layers.add;
    const inner = radius * (1 - soft);
    const sy = this.cellAspect;
    const x0 = Math.max(0, Math.floor(x - radius));
    const x1 = Math.min(RANGE_W - 1, Math.ceil(x + radius));
    const y0 = Math.max(0, Math.floor(y - radius * sy));
    const y1 = Math.min(RANGE_H - 1, Math.ceil(y + radius * sy));
    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const d = Math.hypot(px + 0.5 - x, (py + 0.5 - y) / sy);
        if (d > radius) continue;
        const f = d <= inner ? 1 : 1 - smooth(inner, radius, d);
        const i = py * RANGE_W + px;
        const v = Math.round(f * 255);
        if (v > into[i]) into[i] = v;
        // Painting one way wipes the other underneath the brush.
        other[i] = Math.round(other[i] * (1 - f));
      }
    }
  }

  /** Dabs along a segment, close enough together to read as a stroke. */
  stroke(ax: number, ay: number, bx: number, by: number, radius: number, soft: number, mode: BrushMode): void {
    const step = Math.max(1, radius * 0.3);
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step));
    for (let i = 1; i <= n; i++) this.dab(ax + ((bx - ax) * i) / n, ay + ((by - ay) * i) / n, radius, soft, mode);
  }

  // ---------- Persistence: the painted layers live next to the person's image in IndexedDB ----------

  async save(): Promise<void> {
    try {
      const db = await openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(this.painted ? { w: RANGE_W, h: RANGE_H, ...this.copy() } : null, this.key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    } catch (err) {
      console.warn('Could not keep the painted range for next time', err);
    }
  }

  async load(): Promise<boolean> {
    try {
      const db = await openDb();
      const v = await new Promise<unknown>((resolve, reject) => {
        const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(this.key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      db.close();
      const saved = v as (Layers & { w: number; h: number }) | null | undefined;
      const n = RANGE_W * RANGE_H;
      // Both layers must be whole; anything else is discarded rather than half-loaded.
      if (!saved || saved.w !== RANGE_W || saved.h !== RANGE_H) return false;
      if (!(saved.add instanceof Uint8Array) || !(saved.erase instanceof Uint8Array)) return false;
      if (saved.add.length !== n || saved.erase.length !== n) return false;
      this.layers = { add: new Uint8Array(saved.add), erase: new Uint8Array(saved.erase) };
      return true;
    } catch {
      return false;
    }
  }
}

const DB = 'foil';
const STORE = 'images';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
