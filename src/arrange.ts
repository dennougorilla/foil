// Free placement of the card's words (docs/arrange.md): where a piece sits, how big and how
// turned, as shares of the card, plus the snapping and the bounds used while dragging it.
// Plain data and geometry; the face painter draws from it and the stage drags it.

import type { Rect } from './message';

export type Arrange = 'auto' | 'free';
export const ARRANGES: Arrange[] = ['auto', 'free'];

/** The pieces that may move: the message always, the name on the classic card. */
export type FreeField = 'message' | 'name';

export interface Placement {
  /** Centre, as shares of the face's width and height. */
  x: number;
  y: number;
  /** Type size as a share of the face's short side. */
  size: number;
  /** Turn in radians, within ±MAX_TURN. */
  rot: number;
}

export type Placements = Partial<Record<FreeField, Placement>>;

export const MAX_TURN = (15 * Math.PI) / 180;
/** Within this of level, a turn settles level. */
const LEVEL = (3 * Math.PI) / 180;
export const MIN_SIZE = 0.025;
export const MAX_SIZE = 0.3;

const num = (v: unknown, lo: number, hi: number, d: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;

/** A turn kept within ±15°, and level when it is nearly so. */
export const clampTurn = (rot: number) => (Math.abs(rot) < LEVEL ? 0 : Math.min(MAX_TURN, Math.max(-MAX_TURN, rot)));

/** Accepts anything stored and keeps only valid placements of known pieces. */
export function normalizePlacements(x: unknown): Placements {
  const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
  const out: Placements = {};
  for (const f of ['message', 'name'] as FreeField[]) {
    const p = o[f] as Partial<Placement> | undefined;
    if (!p || typeof p !== 'object') continue;
    if (![p.x, p.y, p.size].every((v) => typeof v === 'number' && Number.isFinite(v))) continue;
    out[f] = { x: num(p.x, 0, 1, 0.5), y: num(p.y, 0, 1, 0.5), size: num(p.size, MIN_SIZE, MAX_SIZE, 0.1), rot: clampTurn(num(p.rot, -1, 1, 0)) };
  }
  return out;
}

/** A piece's half extent in face uv: its width and height halves, as turned (the box that holds it). */
export function halfExtent(w: number, h: number, rot: number): { x: number; y: number } {
  const c = Math.abs(Math.cos(rot));
  const s = Math.abs(Math.sin(rot));
  return { x: (w * c + h * s) / 2, y: (w * s + h * c) / 2 };
}

/** Lines the words snap to while dragged, in face uv. */
export interface Guides {
  x: number[];
  y: number[];
}

export interface Snapped {
  x: number;
  y: number;
  /** The guide each axis snapped to, if any (for drawing it). */
  gx: number | null;
  gy: number | null;
}

/**
 * Pulls a dragged piece onto a guide when its centre or one of its edges is within `near` of
 * it, then keeps it inside `inner` (both in face uv).
 */
export function snapInside(x: number, y: number, half: { x: number; y: number }, guides: Guides, inner: Rect, near: number): Snapped {
  const pick = (c: number, h: number, lines: number[]) => {
    let best: { c: number; g: number; d: number } | null = null;
    for (const g of lines) {
      for (const off of [0, -h, h]) {
        const d = Math.abs(c + off - g);
        if (d <= near && (!best || d < best.d)) best = { c: g - off, g, d };
      }
    }
    return best;
  };
  const sx = pick(x, half.x, guides.x);
  const sy = pick(y, half.y, guides.y);
  const cx = Math.min(Math.max(sx ? sx.c : x, inner.x + half.x), inner.x + inner.w - half.x);
  const cy = Math.min(Math.max(sy ? sy.c : y, inner.y + half.y), inner.y + inner.h - half.y);
  return { x: cx, y: cy, gx: sx && Math.abs(cx - sx.c) < 1e-6 ? sx.g : null, gy: sy && Math.abs(cy - sy.c) < 1e-6 ? sy.g : null };
}

/** What the editing overlay shows on screen. */
export interface Overlay {
  /** The box round the selected words, its handles. */
  box: boolean;
  /** The bar under the card. */
  bar: boolean;
  /** The faint outlines of the words that can be picked up. */
  idle: boolean;
  /** The guides drawn (null: none on that axis). */
  guides: { gx: number | null; gy: number | null };
}

/**
 * The overlay for a moment of editing: the box and bar only round selected words, the guides only
 * while those words are held (gone the moment the press ends or they are let go), the faint
 * outlines only while Free is on and nothing is held.
 */
export function overlayOf(s: { free: boolean; selected: boolean; dragging: boolean; guides: { gx: number | null; gy: number | null } }): Overlay {
  const held = s.free && s.selected;
  return {
    box: held,
    bar: held,
    idle: s.free && !s.selected && !s.dragging,
    guides: held && s.dragging ? s.guides : { gx: null, gy: null },
  };
}
