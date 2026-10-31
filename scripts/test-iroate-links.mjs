#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const IROATE_URL = 'https://chameleonjp-lab.github.io/iroate/';
export const OLD_IROATE_URL = 'https://chameleonjp.codeberg.page/iroate/';

// Data fingerprints from main 419e25e68f3ee57f9e9d5030106d3fa418c43435. Only the
// exact Iroate URL is normalized; every other URL and field stays covered.
// Literal fingerprints keep this check usable in a shallow checkout.
const baseline = {
  'catalog/games.json': { hash: 'e97c7fe64605d0e5a3426f119eb16966ac0a112e067c5a056c2a411044445cd4', occurrences: 2 },
  'index.html': { hash: 'e3bcb733d30211f30436be09e6f4b0c517c5f4c80a8ba26e3a79dade9e9ef7d1', occurrences: 2 },
  'ranking.html': { hash: '15baaa6d91837d908179b185a9d18ac3a897c3bb9f2dd134b7b3ba7d718b25bd', occurrences: 4 }
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
  assert.equal(record[urlKey], IROATE_URL, `${label}: play URL`);
  const share = record[shareKey];
  assert.equal(typeof share, 'string', `${label}: share text`);
  assert.equal(share.split(/\\n|\n/).at(-1), IROATE_URL, `${label}: share URL`);
  assert.equal(share.split(IROATE_URL).length - 1, 1, `${label}: one canonical share URL`);
}

function checkScore(record, snakeCase, label) {
  const keys = snakeCase
    ? ['score_order', 'score_scale', 'score_decimals']
    : ['scoreOrder', 'scoreScale', 'scoreDecimals'];
  assert.deepEqual(keys.map(key => record[key]), ['asc', 100, 2], `${label}: unchanged time score contract`);
}

export function validateIroateLinks() {
  const sources = loadLinkSources();
  for (const { file, source, data, expected } of sources) {
    assert.ok(!source.includes(OLD_IROATE_URL), `${file}: retired Iroate URL remains`);
    assert.equal(source.split(IROATE_URL).length - 1, expected.occurrences, `${file}: canonical URL occurrences`);
    const normalized = JSON.stringify(data)
      .replaceAll(OLD_IROATE_URL, '<IROATE_URL>')
      .replaceAll(IROATE_URL, '<IROATE_URL>');
    assert.equal(createHash('sha256').update(normalized).digest('hex'), expected.hash,
      `${file}: non-URL fields or other games changed from the pinned baseline`);
  }

  const game = sources[0].data.games.find(row => row.game_slug === 'iroate');
  assert.ok(game, 'Iroate remains in the catalog');
  checkLink(game, 'game_url', 'share_text', 'catalog');
  checkScore(game, true, 'catalog');

  const card = sources[1].data.find(row => row.slug === 'iroate');
  assert.ok(card, 'Iroate remains in the list fallback');
  checkLink(card, 'url', 'shareText', 'list fallback');
  checkScore(card, false, 'list fallback');
  assert.equal(card.detailSlug, 'iroate');
  assert.equal(card.rankingSlug, 'iroate');
  assert.deepEqual(card.statsSlugs, ['iroate']);

  const page = sources[2].data.find(row => row.pageSlug === 'iroate');
  assert.ok(page, 'Iroate remains in the ranking fallback');
  checkLink(page, 'url', 'shareText', 'ranking page fallback');
  assert.equal(page.difficulties.length, 1);
  const difficulty = page.difficulties[0];
  assert.equal(difficulty.slug, 'iroate');
  checkLink(difficulty, 'url', 'shareText', 'ranking entry fallback');
  checkScore(difficulty, false, 'ranking entry fallback');
  return sources;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  validateIroateLinks();
  console.log('Iroate URL regression checks passed: catalog, both fallbacks, shares, asc/100/2, and all baseline fields.');
}
