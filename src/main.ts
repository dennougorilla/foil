import './style.css';
import './tag.css';
import { cardOf, CARD_KEYS, CARD_TYPE_MAX, cleanCard, createStore, EXPORT_FORMATS, PANEL_TABS, type PanelTab, type State } from './state';
import { dictOf, loadDict, type Dict } from './i18n';
import { FRAMES, RARITIES, editionById, rarityById, type EditionId } from './editions';
import { canPaint, clampCrop, cropRect, drawFace, drawFlip, faceArt, loadTcgFace, type Crop } from './card/face';
import { backUrl, drawBack } from './card/back';
import { exportFrame, fitArea, shapeById, SHAPES } from './card/shape';
import { CARD_LAYOUTS } from './card/tcg';
import type { PrintPop } from './printPop';
import type { TextRun } from './lettering';
import type { ShadowDepth } from './depth/shadowDepth';
import { paintSample, SAMPLE_COUNT } from './samples';
import { Stage } from './stage';
import { setSound, sfx } from './audio';
import { GIF_SAVE, GIF_SHARE } from './exportSize';
import { forgetUserImage, loadUserImage, saveUserImage } from './imageStore';
import { animKind, frameAt, type Anim } from './anim/anim';
import { apngPlan } from './anim/apngPlan';
import { mountApngExport } from './anim/apngUi';
import { mountLetteringJump } from './letteringJump';
import { bindMessageField } from './messageField';
import { loadMessageFont, messageFonts } from './card/messageFace';
import { MESSAGE_FACES } from './message';
import { changedKeys, EXPORT_MOTIONS, type ExportMotion } from './tune/model';
import { DEFAULT_LETTERING, fieldAt, setFieldPrints, setTextRuns } from './lettering';
import { initAreas } from './areas';
import { layerDraw } from './layers';
import type { Adjust } from './adjust';
import { mountProof } from './proof';
import { stepIn } from './handStep';
import { initPackStore, packs, releaseSealedEdition } from './packStore';
import { addToHand, available, firstSealed, normalizeHand, OPEN_EDITIONS, ownedGroups, packOf, shelf } from './packs';
import { loadPack } from './gl/finishes/registry';
import { mountDeck } from './deck';
import { mountQuickMotion } from './tune/quick';
import type { Kept } from './binder/db';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

/** The finish of the earlier "drawn card" slot, read before the store rewrites its save (see docs/packs.md). */
const legacyDrawn = (() => {
  try {
    const v = JSON.parse(localStorage.getItem('foil:v1') ?? '{}') as { drawn?: unknown; hand?: unknown };
    return v.hand ? null : (v.drawn as EditionId | undefined) ?? null;
  } catch {
    return null;
  }
})();
const store = createStore();
// Fine-tune left open last visit opens again once its tabs are here (see openAdjust), never empty.
const reopenAdjust = store.get().adjustOpen;
if (reopenAdjust) store.set({ adjustOpen: false });
releaseSealedEdition(store);
/** The hand: seven cards, in their order. */
const hand = () => store.get().hand;
const dict = loadDict(store.get().lang);

// ---------- Stage ----------

// The stage comes first: its shaders compile in the background while the rest of the page is built.
// Its hand and card answer only once the page is (`booted`, at the end of this module).
let booted = false;
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
    onSelect: (id) => booted && selectEdition(id),
    onHover: (id) => booted && renderCaption(id),
    onFlick: (dir) => {
      if (!booted) return;
      store.set({ flicked: true });
      stepEdition(dir);
    },
    // Tapping words on the card opens their own print.
    onTapCard: (uv, x, y) => {
      const field = booted && fieldAt(uv);
      if (field) void usePrint().then((p) => p.open(field, { x, y }), () => toast(t.loadFailed, true));
    },
    handIds: hand,
    deckRect: () => document.getElementById('deckBtn')?.getBoundingClientRect() ?? null,
  });
} catch (err) {
  console.error(err);
  const fatal = $('fatal');
  fatal.hidden = false;
  fatal.textContent = (await dict).errGl;
  throw err;
}
let t: Dict = await dict;
// A trading card from last visit: its painter is fetched at once.
if (store.get().layout === 'tcg') void loadTcgFace().catch(() => {});

// ---------- Images ----------

type Img = HTMLCanvasElement;
const samples: Img[] = Array.from({ length: SAMPLE_COUNT }, (_, i) => paintSample(i));
let userImage: Img | null = null;
/** Set when the person's image is an animated GIF; userImage then holds its first frame. */
let userAnim: Anim | null = null;
/** The person's picture as it came (kept in the binder as is while it moves). */
let userSource: Blob | null = null;
let animFrame = 0;
const currentImage = (): Img => {
  const s = store.get();
  if (s.sample >= 0) return samples[s.sample];
  if (userAnim) return userAnim.frames[animFrame] ?? userAnim.frames[0];
  return userImage ?? samples[0];
};

