// Keeps the person's uploaded images across reloads: the card's picture ('user') and Flip Lenticular's
// other picture ('flip'). Failure is never fatal: we just fall back to a sample (or the pencil drawing).

const DB = 'foil';
const STORE = 'images';
export type ImageKey = 'user' | 'flip';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Keeps a still image as WebP, or an animated GIF as its original bytes so the motion survives. */
export async function saveUserImage(src: HTMLCanvasElement | Blob, key: ImageKey = 'user'): Promise<void> {
  try {
    const blob = src instanceof Blob ? src : await new Promise<Blob | null>((r) => src.toBlob(r, 'image/webp', 0.92));
    if (!blob) return;
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(blob, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (err) {
    console.warn('Could not keep the image for next time', err);
  }
}

export async function loadUserImage(key: ImageKey = 'user'): Promise<Blob | null> {
  try {
    const db = await open();
    const blob = await new Promise<Blob | undefined>((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result as Blob | undefined);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return blob ?? null;
  } catch {
    return null;
  }
}

export async function forgetUserImage(key: ImageKey): Promise<void> {
  try {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (err) {
    console.warn('Could not forget the image', err);
  }
}
