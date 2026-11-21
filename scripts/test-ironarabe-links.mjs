#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const IRONARABE_URL = 'https://chameleonjp-lab.github.io/ironarabe/';
export const OLD_IRONARABE_URL = 'https://chameleonjp.codeberg.page/ironarabe/';

// Data fingerprints from 88ad6a8 plus the reviewed Iroate URL-only migration. Only the
// exact Ironarabe URL is normalized; every other URL and field stays covered.
// The Chameleol and Inubo additions were checked against every prior catalog row.
// Literal fingerprints keep this check usable in a shallow checkout.
const baseline = {
  'catalog/games.json': { hash: 'b20765d0eea07e7f88484c0862345638f5d3c2ea52df3bead12ab547b980ce11', occurrences: 2 },
  'index.html': { hash: '4bf423dcb009cbb31651a985b18cb6e2e2e0eeab24a6f4fe1b10166122c02ae5', occurrences: 2 },
  'ranking.html': { hash: 'd95390a06ce91aa09e29317e9a34a3ef57528a03eb1d170dd8af7e30222d7a3a', occurrences: 4 }
};

function inlineArray(source, marker) {
  const markerIndex = source.indexOf(marker);
  assert.ok(markerIndex >= 0, `Missing fallback catalog: ${marker}`);
  const start = source.indexOf('[', markerIndex);
  const end = source.indexOf('\n];', start);
  assert.ok(start >= 0 && end > start, `Incomplete fallback catalog: ${marker}`);
  return JSON.parse(source.slice(start, end + 2));
}

export function loadLinkSources() {
  return Object.entries(baseline).map(([file, expected]) => {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    const data = file.endsWith('.json') ? JSON.parse(source)
      : inlineArray(source, file === 'index.html' ? 'let GAMES =' : 'const GAME_PAGES =');
    return { file, source, data, expected };
  });
}

function checkLink(record, urlKey, shareKey, label) {
  assert.equal(record[urlKey], IRONARABE_URL, `${label}: play URL`);
  const share = record[shareKey];
  assert.equal(typeof share, 'string', `${label}: share text`);
  assert.equal(share.split(/\\n|\n/).at(-1), IRONARABE_URL, `${label}: share URL`);
  assert.equal(share.split(IRONARABE_URL).length - 1, 1, `${label}: one canonical share URL`);
}

function checkScore(record, snakeCase, label) {
  const keys = snakeCase
    ? ['score_order', 'score_scale', 'score_decimals']
    : ['scoreOrder', 'scoreScale', 'scoreDecimals'];
  assert.deepEqual(keys.map(key => record[key]), ['asc', 100, 2], `${label}: unchanged time score contract`);
}

export function validateIronarabeLinks() {
  const sources = loadLinkSources();
  for (const { file, source, data, expected } of sources) {
    assert.ok(!source.includes(OLD_IRONARABE_URL), `${file}: retired Ironarabe URL remains`);
    assert.equal(source.split(IRONARABE_URL).length - 1, expected.occurrences, `${file}: canonical URL occurrences`);
    const normalized = JSON.stringify(data)
      .replaceAll(OLD_IRONARABE_URL, '<IRONARABE_URL>')
      .replaceAll(IRONARABE_URL, '<IRONARABE_URL>');
    assert.equal(createHash('sha256').update(normalized).digest('hex'), expected.hash,
      `${file}: non-URL fields or other games changed from the pinned baseline`);
  }

  const game = sources[0].data.games.find(row => row.game_slug === 'ironarabe');
  assert.ok(game, 'Ironarabe remains in the catalog');
  checkLink(game, 'game_url', 'share_text', 'catalog');
  checkScore(game, true, 'catalog');

  const card = sources[1].data.find(row => row.slug === 'ironarabe');
  assert.ok(card, 'Ironarabe remains in the list fallback');
  checkLink(card, 'url', 'shareText', 'list fallback');
  checkScore(card, false, 'list fallback');
  assert.equal(card.detailSlug, 'ironarabe');
  assert.equal(card.rankingSlug, 'ironarabe');
  assert.deepEqual(card.statsSlugs, ['ironarabe']);

  const page = sources[2].data.find(row => row.pageSlug === 'ironarabe');
  assert.ok(page, 'Ironarabe remains in the ranking fallback');
  checkLink(page, 'url', 'shareText', 'ranking page fallback');
  assert.equal(page.difficulties.length, 1);
  const difficulty = page.difficulties[0];
  assert.equal(difficulty.slug, 'ironarabe');
  checkLink(difficulty, 'url', 'shareText', 'ranking entry fallback');
  checkScore(difficulty, false, 'ranking entry fallback');
  return sources;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  validateIronarabeLinks();
  console.log('Ironarabe URL regression checks passed: catalog, both fallbacks, shares, asc/100/2, and all baseline fields.');
}