// Animated pictures: advance the card face whenever the next frame is due, for as long as there is one.
let framesPlaying = false;
function playFrames() {
  if (framesPlaying || !userAnim) return;
  framesPlaying = true;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const tick = (now: number) => {
    if (!userAnim) return void (framesPlaying = false);
    if (store.get().sample < 0 && !reduced.matches) {
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

const face = document.createElement('canvas');
const mask = document.createElement('canvas');
const back = document.createElement('canvas');
drawBack(back, store.get().shape);
// Face-down cards drawn by the page (the deck's pile, a card still being dealt) wear the same back.
document.documentElement.style.setProperty('--card-back', `url(${backUrl()})`);

stage.cards.setBack(back);
// Shadowbox and 3D Lenticular read the art's depth; its code loads the first time one is chosen.
let depth: ShadowDepth | null = null;
let depthLoading = false;
function wakeDepth() {
  if (depth || depthLoading || !editionById(store.get().edition).depth) return;
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
  })
    .catch((err) => console.error(err))
    // A failed fetch (offline) is tried again the next time a depth finish is chosen.
    .finally(() => (depthLoading = false));
}

/** Fetches the packs of the finishes on the card (both layers) and of the hand's cards; they deal in once ready. */
function wakePacks() {
  const s = store.get();
  const ids = [s.edition, ...s.hand, ...(s.layer2 ? [s.layer2.edition] : [])];
  for (const id of new Set(ids.map((e) => packOf(e)?.id))) if (id) loadPack(id).catch(() => toast(t.pack.failed, true));
  wakeDepth();
}
const artIds = new WeakMap<object, number>();
let artCount = 0;
/** Names the art in the window (picture, layout and crop), so depth is read once per art. */
function artKey() {
  const s = store.get();
  const src: object = s.sample >= 0 ? samples[s.sample] : (userAnim ?? userImage ?? samples[0]);
  if (!artIds.has(src)) artIds.set(src, ++artCount);
  const a = faceArt(s);
  return `${artIds.get(src)}:${a.x},${a.y},${a.w},${a.h}:${s.crop.zoom},${s.crop.x},${s.crop.y}`;
}

function faceSpec(image: Img) {
  const s = store.get();
  return { image, crop: s.crop, frame: s.frame, rarity: s.rarity, name: s.name || fallback().name, frameColor: s.frameColor, shape: s.shape, message: s.message, plate: s.plate, layout: s.layout, cardType: s.cardType, arrange: s.arrange, placements: s.placements };
}

/** Changes whenever the face is repainted: View deck's cached mini cards are remade after it. */
let faceVersion = 0;
const thumbKey = () => `${faceVersion}|${JSON.stringify(store.get().tune)}|${store.get().intensity}`;

/** The message's typeface and words last asked for; the face is painted again once they can be drawn. */
let fontAsked = '';

/** The text the face last painted (Free placement starts each piece where it was). */
let lastRuns: TextRun[] = [];

/** A repaint waits for the trading card's painter (one, however many redraws ask meanwhile). */
let paintWaiting = false;

function redrawFace() {
  const spec = faceSpec(currentImage());
  // A trading card's painter comes with its first use; the face is painted once it is here.
  if (!canPaint(spec)) {
    if (paintWaiting) return;
    paintWaiting = true;
    return void loadTcgFace()
      .then(redrawFace, () => toast(t.loadFailed, true))
      .finally(() => (paintWaiting = false));
  }
  faceVersion++;
  lastRuns = drawFace(face, mask, spec);
  setTextRuns(face.width, face.height, lastRuns);
  const { font, text } = spec.message;
  const ask = text.trim() ? `${font}|${text}` : '';
  if (ask && ask !== fontAsked) void loadMessageFont(font, text).then(() => fontAsked === ask && redrawFace());
  fontAsked = ask;
  stage.cards.setFace(face, mask);
  areas.onFace(face, mask, spec);
  depth?.update(face, artKey());
}

// ---------- Text ----------

/** "v0.2.0 · 1a2b3c4", shown quietly at the foot of the support menu. */
const APP_VERSION_LABEL = __APP_COMMIT__ === 'unknown' ? `v${__APP_VERSION__}` : `v${__APP_VERSION__} · ${__APP_COMMIT__}`;

/** Placeholder name: samples carry their own, uploads get a generic one. */
function fallback() {
  const i = store.get().sample;
  return { name: i >= 0 ? t.samplesName[i] : t.myCard };
}

function applyText() {
  const s = store.get();
  t = dictOf(s.lang);
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
  for (const [id, label] of [['handPrev', t.prevFinish], ['handNext', t.nextFinish]]) {
    $(id).setAttribute('aria-label', label);
    $(id).title = label;
  }
  $('hand').title = t.handHint;
  stage.setHandLabels(t.edition, t.look);
  // Written into the fade above the Save box when more of the panel waits below.
  $('panel').style.setProperty('--more-text', JSON.stringify(t.moreBelow));
  $('cropView').setAttribute('aria-label', t.cropHint);
  $('cropView').title = t.cropHint;
  // Paste is ⌘V on Apple keyboards; taps, not clicks, on touch screens.
  const pasteKey = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘V' : 'Ctrl+V';
  $('pickBtn').querySelector('small')!.textContent = t.pickSub.replace('Ctrl+V', pasteKey);
  $('pickBtn').title = t.pickSub.replace('Ctrl+V', pasteKey);
  renderCardHint();
  buildSegments();
  buildThumbs();
  buildTabs();
  buildFormats();
  buildSaveOpts();
  renderSave();
  renderShare();
  renderKeep();
  renderBinderChip();
  syncInputs();
  renderInfo();
  renderCaption(null);
}

/** The hint under the tag beside the card: taps rather than clicks on touch screens, and what Free does while it is on. */
function renderCardHint() {
  const touch = matchMedia('(pointer: coarse)').matches;
  const words = store.get().arrange === 'free' ? t.arrange : t;
  document.querySelector('#info .card-hint')!.textContent = touch ? words.cardHintTouch : words.cardHint;
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
  pe.classList.toggle('is-light', ['foil', 'gold', 'prism', 'glitch', 'relief', 'kintsugi', 'opal', 'confetti', 'fireworks'].includes(s.edition));
  document.documentElement.style.setProperty('--accent', ed.id === 'base' ? '#ff5a4f' : ed.color);
  // The panel names the finish on the card (beside a live proof of it) and points to the hand where it is picked.
  $('finishName').textContent = t.edition[s.edition];
  $('finishLook').textContent = t.look[s.edition];
  $('recapFinishName').textContent = t.edition[s.edition];
  $('finishPick').setAttribute('aria-label', t.finishPick);
  $('finishPick').title = matchMedia('(max-width: 900px)').matches ? t.finishPickHintPhone : t.finishPickHint;
  renderFlip();
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
    rim: '#fbf7ee',
    ribbon: '#f3eee2',
  };
  for (const f of FRAMES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'seg-btn';
    b.setAttribute('role', 'radio');
    b.innerHTML = `<span class="swatch" data-frame="${f}" style="--sw:${swatch[f]}"></span><span></span>`;
    b.lastElementChild!.textContent = t.frameName[f];
    radio(b, s.frame === f);
    b.onclick = () => {
      sfx.tick();
      store.set({ frame: f });
    };
    fs.appendChild(b);
  }
  adjust?.decorateFrames(fs);
  const ss = $('shapeSeg');
  ss.textContent = '';
  for (const sh of SHAPES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'seg-btn';
    b.setAttribute('role', 'radio');
    b.dataset.shape = sh.id;
    // A small outline of the shape, at the area of the trading card's.
    const { w, h } = fitArea(sh.h / sh.w, 18);
    b.innerHTML = `<span class="shape-ico" style="--w:${w.toFixed(1)}px;--h:${h.toFixed(1)}px"></span><span></span>`;
    b.lastElementChild!.textContent = t.shapeName[sh.id];
    b.title = `${t.shapeName[sh.id]} · ${sh.size}`;
    radio(b, s.shape === sh.id);
    b.onclick = () => {
      sfx.tick();
      store.set({ shape: sh.id });
      stage.juice(0.4);
    };
    ss.appendChild(b);
  }
  const ls = $('layoutSeg');
  ls.textContent = '';
  for (const id of CARD_LAYOUTS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'seg-btn';
    b.dataset.v = id;
    b.setAttribute('role', 'radio');
    // A tiny card drawn in each layout's parts.
    b.innerHTML = '<i class="layout-icon" aria-hidden="true"><i></i><i></i><i></i></i><span></span>';
    b.lastElementChild!.textContent = t.tcg.layoutName[id];
    radio(b, s.layout === id);
    b.onclick = () => {
      if (store.get().layout === id) return;
      sfx.tick();
      stage.flipTo(() => store.set({ layout: id }));
    };
    ls.appendChild(b);
  }
}

