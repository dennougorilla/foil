// The "High quality (APNG)" export button: size hint, progress, and cancel (click again or Esc).
import './apng.css';
import type { Lang } from '../i18n';
import type { ExportInput } from '../exporter';
import { apngPlan, exportApng } from './apngExport';

const TEXT = {
  ja: {
    title: 'APNG',
    badge: '高画質',
    sub: 'フルカラー・背景透過',
    about: 'APNG で保存します。背景が透明で、色と影がそのまま残ります。書き出し中は Esc かもう一度クリックで中止できます。Discord・Slack では動かないので、SNS には GIF を。',
    size: '約{n}',
    meta: '{s}秒ループ',
    working: '書き出し中…',
    frames: '{i} / {n} コマ',
    stop: '中止',
    cancelLabel: 'APNG の書き出しを中止',
    cancelled: '書き出しを中止しました',
    stopped: '中止しました',
    saved: '保存しました: {file} ({size})。',
    note: 'Discord・Slack では静止します。',
    error: 'APNG を書き出せませんでした。もう一度お試しください。',
  },
  en: {
    title: 'APNG',
    badge: 'HQ',
    sub: 'Full colour, clear bg',
    about: 'Saves an APNG: transparent background, every colour and the soft shadow kept. While it saves, press Esc or click again to stop. Discord and Slack won’t play it, so share a GIF there.',
    size: '~{n}',
    meta: '{s}s loop',
    working: 'Saving…',
    frames: '{i} / {n} frames',
    stop: 'Stop',
    cancelLabel: 'Stop the APNG export',
    cancelled: 'Export stopped',
    stopped: 'Stopped',
    saved: 'Saved: {file} ({size}). ',
    note: 'It won’t move on Discord or Slack.',
    error: "Couldn't make the APNG. Please try again.",
  },
} satisfies Record<Lang, Record<string, string>>;

const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k]));

/** "2.4 MB" / "860 KB", rounded the way people read file sizes. */
export function formatBytes(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)} MB`;
  return `${Math.max(1, Math.round(n / 1000))} KB`;
}

export interface ApngUiOptions {
  btn: HTMLButtonElement;
  lang: () => Lang;
  input: () => ExportInput;
  toast: (msg: string, error?: boolean) => void;
  sfx: { coin(): void; error(): void; tick(): void };
}

export function mountApngExport({ btn, lang, input, toast, sfx }: ApngUiOptions) {
  const [label, meta] = btn.querySelectorAll<HTMLElement>('.btn-text, .hq-meta');
  const [b, small] = [label.querySelector('b')!, label.querySelector('small')!];
  const [mb, msmall] = [meta.querySelector('b')!, meta.querySelector('small')!];
  let job: AbortController | null = null;
  /** After a stop, the row says so for a moment, so a stop never looks like a finished save. */
  let hold = 0;

  /** Idle label: what it is, plus how big and how long the file will be for the current image. */
  const refresh = () => {
    if (job || hold) return;
    const t = TEXT[lang()];
    const plan = apngPlan(input().loopMs);
    const size = fill(t.size, { n: formatBytes(plan.bytes) });
    const secs = plan.delays.reduce((a, d) => a + d, 0) / 1000;
    b.textContent = t.title;
    b.appendChild(document.createElement('i')).textContent = t.badge;
    small.textContent = t.sub;
    mb.textContent = size;
    msmall.textContent = fill(t.meta, { s: +secs.toFixed(1) });
    btn.title = t.about;
    btn.removeAttribute('aria-label');
  };

  const others = () => [...document.querySelectorAll<HTMLButtonElement>('.export .btn')].filter((x) => x !== btn);

  async function run() {
    const t = TEXT[lang()];
    clearTimeout(hold);
    hold = 0;
    btn.classList.remove('is-stopped');
    const ctl = new AbortController();
    job = ctl;
    others().forEach((x) => (x.disabled = true));
    btn.setAttribute('aria-busy', 'true');
    btn.setAttribute('aria-label', t.cancelLabel);
    mb.innerHTML = '<kbd>Esc</kbd><span></span>';
    mb.lastElementChild!.textContent = t.stop;
    msmall.textContent = '';
    // One number drives the frame count and the strip, so they always agree.
    const progress = (p: number, total: number) => {
      const cells = Math.floor(p * total);
      b.textContent = t.working;
      small.textContent = fill(t.frames, { i: cells, n: total });
      btn.style.setProperty('--p', (cells / total).toFixed(4));
      btn.style.setProperty('--n', String(total));
    };
    let stopped = false;
    try {
      const { file, bytes } = await exportApng(input(), progress, ctl.signal);
      sfx.coin();
      toast(fill(t.saved, { file, size: formatBytes(bytes) }) + t.note);
    } catch (err) {
      if ((err as DOMException).name === 'AbortError') {
        stopped = true;
        toast(t.cancelled);
      } else {
        console.error(err);
        sfx.error();
        toast(t.error, true);
      }
    } finally {
      job = null;
      others().forEach((x) => (x.disabled = false));
      btn.removeAttribute('aria-busy');
      btn.style.removeProperty('--p');
      btn.style.removeProperty('--n');
      if (stopped) {
        b.textContent = t.stopped;
        small.textContent = '';
        mb.textContent = '';
        msmall.textContent = '';
        btn.classList.add('is-stopped');
        hold = window.setTimeout(() => {
          hold = 0;
          btn.classList.remove('is-stopped');
          refresh();
        }, 1600);
      } else refresh();
    }
  }

  btn.addEventListener('click', () => {
    if (job) {
      sfx.tick();
      job.abort();
    } else void run();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && job) job.abort();
  });

  refresh();
  return { refresh };
}
