import './style.css';
import { createStore, type State } from './state';
import { DICTS, type Dict } from './i18n';
import { EDITIONS, FRAMES, RARITIES, editionById, rarityById, type EditionId } from './editions';
import { clampCrop, cropRect, drawBack, drawFace, type Crop } from './card/face';
import { paintSample, SAMPLE_COUNT } from './samples';
import { Stage } from './stage';
import { setSound, sfx } from './audio';
import { exportGif, exportPng, exportVideo, videoSupported } from './exporter';
import { loadUserImage, saveUserImage } from './imageStore';
import { decodeGif, frameAt, type Anim } from './gifDecode';
import { mountTune } from './tune/panel';
import { animKind, asTypedApng, decodeAnimated } from './anim/apngDecode';
import { mountApngExport } from './anim/apngUi';
import { mountLettering } from './letteringPanel';
import { initRangeColors } from './features';
import { initSponsor, isLocked, releaseLockedEdition } from './sponsor';
import { mountReliefPick } from './reliefPick';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const store = createStore();
releaseLockedEdition(store);
let t: Dict = DICTS[store.get().lang];

// ---------- Images ----------

type Img = HTMLCanvasElement;
const samples: Img[] = Array.from({ length: SAMPLE_COUNT }, (_, i) => paintSample(i));
let userImage: Img | null = null;
/** Set when the person's image is an animated GIF; userImage then holds its first frame. */
let userAnim: Anim | null = null;
let animFrame = 0;
const currentImage = (): Img => {
  const s = store.get();
  if (s.sample >= 0) return samples[s.sample];
  if (userAnim) return userAnim.frames[animFrame] ?? userAnim.frames[0];
  return userImage ?? samples[0];
};

const face = document.createElement('canvas');
const mask = document.createElement('canvas');
const back = document.createElement('canvas');
drawBack(back);

// ---------- Stage ----------

let stage: Stage;
try {
  stage = new Stage({
    store,
    stage: $('stage'),
    canvas: $<HTMLCanvasElement>('cards'),
    bgCanvas: $<HTMLCanvasElement>('bg'),
    cardSlot: $<HTMLButtonElement>('cardSlot'),
    hand: $('hand'),
    info: $('info'),
    onSelect: (id) => selectEdition(id),
    onHover: (id) => renderCaption(id),
    isHidden: isLocked,
  });
} catch (err) {
  console.error(err);
  const fatal = $('fatal');
  fatal.hidden = false;
  fatal.textContent = t.errGl;
  throw err;
}
stage.cards.setBack(back);
// Relief's gold / silver coins ride in the finish pill on the name tag.
const reliefPill = mountReliefPick({ store, dict: () => t, onPick: () => stage.juice(0.4) });

function faceSpec(image: Img) {
  const s = store.get();
  return { image, crop: s.crop, frame: s.frame, rarity: s.rarity, name: s.name || fallback().name, frameColor: s.frameColor };
}

function redrawFace() {
  const spec = faceSpec(currentImage());
  drawFace(face, mask, spec);
  stage.cards.setFace(face, mask);
  rangeColors.onFace(face, mask, spec);
}

// ---------- Text ----------

/** "v0.2.0 · 1a2b3c4", shown quietly at the foot of the support menu. */
const APP_VERSION_LABEL = __APP_COMMIT__ === 'unknown' ? `v${__APP_VERSION__}` : `v${__APP_VERSION__} · ${__APP_COMMIT__}`;

/** Placeholder title and line: samples carry their own, uploads get a generic one. */
function fallback() {
  const i = store.get().sample;
  return i >= 0
    ? { name: t.samplesName[i], desc: t.samplesDesc[i] }
    : { name: t.myCard, desc: t.myDesc };
}

