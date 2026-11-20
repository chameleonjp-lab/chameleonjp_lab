import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const languages = ['ja','en','es','pt-BR','zh-Hans','fr','de','ko','ru','it','zh-Hant','id','tr','vi','th'];
const group = {
  'index.html': ['common.js','ranking.js','games-1.js','games-2.js','games-3.js','extras.js'],
  'ranking.html': ['common.js','ranking.js','games-1.js','games-2.js','games-3.js','extras.js','hall.js'],
  'terms.html': ['common.js','extras.js','terms-1.js','terms-2.js','terms-3.js'],
};
const loaded = new Map();

function rowsFor(file) {
  if (loaded.has(file)) return loaded.get(file);
  const source = read('i18n/' + file);
  new Script(source, { filename: file });
  const match = source.match(/\.concat\((\[[\s\S]*\])\);/);
  assert.ok(match, file + ' must contain a JSON data table');
  const rows = JSON.parse(match[1]);
  for (const row of rows) {
    assert.equal(row.length, languages.length, 'locale count in ' + file + ': ' + row[0]);
    for (const [index, value] of row.entries()) {
      assert.equal(typeof value, 'string', 'string translation in ' + file);
      assert.ok(value.trim().length > 0, languages[index] + ' missing ' + row[0]);
    }
    assert.equal(row[0], row[0].normalize('NFC'), file + ' Japanese key normalization');
  }
  loaded.set(file, rows);
  return rows;
}
for (const [page, assets] of Object.entries(group)) {
  const html = read(page);
  assert.match(html, /i18n\/language\.css/);
  assert.match(html, /i18n\/runtime\.js/);
  let pos = -1;
  const seen = new Set();
  for (const asset of assets) {
    const marker = 'i18n/' + asset;
    assert.ok(html.includes(marker), page + ' missing asset ' + asset);
    const next = html.indexOf(marker);
    assert.ok(next > pos, page + ' dictionary order: ' + asset);
    pos = next;
    for (const row of rowsFor(asset)) {
      assert.ok(!seen.has(row[0]), page + ' duplicate key: ' + row[0]);
      seen.add(row[0]);
    }
  }
  assert.ok(html.indexOf('i18n/runtime.js') > pos, page + ' runtime runs last');
}
const available = new Set(group['index.html'].flatMap(file => rowsFor(file).map(row => row[0])));
const catalog = JSON.parse(read('catalog/games.json'));
for (const game of catalog.games) {
  assert.ok(available.has(game.title), 'missing game title: ' + game.game_slug);
  assert.ok(available.has(game.description), 'missing game description: ' + game.game_slug);
  for (const field of ['score_unit','score_label','first_score_label','best_score_label']) {
    if (game[field]) assert.ok(available.has(game[field]), 'missing ' + field + ': ' + game.game_slug + ' / ' + game[field]);
  }
}
const termsHtml = read('terms.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/g,'');
const termsAvailable = new Set(group['terms.html'].flatMap(file => rowsFor(file).map(row => row[0])));
const staticTexts = [...termsHtml.matchAll(/>([^<>]*[\u3040-\u30ff\u3400-\u9fff][^<>]*)</g)]
  .map(match => match[1].replace(/\s+/g,' ').trim()).filter(Boolean);
for (const phrase of staticTexts) {
  if (phrase.includes('｜')) continue;
  assert.ok(termsAvailable.has(phrase), 'missing terms paragraph: ' + phrase);
}
const runtime = read('i18n/runtime.js');
new Script(runtime, { filename: 'i18n/runtime.js' });
assert.ok(runtime.includes('.player-name, .rank-name, bdi'), 'player names must never be translated');
assert.ok(runtime.includes("localStorage.setItem('chameleonjp_lab_language'"), 'persist language preference');
assert.ok(runtime.includes("new MutationObserver(scheduleApply)"), 'translate rankings loaded asynchronously');
assert.ok(runtime.includes("return 'ja';"), 'preserve Japanese default');
console.log('i18n dictionaries verified: 15 languages, ' + catalog.games.length + ' catalog games, 3 pages, ' +
  [...loaded.values()].reduce((sum, rows) => sum + rows.length, 0) + ' localized rows');
