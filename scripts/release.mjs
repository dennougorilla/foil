// Cuts a release: npm run release -- <patch|minor|major|x.y.z> [--dry-run] [--yes]
// Checks that main is clean and up to date, builds, bumps the version with `npm version`
// (commit + tag vX.Y.Z), then pushes main and the tag. The tag push runs
// .github/workflows/release.yml, which deploys to GitHub Pages and publishes the Release.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';

const BRANCH = 'main';
const REMOTE = 'origin';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const yes = args.includes('--yes') || args.includes('-y');
const bump = args.find((a) => !a.startsWith('-'));

function fail(message) {
  console.error(`\nrelease: ${message}`);
  process.exit(1);
}

function run(cmd, cmdArgs, { capture = false } = {}) {
  const res = spawnSync(cmd, cmdArgs, { stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit', encoding: 'utf8' });
  if (res.error) fail(`could not run ${cmd}: ${res.error.message}`);
  if (res.status !== 0) {
    if (capture) process.stderr.write(res.stderr ?? '');
    fail(`\`${cmd} ${cmdArgs.join(' ')}\` exited with ${res.status}`);
  }
  return capture ? res.stdout.trim() : '';
}

const git = (...a) => run('git', a, { capture: true });

// Run npm through the same Node/npm that launched us, so no shell is needed on Windows.
function npm(...a) {
  const npmCli = process.env.npm_execpath;
  if (npmCli && /\.c?js$/.test(npmCli)) return run(process.execPath, [npmCli, ...a]);
  const res = spawnSync('npm', a, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (res.status !== 0) fail(`\`npm ${a.join(' ')}\` exited with ${res.status}`);
}

const EXACT = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
if (!['patch', 'minor', 'major'].includes(bump) && !EXACT.test(bump ?? '')) {
  fail('usage: npm run release -- <patch|minor|major|x.y.z> [--dry-run] [--yes]');
}

function nextVersion(current, kind) {
  if (EXACT.test(kind)) return kind;
  const [major, minor, patch] = current.split('-')[0].split('.').map(Number);
  if (kind === 'major') return `${major + 1}.0.0`;
  if (kind === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

// ---------- preflight ----------

const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
if (branch !== BRANCH) fail(`on branch "${branch}"; releases are cut from ${BRANCH}.`);

if (git('status', '--porcelain')) fail('working tree has uncommitted changes. Commit or stash them first.');

console.log(`Fetching ${REMOTE}...`);
git('fetch', '--tags', REMOTE, BRANCH);
const [behind, ahead] = git('rev-list', '--left-right', '--count', `${REMOTE}/${BRANCH}...HEAD`).split(/\s+/).map(Number);
if (behind > 0) fail(`${BRANCH} is ${behind} commit(s) behind ${REMOTE}/${BRANCH}. Pull first.`);

const current = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const next = nextVersion(current, bump);
const tag = `v${next}`;
if (next === current) fail(`version is already ${current}.`);
if (git('tag', '--list', tag)) fail(`tag ${tag} already exists.`);
if (git('ls-remote', '--tags', REMOTE, `refs/tags/${tag}`)) fail(`tag ${tag} already exists on ${REMOTE}.`);

console.log(`\n  ${current} -> ${next}  (tag ${tag})`);
if (ahead > 0) console.log(`  ${ahead} unpushed commit(s) on ${BRANCH} will be pushed too.`);

if (dryRun) {
  console.log('\nDry run: checks passed, nothing changed.');
  process.exit(0);
}

if (!yes) {
  if (!process.stdin.isTTY) fail('not interactive; pass --yes to confirm.');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`\nBuild, tag ${tag} and push to ${REMOTE}? This deploys to GitHub Pages. [y/N] `);
  rl.close();
  if (!/^y(es)?$/i.test(answer.trim())) fail('cancelled.');
}

// ---------- release ----------

console.log('\nBuilding...');
npm('run', 'build');

npm('version', next, '-m', 'Release v%s');

const pushed = spawnSync('git', ['push', '--atomic', REMOTE, BRANCH, tag], { stdio: 'inherit' });
if (pushed.status !== 0) {
  fail(
    `push failed. The release commit and tag ${tag} exist only locally.\n` +
      `  Retry:  git push --atomic ${REMOTE} ${BRANCH} ${tag}\n` +
      `  Undo:   git tag -d ${tag} && git reset --hard HEAD~1`,
  );
}

const repo = git('remote', 'get-url', REMOTE).match(/github\.com[:/](.+?)(\.git)?$/)?.[1];
console.log(`\nPushed ${tag}.`);
if (repo) console.log(`Watch the release: https://github.com/${repo}/actions/workflows/release.yml`);
