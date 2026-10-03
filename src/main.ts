import './style.css';
import { createStore, EXPORT_FORMATS, PANEL_TABS, type PanelTab, type State } from './state';
import { DICTS, type Dict } from './i18n';
import { FRAMES, RARITIES, editionById, rarityById, type EditionId } from './editions';
import { clampCrop, cropRect, drawBack, drawFace, type Crop } from './card/face';
import type { ShadowDepth } from './depth/shadowDepth';
import { paintSample, SAMPLE_COUNT } from './samples';
import { Stage } from './stage';
import { setSound, sfx } from './audio';
import { exportGif, exportPng } from './exporter';
import { loadUserImage, saveUserImage } from './imageStore';
import { decodeGif, frameAt, type Anim } from './gifDecode';
import { mountTune } from './tune/panel';
import { animKind, asTypedApng, decodeAnimated } from './anim/apngDecode';
import { mountApngExport } from './anim/apngUi';
import { mountLettering } from './letteringPanel';
import { changedKeys } from './tune/model';
import { DEFAULT_LETTERING } from './lettering';
import { initRangeColors } from './features';
import { initPackStore, packs, releaseSealedEdition } from './packStore';
import { handOf, packOf, type Pack } from './packs';
import { loadPack } from './gl/finishes/registry';
import { mountShelf } from './shelf';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const store = createStore();
releaseSealedEdition(store);
/** The hand: the seven open finishes, then the chosen folder's. */
const hand = () => handOf(store.get().folder, packs.get());
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
    handIds: hand,
  });
} catch (err) {
  console.error(err);
  const fatal = $('fatal');
  fatal.hidden = false;
  fatal.textContent = t.errGl;
  throw err;
}
stage.cards.setBack(back);
// The Shadowbox finish cuts the art into sheets by depth; its code loads the first time it is chosen.
let depth: ShadowDepth | null = null;
let depthLoading = false;
function wakeDepth() {
  if (depth || depthLoading || store.get().edition !== 'shadowbox') return;
  depthLoading = true;
  void import('./depth/shadowDepth').then((m) => {
    depth = m.mountShadowDepth({
      store,
      cards: stage.cards,
      slot: $('cardSlot'),
      dict: () => t,
      animated: () => !!userAnim && store.get().sample < 0,
    });
    depth.update(face, artKey());
  });
}

/** Fetches the pack of the finish on the card and of the chosen folder; their cards deal in once ready. */
function wakePacks() {
  const s = store.get();
  for (const id of [packOf(s.edition)?.id, s.folder]) if (id) loadPack(id).catch(() => toast(t.pack.failed, true));
  wakeDepth();
}
const artIds = new WeakMap<object, number>();
let artCount = 0;
/** Names the art in the window (picture and crop), so depth is read once per art. */
function artKey() {
  const s = store.get();
  const src: object = s.sample >= 0 ? samples[s.sample] : (userAnim ?? userImage ?? samples[0]);
  if (!artIds.has(src)) artIds.set(src, ++artCount);
  return `${artIds.get(src)}:${s.crop.zoom},${s.crop.x},${s.crop.y}`;
}

function faceSpec(image: Img) {
  const s = store.get();
  return { image, crop: s.crop, frame: s.frame, rarity: s.rarity, name: s.name || fallback().name, frameColor: s.frameColor };
}

function redrawFace() {
  const spec = faceSpec(currentImage());
  drawFace(face, mask, spec);
  stage.cards.setFace(face, mask);
  rangeColors.onFace(face, mask, spec);
  depth?.update(face, artKey());
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
  $('hand').title = t.handHint;
  stage.setHandLabels(t.edition, t.look);
  $('cropView').setAttribute('aria-label', t.cropHint);
  $('cropView').title = t.cropHint;
  // Paste is ⌘V on Apple keyboards; taps, not clicks, on touch screens.
  const pasteKey = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘V' : 'Ctrl+V';
  $('pickBtn').querySelector('small')!.textContent = t.pickSub.replace('Ctrl+V', pasteKey);
  $('pickBtn').title = t.pickSub.replace('Ctrl+V', pasteKey);
  if (matchMedia('(pointer: coarse)').matches) document.querySelector('#info .card-hint')!.textContent = t.cardHintTouch;
  buildSegments();
  buildThumbs();
  buildTabs();
  buildFormats();
  buildSaveOpts();
  renderSave();
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
  pe.classList.toggle('is-light', ['foil', 'gold', 'prism', 'glitch', 'relief', 'kintsugi', 'opal'].includes(s.edition));
  document.documentElement.style.setProperty('--accent', ed.id === 'base' ? '#ff5a4f' : ed.color);
  // The panel names the finish on the card and points to the hand where it is picked.
  $('finishName').textContent = t.edition[s.edition];
  const chip = $('finishChip');
  chip.style.setProperty('--c', s.edition === 'base' ? '#c9c2b2' : ed.color);
  chip.style.setProperty('--a', ed.swirl[0]);
  chip.style.setProperty('--b', ed.swirl[1]);
  chip.style.setProperty('--c3', ed.swirl[2]);
  $('finishPick').setAttribute('aria-label', t.finishPick);
  $('finishPick').title = matchMedia('(max-width: 900px)').matches ? t.finishPickHintPhone : t.finishPickHint;
}