function applyText() {
  const s = store.get();
  t = DICTS[s.lang];
  document.documentElement.lang = s.lang;
  document.querySelectorAll<HTMLElement>('[data-t]').forEach((el) => {
    const key = el.dataset.t as keyof Dict;
    const v = t[key];
    if (typeof v === 'string') el.textContent = v;
  });
  $('repoLink').setAttribute('aria-label', t.repo);
  $('repoLink').title = t.repo;
  $('logoBtn').setAttribute('aria-label', t.logo);
  $('logoBtn').title = t.logo;
  $('langBtn').textContent = t.lang;
  $('langBtn').setAttribute('aria-label', t.langLabel);
  $('soundBtn').setAttribute('aria-label', s.sound ? t.soundOn : t.soundOff);
  $('crtBtn').setAttribute('aria-label', s.crt ? t.crtOn : t.crtOff);
  $('cardSlot').setAttribute('aria-label', t.stageLabel);
  document.querySelectorAll('.support-link').forEach((a) => a.setAttribute('title', t.supportOpen));
  $('creditLink').title = t.creditLink;
  $('versionLink').textContent = APP_VERSION_LABEL;
  $('versionLink').title = t.version.replace('{v}', APP_VERSION_LABEL);
  $('versionLink').setAttribute('aria-label', $('versionLink').title);
  $('cardSlot').dataset.loading = t.loading;
  $('hand').setAttribute('aria-label', t.handLabel);
  stage.setHandLabels(t.edition, t.look);
  $('cropView').setAttribute('aria-label', t.cropHint);
  buildSegments();
  buildThumbs();
  syncInputs();
  renderInfo();
  renderCaption(null);
}

function renderInfo() {
  const s = store.get();
  const ed = editionById(s.edition);
  const rar = rarityById(s.rarity);
  $('rarityName').textContent = t.rarityName[s.rarity];
  $('pillRarity').style.setProperty('--c', rar.color);
  const pe = $('pillEdition');
  pe.textContent = t.edition[s.edition];
  pe.style.setProperty('--c', s.edition === 'base' ? '#5b6d73' : ed.color);
  pe.classList.toggle('is-light', ['foil', 'gold', 'prism', 'glitch', 'relief', 'kintsugi', 'opal', 'eclipse'].includes(s.edition));
  reliefPill(pe);
  document.documentElement.style.setProperty('--accent', ed.id === 'base' ? '#ff5a4f' : ed.color);
}

/**
 * The caption always names the finish that is applied. A finish you are only
 * pointing at gets a small tag right above its card, so the two never mix up.
 */
function renderCaption(id: EditionId | null) {
  const s = store.get();
  const cap = $('handCaption');
  cap.querySelector('b')!.textContent = t.edition[s.edition];
  cap.querySelector('span')!.textContent = t.look[s.edition];
  const peek = $('handPeek');
  peek.hidden = !id || id === s.edition;
  if (id) peek.textContent = t.edition[id];
}

// ---------- Panel controls ----------

function radio(btn: HTMLButtonElement, on: boolean) {
  btn.setAttribute('aria-checked', String(on));
  btn.tabIndex = on ? 0 : -1;
}

function rovingKeys(group: HTMLElement) {
  group.addEventListener('keydown', (e) => {
    const items = [...group.querySelectorAll<HTMLButtonElement>('[role=radio]')];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const n = (i + dir + items.length) % items.length;
    items[n].click();
    // Clicking may rebuild the group, so look the button up again before focusing.
    group.querySelectorAll<HTMLButtonElement>('[role=radio]')[n]?.focus();
  });
}

function buildSegments() {
  const s = store.get();
  const rs = $('raritySeg');
  rs.textContent = '';
  rs.setAttribute('aria-label', t.rarity);
  const level = RARITIES.findIndex((r) => r.id === s.rarity);
  RARITIES.forEach((r, i) => {
    // One diamond per rarity level; the filled ones show how rare the card is.
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'rpip';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-label', t.rarityName[r.id]);
    b.title = t.rarityName[r.id];
    b.classList.toggle('is-on', i <= level);
    radio(b, s.rarity === r.id);
    b.onclick = () => {
      sfx.tick();
      store.set({ rarity: r.id });
      stage.juice(0.4);
    };
    rs.appendChild(b);
  });
  const fs = $('frameSeg');
  fs.textContent = '';
  const swatch: Record<string, string> = {
    paper: '#f3eee2',
    ink: '#252c30',
    gilt: 'linear-gradient(135deg,#f7dc8b,#d9a441 45%,#fbe7a6 60%,#b97f26)',
    rarity: rarityById(s.rarity).color,
  };
  for (const f of FRAMES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'seg-btn';
    b.setAttribute('role', 'radio');
    b.innerHTML = `<span class="swatch" style="--sw:${swatch[f]}"></span><span></span>`;
    b.lastElementChild!.textContent = t.frameName[f];
    radio(b, s.frame === f);
    b.onclick = () => {
      sfx.tick();
      store.set({ frame: f });
    };
    fs.appendChild(b);
  }
  rangeColors.decorateFrames(fs);
}

