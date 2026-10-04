// The pack modules that have arrived. Card renderers build one program per pack from these, so a
// pack's shader code is neither downloaded nor compiled before the pack is opened or picked.
import { editionById } from '../../editions';
import { PACKS, packById, type PackId } from '../../packs';
import type { FinishModule } from './types';

const ready = new Map<PackId, FinishModule>();
const loading = new Map<PackId, Promise<FinishModule>>();
const byShader = new Map<number, PackId>(PACKS.flatMap((p) => p.finishes.map((id) => [editionById(id).shader, p.id] as const)));

/** Fetches a pack's finishes once; later calls get the same promise. */
export function loadPack(id: PackId): Promise<FinishModule> {
  let p = loading.get(id);
  if (!p) {
    p = packById(id)
      .load()
      .then((m) => {
        ready.set(id, m.default);
        return m.default;
      });
    // A failed fetch (offline) may be tried again later.
    p.catch(() => loading.delete(id));
    loading.set(id, p);
  }
  return p;
}

/** The module of a pack that has arrived, if it has. */
export const packModule = (id: PackId): FinishModule | undefined => ready.get(id);

/** The pack a shader index belongs to; undefined for the open finishes, which are always in. */
export const packOfShader = (shader: number): PackId | undefined => byShader.get(shader);