$('finishPick').addEventListener('click', () => {
  sfx.tick();
  const slot = document.querySelector<HTMLElement>('.hand-slot[aria-checked=true]');
  if (!slot) return;
  slot.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  slot.focus({ preventScroll: true });
  stage.juice(0.3);
});

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
  $('thumbLabel').textContent = s.sample >= 0 ? t.sampleNow : userAnim ? t.yourGif.replace('GIF', animKind(userAnim)) : t.yourImage;
  apngExport.refresh();
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
  // The way back only shows once there is something to go back from.
  $('cropReset').hidden = s.crop.zoom === 1 && s.crop.x === 0.5 && s.crop.y === 0.5;
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
      toast(t.errType.replace('{name}', file.name), true, true);
      return;
    }
    file = apng;
  }
  store.set({ loading: true });
  document.body.classList.add('is-loading');
  hideImageError();
  // The pick button says what is happening, and Save rests until the new picture is on the card.
  const pickLabel = $('pickBtn').querySelector('b')!;
  pickLabel.textContent = t.loading;
  $('thumbLabel').textContent = t.loading;
  $('pickBtn').setAttribute('aria-busy', 'true');
  // Save rests while the picture loads, unless an export owns the button (APNG uses it to stop).
  if (!saveBtn.hasAttribute('aria-busy')) saveBtn.disabled = true;
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
    pickLabel.textContent = t.pick;
    $('pickBtn').removeAttribute('aria-busy');
    if (!saveBtn.hasAttribute('aria-busy')) saveBtn.disabled = false;
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
  const i = Math.max(0, hand().indexOf(id));
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
  // 1–9 then 0 pick the first ten finishes in the hand, like a keyboard row.
  const n = parseInt(e.key, 10);
  if (!Number.isNaN(n) && e.key.length === 1) {
    const shown = hand();
    const i = n === 0 ? 9 : n - 1;
    if (shown[i]) selectEdition(shown[i]);
    return;
  }
  // Arrows step through finishes when nothing else on the page wants them.
  const free = document.activeElement === document.body || document.activeElement?.id === 'cardSlot';
  if (free && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
    e.preventDefault();
    const shown = hand();
    const at = shown.indexOf(store.get().edition);
    selectEdition(shown[(at + (e.key === 'ArrowRight' ? 1 : -1) + shown.length) % shown.length]);
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
rovingKeys($('formatSeg'));
mountTune(store, $('pane-light'));

// ---------- Fine-tune: closed until asked for, then four tabs ----------

const adjustToggle = $<HTMLButtonElement>('adjustToggle');
const tabBar = $('panelTabs');
let rangeChanged = false;

/** Whether anything in a tab differs from the defaults; the tab then carries a dot. */
function tabChanged(id: PanelTab): boolean {
  const s = store.get();
  if (id === 'card') return s.intensity !== 1 || s.pixel !== 0 || s.frame !== 'paper' || !!s.frameColor;
  if (id === 'light') return changedKeys(s.tune).length > 0;
  if (id === 'text') return JSON.stringify(s.text) !== JSON.stringify(DEFAULT_LETTERING);
  return rangeChanged;
}

function buildTabs() {
  tabBar.textContent = '';
  tabBar.setAttribute('aria-label', t.adjust);
  for (const id of PANEL_TABS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tab';
    b.id = `tab-${id}`;
    b.dataset.tab = id;
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-controls', `pane-${id}`);
    b.innerHTML = '<span></span><i class="tab-dot" hidden></i>';
    b.firstElementChild!.textContent = t.tabs[id];
    b.onclick = () => {
      if (store.get().panelTab === id) return;
      sfx.tick();
      store.set({ panelTab: id });
      revealTabs();
    };
    tabBar.appendChild(b);
    $(`pane-${id}`).setAttribute('aria-labelledby', b.id);
  }
  syncAdjust();
}

tabBar.addEventListener('keydown', (e) => {
  const i = PANEL_TABS.indexOf(store.get().panelTab);
  const n = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: PANEL_TABS.length - 1 }[e.key];
  if (n === undefined) return;
  e.preventDefault();
  const id = PANEL_TABS[(n + PANEL_TABS.length) % PANEL_TABS.length];
  sfx.tick();
  store.set({ panelTab: id });
  $(`tab-${id}`).focus();
  revealTabs();
});

