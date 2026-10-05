// The service worker (docs/pwa.md): keeps one version of the app for offline use and answers from it,
// waits to be let in when it is a new version, keeps the fonts the page uses, and takes pictures that
// other apps share to FOIL. vite.config.ts builds it into dist/sw.js with OFFLINE (src/swFiles.ts)
// and VERSION (a hash of those files) above it, so every new build is a new worker.

declare const OFFLINE: string[];
declare const VERSION: string;

type Extendable = Event & { waitUntil(job: Promise<unknown>): void };
type Fetch = Extendable & { readonly request: Request; respondWith(res: Promise<Response>): void };
type Message = Extendable & { readonly data: unknown };
interface Worker {
  readonly location: Location;
  skipWaiting(): Promise<void>;
  readonly clients: { claim(): Promise<void> };
  addEventListener(type: 'install' | 'activate', run: (e: Extendable) => void): void;
  addEventListener(type: 'fetch', run: (e: Fetch) => void): void;
  addEventListener(type: 'message', run: (e: Message) => void): void;
}
const sw = self as unknown as Worker;

const APP = `foil-app-${VERSION}`;
const FONTS = 'foil-fonts';
const SHARED = 'foil-shared';
const FONT = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//;

const scope = new URL('./', sw.location.href);
const at = (path: string) => new URL(path, scope).href;
const PAGE = at('./');
const KEPT = new Set(OFFLINE.map(at));
const SHARE_TARGET = at('./share-target');
const SHARED_PICTURE = at('./shared-picture');

sw.addEventListener('install', (e) => e.waitUntil(keep()));

/** This version's files, beside the old version's. A file whose name carries its hash is copied from an old cache when it is there. */
async function keep() {
  const cache = await caches.open(APP);
  await Promise.all(
    OFFLINE.map(async (path) => {
      const url = at(path);
      const res = (path.startsWith('./assets/') && (await caches.match(url))) || (await fetch(url, { cache: 'no-cache' }));
      if (!res.ok) throw new Error(`${url}: ${res.status}`);
      await cache.put(url, res);
    }),
  );
}

// Let in (the Update chip, or every window closed): the old versions go, and the open pages are taken over.
sw.addEventListener('activate', (e) =>
  e.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key.startsWith('foil-app-') && key !== APP) await caches.delete(key);
      await sw.clients.claim();
    })(),
  ),
);

sw.addEventListener('message', (e) => {
  if (e.data === 'update') void sw.skipWaiting();
  else if (Array.isArray(e.data)) e.waitUntil(keepFonts(e.data.filter((u): u is string => typeof u === 'string' && FONT.test(u))));
});

/** The fonts a page loaded before this worker ran (its first visit). */
async function keepFonts(urls: string[]) {
  const cache = await caches.open(FONTS);
  for (const url of urls) {
    if (await cache.match(url)) continue;
    const res = await fetch(url, { mode: 'cors', credentials: 'omit' }).catch(() => null);
    if (res?.ok) await cache.put(url, res);
  }
}

sw.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method === 'POST' && url.href === SHARE_TARGET) return e.respondWith(takeShared(req));
  if (req.method !== 'GET') return;
  if (url.href === SHARED_PICTURE) return e.respondWith(giveShared());
  // Opening FOIL, with any query: the kept page, online or not.
  if (req.mode === 'navigate' && (url.pathname === scope.pathname || url.pathname === `${scope.pathname}index.html`)) return e.respondWith(fromApp(PAGE, req));
  const plain = url.origin + url.pathname;
  if (KEPT.has(plain)) return e.respondWith(fromApp(plain, req));
  if (FONT.test(req.url)) return e.respondWith(font(req.url, e));
});

async function fromApp(key: string, req: Request): Promise<Response> {
  return (await caches.match(key, { cacheName: APP })) ?? fetch(req);
}

/** A font file never changes under its address; a stylesheet may, so a fresh one is fetched behind the kept one. */
async function font(url: string, e: Fetch): Promise<Response> {
  const cache = await caches.open(FONTS);
  const hit = await cache.match(url);
  const fresh = fetch(url, { mode: 'cors', credentials: 'omit' }).then(async (res) => {
    if (res.ok) await cache.put(url, res.clone());
    return res;
  });
  if (!hit) return fresh;
  if (url.startsWith('https://fonts.googleapis.com/')) e.waitUntil(fresh.catch(() => null));
  return hit;
}

/** A picture from another app's share menu: kept until the page takes it, which it is sent to open. */
async function takeShared(req: Request): Promise<Response> {
  const form = await req.formData().catch(() => null);
  const file = form?.getAll('image').find((f): f is File => f instanceof File);
  if (file) {
    const headers = { 'content-type': file.type, 'x-name': encodeURIComponent(file.name) };
    await (await caches.open(SHARED)).put(SHARED_PICTURE, new Response(file, { headers }));
  }
  return Response.redirect(at('./?shared'), 303);
}

/** The shared picture, handed over once. */
async function giveShared(): Promise<Response> {
  const cache = await caches.open(SHARED);
  const res = await cache.match(SHARED_PICTURE);
  await cache.delete(SHARED_PICTURE);
  return res ?? new Response(null, { status: 404 });
}

export {};
