import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';

const base = 'https://chameleonjp-lab.github.io';
const api = 'https://verified.example.test/functions/v1/kamereoru';
const output = new URL('../dist/', import.meta.url);
const catalog = JSON.parse(await readFile(new URL('../catalog/games.json', import.meta.url), 'utf8')).games;
const chameleol = catalog.find(game => game.game_slug === 'chameleol');
const iroate = catalog.find(game => game.game_slug === 'iroate');
const takkeu = { ...chameleol, game_slug: 'takkeu', title: 'タッケウ', game_url: base + '/takkeu/' };
const acceptanceRows = [
  { position: 1, rank: 1, name: 'A<&>', buildings: 50, average: 9999 },
  { position: 2, rank: 2, name: 'B', buildings: 30, average: 8888 },
];
const boundaryRows = Array.from({ length: 32 }, (_, index) => ({
  position: index + 1, rank: Math.min(index + 1, 30), name: '同率テスト' + index,
  buildings: 50, average: 10000 - Math.min(index, 29),
}));

// Simulate the deployed SDK reading active public.games entries. Keep all calls offline.
function catalogSdk(games) {
  function from() {
    const predicates = [];
    const rows = () => games.filter(game => predicates.every(([key, value]) => game[key] === value));
    const query = {
      select() { return query; },
      eq(key, value) { predicates.push([key, value]); return query; },
      order() { return Promise.resolve({ data: rows() }); },
      maybeSingle() { return Promise.resolve({ data: rows()[0] }); },
    };
    return query;
  }
  async function rpc(name, args) {
    window.rpcCalls.push({name, slug: args.p_game_slug});
    switch (name) {
      case 'get_game_play_stats': return {data:[{total_play_count:5,player_count:2}]};
      case 'get_best_score_ranking':
      case 'get_first_try_ranking':
      case 'get_play_count_ranking': return {data:[{rank_no:1,display_name:'対照',best_score:34,first_score:35,play_count:5}]};
      case 'get_takkeu_abnormal_entries_v1':
      case 'get_disqualified_score_entries': return {data:[]};
      default: throw new Error('Unexpected RPC: ' + name);
    }
  }
  window.rpcCalls = [];
  window.supabase = { createClient: () => ({from, rpc}) };
}

