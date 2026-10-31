import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

// Explicit allowlist: never publish repository metadata, tests, SQL or secrets.
const files = ['index.html', 'ranking.html', 'terms.html', 'IMG_7589.JPG', 'banner'];
const commit = process.env.GITHUB_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('A full commit SHA is required');
await rm('dist', { recursive: true, force: true });
await mkdir('dist');
for (const file of files) await copyFile(file, `dist/${file}`);
await writeFile('dist/.nojekyll', '');
await writeFile('dist/release.json', `${JSON.stringify({ commit })}\n`);
console.log(`Built ${files.length} runtime files for ${commit}`);