/** Scrolls so the Fine-tune row and its tabs sit at the top, giving the tab the panel's whole height. */
function revealTabs() {
  const behavior: ScrollBehavior = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  requestAnimationFrame(() => {
    const panel = $('panel');
    const top = $('adjust').getBoundingClientRect().top;
    // The panel scrolls on its own beside the stage; on phones the page does.
    if (getComputedStyle(panel).overflowY === 'visible') window.scrollBy({ top, behavior });
    else panel.scrollBy({ top: top - panel.getBoundingClientRect().top, behavior });
  });
}

function syncAdjust() {
  // The range tab reports in while it is still being built, before the tabs exist.
  if (!tabBar.children.length) return;
  const s = store.get();
  adjustToggle.setAttribute('aria-expanded', String(s.adjustOpen));
  $('adjustBody').hidden = !s.adjustOpen;
  $('adjust').classList.toggle('is-open', s.adjustOpen);
  const changed = PANEL_TABS.filter(tabChanged);
  for (const id of PANEL_TABS) {
    const b = $(`tab-${id}`);
    const on = s.panelTab === id;
    b.setAttribute('aria-selected', String(on));
    b.tabIndex = on ? 0 : -1;
    b.querySelector<HTMLElement>('.tab-dot')!.hidden = !changed.includes(id);
    b.title = changed.includes(id) ? t.adjustChanged.replace('{list}', t.tabs[id]) : '';
    $(`pane-${id}`).hidden = !on;
  }
  $('cardTools').hidden = !changed.includes('card');
  const summary = $('adjustSummary');
  summary.textContent = changed.length
    ? t.adjustChanged.replace('{list}', changed.map((id) => t.tabs[id]).join(s.lang === 'ja' ? '・' : ', '))
    : t.adjustSub;
  summary.classList.toggle('is-changed', changed.length > 0);
}

$('cardReset').addEventListener('click', () => {
  sfx.tick();
  store.set({ intensity: 1, pixel: 0, frame: 'paper', frameColor: '' });
});

// The tabs pin right under the pinned Fine-tune row, however tall its summary wraps.
new ResizeObserver(([e]) =>
  document.documentElement.style.setProperty('--adjust-row-h', `${Math.round(e.borderBoxSize[0].blockSize)}px`),
).observe(adjustToggle);

adjustToggle.addEventListener('click', () => {
  sfx.tick();
  const open = !store.get().adjustOpen;
  store.set({ adjustOpen: open });
  if (open) revealTabs();
});

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
    layers: depth?.current(),
  };
}

/** Lets GIF and APNG exports step through the person's animated GIF frame by frame. */
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

const saveBtn = $<HTMLButtonElement>('saveBtn');

function buildFormats() {
  const fs = $('formatSeg');
  fs.textContent = '';
  fs.setAttribute('aria-label', t.formatLabel);
  for (const f of EXPORT_FORMATS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'seg-btn';
    b.dataset.format = f;
    b.setAttribute('role', 'radio');
    b.textContent = t.format[f];
    radio(b, store.get().exportFormat === f);
    b.disabled = saveBtn.hasAttribute('aria-busy');
    b.onclick = () => {
      if (store.get().exportFormat === f) return;
      sfx.tick();
      store.set({ exportFormat: f });
    };
    fs.appendChild(b);
  }
}

/** The Save button names what it will write; APNG adds its size and length (see anim/apngUi). */
function renderSave() {
  if (saveBtn.hasAttribute('aria-busy')) return;
  const f = store.get().exportFormat;
  saveBtn.dataset.format = f;
  if (f === 'apng') return apngExport.refresh();
  saveBtn.querySelector('.btn-text b')!.textContent = t.save.replace('{f}', t.format[f]);
  saveBtn.querySelector('.btn-text small')!.textContent = f === 'gif' && store.get().gifClear ? t.saveSubGifClear : t.saveSub[f];
  for (const el of saveBtn.querySelectorAll('.save-meta > *')) el.textContent = '';
  saveBtn.removeAttribute('title');
}

