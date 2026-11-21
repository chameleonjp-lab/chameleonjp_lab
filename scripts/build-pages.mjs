import { copyFile, lstat, mkdtemp, mkdir, rename, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

// Explicit allowlist: never publish repository metadata, tests, SQL or secrets.
const rootFiles = ['index.html', 'ranking.html', 'terms.html', 'inubo-ranking.html', 'inubo-ranking.js', 'chameleol-ranking.js', 'chameleol-hof.css', 'chameleol-hof.js', 'IMG_7589.JPG', 'banner'];
const translations = [
  'common.js', 'ranking.js', 'games-1.js', 'games-2.js', 'games-3.js',
  'extras.js', 'hall.js', 'terms-1.js', 'terms-2.js', 'terms-3.js',
  'runtime.js', 'language.css'
];
const files = [...rootFiles, ...translations.map(file => 'i18n/' + file)];
const commit = process.env.GITHUB_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('A full commit SHA is required');
const root = process.cwd();
const destination = resolve(root, 'dist');
// Trusted build root, no concurrent writers. This is not a hostile-filesystem sandbox.
async function outputState() {
  try {
    const info = await lstat(destination);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Unsafe output path: dist must be a real directory or absent');
    return info;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}
const original = await outputState();
const translationDirectory = await lstat(join(root, 'i18n'));
if (!translationDirectory.isDirectory() || translationDirectory.isSymbolicLink()) {
  throw new Error('Unsafe source path: i18n must be a real directory');
}
for (const file of files) {
  const info = await lstat(join(root, file));
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`Unsafe source path: ${file}`);
}
// Exclusive sibling paths keep retained history outside the published dist allowlist.
const stage = await mkdtemp(join(root, '.lab-pages-build-'));
console.log(`Build staging retained on failure: ${stage}`);
await mkdir(join(stage, 'i18n'));
for (const file of files) await copyFile(join(root, file), join(stage, file), constants.COPYFILE_EXCL);
await writeFile(join(stage, '.nojekyll'), '', { flag: 'wx' });
await writeFile(join(stage, 'release.json'), `${JSON.stringify({ commit })}\n`, { flag: 'wx' });
const current = await outputState();
if (Boolean(original) !== Boolean(current) || (original && (original.dev !== current.dev || original.ino !== current.ino))) {
  throw new Error('Output changed during build; staging retained without replacement');
}
if (current) {
  const retained = await mkdtemp(join(root, '.lab-pages-previous-'));
  const previous = join(retained, 'dist');
  console.log(`Previous output will be retained at: ${previous}`);
  await rename(destination, previous);
}
// If this fails, old output remains in its retained directory; no deletion/overwrite recovery.
await rename(stage, destination);
console.log(`Built ${files.length} runtime files for ${commit}`);
