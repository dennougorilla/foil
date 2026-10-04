// The Lettering tab's message block: the words (typed, or a ready phrase in one
// tap), where they sit and their typeface, and whether the nameplate stays. On a
// trading card the words are the effect text, under a type line field.
// How the words are printed is the lettering block below it, shared with the name;
// a chip beside each field gives that piece its own print.

import './message.css';
import { CARD_TYPE_MAX, type Store } from './state';
import type { TextField } from './lettering';
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
  /** A chip that shows and changes a field's own print. */
  chip: (f: TextField) => HTMLButtonElement;
  /** The name printed when none is typed (the sample's, or "My card"). */
  namePlaceholder: () => string;
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
  // How many of the four lines are used, while there are any.
  const count = el('small', 'msg-count');
  count.setAttribute('aria-live', 'polite');
  head.append(label, count, o.chip('message'), clear);

  // The name, as in the tag beside the card: here it sits with the card's other words and its print.
  const nameRow = el('div', 'msg-type');
  const nameHead = el('div', 'msg-head');
  const nameLabel = el('label', 'field-label');
  nameLabel.htmlFor = 'msgName';
  nameHead.append(nameLabel, o.chip('name'));
  const nameField = el('input', 'msg-type-field');
  nameField.id = 'msgName';
  nameField.type = 'text';
  nameField.maxLength = 24;
  nameField.autocomplete = 'off';
  nameField.spellcheck = false;
  nameField.addEventListener('input', () => store.set({ name: nameField.value, nameEdited: nameField.value.length > 0 }));
  nameRow.append(nameHead, nameField);

  // The trading card's type line: one short line, above the effect text.
  const typeRow = el('div', 'msg-type');
  const typeHead = el('div', 'msg-head');
  const typeLabel = el('label', 'field-label');
  typeLabel.htmlFor = 'msgType';
  typeHead.append(typeLabel, o.chip('type'));
  const typeField = el('input', 'msg-type-field');
  typeField.id = 'msgType';
  typeField.type = 'text';
  typeField.maxLength = CARD_TYPE_MAX;
  typeField.autocomplete = 'off';
  typeField.spellcheck = false;
  typeField.addEventListener('input', () => store.set({ cardType: typeField.value }));
  typeRow.append(typeHead, typeField);

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

  root.append(nameRow, typeRow, head, field, phrases, detail, plate.row);
  o.host.prepend(root);

  function labels() {
    const t = o.dict().msg;
    root.setAttribute('aria-label', t.title);
    typeLabel.textContent = o.dict().tcg.type;
    nameLabel.textContent = o.dict().name;
    typeField.placeholder = o.dict().tcg.typeHint;
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
    const t = o.dict().msg;
    const m = s.message;
    const tcg = s.layout === 'tcg';
    syncField();
    label.textContent = t.label;
    root.setAttribute('aria-label', t.title);
    field.placeholder = tcg ? t.effectField : t.field;
    typeRow.hidden = !tcg;
    if (document.activeElement !== typeField) typeField.value = s.cardType;
    if (document.activeElement !== nameField) nameField.value = s.name;
    nameField.placeholder = o.namePlaceholder();
    // Off, the nameplate prints no name: the field steps back.
    nameRow.classList.toggle('is-off', !s.plate);
    // A trading card's effect text has its own box: no place to choose.
    place.row.hidden = tcg;
    const has = m.text.trim().length > 0;
    count.hidden = !m.text;
    count.textContent = t.count.replace('{n}', String(m.text.split('\n').length));
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
    if (['lang', 'message', 'plate', 'layout', 'cardType', 'name', 'sample'].some((k) => changed.has(k as keyof typeof _))) sync();
  });
}
