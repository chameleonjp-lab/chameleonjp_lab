#!/usr/bin/env node
'use strict';

// With Playwright and its browsers installed: node scripts/test-ironarabe-links-browser.cjs
// Optional: --browser=chromium or --browser=webkit (default: both).
// Every request is fulfilled or rejected by a route; nothing reaches production.
const assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright');

const origin = 'https://lab.example.test';
const ranks = [1, 1, 3];
const names = ['同率A<&>', '同率B', '既存C'];
const scores = ['34.15秒', '34.15秒', '40.00秒'];

function sdkSource(games) {
  return `(${function installFixture(rows, playerNames) {
    window.__fixtureCalls = [];
    const log = (operation, detail) => window.__fixtureCalls.push({ operation, ...detail });
    function query(table) {
      if (table !== 'games') throw new Error('Unexpected fixture table: ' + table);
      const filters = [];
      let ordering;
      const result = () => {
        log('select', { table, filters: [...filters], ordering });
        const data = rows.filter(row => filters.every(([key, value]) => row[key] === value));
        if (ordering) data.sort((a, b) => a[ordering] - b[ordering]);
        return data;
      };
      const builder = {
        select() { return builder; },
        eq(key, value) { filters.push([key, value]); return builder; },
        order(key) { ordering = key; return builder; },
        maybeSingle() { return Promise.resolve({ data: result()[0] || null, error: null }); },
        then(resolve, reject) { return Promise.resolve({ data: result(), error: null }).then(resolve, reject); }
      };
      return builder;
    }
    async function rpc(name, args) {
      log('rpc', { name, args });
      const ranking = playerNames.map((display_name, i) => ({
        display_name, rank_no: [1, 1, 3][i],
        first_score: [3415, 3415, 4000][i],
        best_score: [2415, 2415, 3000][i],
        play_count: [7, 7, 3][i]
      }));
      if (name === 'get_game_play_stats') return { data: [{ total_play_count: 17, player_count: 3 }], error: null };
      if (['get_first_try_ranking', 'get_best_score_ranking', 'get_play_count_ranking'].includes(name)) {
        return { data: ranking.slice(0, args.p_limit), error: null };
      }
      if (name === 'get_disqualified_score_entries') return { data: [], error: null };
      throw new Error('Unexpected or mutating fixture RPC: ' + name);
    }
    window.supabase = { createClient() { return { from: query, rpc }; } };
  }.toString()})(${JSON.stringify(games)}, ${JSON.stringify(names)});`;
}

