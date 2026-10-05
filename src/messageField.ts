// The message's text fields (the name tag's on the stage, the Lettering tab's): both write the same words.
import { cleanMessageText } from './message';
import type { Store } from './state';

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