/** The card takes a new shape: its slot, its back, the crop window and every face follow. */
function applyShape() {
  const sh = shapeById(store.get().shape);
  // The slot holds the card at the trading card's area (shape.ts fitArea); CSS reads these.
  const k = fitArea(sh.h / sh.w, 1);
  const root = document.documentElement.style;
  root.setProperty('--card-ar', `${sh.w} / ${sh.h}`);
  root.setProperty('--card-kw', k.w.toFixed(4));
  root.setProperty('--card-kh', k.h.toFixed(4));
  drawBack(back, sh.id);
  stage.cards.setBack(back);
  if (flipImage) setFlip(flipImage);
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
  // While a sample shows, opening your own picture is the loud step; once it is yours, Save is.
  $('panel').dataset.picture = s.sample >= 0 ? 'sample' : 'own';
  $('recapThumb').style.backgroundImage = `url(${thumbUrl(currentImage())})`;
  $('recapImageName').textContent = s.sample >= 0 ? t.samplesName[s.sample] : t.yourImage;
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
  const msg = $<HTMLTextAreaElement>('messageInput');
  if (document.activeElement !== name) name.value = s.name;
  syncMessageInput();
  name.placeholder = fallback().name;
  const tcg = s.layout === 'tcg';
  msg.placeholder = tcg ? t.msg.effectTag : t.msg.tag;
  // The words being typed (in the tag and in the Lettering tab) take the card's typeface.
  if (s.message.text.trim()) {
    void messageFonts();
    const f = MESSAGE_FACES[s.message.font];
    document.documentElement.style.setProperty('--msg-font', `${f.weight} 1em "${f.family}", ${f.fallback}`);
  } else document.documentElement.style.removeProperty('--msg-font');
  const type = $<HTMLInputElement>('typeInput');
  type.hidden = !tcg;
  if (document.activeElement !== type) type.value = s.cardType;
  type.placeholder = t.tcg.typeTag;
  type.setAttribute('aria-label', t.tcg.type);
  name.setAttribute('aria-label', t.name);
  // Off, the name stays in the tag but is not printed: it steps back.
  name.classList.toggle('is-off', !s.plate);
  msg.setAttribute('aria-label', t.msg.title);
  $('info').classList.toggle('is-tcg', tcg);
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
  const r = cropRect(img.width, img.height, store.get().crop, artAspect());
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

/** Width / height of the art window the crop fills (the layout's). */
function artAspect() {
  const a = faceArt(store.get());
  return a.w / a.h;
}

function setCrop(c: Crop) {
  const img = currentImage();
  store.set({ crop: clampCrop(img.width, img.height, c, artAspect()) });
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
    const { decodeGif } = await import('./gifDecode');
    const anim = decodeGif(await blob.arrayBuffer());
    if (anim) return { still: anim.frames[0], anim };
  }
  if (/^image\/(a?png|webp)$/.test(blob.type)) {
    const { decodeAnimated } = await import('./anim/apngDecode');
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
    const apng = file.type ? null : await import('./anim/apngDecode').then((m) => m.asTypedApng(file));
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
    userSource = file;
    animFrame = 0;
    playFrames();
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
    pickLabel.textContent = t.pickFile;
    $('pickBtn').removeAttribute('aria-busy');
    if (!saveBtn.hasAttribute('aria-busy')) saveBtn.disabled = false;
  }
}

function useImage(idx: number) {
  const s = store.get();
  const patch: Partial<State> = { sample: idx, crop: { zoom: 1, x: 0.5, y: 0.5 } };
  if (idx >= 0) {
    if (!s.nameEdited) patch.name = '';
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

// ---------- Flip Lenticular's other picture ----------

const flip = document.createElement('canvas');
/** The picture Flip Lenticular flips to; null draws the front picture in pencil instead. */
let flipImage: Img | null = null;
/** Someone chose or removed the picture during this visit. */
let flipChosen = false;

function setFlip(img: Img | null) {
  flipImage = img;
  if (img) drawFlip(flip, img, store.get().shape, faceArt(store.get()));
  stage.cards.setFlip(img ? flip : null);
  renderFlip();
}

/** One quiet row under the finish, shown only while Flip Lenticular is on the card. */
function renderFlip() {
  const s = store.get();
  $('flipRow').hidden = s.edition !== 'lenticularflip';
  const front = s.sample >= 0 ? samples[s.sample] : (userImage ?? samples[0]);
  const thumb = $('flipThumb');
  thumb.style.backgroundImage = `url(${thumbUrl(flipImage ?? front)})`;
  thumb.classList.toggle('is-auto', !flipImage);
  $('flipNow').textContent = flipImage ? t.flipOwn : t.flipAuto;
  $('flipClear').hidden = !flipImage;
  $('flipPick').setAttribute('aria-label', t.flipPickLabel);
  $('flipClear').setAttribute('aria-label', t.flipClearLabel);
}

const flipInput = $<HTMLInputElement>('flipInput');
$('flipPick').addEventListener('click', () => flipInput.click());
flipInput.addEventListener('change', async () => {
  const f = flipInput.files?.[0];
  flipInput.value = '';
  if (!f) return;
  if (!ACCEPT.test(f.type)) {
    toast(t.errType.replace('{name}', f.name), true);
    return;
  }
  try {
    // An animated picture flips to its first frame.
    const { still } = await decodeImage(f);
    flipChosen = true;
    setFlip(still);
    void saveUserImage(still, 'flip');
    sfx.tick();
    stage.juice(0.35);
  } catch (err) {
    console.error(err);
    toast(t.errDecode, true);
  }
});
$('flipClear').addEventListener('click', () => {
  flipChosen = true;
  setFlip(null);
  void forgetUserImage('flip');
  sfx.tick();
});

// ---------- Edition ----------

/** Counts finish picks, so a pick queued earlier can tell it was overtaken. */
let picks = 0;
function selectEdition(id: EditionId) {
  picks++;
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

/** Steps to the next (1) or previous (-1) card the hand holds, whatever it holds right now. */
function stepEdition(dir: 1 | -1) {
  const id = stepIn(hand(), store.get().edition, dir);
  if (id) selectEdition(id);
}

/** The phone's note that a flick changes the finish: until the first flick, and not on a finish a
 *  finger strokes instead (see stage-phone.css). */
function syncFlickHint() {
  const s = store.get();
  const ed = editionById(s.edition);
  $('flickHint').hidden = s.flicked || !!ed.touch || !!ed.torch;
}
syncFlickHint();

// Phones step through the hand from beside the finish's name too (see stage-phone.css).
$('handPrev').addEventListener('click', () => stepEdition(-1));
$('handNext').addEventListener('click', () => stepEdition(1));

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
    stepEdition(e.key === 'ArrowRight' ? 1 : -1);
  }
});

// ---------- Inputs ----------

$<HTMLInputElement>('nameInput').addEventListener('input', (e) => {
  const v = (e.target as HTMLInputElement).value;
  store.set({ name: v, nameEdited: v.length > 0 });
});
const syncMessageInput = bindMessageField($<HTMLTextAreaElement>('messageInput'), store);
$<HTMLInputElement>('typeInput').maxLength = CARD_TYPE_MAX;
$<HTMLInputElement>('typeInput').addEventListener('input', (e) => store.set({ cardType: (e.target as HTMLInputElement).value }));
$<HTMLInputElement>('intensity').addEventListener('input', (e) => {
  store.set({ intensity: +(e.target as HTMLInputElement).value });
});
$<HTMLInputElement>('pixel').addEventListener('input', (e) => {
  store.set({ pixel: +(e.target as HTMLInputElement).value });
});
$('langBtn').addEventListener('click', () => {
  sfx.tick();
  // The other language's texts arrive first; then everything changes at once.
  const next = store.get().lang === 'ja' ? 'en' : 'ja';
  loadDict(next).then(
    () => store.set({ lang: next }),
    () => toast(t.loadFailed, true),
  );
});
// Fetched ahead the moment the button is pointed at.
for (const ev of ['pointerenter', 'focus']) $('langBtn').addEventListener(ev, () => void loadDict(store.get().lang === 'ja' ? 'en' : 'ja').catch(() => {}));
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
rovingKeys($('shapeSeg'));
rovingKeys($('layoutSeg'));
$('layoutSeg').addEventListener('pointerenter', () => void loadTcgFace().catch(() => {}), { once: true });
rovingKeys($('thumbs'));
rovingKeys($('formatSeg'));
mountProof($('finishProof'));
mountProof($('recapProof'));