async function browserCase(browser, mode, helpers) {
  const { IRONARABE_URL, OLD_IRONARABE_URL, loadLinkSources } = helpers;
  const [catalog, index, ranking] = loadLinkSources();
  const target = catalog.data.games.find(game => game.game_slug === 'ironarabe');
  const other = catalog.data.games.find(game => game.game_slug === 'torani_yasashiku');
  assert.ok(other);
  const fixtureTitle = 'イロナラベ（カタログ検証）';
  const fixtures = [
    { ...target, title: fixtureTitle, description: 'Supabaseカタログの検証用説明' },
    other,
    { ...other, game_slug: 'inactive_fixture', title: '非公開の検証用ゲーム', is_active: false }
  ];
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const requests = [];
  const pageErrors = [];
  try {
    await context.addInitScript(({ nativeShare }) => {
      window.__shared = [];
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: nativeShare ? async payload => window.__shared.push({ kind: 'share', ...payload }) : undefined
      });
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async text => window.__shared.push({ kind: 'clipboard', text }) }
      });
    }, { nativeShare: mode === 'catalog' });

    await context.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      requests.push({ url: request.url(), method: request.method() });
      if (url.origin === origin && ['/index.html', '/ranking.html'].includes(url.pathname)) {
        return route.fulfill({ contentType: 'text/html; charset=utf-8', body: url.pathname === '/index.html' ? index.source : ranking.source });
      }
      if (url.hostname === 'cdn.jsdelivr.net' && url.pathname.includes('@supabase/supabase-js@2')) {
        return route.fulfill({ contentType: 'application/javascript', body: mode === 'catalog' ? sdkSource(fixtures) : '/* SDK unavailable in this fixture. */' });
      }
      // This includes the REST catalog fallback, images and lazy banners.
      // No request is continued to a local or external server.
      return route.fulfill({ status: 503, contentType: 'text/plain', body: 'Blocked by offline fixture' });
    });

    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    page.on('pageerror', error => pageErrors.push(error.message));
    async function checkShare(selector) {
      await page.locator(selector).click();
      await page.waitForFunction(() => window.__shared.length === 1);
      const shared = await page.evaluate(() => window.__shared[0]);
      assert.equal(shared.kind, mode === 'catalog' ? 'share' : 'clipboard');
      assert.ok(!shared.text.includes(OLD_IRONARABE_URL));
      assert.equal(shared.text.split(IRONARABE_URL).length - 1, 1);
      assert.equal(shared.text.split(/\\n|\n/).at(-1), IRONARABE_URL);
    }
    async function rowTexts(selector) {
      return page.locator(selector).allTextContents();
    }

    await page.goto(`${origin}/index.html`, { waitUntil: 'load' });
    await page.locator('#game-ironarabe').waitFor();
    const card = page.locator('#game-ironarabe');
    assert.equal(await card.locator('.accordion-title-text').textContent(), mode === 'catalog' ? fixtureTitle : target.title);
    if (mode === 'catalog') {
      assert.equal(await page.locator('.game-card').count(), 2, 'active Supabase catalog replaces the fallback list');
      assert.equal(await page.locator('#game-inactive_fixture').count(), 0);
    }
    await card.locator('[data-accordion]').click();
    assert.equal(await card.getByRole('link', { name: '遊ぶ', exact: true }).getAttribute('href'), IRONARABE_URL);
    assert.match(await card.getByRole('link', { name: /詳細ランキング/ }).getAttribute('href'), /ranking\.html\?game=ironarabe$/);
    await checkShare('[data-share="ironarabe"]');
    if (mode === 'catalog') {
      await page.locator('#ranking-ironarabe .rank-row').first().waitFor();
      assert.deepEqual(await rowTexts('#ranking-ironarabe .rank-no'), ranks.map(rank => `${rank}位`));
      assert.deepEqual(await rowTexts('#ranking-ironarabe .rank-name'), names);
      assert.deepEqual(await rowTexts('#ranking-ironarabe .rank-score'), ['24.15秒', '24.15秒', '30.00秒']);
      const calls = await page.evaluate(() => window.__fixtureCalls);
      assert.ok(calls.some(call => call.operation === 'select' && call.ordering === 'display_order' && call.filters.some(([key, value]) => key === 'is_active' && value === true)));
      assert.ok(calls.some(call => call.name === 'get_best_score_ranking' && call.args.p_game_slug === 'ironarabe' && call.args.p_limit === 3));
    } else {
      await page.waitForFunction(() => document.getElementById('ranking-ironarabe').textContent.includes('coming soon'));
    }

    await page.goto(`${origin}/ranking.html?game=ironarabe`, { waitUntil: 'load' });
    await page.locator('#shareButton').waitFor();
    assert.equal(await page.locator('.summary-title').textContent(), mode === 'catalog' ? fixtureTitle : target.title);
    assert.equal(await page.getByRole('link', { name: 'ゲームで遊ぶ', exact: true }).getAttribute('href'), IRONARABE_URL);
    await checkShare('#shareButton');
    if (mode === 'catalog') {
      await page.waitForFunction(() => document.querySelectorAll('#playsRanking .detail-row').length === 3);
      for (const panel of ['firstRanking', 'bestRanking', 'playsRanking']) {
        assert.deepEqual(await rowTexts(`#${panel} .rank-no`), ranks.map(rank => `${rank}位`));
        assert.deepEqual(await rowTexts(`#${panel} .player-name`), names);
      }
      assert.deepEqual(await rowTexts('#firstRanking .mini-value'), scores);
      assert.deepEqual(await rowTexts('#bestRanking .best-score .mini-value'), ['24.15秒', '24.15秒', '30.00秒']);
      assert.deepEqual(await rowTexts('#playsRanking .primary-score .mini-value'), ['7回', '7回', '3回']);
      assert.equal(await page.locator('#totalPlayCount').textContent(), '17回');
      assert.equal(await page.locator('#playerCount').textContent(), '3人');
      await page.locator('#bestTab').click();
      assert.equal(await page.locator('#bestPanel').isVisible(), true);
      await page.locator('#playsTab').click();
      assert.equal(await page.locator('#playsPanel').isVisible(), true);
      const calls = await page.evaluate(() => window.__fixtureCalls);
      assert.ok(calls.some(call => call.operation === 'select' && call.filters.some(([key, value]) => key === 'game_slug' && value === 'ironarabe')));
      for (const rpc of ['get_first_try_ranking', 'get_best_score_ranking', 'get_play_count_ranking']) {
        assert.ok(calls.some(call => call.name === rpc && call.args.p_game_slug === 'ironarabe' && call.args.p_limit === 100), rpc);
      }
    } else {
      await page.waitForFunction(() => document.getElementById('firstRanking').textContent.includes('coming soon'));
      assert.equal(await page.locator('.detail-row').count(), 0);
      assert.equal(await page.evaluate(() => typeof window.supabase), 'undefined');
    }
    assert.deepEqual(pageErrors, []);
    assert.ok(requests.every(request => request.method === 'GET'), 'no write request was attempted');
    assert.ok(requests.every(request => !request.url.startsWith(IRONARABE_URL) && !request.url.startsWith(OLD_IRONARABE_URL)), 'game links were inspected without visiting production');
    return requests.length;
  } finally {
    await context.close();
  }
}

(async () => {
  const helpers = await import('./test-ironarabe-links.mjs');
  const selection = process.argv.find(argument => argument.startsWith('--browser='))?.split('=')[1] || 'all';
  assert.ok(['all', 'chromium', 'webkit'].includes(selection), 'Use --browser=chromium or --browser=webkit');
  for (const [name, engine] of Object.entries({ chromium, webkit })) {
    if (selection !== 'all' && selection !== name) continue;
    const browser = await engine.launch({ headless: true });
    try {
      for (const mode of ['catalog', 'fallback']) {
        const count = await browserCase(browser, mode, helpers);
        console.log(`${name}/${mode}: list and detail links, sharing and ranking checks passed; ${count} requests intercepted.`);
      }
    } finally {
      await browser.close();
    }
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
