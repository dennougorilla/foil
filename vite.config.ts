import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

// Short SHA of the commit being built: from Actions when available, otherwise local git.
function commitSha(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'unknown';
  }
}

/**
 * The page's texts come one language at a time (src/i18n.ts). index.html works out which one the page
 * opens in, the way the store does (saved choice, then ?lang=), and fetches its chunk beside the
 * page's script, so the texts never wait for the script to ask. Placed first in <head>: an inline
 * script after a stylesheet would wait for it.
 */
function langPreload(): Plugin {
  return {
    name: 'lang-preload',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(_html, { bundle }) {
        const files: Record<string, string> = {};
        for (const c of Object.values(bundle ?? {})) {
          const m = c.type === 'chunk' && c.facadeModuleId?.match(/[\\/]src[\\/]i18n[\\/](ja|en)\.ts$/);
          if (m && c.type === 'chunk') files[m[1]] = `./${c.fileName}`;
        }
        if (!files.ja || !files.en) throw new Error('lang-preload: the language chunks were not found');
        const pick = `var l='en';try{l=JSON.parse(localStorage.getItem('foil:v1')||'{}').lang}catch(e){}var q=new URLSearchParams(location.search).get('lang');if(q==='ja'||q==='en')l=q;if(l!=='ja')l='en';`;
        const link = `var k=document.createElement('link');k.rel='modulepreload';k.crossOrigin='';k.href=${JSON.stringify(files)}[l];document.head.appendChild(k);`;
        return [{ tag: 'script', injectTo: 'head-prepend', children: `(function(){${pick}${link}})()` }];
      },
    },
  };
}

/**
 * Everything the page's script reaches through static imports goes into the one entry chunk, so the
 * first load is one script (and one stylesheet) rather than a dozen small shared pieces, which also
 * compress better together. What loads on demand (docs/performance.md) keeps its own chunks.
 */
function firstLoad(id: string, ctx: { getModuleInfo(id: string): { isEntry: boolean; importedIds: readonly string[] } | null }): string | null {
  if (!firstLoadIds) {
    firstLoadIds = new Set();
    const entry = [...entryIds].find((e) => ctx.getModuleInfo(e)?.isEntry);
    const todo = entry ? [entry] : [];
    while (todo.length) {
      const m = todo.pop()!;
      if (firstLoadIds.has(m)) continue;
      firstLoadIds.add(m);
      todo.push(...(ctx.getModuleInfo(m)?.importedIds ?? []));
    }
  }
  return firstLoadIds.has(id) ? 'index' : null;
}
let firstLoadIds: Set<string> | null = null;
const entryIds = new Set<string>();

// Relative base so the build works from any GitHub Pages sub-path.
export default defineConfig({
  base: './',
  plugins: [
    langPreload(),
    {
      name: 'first-load-ids',
      apply: 'build',
      buildStart() {
        firstLoadIds = null;
        entryIds.clear();
      },
      moduleParsed(info) {
        if (info.isEntry) entryIds.add(info.id);
      },
    },
  ],
  build: {
    rolldownOptions: {
      output: { codeSplitting: { groups: [{ name: firstLoad }] } },
    },
  },
  // Typed in src/types/app-env.d.ts.
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __APP_COMMIT__: JSON.stringify(commitSha()),
  },
});
