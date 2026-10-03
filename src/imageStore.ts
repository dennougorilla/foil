// Keeps the person's uploaded image across reloads. Failure is never fatal: we just fall back to a sample.

const DB = 'foil';
const STORE = 'images';
const KEY = 'user';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveUserImage(canvas: HTMLCanvasElement): Promise<void> {
  try {
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/webp', 0.92));
    if (!blob) return;
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(blob, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (err) {
    console.warn('Could not keep the image for next time', err);
  }
}

export async function loadUserImage(): Promise<HTMLCanvasElement | null> {
  try {
    const db = await open();
    const blob = await new Promise<Blob | undefined>((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result as Blob | undefined);
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (!blob) return null;
    const bmp = await createImageBitmap(blob);
    const c = document.createElement('canvas');
    c.width = bmp.width;
    c.height = bmp.height;
    c.getContext('2d')!.drawImage(bmp, 0, 0);
    bmp.close();
    return c;
  } catch {
    return null;
  }
}