function buildThumbs() {
  const s = store.get();
  const th = $('thumbs');
  th.textContent = '';
  th.setAttribute('aria-label', t.samples);
  const add = (img: Img, label: string, idx: number) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'thumb';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-label', label);
    b.style.backgroundImage = `url(${thumbUrl(img)})`;
    if (idx < 0 && userAnim) b.dataset.badge = animKind(userAnim);
    radio(b, s.sample === idx);
    b.onclick = () => {
      if (store.get().sample === idx) return;
      useImage(idx);
    };
    th.appendChild(b);
  };
  samples.forEach((img, i) => add(img, t.samplesName[i], i));
  if (userImage) add(userImage, userAnim ? `${t.yourImage} (${animKind(userAnim)})` : t.yourImage, -1);
  const label = document.createElement('span');
  label.className = 'thumb-label';
  label.textContent = s.sample >= 0 ? t.sampleNow : userAnim ? t.yourGif.replace('GIF', animKind(userAnim)) : t.yourImage;
  apngExport.refresh();
  th.appendChild(label);
}

const thumbCache = new WeakMap<Img, string>();
function thumbUrl(img: Img): string {
  let u = thumbCache.get(img);
  if (!u) {
    const c = document.createElement('canvas');
    const h = 140;
    c.width = Math.round((img.width / img.height) * h);
    c.height = h;
    const x = c.getContext('2d')!;
    x.imageSmoothingQuality = 'high';
    x.drawImage(img, 0, 0, c.width, c.height);
    u = c.toDataURL('image/png');
    thumbCache.set(img, u);
  }
  return u;
}

function setRangeFill(input: HTMLInputElement) {
  const p = ((+input.value - +input.min) / (+input.max - +input.min)) * 100;
  input.style.setProperty('--fill', `${p}%`);
}

function syncInputs() {
  const s = store.get();
  const name = $<HTMLInputElement>('nameInput');
  const desc = $<HTMLTextAreaElement>('descInput');
  if (document.activeElement !== name) name.value = s.name;
  if (document.activeElement !== desc) desc.value = s.desc;
  name.placeholder = fallback().name;
  desc.placeholder = fallback().desc;
  desc.classList.toggle('is-hint', s.sample < 0);
  name.setAttribute('aria-label', t.name);
  desc.setAttribute('aria-label', t.desc);
  const inten = $<HTMLInputElement>('intensity');
  inten.value = String(s.intensity);
  $('intensityOut').textContent = `${Math.round(s.intensity * 100)}%`;
  setRangeFill(inten);
  const px = $<HTMLInputElement>('pixel');
  px.value = String(s.pixel);
  $('pixelOut').textContent = t.pixelLevels[s.pixel] ?? t.off;
  px.setAttribute('aria-valuetext', t.pixelLevels[s.pixel] ?? t.off);
  setRangeFill(px);
  const zoom = $<HTMLInputElement>('zoom');
  zoom.value = String(s.crop.zoom);
  $('zoomOut').textContent = `${Math.round(s.crop.zoom * 100)}%`;
  setRangeFill(zoom);
  $('soundBtn').setAttribute('aria-pressed', String(s.sound));
  $('crtBtn').setAttribute('aria-pressed', String(s.crt));
  $('crt').classList.toggle('is-off', !s.crt);
}

// ---------- Crop ----------

const cropCanvas = $<HTMLCanvasElement>('cropCanvas');
const cropView = $('cropView');
const cropWin = $('cropWindow');