// GIF options: closed until asked for; the defaults keep the swirl backdrop.
const MATTES = ['auto', '#ffffff', '#000000'];

function buildSaveOpts() {
  const s = store.get();
  $('saveOpts').hidden = s.exportFormat !== 'gif';
  $('saveOptsToggle').setAttribute('aria-expanded', String(s.saveOptsOpen));
  $('saveOptsBody').hidden = !s.saveOptsOpen;
  $('saveOpts').classList.toggle('is-open', s.saveOptsOpen);
  $('saveOptsSummary').textContent = `${t.gifBg}: ${s.gifClear ? t.gifBgName.clear : t.gifBgName.swirl}`;
  const bg = $('gifBgSeg');
  bg.textContent = '';
  for (const clear of [false, true]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'seg-btn';
    b.dataset.v = clear ? 'clear' : 'swirl';
    b.setAttribute('role', 'radio');
    b.textContent = clear ? t.gifBgName.clear : t.gifBgName.swirl;
    radio(b, s.gifClear === clear);
    b.onclick = () => {
      if (store.get().gifClear === clear) return;
      sfx.tick();
      store.set({ gifClear: clear });
      revealSaveOpts();
    };
    bg.appendChild(b);
  }
  $('matteField').hidden = !s.gifClear;
  $('gifClearNote').hidden = !s.gifClear;
  const ms = $('matteSeg');
  ms.textContent = '';
  const custom = !MATTES.includes(s.gifMatte);
  for (const m of [...MATTES, 'custom']) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `matte-sw matte-${m === 'auto' || m === 'custom' ? m : m === '#ffffff' ? 'white' : 'black'}`;
    b.setAttribute('role', 'radio');
    b.dataset.v = m;
    const name = t.matteName[m];
    const help = t.matteHelp[m === 'auto' ? 'auto' : m === '#ffffff' ? 'white' : m === '#000000' ? 'black' : 'custom'];
    b.setAttribute('aria-label', name);
    b.title = `${name} — ${help}`;
    if (m === 'auto') b.textContent = name;
    if (m === 'custom' && custom) b.style.setProperty('--sw', s.gifMatte);
    b.classList.toggle('is-set', m === 'custom' && custom);
    radio(b, m === 'custom' ? custom : s.gifMatte === m);
    b.onclick = () => {
      sfx.tick();
      if (m !== 'custom') return store.set({ gifMatte: m });
      const picker = $<HTMLInputElement>('mattePicker');
      picker.value = custom ? s.gifMatte : '#7f8c8d';
      store.set({ gifMatte: picker.value });
      try {
        picker.showPicker();
      } catch {
        picker.click();
      }
    };
    ms.appendChild(b);
  }
}

$('saveOptsToggle').addEventListener('click', () => {
  sfx.tick();
  const open = !store.get().saveOptsOpen;
  store.set({ saveOptsOpen: open });
  if (open) revealSaveOpts();
});

/** The options open under the pinned Save button; bring all of them up above it. */
function revealSaveOpts() {
  const behavior: ScrollBehavior = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  requestAnimationFrame(() => $('saveOptsBody').scrollIntoView({ block: 'nearest', behavior }));
}
$<HTMLInputElement>('mattePicker').addEventListener('input', (e) => store.set({ gifMatte: (e.target as HTMLInputElement).value }));
$('toApng').addEventListener('click', () => {
  sfx.tick();
  store.set({ exportFormat: 'apng' });
  saveBtn.focus();
});
rovingKeys($('gifBgSeg'));
rovingKeys($('matteSeg'));

