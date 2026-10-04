// The Lettering tab's message block: the words (typed, or a ready phrase in one
// tap), where they sit and their typeface, and whether the nameplate stays.
// How the words are printed is the lettering block below it, shared with the name.

import './message.css';
import type { Store } from './state';
import type { Dict } from './i18n';
import { sfx } from './audio';
import { stamp } from './lettering';
import { messageFonts } from './card/messageFace';
import {
  MESSAGE_FACES,
  MESSAGE_FONTS,
  MESSAGE_PHRASES,
  MESSAGE_PLACES,
  cleanMessageText,
  type Message,
} from './message';

interface Options {
  store: Store;
  /** The Lettering tab. */
  host: HTMLElement;
  dict: () => Dict;
  /** A small bounce on the card when the words change at a tap. */
  onPick: () => void;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
};

function radio(btn: HTMLElement, on: boolean) {
  btn.setAttribute('aria-checked', String(on));
  btn.tabIndex = on ? 0 : -1;
}

/** Arrow keys move and select within a radiogroup, like the rest of the panel. */
function roving(group: HTMLElement) {
  group.addEventListener('keydown', (e) => {
    const items = [...group.querySelectorAll<HTMLButtonElement>('[role=radio]')];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    const n = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: items.length - 1 }[e.key];
    if (i < 0 || n === undefined) return;
    e.preventDefault();
    const b = items[(n + items.length) % items.length];
    b.click();
    b.focus();
  });
}

/** Writes the message text into a field, keeping the caret where it was when it is being typed in. */
export function bindMessageField(field: HTMLTextAreaElement, store: Store): () => void {
  field.addEventListener('input', () => {
    const text = cleanMessageText(field.value);
    if (text !== field.value) {
      const at = Math.min(field.selectionStart ?? text.length, text.length);
      field.value = text;
      field.setSelectionRange(at, at);
    }
    store.set({ message: { ...store.get().message, text } });
  });
  return () => {
    if (document.activeElement !== field) field.value = store.get().message.text;
  };
}

export function mountMessage(o: Options): void {
  const { store } = o;
  const set = (patch: Partial<Message>) => store.set({ message: { ...store.get().message, ...patch } });

  const root = el('div', 'msg');
  root.setAttribute('role', 'group');

  const head = el('div', 'msg-head');
  const label = el('label', 'field-label');
  label.htmlFor = 'msgField';
  const clear = el('button', 'link msg-clear');
  clear.type = 'button';
  clear.addEventListener('click', () => {
    sfx.tick();
    set({ text: '' });
    field.focus();
  });
  head.append(label, clear);

  const field = el('textarea', 'msg-field');
  field.id = 'msgField';
  field.rows = 2;
  field.spellcheck = false;
  const syncField = bindMessageField(field, store);

  const phrases = el('div', 'msg-phrases');
  phrases.setAttribute('role', 'group');

  // One radiogroup of buttons per choice, each with its own face.
  const choice = <T extends string>(ids: readonly T[], key: string, pick: (id: T) => void) => {
    const row = el('div', 'field');
    const name = el('span', 'field-label');
    name.id = `msgLabel-${key}`;
    const group = el('div', `seg msg-${key}`);
    group.setAttribute('role', 'radiogroup');
    group.setAttribute('aria-labelledby', name.id);
    const btns = ids.map((id) => {
      const b = el('button', 'seg-btn');
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.dataset.v = id;
      b.addEventListener('click', () => {
        sfx.tick();
        pick(id);
      });
      group.append(b);
      return b;
    });
    roving(group);
    row.append(name, group);
    return { row, name, btns };
  };

  const place = choice(MESSAGE_PLACES, 'places', (id) => set({ place: id }));
  for (const b of place.btns) {
    // A tiny card with a bar where the words go.
    const icon = el('i', 'msg-place-icon');
    icon.setAttribute('aria-hidden', 'true');
    b.append(icon, el('span'));
  }
  const font = choice(MESSAGE_FONTS, 'fonts', (id) => set({ font: id }));
  for (const b of font.btns) {
    const f = MESSAGE_FACES[b.dataset.v as Message['font']];
    b.style.fontFamily = `"${f.family}", ${f.fallback}`;
    b.style.fontWeight = String(f.weight);
  }
  const detail = el('div', 'msg-detail');
  detail.append(place.row, font.row);

  const plate = choice(['on', 'off'] as const, 'plate', (v) => store.set({ plate: v === 'on' }));

  root.append(head, field, phrases, detail, plate.row);
  o.host.prepend(root);

  function labels() {
    const t = o.dict().msg;
    root.setAttribute('aria-label', t.title);
    label.textContent = t.label;
    clear.textContent = t.clear;
    field.placeholder = t.field;
    phrases.setAttribute('aria-label', t.phrasesLabel);
    phrases.textContent = '';
    for (const p of MESSAGE_PHRASES[store.get().lang]) {
      const b = el('button', 'msg-phrase');
      b.type = 'button';
      b.textContent = p.replace(/\n/g, ' ');
      b.addEventListener('click', () => {
        sfx.tick();
        if (store.get().message.text === p) return;
        set({ text: p });
        stamp();
        o.onPick();
      });
      phrases.append(b);
    }
    place.name.textContent = t.place;
    place.btns.forEach((b) => (b.lastElementChild!.textContent = t.placeName[b.dataset.v as Message['place']]));
    font.name.textContent = t.font;
    font.btns.forEach((b) => (b.textContent = t.fontName[b.dataset.v as Message['font']]));
    plate.name.textContent = t.plate;
    plate.btns[0].textContent = t.plateOn;
    plate.btns[1].textContent = t.plateOff;
  }

  function sync() {
    const s = store.get();
    const m = s.message;
    syncField();
    const has = m.text.trim().length > 0;
    clear.hidden = !m.text;
    // Where and in which face only matter once there are words.
    detail.hidden = !has;
    // The typeface buttons show themselves in their own face, which needs the sheet;
    // the words being typed (here and in the tag) take the card's typeface too.
    if (has) void messageFonts();
    const f = MESSAGE_FACES[m.font];
    if (has) document.documentElement.style.setProperty('--msg-font', `${f.weight} 1em "${f.family}", ${f.fallback}`);
    else document.documentElement.style.removeProperty('--msg-font');
    place.btns.forEach((b) => radio(b, b.dataset.v === m.place));
    font.btns.forEach((b) => radio(b, b.dataset.v === m.font));
    radio(plate.btns[0], s.plate);
    radio(plate.btns[1], !s.plate);
    phrases.querySelectorAll<HTMLButtonElement>('.msg-phrase').forEach((b, i) => {
      b.setAttribute('aria-pressed', String(MESSAGE_PHRASES[s.lang][i] === m.text));
    });
  }

  labels();
  sync();
  store.on((_, changed) => {
    if (changed.has('lang')) labels();
    if (changed.has('lang') || changed.has('message') || changed.has('plate')) sync();
  });
}