function drawCropPreview() {
  const img = currentImage();
  const box = cropView.getBoundingClientRect();
  const scale = Math.min((box.width - 16) / img.width, (box.height - 16) / img.height);
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  cropCanvas.width = w * 2;
  cropCanvas.height = h * 2;
  cropCanvas.style.width = `${w}px`;
  cropCanvas.style.height = `${h}px`;
  const x = cropCanvas.getContext('2d')!;
  x.imageSmoothingQuality = 'high';
  x.drawImage(img, 0, 0, cropCanvas.width, cropCanvas.height);
  cropWin.style.backgroundImage = `url(${thumbUrl(img)})`;
  positionCropWindow();
}

function positionCropWindow() {
  const img = currentImage();
  const box = cropView.getBoundingClientRect();
  const cw = parseFloat(cropCanvas.style.width) || 1;
  const ch = parseFloat(cropCanvas.style.height) || 1;
  const left = (box.width - cw) / 2;
  const top = (box.height - ch) / 2;
  const r = cropRect(img.width, img.height, store.get().crop);
  const k = cw / img.width;
  Object.assign(cropWin.style, {
    left: `${left + r.sx * k}px`,
    top: `${top + r.sy * k}px`,
    width: `${r.sw * k}px`,
    height: `${r.sh * k}px`,
    backgroundSize: `${cw}px ${ch}px`,
    backgroundPosition: `${-r.sx * k}px ${-r.sy * k}px`,
  });
}

function setCrop(c: Crop) {
  const img = currentImage();
  store.set({ crop: clampCrop(img.width, img.height, c) });
}

{
  let dragging = false;
  let sx = 0;
  let sy = 0;
  let start: Crop = { zoom: 1, x: 0.5, y: 0.5 };
  cropView.addEventListener('pointerdown', (e) => {
    dragging = true;
    sx = e.clientX;
    sy = e.clientY;
    start = { ...store.get().crop };
    cropView.setPointerCapture(e.pointerId);
  });
  cropView.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const cw = parseFloat(cropCanvas.style.width) || 1;
    const ch = parseFloat(cropCanvas.style.height) || 1;
    setCrop({ ...start, x: start.x + (e.clientX - sx) / cw, y: start.y + (e.clientY - sy) / ch });
  });
  const end = () => (dragging = false);
  cropView.addEventListener('pointerup', end);
  cropView.addEventListener('pointercancel', end);
  cropView.addEventListener('wheel', (e) => {
    e.preventDefault();
    const c = store.get().crop;
    setCrop({ ...c, zoom: Math.min(4, Math.max(1, c.zoom * Math.exp(-e.deltaY * 0.0015))) });
  }, { passive: false });
  cropView.addEventListener('keydown', (e) => {
    const c = store.get().crop;
    const step = (e.shiftKey ? 0.08 : 0.02) / c.zoom;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const m = moves[e.key];
    if (m) {
      e.preventDefault();
      setCrop({ ...c, x: c.x + m[0], y: c.y + m[1] });
    } else if (e.key === '+' || e.key === '=') {
      setCrop({ ...c, zoom: Math.min(4, c.zoom + 0.1) });
    } else if (e.key === '-') {
      setCrop({ ...c, zoom: Math.max(1, c.zoom - 0.1) });
    }
  });
  $<HTMLInputElement>('zoom').addEventListener('input', (e) => {
    setCrop({ ...store.get().crop, zoom: +(e.target as HTMLInputElement).value });
  });
  $('cropReset').addEventListener('click', () => {
    sfx.tick();
    store.set({ crop: { zoom: 1, x: 0.5, y: 0.5 } });
  });
}

// ---------- Image loading ----------

const ACCEPT = /^image\/(a?png|jpe?g|webp|gif|avif|bmp)$/;
const MAX_SIDE = 2048;

/** Decodes a still image (downscaled), or every frame of an animated GIF, PNG or WebP. */
async function decodeImage(blob: Blob): Promise<{ still: Img; anim: Anim | null }> {
  if (blob.type === 'image/gif') {
    const anim = decodeGif(await blob.arrayBuffer());
    if (anim) return { still: anim.frames[0], anim };
  }
  if (/^image\/(a?png|webp)$/.test(blob.type)) {
    const anim = await decodeAnimated(blob);
    if (anim) return { still: anim.frames[0], anim };
  }
  const bmp = await createImageBitmap(blob);
  const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  const x = c.getContext('2d')!;
  x.imageSmoothingQuality = 'high';
  x.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return { still: c, anim: null };
}