// A folded step leads back to itself: Fine-tune closes, the step is brought into view and focus
// moves to the step's own button (the recap it was on folds away).
for (const [id, target] of [['recapImage', 'pickBtn'], ['recapFinish', 'finishPick']]) {
  $(id).addEventListener('click', () => {
    sfx.tick();
    store.set({ adjustOpen: false });
    $(target).focus({ preventScroll: true });
    requestAnimationFrame(() => $(id).closest('.sec')!.scrollIntoView({ block: 'nearest' }));
  });
}

// ---------- Fine-tune: closed until asked for, then four tabs ----------

const adjustToggle = $<HTMLButtonElement>('adjustToggle');
const tabBar = $('panelTabs');
let rangeChanged = false;

/** Whether anything in a tab differs from the defaults; the tab then carries a dot. */
function tabChanged(id: PanelTab): boolean {
  const s = store.get();
  if (id === 'card') return s.intensity !== 1 || s.pixel !== 0 || s.frame !== 'paper' || !!s.frameColor || s.shape !== 'card' || s.layout !== 'classic';
  if (id === 'light') return changedKeys(s.tune).length > 0;
  if (id === 'text')
    return JSON.stringify(s.text) !== JSON.stringify(DEFAULT_LETTERING) || !!s.message.text.trim() || !s.plate || Object.keys(s.prints).length > 0;
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

/** Scrolls to the top of the panel: the folded steps, the Fine-tune row and its tabs, then the tab itself. */
function revealTabs() {
  const behavior: ScrollBehavior = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  requestAnimationFrame(() => {
    const panel = $('panel');
    const top = panel.querySelector('.sec')!.getBoundingClientRect().top;
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
  // While tuning, steps 1 and 2 fold into one line each, so the tabs get the panel.
  $('panel').classList.toggle('is-tuning', s.adjustOpen);
  requestAnimationFrame(trackExportBar);
}

$('cardReset').addEventListener('click', () => {
  sfx.tick();
  store.set({ intensity: 1, pixel: 0, frame: 'paper', frameColor: '', shape: 'card', layout: 'classic' });
});

// The tabs pin right under the pinned Fine-tune row, however tall its summary wraps.
new ResizeObserver(([e]) =>
  document.documentElement.style.setProperty('--adjust-row-h', `${Math.round(e.borderBoxSize[0].blockSize)}px`),
).observe(adjustToggle);

adjustToggle.addEventListener('click', () => {
  sfx.tick();
  if (store.get().adjustOpen) return store.set({ adjustOpen: false });
  // A press while the tabs are on their way calls the opening off, as it would close Fine-tune.
  if (adjustPending) {
    adjustPending = false;
    adjustAsk++;
    return adjustToggle.removeAttribute('aria-busy');
  }
  // The tabs' code arrives first, so a tab never opens empty.
  void openAdjust().then((a) => a && revealTabs(), () => {});
});
for (const ev of ['pointerenter', 'focus']) adjustToggle.addEventListener(ev, () => void useAdjust().catch(() => {}), { once: true });

let adjust: Adjust | null = null;
let adjustLoad: Promise<Adjust> | null = null;
/** Fine-tune's tabs past Card (and the frame's own colours): their code and styles come on first use. */
function useAdjust(): Promise<Adjust> {
  if (!adjustLoad) {
    adjustLoad = Promise.all([import('./adjust'), usePrint()]).then(([m, print]) => {
      adjust = m.mountAdjust({ store, stage, areas, print, dict: () => t, announce, onPick: () => stage.juice(0.35), fallbackName: () => fallback().name });
      buildSegments();
      syncAdjust();
      return adjust;
    });
    adjustLoad.catch(() => (adjustLoad = null));
  }
  return adjustLoad;
}

/** Fine-tune was asked to open and its tabs are still on their way; each ask (and each call-off) has its own number. */
let adjustPending = false;
let adjustAsk = 0;

/**
 * Opens Fine-tune once its tabs are there (on `tab` when given), unless the opening was called off
 * meanwhile (then null); says so when they can't be fetched.
 */
function openAdjust(tab?: PanelTab): Promise<Adjust | null> {
  const ask = ++adjustAsk;
  adjustPending = true;
  adjustToggle.setAttribute('aria-busy', 'true');
  const ready = useAdjust().then((a) => {
    // A later ask, or a call-off, overrides this one.
    if (ask !== adjustAsk) return null;
    adjustPending = false;
    store.set(tab ? { adjustOpen: true, panelTab: tab } : { adjustOpen: true });
    return a;
  });
  ready
    .catch(() => {
      if (ask !== adjustAsk) return;
      adjustPending = false;
      toast(t.loadFailed, true);
    })
    .finally(() => adjustPending || adjustToggle.removeAttribute('aria-busy'));
  return ready;
}

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
    motion: s.exportMotion,
    name: s.name || fallback().name,
    ...(userAnim && s.sample < 0 ? animatedExport(userAnim) : {}),
    range: areas.snapshot(),
    layer: layerOf(s),
    layers: depth?.current(),
    flip: flipImage ? flip : undefined,
  };
}

/** Layer 2 as the exporter draws it, when the card has one. */
function layerOf(s: State) {
  const draw = layerDraw(s);
  return s.layer2 && draw ? { edition: editionById(s.layer2.edition), draw, range: areas.snapshot2() } : undefined;
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
    b.innerHTML = '<b></b><small></small>';
    b.firstElementChild!.textContent = t.format[f];
    b.lastElementChild!.textContent = t.formatKind[f];
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
  saveBtn.querySelector<HTMLElement>('.btn-text b')!.dataset.short = t.saveShort;
  if (f === 'apng') return apngExport.refresh();
  saveBtn.querySelector('.btn-text b')!.textContent = t.save.replace('{f}', t.format[f]);
  // The card's own size for a PNG; the GIF's frame turns with the shape.
  const sh = shapeById(store.get().shape);
  const gif = exportFrame(sh.h / sh.w, GIF_SAVE.w, GIF_SAVE.h);
  const size = f === 'png' ? `${sh.w}×${sh.h}` : `${gif.W}×${gif.H}`;
  saveBtn.querySelector('.btn-text small')!.textContent = (f === 'gif' && store.get().gifClear ? t.saveSubGifClear : t.saveSub[f]).replace('{size}', size);
  for (const el of saveBtn.querySelectorAll('.save-meta > *')) el.textContent = '';
  saveBtn.removeAttribute('title');
}

// GIF options: closed until asked for; the defaults keep the swirl backdrop.
const MATTES = ['auto', '#ffffff', '#000000'];

function buildSaveOpts() {
  const s = store.get();
  const gif = s.exportFormat === 'gif';
  $('saveOpts').hidden = s.exportFormat === 'png';
  $('saveOptsToggle').setAttribute('aria-expanded', String(s.saveOptsOpen));
  $('saveOptsBody').hidden = !s.saveOptsOpen;
  $('saveOpts').classList.toggle('is-open', s.saveOptsOpen);
  const motionName = (m: ExportMotion) => (m === 'stage' ? `${t.exportMotionName.stage} (${t.tune.idleMode[s.tune.idle]})` : t.exportMotionName[m]);
  $('saveOptsSummary').textContent = [`${t.exportMotion}: ${motionName(s.exportMotion)}`, ...(gif ? [`${t.gifBg}: ${s.gifClear ? t.gifBgName.clear : t.gifBgName.swirl}`] : [])].join(' · ');
  // The loop's motion, for GIF and APNG alike.
  const mo = $('exportMotionSeg');
  mo.textContent = '';
  for (const m of EXPORT_MOTIONS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'seg-btn';
    b.dataset.v = m;
    b.setAttribute('role', 'radio');
    b.textContent = motionName(m);
    b.title = t.exportMotionHelp[m];
    radio(b, s.exportMotion === m);
    b.onclick = () => {
      if (store.get().exportMotion === m) return;
      sfx.tick();
      store.set({ exportMotion: m });
    };
    mo.appendChild(b);
  }
  $('exportMotionHelp').textContent = t.exportMotionHelp[s.exportMotion];
  $('gifBgField').hidden = !gif;
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
  $('matteField').hidden = !gif || !s.gifClear;
  $('gifClearNote').hidden = !gif || !s.gifClear;
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
rovingKeys($('exportMotionSeg'));
rovingKeys($('gifBgSeg'));
rovingKeys($('matteSeg'));

/**
 * While a file is made, the sub-label names the step and the title counts up; the button fills like
 * a bar. Answers with the file, or null when it could not be made (the person is told).
 */
async function busy(label: string, job: (progress: (p: number) => void) => Promise<File>, fail = t.errDecode): Promise<File | null> {
  const b = saveBtn.querySelector('.btn-text b')!;
  const small = saveBtn.querySelector('.btn-text small')!;
  // One export at a time: the button, the format choice and the APNG shortcut rest while this one works.
  saveBtn.disabled = true;
  saveBtn.setAttribute('aria-busy', 'true');
  exportBusy(true);
  $<HTMLButtonElement>('toApng').disabled = true;
  buildFormats();
  small.textContent = label;
  const progress = (p: number) => {
    b.textContent = `${Math.round(p * 100)}%`;
    saveBtn.style.setProperty('--p', p.toFixed(3));
  };
  let made: File | null = null;
  try {
    made = await job(progress);
  } catch (err) {
    console.error(err);
    sfx.error();
    toast(fail, true);
  } finally {
    exportBusy(false);
    saveBtn.removeAttribute('aria-busy');
    // A picture still loading keeps Save resting; the format buttons are rebuilt, not the old ones re-enabled.
    saveBtn.disabled = store.get().loading;
    $<HTMLButtonElement>('toApng').disabled = false;
    buildFormats();
    saveBtn.style.removeProperty('--p');
    // From the current dictionary, in case the language changed mid-export.
    renderSave();
  }
  return made;
}

let exporter: Promise<typeof import('./exporter')> | null = null;
/** The exporters' code, fetched ahead (idle, or pointing at Save or Share) so a press does not wait for it. */
function useExporter() {
  if (!exporter) {
    exporter = import('./exporter');
    exporter.catch(() => (exporter = null));
    // APNG's encoder comes along, for a first APNG save that does not wait either.
    void import('./anim/apngExport').catch(() => {});
  }
  return exporter;
}
for (const b of [saveBtn, $('shareBtn'), $('formatSeg')]) for (const ev of ['pointerenter', 'focusin']) b.addEventListener(ev, () => void useExporter().catch(() => {}), { once: true });

/** The face painted for the card as it is now (a trading card's painter may still be on its way). */
async function faceReady() {
  if (canPaint(faceSpec(currentImage()))) return;
  await loadTcgFace();
  redrawFace();
}

/** The card as a file, its progress shown on the Save button under `label`; a GIF to share is smaller. */
async function makeFile(format: 'png' | 'gif' | 'share', label: string, progress: (p: number) => void): Promise<File> {
  const { exportGif, exportPng } = await useExporter();
  // After the fetch: the card may have changed layout meanwhile.
  await faceReady();
  if (format === 'png') return exportPng(exportInput());
  const small = saveBtn.querySelector('.btn-text small')!;
  return exportGif(
    exportInput(),
    (p, encoding) => {
      small.textContent = encoding ? t.encoding : label;
      progress(p);
    },
    { clear: store.get().gifClear, matte: store.get().gifMatte, size: format === 'share' ? GIF_SHARE : undefined },
  );
}

/**
 * A saved card is a pulled card: it hops and sheds sparks in its finish's colour, and Save turns
 * green for a moment with a gold "done" tag popping onto it.
 */
let celebrateTimer = 0;
function celebrate(file: string) {
  stage.juice(0.6);
  stage.burst(editionById(store.get().edition).color);
  saveBtn.classList.remove('is-saved');
  void saveBtn.offsetWidth;
  saveBtn.classList.add('is-saved');
  // Save keeps its name (it can be pressed again); its note says what was written.
  saveBtn.querySelector('.btn-text small')!.textContent = `${t.savedShort}: ${file}`;
  $('seal').textContent = t.sealDone;
  clearTimeout(celebrateTimer);
  celebrateTimer = window.setTimeout(() => {
    saveBtn.classList.remove('is-saved');
    renderSave();
  }, 2400);
}

/**
 * An export starts (on) or ends: the stage's quality governor rests meanwhile (an export's frames
 * say nothing about the stage's own speed), and the "done" tag still showing from the last save comes off.
 */
function exportBusy(on: boolean) {
  stage?.holdQuality(on);
  shareBtn.disabled = on;
  if (!on || !saveBtn.classList.contains('is-saved')) return;
  clearTimeout(celebrateTimer);
  saveBtn.classList.remove('is-saved');
}

saveBtn.addEventListener('click', async () => {
  const f = store.get().exportFormat;
  // One export at a time, and not while a picture is loading. APNG runs from its own module,
  // which also handles stopping it.
  if (f === 'apng' || saveBtn.hasAttribute('aria-busy') || store.get().loading) return;
  const file = await busy(t.saving, (progress) => makeFile(f, t.saving, progress), f === 'png' ? t.errPng : t.errGif);
  if (!file) return;
  (await useExporter()).download(file);
  sfx.coin();
  announce(`${t.saved}: ${file.name}`);
  celebrate(file.name);
});

// ---------- Share ----------

const shareBtn = $<HTMLButtonElement>('shareBtn');
// Only where the share sheet takes an image file; elsewhere Save is the way out.
shareBtn.hidden = !(() => {
  try {
    return !!navigator.canShare?.({ files: [new File([''], 'card.gif', { type: 'image/gif' })] });
  } catch {
    return false;
  }
})();
/** A file made for sharing that waits for one more tap: the browser stopped counting the first. */
let shareReady: File | null = null;

function renderShare() {
  shareBtn.dataset.ready = String(!!shareReady);
  shareBtn.querySelector('span')!.textContent = shareReady ? t.shareReady : t.share;
  shareBtn.title = shareReady ? t.shareReadyHint : t.shareHint;
}

function readyToShare(file: File | null) {
  shareReady = file;
  renderShare();
  if (file) toast(t.shareReadyHint);
}

/** Only the site's address goes along with the card; the card itself leaves the device only through the sheet. */
const SITE = 'https://dennougorilla.github.io/foil/';
/**
 * A Mac (not an iPad, which also says Macintosh but has touch): its share sheet's Copy puts every
 * shared item on the clipboard, and pasting that into X attached the GIF twice, so the GIF goes alone.
 */
const macDesktop = /Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints < 2;
/** A share sheet is open: another press waits for it rather than opening a second one. */
let sending = false;

/**
 * Hands the GIF to the share sheet with a line and the site's address, or the GIF alone where the
 * sheet can't take both (and on a Mac). On the first tap, a file made too late waits for a second one.
 */
async function send(file: File, firstTap: boolean) {
  const withText = { files: [file], text: `${t.shareText} ${SITE}` };
  sending = true;
  try {
    await navigator.share(!macDesktop && navigator.canShare(withText) ? withText : { files: [file] });
  } catch (err) {
    const name = (err as DOMException).name;
    if (firstTap && name === 'NotAllowedError') return readyToShare(file);
    // Closing the sheet without picking an app is not an error.
    if (name === 'AbortError') return;
    console.error(err);
    sfx.error();
    toast(t.errShare, true);
  } finally {
    sending = false;
  }
}

shareBtn.addEventListener('click', async () => {
  if (sending) return;
  if (shareReady) {
    const file = shareReady;
    readyToShare(null);
    return send(file, false);
  }
  if (saveBtn.hasAttribute('aria-busy') || store.get().loading) return;
  sfx.tick();
  // The progress shows on Share as well as on the Save button.
  const label = shareBtn.querySelector('span')!;
  shareBtn.dataset.busy = 'true';
  const file = await busy(
    t.sharing,
    (progress) =>
      makeFile('share', t.sharing, (p) => {
        label.textContent = `${Math.round(p * 100)}%`;
        progress(p);
      }),
    t.errGif,
  );
  delete shareBtn.dataset.busy;
  renderShare();
  if (file) await send(file, true);
});

// ---------- Binder ----------

const keepBtn = $<HTMLButtonElement>('keepBtn');
const binderBtn = $<HTMLButtonElement>('binderBtn');
/** The binder's count, kept here so the chip shows it before the binder's code loads. */
const BINDER_COUNT = 'foil:binder';
/** The binder card the stage shows as it is now (until it changes), and one just thrown away. */
let keptId: string | null = null;
let droppedId: string | null = null;
const isKept = () => keptId !== null;

function renderKeep() {
  keepBtn.dataset.kept = String(isKept());
  keepBtn.querySelector('span')!.textContent = isKept() ? t.kept : t.keep;
  keepBtn.title = isKept() ? t.keptHint : t.keepHint;
}

function renderBinderChip() {
  let n = 0;
  try {
    n = Math.max(0, parseInt(localStorage.getItem(BINDER_COUNT) ?? '0', 10) || 0);
  } catch {
    /* storage unavailable: no count */
  }
  binderBtn.querySelector('.binder-count')!.textContent = String(n);
  binderBtn.dataset.empty = String(n === 0);
  binderBtn.setAttribute('aria-label', t.binderLabel.replace('{n}', String(n)));
  binderBtn.title = t.binderLabel.replace('{n}', String(n));
}

type Binder = ReturnType<typeof import('./binder/binder').mountBinder>;
let binder: Promise<Binder> | null = null;
/** The binder's code, styles and texts load the first time it is used (or pointed at). */
function useBinder(): Promise<Binder> {
  if (binder) return binder;
  binder = import('./binder/binder').then((m) =>
    m.mountBinder({
      lang: () => store.get().lang,
      dict: () => t,
      chip: binderBtn,
      cardRect: () => $('cardSlot').getBoundingClientRect(),
      card: () => cardOf(store.get()),
      input: exportInput,
      picture: () => (store.get().sample >= 0 ? null : { still: userImage ?? samples[0], file: userAnim ? userSource : null }),
      play: playCard,
      pause: (on) => stage.pause(on),
      toast: (msg, error) => toast(msg, error),
      announce,
      onCount: (n) => {
        try {
          localStorage.setItem(BINDER_COUNT, String(n));
        } catch {
          /* the chip shows the count from the next opening */
        }
        renderBinderChip();
      },
      onKept: (id) => setKept(id),
      // Throwing the stage's card away makes it keepable again; Undo makes it kept again.
      onGone: (ids) => {
        if (keptId && ids.includes(keptId)) {
          droppedId = keptId;
          setKept(null);
        }
      },
      onBack: (ids) => droppedId && ids.includes(droppedId) && setKept(droppedId),
      sfx,
    }),
  );
  binder.catch(() => (binder = null));
  return binder;
}

/** Runs something in the binder, saying so if its code can't be fetched. */
function withBinder(run: (b: Binder) => Promise<void> | void): Promise<void> {
  return useBinder().then(run, () => toast(t.binderFailed, true));
}

for (const b of [keepBtn, binderBtn]) for (const ev of ['pointerenter', 'focus']) b.addEventListener(ev, () => void useBinder().catch(() => {}), { once: true });
binderBtn.addEventListener('click', () => {
  sfx.tick();
  void withBinder((b) => b.open());
});
keepBtn.addEventListener('click', () => {
  sfx.tick();
  // Already kept: the button leads to the binder instead of keeping a second copy.
  if (isKept()) return void withBinder((b) => b.open());
  if (keepBtn.hasAttribute('aria-busy')) return;
  keepBtn.setAttribute('aria-busy', 'true');
  void withBinder((b) => faceReady().then(() => b.keep()))
    .catch(() => toast(t.loadFailed, true))
    .finally(() => keepBtn.removeAttribute('aria-busy'));
});

/** Puts a card from the binder on the stage: its picture and every setting of the card. */
function setKept(id: string | null) {
  keptId = id;
  renderKeep();
}

async function playCard(k: Kept, id: string) {
  const card = cleanCard(k.card);
  if (!available(card.edition!, packs.get())) card.edition = 'holo';
  if (card.layer2 && !available(card.layer2.edition, packs.get())) card.layer2 = null;
  if (card.sample! >= SAMPLE_COUNT) card.sample = 0;
  if (card.sample! < 0) {
    const img = k.picture ? await decodeImage(k.picture).catch(() => null) : null;
    if (img) {
      userImage = img.still;
      userAnim = img.anim;
      userSource = k.picture;
      animFrame = 0;
      playFrames();
      void saveUserImage(k.picture!);
    } else {
      card.sample = 0;
      card.crop = { zoom: 1, x: 0.5, y: 0.5 };
      toast(t.errDecode, true);
    }
  }
  stage.flipTo(() => {
    store.set(card);
    redrawFace();
    buildThumbs();
    syncInputs();
    renderInfo();
    drawCropPreview();
    setKept(id);
  });
}

const areas = initAreas({
  store,
  stage,
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
  prepare: faceReady,
  plan: () => {
    const s = store.get();
    return apngPlan(s.tune, face.height / face.width, userAnim && s.sample < 0 ? userAnim.duration : undefined, s.exportMotion);
  },
  toast: (msg, error) => toast(msg, error),
  onSaved: (file) => celebrate(file),
  busy: exportBusy,
  sfx,
});

// ---------- Packs ----------

/** Opens the pack shop (every pack on a tray, the first sealed one chosen). Its code loads now. */
let opening = false;
function openShop() {
  if (opening) return;
  opening = true;
  const btn = $('packsBtn');
  btn.setAttribute('aria-busy', 'true');
  const wasOpened = new Set(packs.get().opened);
  const list = shelf(packs.get());
  // The cards in the opening wear the face as it is now (a trading card's painter may be on its way).
  void Promise.all([import('./pack/opening'), faceReady()])
    .then(([m]) =>
      m.openPack({
        pack: firstSealed(packs.get()) ?? list[0],
        shop: list,
        from: btn.getBoundingClientRect(),
        isOpened: (id) => packs.isOpened(id),
        deckRect: () => deck.rect(),
        dict: t,
        face,
        mask,
        back,
        tune: store.get().tune,
        intensity: store.get().intensity,
        pause: (on) => stage.pause(on),
        onOpened: (id) => packs.open(id),
        onClose: (done, pick) => {
          opening = false;
          if (done && !wasOpened.has(done.id)) {
            deck.bump(done.finishes.length);
            toast(t.pack.intoDeck.replace('{name}', t.pack.name[done.id]).replace('{n}', String(done.finishes.length)));
          }
          // A pick in the haul comes into the hand and onto the card.
          if (pick) useCard(pick);
          else deck.focusShop();
        },
      }),
    )
    .catch(() => {
      opening = false;
      toast(t.pack.failed, true);
    })
    .finally(() => btn.removeAttribute('aria-busy'));
}

/** Brings a finish into the hand (the last place that is not Base when it is full) and puts it on the card. */
function useCard(id: EditionId) {
  const full = store.get().hand.length >= 7;
  store.set({ hand: addToHand(store.get().hand, id) });
  // The cards trade places first: one lands on the deck (a bump), then the big card takes the new finish.
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (full) setTimeout(() => deck.bump(), still ? 0 : 420);
  // A card picked on the page meanwhile wins.
  const turn = ++picks;
  if (id !== store.get().edition) setTimeout(() => turn === picks && store.get().hand.includes(id) && selectEdition(id), still ? 0 : 560);
}

/** The deck builder changed the hand: it applies at once; a finish taken off the hand leaves the card on Base. */
function setHand(next: EditionId[]): EditionId[] {
  // Another tab may have sealed a pack while the builder was open.
  next = normalizeHand(next, packs.get());
  store.set({ hand: next });
  if (!next.includes(store.get().edition)) selectEdition('base');
  return next;
}

/** The deck builder: the hand's slots over everything owned; one tap moves a card. */
let deckOpen = false;
function viewDeck() {
  if (deckOpen) return;
  deckOpen = true;
  Promise.all([import('./pack/deckView'), faceReady()]).then(([m]) =>
    m.viewDeck({
      dict: t,
      owned: ownedGroups(packs.get()),
      hand: store.get().hand,
      starters: [...OPEN_EDITIONS],
      key: thumbKey(),
      face,
      mask,
      tune: store.get().tune,
      intensity: store.get().intensity,
      onChange: (next) => setHand(next),
      onShop: () => openShop(),
      onClose: () => {
        deckOpen = false;
        deck.focusDeck();
      },
    }),
  ).catch(() => {
    deckOpen = false;
    toast(t.pack.failed, true);
  });
}

// ---------- On demand: the print menu, free placement ----------

let printLoad: Promise<PrintPop> | null = null;
/** The print menu of one piece of text, fetched the first time a word on the card is tapped (or Fine-tune opens). */
function usePrint(): Promise<PrintPop> {
  printLoad ??= import('./printPop').then((m) => m.mountPrintPop({ store, dict: () => t, onPick: () => stage.juice(0.35) }));
  printLoad.catch(() => (printLoad = null));
  return printLoad;
}

let arrangeLoad: Promise<void> | null = null;
/** Free placement on the card, fetched once a piece is set to Free. */
function useArrange() {
  arrangeLoad ??= import('./arrangeEdit').then((m) =>
    m.mountArrange({
      store,
      stage,
      slot: $('cardSlot'),
      face,
      dict: () => t,
      runs: () => lastRuns,
      openPrint: (f, at) => void usePrint().then((p) => p.open(f, at), () => toast(t.loadFailed, true)),
    }),
  );
  arrangeLoad.catch(() => {
    arrangeLoad = null;
    toast(t.loadFailed, true);
  });
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
    if (others.length) selectEdition(others[Math.floor(Math.random() * others.length)]);
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

/**
 * Toasts rise from just above the Export bar, wherever it is now, so they never cover Save.
 * On phones the bar floats over the whole page; it fades the panel's lines only over the panel.
 * Scrolled, the panel fades what has gone up under its head, and marks when more waits below.
 */
function trackExportBar() {
  const top = exportSec.getBoundingClientRect().top;
  const bottom = Math.max(12, Math.min(innerHeight - top + 12, innerHeight - 160));
  $('toasts').style.bottom = `${Math.round(bottom)}px`;
  const panel = $('panel');
  const box = panel.getBoundingClientRect();
  exportSec.classList.toggle('is-over-panel', box.top < top && box.bottom > top);
  panel.classList.toggle('is-scrolled', panel.scrollTop > 2);
  panel.classList.toggle('has-more', panel.scrollHeight - panel.scrollTop - panel.clientHeight > 8);
}
// The panel keeps its height while its steps grow and shrink, so watch the steps as well.
{
  const ro = new ResizeObserver(trackExportBar);
  ro.observe($('panel'));
  $('panel').querySelectorAll('.sec').forEach((s) => ro.observe(s));
}
$('panel').addEventListener('scroll', trackExportBar, { passive: true });
addEventListener('scroll', trackExportBar, { passive: true });

// A value that changes pops in its pocket, the way a game's score counter does, whatever changed
// it (a drag, a choice, a reset). A drag keeps one pop going rather than restarting it, so no
// change forces a layout.
new MutationObserver((records) => {
  for (const r of records) {
    const node = r.target instanceof Element ? r.target : r.target.parentElement;
    node?.closest('output')?.classList.add('is-bump');
  }
}).observe($('panel'), { subtree: true, childList: true, characterData: true });
$('panel').addEventListener('animationend', (e) => (e.target as HTMLElement).classList.remove('is-bump'));
addEventListener('resize', trackExportBar);

function dismissToast(el: HTMLElement) {
  if (el.classList.contains('is-out')) return;
  // Don't strand keyboard focus on a toast that's about to vanish.
  // Focus goes to a pick button that is on screen: the stage's on phones, the panel's otherwise
  // (folded away while Fine-tune is open, whose toggle stands in), brought into view if need be.
  if (el.contains(document.activeElement))
    ['pickBtnStage', store.get().adjustOpen ? 'adjustToggle' : 'pickBtn'].map((id) => $(id)).find((b) => b.offsetParent)?.focus();
  el.classList.add('is-out');
  el.addEventListener('animationend', () => el.remove());
  setTimeout(() => el.remove(), 400);
}

/** Success toasts fade on their own; errors stay until dismissed, offering a way forward. */
// A picture that can't be read is said right under the pick button (beside the stage); phones,
// whose panel is far below, get a toast instead.
function showImageError(msg: string) {
  // The error sits in the picture step, which Fine-tune folds away.
  store.set({ adjustOpen: false });
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
    deck.render();
    return;
  }
  if (changed.has('edition')) {
    // A finish on the card is always in the hand, however it got there.
    if (!s.hand.includes(s.edition)) store.set({ hand: addToHand(s.hand, s.edition) });
    stage.syncHandChecked();
    renderCaption(null);
    wakePacks();
    depth?.update(face, artKey());
  }
  if (changed.has('layer2')) wakePacks();
  // Layer 1 and layer 2 never hold the same finish: putting layer 2's finish on the card removes layer 2.
  if (changed.has('edition') && s.layer2?.edition === s.edition) store.set({ layer2: null, areaLayer: 1 });
  if (changed.has('edition') || changed.has('flicked')) syncFlickHint();
  if (changed.has('hand')) {
    wakePacks();
    stage.syncHand();
    deck.render();
  }
  if (['rarity', 'frame', 'shape', 'frameColor', 'frameSwatches'].some((k) => changed.has(k as keyof State))) buildSegments();
  if (changed.has('arrange')) {
    renderCardHint();
    if (s.arrange === 'free') useArrange();
  }
  if (changed.has('prints')) setFieldPrints(s.prints);
  if (changed.has('shape')) applyShape();
  if (changed.has('shape') || changed.has('layout') || (s.layout === 'tcg' && ['cardType', 'message', 'arrange', 'placements'].some((k) => changed.has(k as keyof State)))) {
    // A new art window has its own proportions: keep the crop inside the picture, and redraw the flip picture for it.
    const img = currentImage();
    const crop = clampCrop(img.width, img.height, s.crop, artAspect());
    if (crop.x !== s.crop.x || crop.y !== s.crop.y) store.set({ crop });
    if (flipImage) setFlip(flipImage);
    buildSegments();
    drawCropPreview();
  }
  if (['name', 'rarity', 'frame', 'frameColor', 'crop', 'message', 'plate', 'layout', 'cardType', 'prints', 'arrange', 'placements', 'shape'].some((k) => changed.has(k as keyof State)) && !changed.has('sample')) {
    redrawFace();
  }
  if (changed.has('crop')) positionCropWindow();
  if (['rarity', 'edition', 'sample'].some((k) => changed.has(k as keyof State))) renderInfo();
  if (['sample', 'name', 'message', 'plate', 'layout', 'cardType'].some((k) => changed.has(k as keyof State))) syncInputs();
  if (['intensity', 'pixel', 'crop', 'sound', 'crt'].some((k) => changed.has(k as keyof State))) syncInputs();
  if (changed.has('exportFormat')) buildFormats();
  if (['exportFormat', 'saveOptsOpen', 'gifClear', 'gifMatte', 'exportMotion', 'shape', 'tune'].some((k) => changed.has(k as keyof State))) {
    buildSaveOpts();
    renderSave();
  }
  // The card changed: it is no longer the one kept, and a file waiting to be shared is out of date
  // (as it is when the export's motion or transparency changes).
  if (CARD_KEYS.some((k) => changed.has(k))) {
    droppedId = null;
    if (isKept()) setKept(null);
  }
  if (shareReady && [...CARD_KEYS, 'exportMotion', 'gifClear', 'gifMatte'].some((k) => changed.has(k as keyof State))) readyToShare(null);
  syncAdjust();
  if (changed.has('sound') || changed.has('crt')) {
    $('soundBtn').setAttribute('aria-label', s.sound ? t.soundOn : t.soundOff);
    $('crtBtn').setAttribute('aria-label', s.crt ? t.crtOn : t.crtOff);
  }
});

// ---------- Boot ----------

setSound(store.get().sound);
setFieldPrints(store.get().prints);
mountLetteringJump({
  store,
  dict: () => t,
  name: () => store.get().name || fallback().name,
  repaint: () => redrawFace(),
  open: () => void openAdjust('text').then((a) => a?.callLettering(), () => {}),
  tag: document.querySelector<HTMLElement>('#info .info-box') ?? undefined,
});
if (reopenAdjust) void openAdjust().catch(() => {});
if (store.get().arrange === 'free') useArrange();
applyText();
applyShape();
initPackStore(store);
packs.on(() => stage.syncHand());
const deck = mountDeck({
  host: $('deckDock'),
  hand,
  dict: () => t,
  onView: () => viewDeck(),
  onShop: () => openShop(),
  onPrefetch: () => void import('./pack/opening'),
});
// The idle motion in one tap, just above the deck.
mountQuickMotion(store, $('deckDock'));
// The saved hand made valid; the earlier drawn card and the finish on the card take places in it.
{
  const s = store.get();
  let next = normalizeHand(s.hand, packs.get());
  if (legacyDrawn) next = normalizeHand(addToHand(next, legacyDrawn), packs.get());
  if (!next.includes(s.edition)) next = addToHand(next, s.edition);
  store.set({ hand: next });
}
wakePacks();
const boot = () => {
  redrawFace();
  drawCropPreview();
};
// The nameplate uses the pixel font (and a trading card's footer the logo's), so wait for them before
// painting the face. Their stylesheet may still be on its way (index.html adds it without holding the
// script), and fonts not declared yet would count as loaded at once.
new Promise<unknown>((done) => {
  const sheet = document.getElementById('uiFonts') as HTMLLinkElement | null;
  if (!sheet || sheet.sheet) return done(null);
  sheet.addEventListener('load', done);
  sheet.addEventListener('error', done);
})
  .then(() => Promise.all([document.fonts.load('40px "DotGothic16"'), document.fonts.load('700 20px "Silkscreen"', 'FOIL·0123456789/')]))
  .then(boot, boot);
boot();
void loadUserImage('flip').then(async (blob) => {
  const img = blob ? await decodeImage(blob).catch(() => null) : null;
  // A picture chosen (or removed) meanwhile wins over last visit's.
  if (img && !flipChosen) setFlip(img.still);
});
if (store.get().sample < 0) {
  // Bring back the image from last visit; if it's gone, fall back to the first sample.
  void loadUserImage().then(async (blob) => {
    const img = blob ? await decodeImage(blob).catch(() => null) : null;
    if (img) {
      userImage = img.still;
      userAnim = img.anim;
      userSource = blob;
      playFrames();
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

// ---------- Fetching ahead ----------

/** The readers of moving pictures, wanted as soon as a picture may be opened. */
const prefetchDecoders = () => void Promise.all([import('./gifDecode'), import('./anim/apngDecode')]).catch(() => {});
for (const b of [$('pickBtn'), $('pickBtnStage')]) for (const ev of ['pointerenter', 'focus']) b.addEventListener(ev, prefetchDecoders, { once: true });
addEventListener('dragenter', prefetchDecoders, { once: true });
// A picture from last visit comes back through them.
if (store.get().sample < 0) prefetchDecoders();

// Once the page has settled, what the next taps want is fetched while nothing else happens (not
// on a data saver): Fine-tune's tabs, the print menu, the exporters, the motion tray.
addEventListener('load', () => {
  if ((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) return;
  const idle = window.requestIdleCallback ?? ((run: () => void) => setTimeout(run, 300));
  idle(() => {
    void useAdjust().catch(() => {});
    void useExporter().catch(() => {});
    void import('./tune/quickTray').catch(() => {});
    void loadTcgFace().catch(() => {});
  });
});


// The page is built: the stage's hand and card answer from now on.
booted = true;
