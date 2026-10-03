// The small chip on the card's top edge that says what the Shadowbox depth reader is doing.
import './pill.css';
import type { Dict } from '../i18n';

const MB = (b: number) => (b / 1e6).toFixed(b < 1e7 ? 1 : 0);

export class DepthPill {
  private el: HTMLDivElement;
  private text: HTMLSpanElement;
  private bar: HTMLSpanElement;
  private ask: HTMLButtonElement;
  private hideTimer = 0;

  constructor(
    private slot: HTMLElement,
    private dict: () => Dict,
    onAsk: () => void,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'depth-pill';
    this.el.setAttribute('role', 'status');
    this.el.hidden = true;
    this.el.innerHTML =
      '<svg class="depth-pill-icon" viewBox="0 0 12 12" aria-hidden="true"><path d="M1 7h6v4H1z"/><path d="M3 4h6v4H3z" opacity=".7"/><path d="M5 1h6v4H5z" opacity=".45"/></svg>' +
      '<span class="depth-pill-text"></span><span class="depth-pill-bar" aria-hidden="true"></span>' +
      '<button class="depth-pill-ask" type="button" hidden></button>';
    this.text = this.el.querySelector('.depth-pill-text')!;
    this.bar = this.el.querySelector('.depth-pill-bar')!;
    this.ask = this.el.querySelector('.depth-pill-ask')!;
    this.ask.addEventListener('click', onAsk);
    slot.parentElement!.appendChild(this.el);
    new ResizeObserver(() => this.place()).observe(slot.parentElement!);
  }

  /** Pins the chip to the middle of the card's top edge. */
  private place() {
    const s = this.slot;
    this.el.style.left = `${s.offsetLeft + s.offsetWidth / 2}px`;
    this.el.style.top = `${s.offsetTop}px`;
  }

  private show(text: string, progress: number | null, mode: 'busy' | 'done' | 'note' | 'ask') {
    clearTimeout(this.hideTimer);
    this.place();
    this.el.hidden = false;
    this.el.dataset.mode = mode;
    this.text.textContent = text;
    this.bar.style.setProperty('--p', progress === null ? '1' : progress.toFixed(3));
    this.bar.classList.toggle('is-indeterminate', progress === null && mode === 'busy');
    this.ask.hidden = mode !== 'ask';
    // The chip appears with a little pop, then just updates in place.
    requestAnimationFrame(() => this.el.classList.add('is-in'));
  }

  download(loaded: number, total: number) {
    this.show(`${this.dict().depthFetch} ${MB(loaded)} / ${MB(total)} MB`, loaded / total, 'busy');
  }

  running() {
    this.show(this.dict().depthRead, null, 'busy');
  }

  done() {
    this.show(this.dict().depthDone, 1, 'done');
    this.hideLater(1600);
  }

  failed() {
    this.show(this.dict().depthGuess, null, 'note');
    this.hideLater(3600);
  }

  /** Data saver is on: the model waits until asked for. */
  offer(bytes: number) {
    this.show(this.dict().depthGuess, null, 'ask');
    this.ask.textContent = `${this.dict().depthAsk} (${MB(bytes)} MB)`;
  }

  hide() {
    clearTimeout(this.hideTimer);
    this.el.classList.remove('is-in');
    this.hideTimer = window.setTimeout(() => (this.el.hidden = true), 250);
  }

  private hideLater(ms: number) {
    this.hideTimer = window.setTimeout(() => this.hide(), ms);
  }
}
