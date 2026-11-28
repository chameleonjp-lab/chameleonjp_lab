#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const IRONARABE_URL = 'https://chameleonjp-lab.github.io/ironarabe/';
export const OLD_IRONARABE_URL = 'https://chameleonjp.codeberg.page/ironarabe/';

// Data fingerprints from 88ad6a8 plus the reviewed Iroate URL-only migration. Only the
// exact Ironarabe URL is normalized; every other URL and field stays covered.
// The Chameleol, Inubo, Ikagetto, Jungle Gym Tag and Medjed additions were checked against every prior catalog row.
// The Medjed URL casing change and the verified Songen 3 Online addition are included.
// Galaxy Shark is the only addition to the preceding catalog and fallback entries.
// Literal fingerprints keep this check usable in a shallow checkout.
const baseline = {
  'catalog/games.json': { hash: '5e1ea5617457500890b5219e1501803f29ef54d8827fbbbda7be7780dd7d0a78', occurrences: 2 },
  'index.html': { hash: '5526cd6b9281e9810d028d3626ea5271c0768529f2a215794e15cb577f4d2435', occurrences: 2 },
  'ranking.html': { hash: 'd3dc98fff451bc51b7d298f63411473077ea40a532c2cc4412bace1035ccb6bc', occurrences: 4 }
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
