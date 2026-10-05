// The finish area's brush strokes as a kept card holds them: both layers' painted-in and
// painted-out grids in one deflated blob. The grids are mostly empty, so a few strokes come to a
// few kilobytes. See docs/binder.md.
//
// No imports but types: the tests load this file directly with Node.

import type { Layers } from '../range';

const painted = (l: Layers) => l.add.some((v) => v) || l.erase.some((v) => v);

/** The layers' strokes in one deflated blob, or null when nothing is painted. */
export async function packBrush(layers: Layers[]): Promise<Blob | null> {
  if (!layers.some(painted)) return null;
  const raw = new Blob(layers.flatMap((l) => [l.add, l.erase]) as BlobPart[]);
  return new Response(raw.stream().pipeThrough(new CompressionStream('deflate-raw'))).blob();
}

/**
 * Two layers' strokes back from a kept blob, each grid `cells` long; null when there are none, or
 * when they can't be read or no longer fit the grid (the card comes back without them).
 */
export async function unpackBrush(blob: Blob | null | undefined, cells: number): Promise<Layers[] | null> {
  if (!(blob instanceof Blob)) return null;
  try {
    const raw = new Uint8Array(await new Response(blob.stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
    if (raw.length !== cells * 4) return null;
    return [0, 1].map((i) => ({ add: raw.slice(i * 2 * cells, (i * 2 + 1) * cells), erase: raw.slice((i * 2 + 1) * cells, (i * 2 + 2) * cells) }));
  } catch {
    return null;
  }
}
