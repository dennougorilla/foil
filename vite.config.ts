import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { defineConfig, transformWithOxc, type Plugin } from 'vite';
import { offlineFiles } from './src/swFiles.ts';

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

/**
 * The service worker (docs/pwa.md). Once the build is written, src/sw.ts becomes dist/sw.js under the
 * list of files to keep offline and a hash of the build, so every build that changes a file is a new
 * worker, which is how browsers learn there is a new version.
 */
function serviceWorker(): Plugin {
  let outDir = '';
  return {
    name: 'service-worker',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      const built = readdirSync(outDir, { recursive: true, withFileTypes: true })
        .filter((e) => e.isFile())
        .map((e) => relative(outDir, join(e.parentPath, e.name)).replaceAll('\\', '/'))
        .filter((f) => f !== 'sw.js')
        .sort();
      const hash = createHash('sha256');
      for (const f of built) hash.update(f).update(readFileSync(join(outDir, f)));
      const { code } = await transformWithOxc(readFileSync(new URL('./src/sw.ts', import.meta.url), 'utf8'), 'sw.ts');
      const head = `const OFFLINE = ${JSON.stringify(offlineFiles(built))};\nconst VERSION = '${hash.digest('hex').slice(0, 12)}';\n`;
      // A classic worker script (module workers are not everywhere yet): the module marker goes.
      writeFileSync(join(outDir, 'sw.js'), head + code.replace(/^export \{\s*\};?\s*$/m, ''));
    },
  };
}

// Relative base so the build works from any GitHub Pages sub-path.
export default defineConfig({
  base: './',
  plugins: [
    langPreload(),
    serviceWorker(),
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
  // The GIF encoder is only reached from its worker, which the dev server finds late and reloads the
  // page for; bundle it up front instead.
  optimizeDeps: { include: ['gifenc'] },
  build: {
    // Every browser FOIL runs in (WebGL 2) preloads modules itself; older ones just skip the hint.
    modulePreload: { polyfill: false },
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
