import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HOF_TITLES, getHofRankMeta } from '../chameleol-hof.js';

const source = readFileSync(new URL('../docs/chameleol-hof-1-300-title-proposals.md', import.meta.url), 'utf8');
const listed = [...source.matchAll(/^\|\s*(\d+)号\s*\|\s*([^|]+?)\s*\|/gm)]
  .map(match => [Number(match[1]), match[2].trim()]);
assert.equal(listed.length, 300, 'All 300 proposal entries must be retained');
assert.equal(HOF_TITLES.length, 300);
assert.equal(new Set(HOF_TITLES).size, 300, 'No duplicate titles');
for (let i = 0; i < 300; i++) {
  const [ordinal, title] = listed[i];
  assert.equal(ordinal, i + 1, 'Ordinals must be sequential');
  assert.equal(HOF_TITLES[i], title, 'Titles must match the reviewed document');
  const rendered = getHofRankMeta(ordinal);
  assert.equal(rendered.title, title);
  assert.equal(rendered.badge, '', 'Old milestone badges must be removed');
  assert.equal(rendered.tier, 'standard', 'Numbers must not imply a hierarchy');
}
for (const invalid of [-1, 0, 301, 1000, 1.5, NaN, Infinity, '1']) {
  const result = getHofRankMeta(invalid);
  assert.equal(result.title, '50棟完全踏破・殿堂入り怪盗');
  assert.equal(result.badge, '');
}
assert.equal(getHofRankMeta(1).title, '夜明けを盗むカメレオン');
assert.equal(getHofRankMeta(300).title, 'カメレオるの永遠の逃走者');
console.log('Hall of Fame title check passed: 300 unique ordinals and safe fallback');