/** While a job runs, the sub-label names the step and the title counts up; the button fills like a bar. */
async function busy(label: string, job: (progress: (p: number) => void) => Promise<string>, fail = t.errDecode) {
  const b = saveBtn.querySelector('.btn-text b')!;
  const small = saveBtn.querySelector('.btn-text small')!;
  // One export at a time: the button, the format choice and the APNG shortcut rest while this one works.
  saveBtn.disabled = true;
  saveBtn.setAttribute('aria-busy', 'true');
  $<HTMLButtonElement>('toApng').disabled = true;
  buildFormats();
  small.textContent = label;
  const progress = (p: number) => {
    b.textContent = `${Math.round(p * 100)}%`;
    saveBtn.style.setProperty('--p', p.toFixed(3));
  };
  let saved = '';
  try {
    const file = await job(progress);
    sfx.coin();
    announce(`${t.saved}: ${file}`);
    saved = file;
  } catch (err) {
    console.error(err);
    sfx.error();
    toast(fail, true);
  } finally {
    saveBtn.removeAttribute('aria-busy');
    // A picture still loading keeps Save resting; the format buttons are rebuilt, not the old ones re-enabled.
    saveBtn.disabled = store.get().loading;
    $<HTMLButtonElement>('toApng').disabled = false;
    buildFormats();
    saveBtn.style.removeProperty('--p');
    // From the current dictionary, in case the language changed mid-export.
    renderSave();
    if (saved) celebrate(saved);
  }
}

/** A saved card is a pulled card: it hops, sheds sparks in its finish's colour, and Save shines once. */
let celebrateTimer = 0;
function celebrate(file: string) {
  stage.juice(0.6);
  stage.burst(editionById(store.get().edition).color);
  saveBtn.classList.remove('is-saved');
  void saveBtn.offsetWidth;
  saveBtn.classList.add('is-saved');
  saveBtn.querySelector('.btn-text b')!.textContent = `${t.savedShort} ✓`;
  saveBtn.querySelector('.btn-text small')!.textContent = file;
  clearTimeout(celebrateTimer);
  celebrateTimer = window.setTimeout(() => {
    saveBtn.classList.remove('is-saved');
    renderSave();
  }, 2400);
}

saveBtn.addEventListener('click', () => {
  const f = store.get().exportFormat;
  // One export at a time, and not while a picture is loading (APNG handles its own button, incl. stop).
  if (f !== 'apng' && (saveBtn.hasAttribute('aria-busy') || store.get().loading)) return;
  if (f === 'png') void busy(t.saving, () => exportPng(exportInput()), t.errPng);
  else if (f === 'gif') {
    const small = saveBtn.querySelector('.btn-text small')!;
    void busy(
      t.saving,
      (progress) =>
        exportGif(
          exportInput(),
          (p, encoding) => {
            small.textContent = encoding ? t.encoding : t.saving;
            progress(p);
          },
          { clear: store.get().gifClear, matte: store.get().gifMatte },
        ),
      t.errGif,
    );
  }
  // APNG runs from its own module, which also handles stopping it.
});

// Before the APNG export: its first refresh already reads the export input, which includes the range.
const rangeColors = initRangeColors({
  store,
  stage,
  t: () => t,
  announce,
  redrawFace,
  rebuildFrames: buildSegments,
  onRangeChanged: (changed) => {
    if (changed === rangeChanged) return;
    rangeChanged = changed;
    syncAdjust();
  },
});
const apngExport = mountApngExport({
  btn: saveBtn,
  active: () => store.get().exportFormat === 'apng',
  loading: () => store.get().loading,
  lang: () => store.get().lang,
  input: exportInput,
  toast: (msg, error) => toast(msg, error),
  onSaved: (file) => celebrate(file),
  sfx,
});

// ---------- Packs ----------

/** Opens a sealed pack, or replays an opened one. The opening's code and the pack's finishes load now. */
let opening = false;
function openPack(pack: Pack, from: DOMRect) {
  if (opening) return;
  opening = true;
  const chip = document.querySelector<HTMLElement>(`.pk-chip[data-pack="${pack.id}"]`);
  chip?.setAttribute('aria-busy', 'true');
  const replay = packs.isOpened(pack.id);
  const finishes = loadPack(pack.id);
  void import('./pack/opening')
    .then((m) =>
      m.openPack({
        pack,
        from,
        replay,
        dict: t,
        face,
        mask,
        back,
        tune: store.get().tune,
        intensity: store.get().intensity,
        finishes,
        pause: (on) => stage.pause(on),
        onOpened: () => packs.open(pack.id),
        onClose: (pick) => {
          opening = false;
          // A pack just opened becomes the folder in the hand; a pick also goes on the card. Closed
          // before the tear, it stays sealed and nothing changes.
          if (packs.isOpened(pack.id) && (!replay || pick)) store.set({ folder: pack.id });
          if (packs.isOpened(pack.id) && !replay) {
            shelfUi.greet(pack.id);
            toast(t.pack.folded.replace('{name}', t.pack.name[pack.id]));
          }
          if (pick && pick !== store.get().edition) stage.flipTo(() => selectEdition(pick));
          shelfUi.focus(pack.id);
        },
      }),
    )
    .catch(() => {
      opening = false;
      toast(t.pack.failed, true);
    })
    .finally(() => chip?.removeAttribute('aria-busy'));
}

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
    const others = hand().filter((id) => id !== store.get().edition);
    selectEdition(others[Math.floor(Math.random() * others.length)]);
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