async function loadFile(file: File) {
  if (!ACCEPT.test(file.type)) {
    // A .apng with no MIME type is still welcome if its bytes say APNG.
    const apng = file.type ? null : await asTypedApng(file);
    if (!apng) {
      toast(t.errType, true, true);
      return;
    }
    file = apng;
  }
  store.set({ loading: true });
  document.body.classList.add('is-loading');
  try {
    const { still, anim } = await decodeImage(file);
    userImage = still;
    userAnim = anim;
    animFrame = 0;
    void saveUserImage(anim ? file : still);
    const base = file.name.replace(/\.[^.]+$/, '').slice(0, 24);
    const s = store.get();
    if (!s.nameEdited && base && !/^(image|img|photo|IMG_|DSC|screenshot|スクリーンショット)/i.test(base)) {
      store.set({ name: base });
    } else if (!s.nameEdited) {
      store.set({ name: '' });
    }
    useImage(-1);
  } catch (err) {
    console.error(err);
    toast(t.errDecode, true, true);
  } finally {
    store.set({ loading: false });
    document.body.classList.remove('is-loading');
  }
}

function useImage(idx: number) {
  const s = store.get();
  const patch: Partial<State> = { sample: idx, crop: { zoom: 1, x: 0.5, y: 0.5 } };
  if (idx >= 0) {
    if (!s.nameEdited) patch.name = '';
    if (!s.descEdited) patch.desc = '';
  }
  stage.flipTo(() => {
    store.set(patch);
    redrawFace();
    buildThumbs();
    syncInputs();
    renderInfo();
    drawCropPreview();
  });
  // Keep the panel in sync immediately so the UI never lags the click.
  buildThumbsPending(idx);
}

function buildThumbsPending(idx: number) {
  $('thumbs')
    .querySelectorAll<HTMLButtonElement>('.thumb')
    .forEach((b, i) => radio(b, (i < SAMPLE_COUNT ? i : -1) === idx));
}

const fileInput = $<HTMLInputElement>('fileInput');
$('pickBtn').addEventListener('click', () => fileInput.click());
$('pickBtnStage').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  const f = fileInput.files?.[0];
  if (f) void loadFile(f);
  fileInput.value = '';
});

{
  const drop = $('drop');
  let depth = 0;
  const hasFiles = (e: DragEvent) => [...(e.dataTransfer?.types ?? [])].includes('Files');
  window.addEventListener('dragenter', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth++;
    drop.hidden = false;
  });
  window.addEventListener('dragover', (e) => {
    if (hasFiles(e)) e.preventDefault();
  });
  window.addEventListener('dragleave', () => {
    depth = Math.max(0, depth - 1);
    if (!depth) drop.hidden = true;
  });
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    depth = 0;
    drop.hidden = true;
    const f = e.dataTransfer?.files?.[0];
    if (f) void loadFile(f);
  });
  window.addEventListener('paste', (e) => {
    const item = [...(e.clipboardData?.items ?? [])].find((i) => i.kind === 'file');
    const f = item?.getAsFile();
    if (f) {
      e.preventDefault();
      void loadFile(f);
    }
  });
}

// ---------- Edition ----------

function selectEdition(id: EditionId) {
  if (store.get().edition === id) {
    stage.juice(0.5);
    return;
  }
  const i = EDITIONS.findIndex((e) => e.id === id);
  store.set({ edition: id });
  announce(t.applied.replace('{name}', t.edition[id]));
  sfx.select(i);
  stage.juice();
  stage.burst(editionById(id).color);
}

/** Tell screen readers which finish is on the card now. */
function announce(msg: string) {
  const live = $('announcer');
  // Clear first so the same words are read again if they repeat.
  live.textContent = '';
  setTimeout(() => (live.textContent = msg), 60);
}

