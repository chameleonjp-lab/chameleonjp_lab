import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const script = resolve('scripts/build-pages.mjs');
test('Pages artifact contains only runtime files, replaces stale output, and identifies its commit', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lab-pages-'));
  try {
    const files = ['index.html', 'ranking.html', 'terms.html', 'IMG_7589.JPG', 'banner'];
    for (const file of files) await writeFile(join(root, file), `fixture:${file}`);
    await writeFile(join(root, '.env'), 'PRIVATE_TEST_VALUE');
    await mkdir(join(root, 'docs'));
    await writeFile(join(root, 'docs/private.md'), 'development only');
    await mkdir(join(root, 'dist'));
    await writeFile(join(root, 'dist/stale.js'), 'old build');
    const sha = 'a'.repeat(40);
    const run = spawnSync(process.execPath, [script], { cwd: root, env: { ...process.env, GITHUB_SHA: sha }, encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    assert.deepEqual((await readdir(join(root, 'dist'))).sort(), [...files, '.nojekyll', 'release.json'].sort());
    for (const file of files) assert.equal(await readFile(join(root, 'dist', file), 'utf8'), `fixture:${file}`);
    assert.deepEqual(JSON.parse(await readFile(join(root, 'dist/release.json'), 'utf8')), { commit: sha });
  } finally { await rm(root, { recursive: true, force: true }); }
});
