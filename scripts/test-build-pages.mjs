import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rename, symlink, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const script = fileURLToPath(new URL('./build-pages.mjs', import.meta.url));
const files = ['index.html', 'ranking.html', 'terms.html', 'IMG_7589.JPG', 'banner'];
const sha = 'a'.repeat(40);
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'lab-pages-'));
  t.diagnostic(`Retained synthetic fixture: ${root}`);
  for (const file of files) await writeFile(join(root, file), `fixture:${file}`, { flag: 'wx' });
  return root;
}
const build = (root, commit = sha, preload) => spawnSync(process.execPath, [...(preload ? ['--import', preload] : []), script], {
  cwd: root, env: { ...process.env, GITHUB_SHA: commit }, encoding: 'utf8', timeout: 15000
});
async function oldOutput(root) {
  await mkdir(join(root, 'dist'));
  await writeFile(join(root, 'dist/stale.js'), 'old build', { flag: 'wx' });
}
async function verify(root, commit = sha) {
  assert.deepEqual((await readdir(join(root, 'dist'))).sort(), [...files, '.nojekyll', 'release.json'].sort());
  for (const file of files) assert.equal(await readFile(join(root, 'dist', file), 'utf8'), `fixture:${file}`);
  assert.deepEqual(JSON.parse(await readFile(join(root, 'dist/release.json'), 'utf8')), { commit });
}
const retained = async root => (await readdir(root)).filter(n => n.startsWith('.lab-pages-previous-'));

test('Pages allowlist and commit are unchanged; stale output is retained outside artifact', async t => {
  const root = await fixture(t);
  await writeFile(join(root, '.env'), 'PRIVATE_TEST_VALUE', { flag: 'wx' });
  await mkdir(join(root, 'docs'));
  await writeFile(join(root, 'docs/private.md'), 'development only', { flag: 'wx' });
  await oldOutput(root);
  const run = build(root);
  assert.equal(run.status, 0, run.stderr);
  await verify(root);
  const backups = await retained(root);
  assert.equal(backups.length, 1);
  assert.equal(await readFile(join(root, backups[0], 'dist/stale.js'), 'utf8'), 'old build');
  const again = build(root, 'b'.repeat(40));
  assert.equal(again.status, 0, again.stderr);
  await verify(root, 'b'.repeat(40));
  assert.equal((await retained(root)).length, 2);
  const previousRelease = (await retained(root)).find(n => n !== backups[0]);
  assert.deepEqual(JSON.parse(await readFile(join(root, previousRelease, 'dist/release.json'), 'utf8')), { commit: sha });
});

test('fresh output builds without a previous-output backup', async t => {
  const root = await fixture(t);
  const run = build(root);
  assert.equal(run.status, 0, run.stderr);
  await verify(root);
  assert.deepEqual(await retained(root), []);
});

test('invalid commit and missing input preserve the existing artifact', async t => {
  const root = await fixture(t);
  await oldOutput(root);
  assert.notEqual(build(root, 'not-a-sha').status, 0);
  assert.equal(await readFile(join(root, 'dist/stale.js'), 'utf8'), 'old build');
  await rename(join(root, 'banner'), join(root, 'saved-banner'));
  assert.notEqual(build(root).status, 0);
  assert.equal(await readFile(join(root, 'dist/stale.js'), 'utf8'), 'old build');
  assert.equal(await readFile(join(root, 'saved-banner'), 'utf8'), 'fixture:banner');
  assert.deepEqual(await retained(root), []);
});

for (const kind of ['file', 'symlink', 'dangling']) {
  test(`unsafe dist ${kind} is rejected without changing target`, async t => {
    const root = await fixture(t);
    if (kind === 'file') await writeFile(join(root, 'dist'), 'preserve-file', { flag: 'wx' });
    else {
      if (kind === 'symlink') {
        await mkdir(join(root, 'target'));
        await writeFile(join(root, 'target/marker'), 'preserve-target', { flag: 'wx' });
      }
      await symlink(join(root, 'target'), join(root, 'dist'));
    }
    const run = build(root);
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, /Unsafe output path/);
    if (kind === 'file') assert.equal(await readFile(join(root, 'dist'), 'utf8'), 'preserve-file');
    else assert.equal((await lstat(join(root, 'dist'))).isSymbolicLink(), true);
    if (kind === 'symlink') assert.equal(await readFile(join(root, 'target/marker'), 'utf8'), 'preserve-target');
  });
}

for (const kind of ['symlink', 'directory']) {
  test(`unsafe input ${kind} is rejected and prior output retained`, async t => {
    const root = await fixture(t);
    await oldOutput(root);
    await rename(join(root, 'banner'), join(root, 'saved-banner'));
    if (kind === 'symlink') await symlink(join(root, 'saved-banner'), join(root, 'banner'));
    else await mkdir(join(root, 'banner'));
    const run = build(root);
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, /Unsafe source path/);
    assert.equal(await readFile(join(root, 'dist/stale.js'), 'utf8'), 'old build');
    assert.equal(await readFile(join(root, 'saved-banner'), 'utf8'), 'fixture:banner');
  });
}

test('injected copy failure retains partial stage and leaves old artifact untouched', async t => {
  const root = await fixture(t);
  await oldOutput(root);
  const preload = join(root, 'fail-copy.mjs');
  await writeFile(preload, `import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
const original=fs.copyFile;
fs.copyFile=async (...args)=>{if(String(args[0]).endsWith('/ranking.html')) throw new Error('injected copy failure');return original(...args);};
syncBuiltinESMExports();`, { flag: 'wx' });
  const run = build(root, sha, preload);
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /injected copy failure/);
  assert.equal(await readFile(join(root, 'dist/stale.js'), 'utf8'), 'old build');
  const stages = (await readdir(root)).filter(n => n.startsWith('.lab-pages-build-'));
  assert.equal(stages.length, 1);
  assert.equal(await readFile(join(root, stages[0], 'index.html'), 'utf8'), 'fixture:index.html');
  assert.deepEqual(await retained(root), []);
});

test('injected promotion failure retains old artifact and complete staged output', async t => {
  const root = await fixture(t);
  await oldOutput(root);
  const preload = join(root, 'fail-promotion.mjs');
  await writeFile(preload, `import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { basename } from 'node:path';
const original=fs.rename;
fs.rename=async (...args)=>{if(basename(args[0]).startsWith('.lab-pages-build-')) throw new Error('injected promotion failure');return original(...args);};
syncBuiltinESMExports();`, { flag: 'wx' });
  const run = build(root, sha, preload);
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /injected promotion failure/);
  await assert.rejects(lstat(join(root, 'dist')), { code: 'ENOENT' });
  const backups = await retained(root);
  assert.equal(backups.length, 1);
  assert.equal(await readFile(join(root, backups[0], 'dist/stale.js'), 'utf8'), 'old build');
  const stages = (await readdir(root)).filter(n => n.startsWith('.lab-pages-build-'));
  assert.equal(stages.length, 1);
  assert.deepEqual((await readdir(join(root, stages[0]))).sort(), [...files, '.nojekyll', 'release.json'].sort());
});