window.addEventListener('keydown', (e) => {
  const tag = (e.target as HTMLElement).tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || e.metaKey || e.ctrlKey || e.altKey) return;
  // 1–9 then 0 pick the first ten finishes, like a keyboard row.
  const n = parseInt(e.key, 10);
  if (!Number.isNaN(n) && e.key.length === 1) {
    const i = n === 0 ? 9 : n - 1;
    if (EDITIONS[i]) selectEdition(EDITIONS[i].id);
    return;
  }
  // Arrows step through finishes when nothing else on the page wants them.
  const free = document.activeElement === document.body || document.activeElement?.id === 'cardSlot';
  if (free && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
    e.preventDefault();
    let next = EDITIONS.findIndex((x) => x.id === store.get().edition);
    do next = (next + (e.key === 'ArrowRight' ? 1 : -1) + EDITIONS.length) % EDITIONS.length;
    while (isLocked(EDITIONS[next].id));
    selectEdition(EDITIONS[next].id);
  }
});

// ---------- Inputs ----------

$<HTMLInputElement>('nameInput').addEventListener('input', (e) => {
  const v = (e.target as HTMLInputElement).value;
  store.set({ name: v, nameEdited: v.length > 0 });
});
$<HTMLTextAreaElement>('descInput').addEventListener('input', (e) => {
  const v = (e.target as HTMLTextAreaElement).value;
  store.set({ desc: v, descEdited: v.length > 0 });
});
$<HTMLInputElement>('intensity').addEventListener('input', (e) => {
  store.set({ intensity: +(e.target as HTMLInputElement).value });
});
$<HTMLInputElement>('pixel').addEventListener('input', (e) => {
  store.set({ pixel: +(e.target as HTMLInputElement).value });
});
$('langBtn').addEventListener('click', () => {
  sfx.tick();
  store.set({ lang: store.get().lang === 'ja' ? 'en' : 'ja' });
});
$('soundBtn').addEventListener('click', () => {
  const on = !store.get().sound;
  setSound(on);
  store.set({ sound: on });
  sfx.tick();
});
$('crtBtn').addEventListener('click', () => {
  sfx.tick();
  store.set({ crt: !store.get().crt });
});
rovingKeys($('raritySeg'));
rovingKeys($('frameSeg'));
rovingKeys($('thumbs'));
// Fine-tuning drawer for light and motion, right under the Tune section's sliders.
mountTune(store, $('pixel').closest('.row')!);

// ---------- Export ----------

function exportInput() {
  const s = store.get();
  return {
    face,
    mask,
    back,
    edition: editionById(s.edition),
    intensity: s.intensity,
    pixel: s.pixel,
    tune: s.tune,
    name: s.name || fallback().name,
    ...(userAnim && s.sample < 0 ? animatedExport(userAnim) : {}),
    ...rangeColors.exportExtras(),
  };
}

/** Lets GIF and video exports step through the person's animated GIF frame by frame. */
function animatedExport(anim: Anim) {
  // Settings are fixed when the export starts, so edits made meanwhile don't change it midway.
  const spec = faceSpec(anim.frames[0]);
  const crop = { ...spec.crop };
  return {
    loopMs: anim.duration,
    faceAt: (ms: number, f: HTMLCanvasElement, m: HTMLCanvasElement) =>
      drawFace(f, m, { ...spec, crop, image: anim.frames[frameAt(anim, ms)] }),
  };
}

/** While a job runs, the sub-label names the step and the title counts up; the button fills like a bar. */
async function busy(
  btn: HTMLButtonElement,
  label: string,
  job: (progress: (p: number) => void) => Promise<string>,
  fail = t.errDecode,
) {
  const b = btn.querySelector('b')!;
  const small = btn.querySelector('small')!;
  // One export at a time: the other buttons rest while this one works.
  const all = [...document.querySelectorAll<HTMLButtonElement>('.export .btn')];
  all.forEach((x) => (x.disabled = true));
  btn.setAttribute('aria-busy', 'true');
  small.textContent = label;
  const progress = (p: number) => {
    b.textContent = `${Math.round(p * 100)}%`;
    btn.style.setProperty('--p', p.toFixed(3));
  };
  try {
    const file = await job(progress);
    sfx.coin();
    toast(`${t.saved}: ${file}`);
  } catch (err) {
    console.error(err);
    sfx.error();
    toast((err as Error).message === 'video-unsupported' ? t.errVideo : fail, true);
  } finally {
    all.forEach((x) => (x.disabled = false));
    btn.removeAttribute('aria-busy');
    btn.style.removeProperty('--p');
    // From the current dictionary, in case the language changed mid-export.
    for (const el of [b, small]) el.textContent = t[el.dataset.t as keyof Dict] as string;
  }
}