for (const engine of [chromium, webkit]) {
  const browser = await engine.launch();
  try {
    const page = await browser.newPage();
    const calls = [];
    const errors = [];
    let failNextStats = true;
    let rankingRows = acceptanceRows;
    let totalPlays = 4;
    let listedGames = [chameleol, iroate, takkeu];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      assert.equal(route.request().method(), 'GET');
      calls.push(url.href);
      if (url.hostname === 'cdn.jsdelivr.net') {
        const body = '(' + catalogSdk.toString() + ')(' + JSON.stringify(listedGames) + ');';
        return route.fulfill({contentType: 'application/javascript', body});
      }
      if (url.pathname.startsWith('/chameleonjp_lab/')) {
        const file = url.pathname.split('/').pop() || 'index.html';
        const types = {'index.html':'text/html','ranking.html':'text/html','chameleol-ranking.js':'text/javascript','banner':'image/jpeg','IMG_7589.JPG':'image/jpeg'};
        if (Object.hasOwn(types,file)) {
          return route.fulfill({contentType:types[file],body:await readFile(new URL(file,output))});
        }
      }
      if (url.href === base+'/chameleol/release.json') {
        return route.fulfill({json:{env:'production',rankingApi:api}});
      }
      if (url.href === api+'/stats') {
        if (failNextStats) {
          failNextStats = false;
          return route.fulfill({status:503});
        }
        return route.fulfill({json:{ok:true,totalPlays,clearerCount:rankingRows === acceptanceRows ? 1 : rankingRows.length}});
      }
      if (url.href.startsWith(api+'/ranking?')) {
        const after = Number(url.searchParams.get('after') || 0);
        const limit = Number(url.searchParams.get('limit'));
        if (after) assert.equal(url.searchParams.get('version'),'17');
        const selected = rankingRows.slice(after,after+limit);
        return route.fulfill({json:{ok:true,version:17,restarted:false,rows:selected,
          nextAfter:after+limit < rankingRows.length ? after+limit : null}});
      }
      if (url.pathname.endsWith('/hall-of-fame')) {
        const after = url.searchParams.get('after');
        const version = '1'.repeat(32);
        if (after) assert.equal(url.searchParams.get('version'), version);
        const rows = !totalPlays ? [] : after
          ? [{ordinal:2, name:'後からクリア'}] : [{ordinal:1, name:'最初の<クリア>'}];
        return route.fulfill({json:{ok:true, version, rows, nextAfter:rows.length && !after ? 1 : null, restarted:false}});
      }
      return route.fulfill({status:503,body:'Offline fixture'});
    });
    await page.goto(base+'/chameleonjp_lab/index.html');
    await page.locator('[data-accordion=chameleol]').click();
    await page.locator('#game-chameleol').getByRole('button',{name:'再試行'}).click();
    await page.waitForFunction(() => document.querySelector('#plays-chameleol')?.textContent === '4回');
    assert.equal(await page.locator('#players-chameleol').textContent(),'1人');
    await page.locator('#ranking-chameleol .rank-row').first().waitFor();
    // A repeat open must reflect newly recorded games in the public overview.
    await page.locator('[data-accordion=chameleol]').click();
    totalPlays = 6;
    await page.locator('[data-accordion=chameleol]').click();
    await page.waitForFunction(() => document.querySelector('#plays-chameleol')?.textContent === '6回', null, {timeout:5000});
    totalPlays = 4;
    assert.equal(await page.locator('#ranking-chameleol .rank-name').first().textContent(),'A<&>');
    await page.locator('#detail-chameleol').click();
    await page.waitForFunction(() => document.querySelectorAll('#bestRanking .rank-row').length === 2);
    assert.deepEqual(await page.locator('#bestRanking .rank-name').allTextContents(), ['A<&>', 'B']);
    assert.equal(await page.locator('#bestRanking .rank-score').first().textContent(), '50棟 · 99.99%');
    assert.equal(await page.locator('#bestRanking').getAttribute('data-version'),'17');
    assert.equal(await page.locator('#totalPlayCount').textContent(),'4回');
    assert.equal(await page.locator('#playerCount').textContent(),'1人');
    assert.equal(await page.getByText('初クリア人数（登録名単位）',{exact:true}).count(),1);
    assert.equal(await page.getByRole('tab').count(),2);
    await page.getByRole('tab', {name:'殿堂入り'}).click();
    await page.locator('#hallRanking .rank-row').first().waitFor();
    assert.deepEqual(await page.locator('#hallRanking .rank-name').allTextContents(), ['最初の<クリア>']);
    await page.getByRole('button', {name:'次の50件'}).click();
    await page.locator('#hallRanking .rank-row').nth(1).waitFor();
    assert.deepEqual(await page.locator('#hallRanking .rank-no').allTextContents(), ['1人目','2人目']);
    assert.equal(await page.locator('#bestPanel').isVisible(), false);
    assert.equal(await page.getByRole('link',{name:'ゲームで遊ぶ'}).getAttribute('href'),base+'/chameleol/');
    assert.deepEqual(await page.evaluate(() => window.rpcCalls), []);
    rankingRows = boundaryRows;
    totalPlays = 42;
    await page.reload();
    await page.waitForFunction(() => document.querySelectorAll('#bestRanking .rank-row').length === 32);
    assert.equal(await page.locator('#bestRanking .rank-no').last().textContent(),'30位');
    rankingRows = [];
    totalPlays = 0;
    await page.reload();
    await page.locator('#bestRanking').getByText('まだ記録がありません').waitFor();
    assert.equal(await page.locator('#totalPlayCount').textContent(),'0回');
    await page.getByRole('tab', {name:'殿堂入り'}).click();
    await page.getByText('まだ殿堂入りした方はいません').waitFor();
    for (const [game, abnormal] of [[takkeu, 'get_takkeu_abnormal_entries_v1'], [iroate, 'get_disqualified_score_entries']]) {
      await page.goto(base + '/chameleonjp_lab/ranking.html?game=' + game.game_slug);
      await page.locator('#bestRanking .player-name').first().waitFor();
      assert.equal(await page.getByRole('tab').count(), 3);
      assert.equal(await page.locator('#totalPlayCount').textContent(), '5回');
      assert.equal(await page.getByRole('link', {name: 'ゲームで遊ぶ'}).getAttribute('href'), game.game_url);
      await page.waitForFunction(rpc => window.rpcCalls.some(call => call.name === rpc), abnormal);
    }
    await page.goto(base + '/chameleonjp_lab/index.html');
    const pendingStats = Promise.withResolvers();
    const finishStats = Promise.withResolvers();
    const heldStats = async route => {
      pendingStats.resolve();
      await finishStats.promise;
      return route.fallback();
    };
    await page.route(api + '/stats', heldStats);
    try {
      await page.locator('[data-accordion=chameleol]').click();
      await pendingStats.promise;
      await page.locator('[data-accordion=iroate]').click();
      await page.locator('#ranking-iroate .rank-name').getByText('対照').waitFor();
      assert.equal(await page.locator('#plays-iroate').textContent(), '5回');
    } finally {
      finishStats.resolve();
      await page.unroute(api + '/stats', heldStats);
    }
    listedGames = [iroate, takkeu];
    await page.reload();
    await page.locator('[data-accordion=iroate]').waitFor();
    assert.equal(await page.locator('[data-accordion=chameleol]').count(), 0);

    // Keep a real script request pending. The direct detail link must work before DOMContentLoaded.
    const sdkRequested = Promise.withResolvers();
    const resumeSdk = Promise.withResolvers();
    await page.route('https://cdn.jsdelivr.net/**', async route => {
      sdkRequested.resolve();
      await resumeSdk.promise;
      return route.fallback();
    });
    try {
      failNextStats = true;
      await page.goto(base + '/chameleonjp_lab/ranking.html?game=chameleol', {waitUntil: 'commit'});
      await sdkRequested.promise;
      const play = page.getByRole('link', {name: 'ゲームで遊ぶ'});
      assert.equal(await play.getAttribute('href', {timeout: 5000}), base + '/chameleol/');
      await page.getByRole('button', {name: '再試行'}).click({timeout: 5000});
      await page.waitForFunction(() => document.querySelector('#totalPlayCount')?.textContent === '0回');
      await page.locator('#bestRanking').getByText('まだ記録がありません').waitFor();
    } finally {
      resumeSdk.resolve();
      await page.waitForLoadState('load');
    }
    assert.deepEqual(errors,[]);
    assert.ok(!calls.some(url=>url.includes('/rest/v1/rpc/')));
    console.log(engine.name()+': built list → 32-row detail → canonical game link, retry and zero verified');
  } finally { await browser.close(); }
}