// The Export bar is sticky and grows with its options; docked controls sit above it.
const exportSec = document.querySelector<HTMLElement>('.sec-export')!;
new ResizeObserver(([e]) =>
  document.documentElement.style.setProperty('--export-h', `${Math.round(e.borderBoxSize[0].blockSize)}px`),
).observe(exportSec);

/** Toasts rise from just above the Export bar, wherever it is now, so they never cover Save. */
function placeToasts() {
  const top = exportSec.getBoundingClientRect().top;
  const bottom = Math.max(12, Math.min(innerHeight - top + 12, innerHeight - 160));
  $('toasts').style.bottom = `${Math.round(bottom)}px`;
}
new ResizeObserver(placeToasts).observe($('panel'));
$('panel').addEventListener('scroll', placeToasts, { passive: true });
addEventListener('scroll', placeToasts, { passive: true });
addEventListener('resize', placeToasts);

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
// A picture that can't be read is said right under the pick button (beside the stage); phones,
// whose panel is far below, get a toast instead.
function showImageError(msg: string) {
  const box = $('imageError');
  box.querySelector('p')!.textContent = msg;
  box.hidden = false;
  $('imageErrorPick').focus({ preventScroll: true });
}
function hideImageError() {
  const box = $('imageError');
  if (box.hidden) return;
  box.hidden = true;
  if (box.contains(document.activeElement)) $('pickBtn').focus({ preventScroll: true });
}
$('imageErrorPick').addEventListener('click', () => {
  sfx.tick();
  fileInput.click();
});
$('imageErrorClose').addEventListener('click', () => {
  sfx.tick();
  hideImageError();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') hideImageError();
});

function toast(msg: string, error = false, pick = false) {
  if (pick && !matchMedia('(max-width: 900px)').matches) return showImageError(msg);
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
    wakePacks();
    depth?.update(face, artKey());
  }
  if (changed.has('folder')) {
    wakePacks();
    stage.syncHand();
  }
  if (changed.has('rarity') || changed.has('frame')) buildSegments();
  if (['name', 'rarity', 'frame', 'crop'].some((k) => changed.has(k as keyof State)) && !changed.has('sample')) {
    redrawFace();
  }
  if (changed.has('crop')) positionCropWindow();
  if (['rarity', 'edition', 'sample'].some((k) => changed.has(k as keyof State))) renderInfo();
  if (changed.has('sample')) syncInputs();
  if (['intensity', 'pixel', 'crop', 'sound', 'crt'].some((k) => changed.has(k as keyof State))) syncInputs();
  if (changed.has('exportFormat')) buildFormats();
  if (['exportFormat', 'saveOptsOpen', 'gifClear', 'gifMatte'].some((k) => changed.has(k as keyof State))) {
    buildSaveOpts();
    renderSave();
  }
  syncAdjust();
  if (changed.has('sound') || changed.has('crt')) {
    $('soundBtn').setAttribute('aria-label', s.sound ? t.soundOn : t.soundOff);
    $('crtBtn').setAttribute('aria-label', s.crt ? t.crtOn : t.crtOff);
  }
});

// ---------- Boot ----------

setSound(store.get().sound);
mountLettering({
  store,
  host: $('pane-text'),
  open: () => store.set({ adjustOpen: true, panelTab: 'text' }),
  dict: () => t,
  name: () => store.get().name || fallback().name,
  repaint: () => redrawFace(),
  onPick: () => stage.juice(0.35),
  tag: document.querySelector<HTMLElement>('#info .info-box') ?? undefined,
});
applyText();
initPackStore(store);
packs.on(() => stage.syncHand());
wakePacks();
const shelfUi = mountShelf({
  host: $('shelf'),
  store,
  dict: () => t,
  onOpen: (p, from) => openPack(p, from),
  onPrefetch: (p) => {
    loadPack(p.id).catch(() => {});
    void import('./pack/opening');
  },
});
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