$<HTMLButtonElement>('pngBtn').addEventListener('click', (e) => {
  void busy(e.currentTarget as HTMLButtonElement, t.saving, () => exportPng(exportInput()), t.errPng);
});
$<HTMLButtonElement>('gifBtn').addEventListener('click', (e) => {
  const btn = e.currentTarget as HTMLButtonElement;
  const small = btn.querySelector('small')!;
  void busy(
    btn,
    t.saving,
    (progress) =>
      exportGif(exportInput(), (p, encoding) => {
        small.textContent = encoding ? t.encoding : t.saving;
        progress(p);
      }),
    t.errGif,
  );
});
$<HTMLButtonElement>('videoBtn').addEventListener('click', (e) => {
  const btn = e.currentTarget as HTMLButtonElement;
  if (!videoSupported()) {
    sfx.error();
    toast(t.errVideo, true);
    return;
  }
  void busy(btn, t.recording, (progress) => exportVideo(exportInput(), progress), t.errVideoFail);
});

// Before the APNG tile: its first refresh already reads the export input, which includes the range.
const rangeColors = initRangeColors({ store, stage, t: () => t, announce, redrawFace, rebuildFrames: buildSegments });
const apngExport = mountApngExport({
  btn: $<HTMLButtonElement>('apngBtn'),
  lang: () => store.get().lang,
  input: exportInput,
  toast: (msg, error) => toast(msg, error),
  sfx,
});

// ---------- Logo ----------

{
  const logo = $<HTMLButtonElement>('logoBtn');
  logo.addEventListener('pointermove', (e) => {
    const r = logo.getBoundingClientRect();
    logo.style.setProperty('--mx', ((e.clientX - r.left) / r.width).toFixed(3));
  });
  logo.addEventListener('click', () => {
    // Re-deal the logo and shuffle the card into a different finish.
    logo.classList.remove('is-flip');
    void logo.offsetWidth;
    logo.classList.add('is-flip');
    const others = EDITIONS.filter((e) => e.id !== store.get().edition && !isLocked(e.id));
    selectEdition(others[Math.floor(Math.random() * others.length)].id);
  });
  logo.addEventListener('animationend', (e) => {
    if ((e.target as HTMLElement).matches('.tile:last-of-type')) logo.classList.remove('is-flip');
  });
}

// ---------- Support menu ----------

{
  const btn = $<HTMLButtonElement>('supportBtn');
  const menu = $('supportMenu');
  const setOpen = (open: boolean) => {
    menu.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
  };
  btn.addEventListener('click', () => {
    const open = menu.hasAttribute('hidden');
    sfx.tick();
    setOpen(open);
    if (open) menu.querySelector<HTMLAnchorElement>('a')?.focus();
  });
  document.addEventListener('pointerdown', (e) => {
    if (!menu.hidden && !(e.target as Element).closest('.support')) setOpen(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.hidden) {
      setOpen(false);
      btn.focus();
    }
  });
  menu.addEventListener('focusout', (e) => {
    if (!(e.relatedTarget instanceof Node) || !menu.parentElement!.contains(e.relatedTarget)) setOpen(false);
  });
}

// ---------- Toasts ----------

function dismissToast(el: HTMLElement) {
  if (el.classList.contains('is-out')) return;
  // Don't strand keyboard focus on a toast that's about to vanish.
  // Phones hide the panel's pick button, so land on whichever one is showing.
  if (el.contains(document.activeElement)) {
    const pick = [$('pickBtn'), $('pickBtnStage')].find((b) => b.getClientRects().length) ?? $('pickBtn');
    pick.focus({ preventScroll: true });
  }
  el.classList.add('is-out');
  el.addEventListener('animationend', () => el.remove());
  setTimeout(() => el.remove(), 400);
}

