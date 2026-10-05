// Where each layer's finish lands on the live card: the region, the brightness band and the brush
// strokes, turned into the stage's range textures. This is the part the first view needs; the Layers
// tab that edits it (rangePanel.ts) loads with Fine-tune and plugs in through `attach`.
import { Paint, RangeModel, type Layers } from './range';
import type { Area } from './editions';
import type { FaceSpec } from './card/face';
import type { RangeSnapshot } from './gl/range';
import type { Stage } from './stage';
import type { State, Store } from './state';

/** What the Layers tab adds once it is there. */
export interface AreasUi {
  /** Whether the tab wants the area shown on the card (it is pointed at, or the brush is out). */
  view(): boolean;
  /** After new range textures went to the stage. */
  pushed(snap: RangeSnapshot, snap2: RangeSnapshot | null): void;
  /** After every redraw of the face; `moved` when its regions moved too (a push follows). */
  faced(face: HTMLCanvasElement, mask: HTMLCanvasElement, moved: boolean): void;
}

export interface AreasHost {
  store: Store;
  stage: Stage;
  /** Told whether the areas differ from the default (whole card, no brush, one layer), after every change. */
  onRangeChanged: (changed: boolean) => void;
}

const RANGE_KEYS: (keyof State)[] = ['rangeRegion', 'rangeLo', 'rangeHi', 'rangeInvert', 'layer2', 'areaLayer'];

export function initAreas(host: AreasHost) {
  const { store, stage } = host;
  const model = new RangeModel();
  // Each layer keeps its own brush strokes.
  const paints = [new Paint('rangeBrush'), new Paint('rangeBrush2')];
  const which = (s = store.get()): 1 | 2 => (s.areaLayer === 2 && s.layer2 ? 2 : 1);
  const areaOf = (n: 1 | 2, s = store.get()): Area =>
    n === 2 && s.layer2 ? s.layer2 : { region: s.rangeRegion, lo: s.rangeLo, hi: s.rangeHi, invert: s.rangeInvert };
  const isWhole = (a: Area) => a.region === 'all' && a.lo <= 0 && a.hi >= 1 && !a.invert;
  let ui: AreasUi | null = null;

  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const still = () => (stage.cards.range.motion = stage.cards.range2.motion = !reduced.matches);
  still();
  reduced.addEventListener('change', still);

  /** Layer 1's texture differs from the renderer's own (the whole card); until then there is nothing to send. */
  let custom = false;
  let pending = 0;
  /** Re-uploads the range textures on the next frame, however many changes arrive before it. */
  function push() {
    if (pending) return;
    pending = requestAnimationFrame(() => {
      pending = 0;
      const s = store.get();
      const a = areaOf(1, s);
      const now = !isWhole(a) || paints[0].painted;
      let snap: RangeSnapshot | null = null;
      if (now || custom || ui) {
        snap = model.snapshot(a, paints[0]);
        stage.cards.range.set(snap);
      }
      custom = now;
      let snap2: RangeSnapshot | null = null;
      if (s.layer2) {
        snap2 = model.snapshot(s.layer2, paints[1]);
        stage.cards.range2.set(snap2);
      }
      if (ui && snap) ui.pushed(snap, snap2);
      report();
    });
  }

  function report() {
    const s = store.get();
    stage.rangeLayer = which(s);
    host.onRangeChanged(!isWhole(areaOf(1, s)) || paints.some((p) => p.painted) || s.layer2 !== null);
  }

  // The area shows on the card while it is edited, or always when pinned (Show on card).
  {
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const target = store.get().rangeShow || ui?.view() ? 1 : 0;
      stage.rangeView = reduced.matches ? target : stage.rangeView + (target - stage.rangeView) * (1 - Math.exp(-dt * 12));
      if (Math.abs(stage.rangeView - target) < 0.002) stage.rangeView = target;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  store.on((_s, changed) => {
    if (RANGE_KEYS.some((k) => changed.has(k))) push();
    else report();
  });

  let faceKey = '';
  let last: [HTMLCanvasElement, HTMLCanvasElement] | null = null;
  /** Hook for the live face: called after every redraw. */
  function onFace(face: HTMLCanvasElement, mask: HTMLCanvasElement, spec: FaceSpec) {
    model.onFace(face, mask, spec);
    last = [face, mask];
    const { image, ...rest } = spec;
    void image;
    const key = JSON.stringify(rest);
    // Regions only move when the words or frame do; the brightness is read live by the shader.
    const moved = key !== faceKey;
    faceKey = key;
    if (moved) push();
    ui?.faced(face, mask, moved);
  }

  for (const p of paints) void p.load().then((ok) => ok && push());
  report();

  return {
    model,
    paints,
    which,
    areaOf,
    push,
    onFace,
    /** The Layers tab plugs in: from now on it hears of every push and face. */
    attach(next: AreasUi) {
      ui = next;
      if (last) ui.faced(...last, true);
      push();
    },
    /** A kept card's strokes (layer 1, layer 2) take the place of these; none leaves no strokes. Undo starts afresh. */
    restore(brush: Layers[] | null) {
      paints.forEach((p, i) => {
        p.reset();
        if (brush) p.layers = brush[i];
        void p.save();
      });
      push();
    },
    /** What the exporter needs to put the finish in the same place. */
    snapshot: () => model.snapshot(areaOf(1), paints[0]),
    snapshot2: () => model.snapshot(areaOf(2), paints[1]),
  };
}

export type Areas = ReturnType<typeof initAreas>;