/** Success toasts fade on their own; errors stay until dismissed, offering a way forward. */
function toast(msg: string, error = false, pick = false) {
  const box = $('toasts');
  if (error) box.querySelectorAll<HTMLElement>('.toast.is-error').forEach(dismissToast);
  const el = document.createElement('div');
  el.className = `toast${error ? ' is-error' : ''}`;
  const text = document.createElement('p');
  text.className = 'toast-msg';
  text.setAttribute('role', error ? 'alert' : 'status');
  text.textContent = msg;
  el.appendChild(text);
  if (error) {
    if (pick) {
      const again = document.createElement('button');
      again.type = 'button';
      again.className = 'toast-btn';
      again.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 11V2M4.5 5.5 8 2l3.5 3.5M2 10v3.5h12V10" /></svg><span></span>';
      again.lastElementChild!.textContent = t.pickAnother;
      again.addEventListener('click', () => {
        sfx.tick();
        dismissToast(el);
        fileInput.click();
      });
      el.appendChild(again);
    }
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'toast-close';
    close.setAttribute('aria-label', t.close);
    close.title = t.close;
    close.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3h2v2H3zm2 2h2v2H5zm2 2h2v2H7zm2 2h2v2H9zm2 2h2v2h-2zM11 3h2v2h-2zM9 5h2v2H9zM5 9h2v2H5zM3 11h2v2H3z" /></svg>';
    close.addEventListener('click', () => dismissToast(el));
    el.appendChild(close);
  } else {
    // Longer messages stay up long enough to read.
    setTimeout(() => dismissToast(el), Math.max(2400, msg.length * 70));
  }
  box.appendChild(el);
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') $('toasts').querySelectorAll<HTMLElement>('.toast.is-error').forEach(dismissToast);
});

// ---------- React to state ----------

store.on((s, changed) => {
  if (changed.has('lang')) {
    applyText();
    redrawFace();
    return;
  }
  if (changed.has('edition')) {
    stage.syncHandChecked();
    renderCaption(null);
  }
  if (changed.has('rarity') || changed.has('frame')) buildSegments();
  if (['name', 'rarity', 'frame', 'crop'].some((k) => changed.has(k as keyof State)) && !changed.has('sample')) {
    redrawFace();
  }
  if (changed.has('crop')) positionCropWindow();
  if (['rarity', 'edition', 'sample'].some((k) => changed.has(k as keyof State))) renderInfo();
  if (changed.has('sample')) syncInputs();
  if (['intensity', 'pixel', 'crop', 'sound', 'crt'].some((k) => changed.has(k as keyof State))) syncInputs();
  if (changed.has('sound') || changed.has('crt')) {
    $('soundBtn').setAttribute('aria-label', s.sound ? t.soundOn : t.soundOff);
    $('crtBtn').setAttribute('aria-label', s.crt ? t.crtOn : t.crtOff);
  }
});

// ---------- Boot ----------

setSound(store.get().sound);
mountLettering({
  store,
  host: $('intensity').closest<HTMLElement>('.sec')!,
  dict: () => t,
  name: () => store.get().name || fallback().name,
  repaint: () => redrawFace(),
  onPick: () => stage.juice(0.35),
  tag: document.querySelector<HTMLElement>('#info .info-box') ?? undefined,
});
applyText();
initSponsor(stage);
const boot = () => {
  redrawFace();
  drawCropPreview();
};
// The nameplate uses the pixel font, so wait for it before painting the face.
document.fonts.load('40px "DotGothic16"').then(boot, boot);
boot();
if (store.get().sample < 0) {
  // Bring back the image from last visit; if it's gone, fall back to the first sample.
  void loadUserImage().then(async (blob) => {
    const img = blob ? await decodeImage(blob).catch(() => null) : null;
    if (img) {
      userImage = img.still;
      userAnim = img.anim;
      buildThumbs();
      boot();
    } else {
      store.set({ sample: 0, crop: { zoom: 1, x: 0.5, y: 0.5 } });
      boot();
      buildThumbs();
      renderInfo();
    }
  });
}
window.addEventListener('resize', () => drawCropPreview());

// Animated GIFs: advance the card face whenever the GIF's next frame is due.
{
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const tick = (now: number) => {
    if (userAnim && store.get().sample < 0 && !reduced.matches) {
      const i = frameAt(userAnim, now);
      if (i !== animFrame) {
        animFrame = i;
        redrawFace();
      }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
