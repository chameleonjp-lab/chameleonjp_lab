import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';
import { timeAttackMode, timeAttackRows, timeAttackPageResponse } from './fixtures/chameleol-time-attack.mjs';
import { titles as timeAttackTitles } from '../i18n/chameleol-time-attack.js';

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
    let failNextParticipantCount = true;
    let rankingRows = acceptanceRows;
    let hallRows = null;
    let totalPlays = 4;
    let timeAttackAvailable = false;
    let allColors = false;
    let timeAttackVersion = 3;
    let attackRows = timeAttackRows;
    let failNextAttackStats = false;
    let failNextAttackPage = false;
    let failNextAttackTitles = false;
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
      if (url.pathname.startsWith('/chameleonjp_lab/i18n/')) {
        const asset = url.pathname.slice('/chameleonjp_lab/i18n/'.length);
        if (asset === 'chameleol-time-attack.js' && failNextAttackTitles) {
          failNextAttackTitles = false;
          return route.fulfill({status:503});
        }
        const allowed = new Set([
          'common.js', 'ranking.js', 'games-1.js', 'games-2.js', 'games-3.js',
          'extras.js', 'hall.js', 'chameleol-time-attack.js', 'terms-1.js', 'terms-2.js', 'terms-3.js',
          'runtime.js', 'language.css'
        ]);
        if (allowed.has(asset)) {
          return route.fulfill({
            contentType: asset.endsWith('.css') ? 'text/css' : 'application/javascript',
            body: await readFile(new URL('i18n/' + asset, output))
          });
        }
      }
      if (url.pathname.startsWith('/chameleonjp_lab/')) {
        const file = url.pathname.split('/').pop() || 'index.html';
        const types = {'index.html':'text/html','ranking.html':'text/html','chameleol-ranking.js':'text/javascript','chameleol-hof.js':'text/javascript','chameleol-hof.css':'text/css','banner':'image/jpeg','IMG_7589.JPG':'image/jpeg'};
        if (Object.hasOwn(types,file)) {
          return route.fulfill({contentType:types[file],body:await readFile(new URL(file,output))});
        }
      }
      if (url.href === base+'/chameleol/release.json') {
        return route.fulfill({json:{env:'production',rankingApi:api,
          timeAttack:{available:timeAttackAvailable,enabled:false,
            rulesVersion:allColors?'kamereoru-time-attack-rules-v3':undefined}}});
      }
      if (url.href.startsWith(api + '/time-attack-stats')) {
        assert.equal(url.searchParams.get('course'),allColors?'all':null);
        if (failNextAttackStats) {
          failNextAttackStats = false;
          return route.fulfill({status:503});
        }
        return route.fulfill({json:{modeId:timeAttackMode,totalPlays:attackRows.length + 12,
          participantCount:attackRows.length}});
      }
      if (url.href.startsWith(api + '/time-attack-ranking?')) {
        assert.equal(url.searchParams.get('course'),allColors?'all':null);
        if (failNextAttackPage) {
          failNextAttackPage = false;
          return route.fulfill({status:503});
        }
        return route.fulfill({json:{...timeAttackPageResponse(attackRows, url.searchParams, timeAttackVersion),
          course:allColors?'all':undefined}});
      }
      if (url.href === api+'/stats') {
        if (failNextStats) {
          failNextStats = false;
          return route.fulfill({status:503});
        }
        return route.fulfill({json:{ok:true,totalPlays,clearerCount:rankingRows === acceptanceRows ? 1 : rankingRows.length}});
      }
      if (url.href.startsWith(api+'/ranking?')) {
        if (url.searchParams.get('limit') === '1') {
          if (failNextParticipantCount) {
            failNextParticipantCount = false;
            return route.fulfill({status:503});
          }
          // The normal ranking excludes Hall members in the deployed database.
          return route.fulfill({json:{ok:true,nameCount:rankingRows === acceptanceRows ? 1 : rankingRows.length}});
        }
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
        if (hallRows) {
          const offset = Number(after || 0);
          const selected = hallRows.slice(offset, offset + 50);
          const nextAfter = offset + selected.length < hallRows.length ? offset + selected.length : null;
          return route.fulfill({json:{ok:true,version,rows:selected,nextAfter,restarted:false}});
        }
        const rows = !totalPlays ? [] : after
          ? [{ordinal:2, name:'後からクリア', average:9876}] : [{ordinal:1, name:'最初の<クリア>', average:9543}];
        return route.fulfill({json:{ok:true, version, rows, nextAfter:rows.length && !after ? 1 : null, restarted:false}});
      }
      return route.fulfill({status:503,body:'Offline fixture'});
    });
    await page.goto(base+'/chameleonjp_lab/index.html');
    // The language picker changes only presentation and restores Japanese exactly.
    assert.equal(await page.locator('#labLanguageSelect').count(), 1);
    await page.locator('#labLanguageSelect').selectOption('en');
    await page.getByRole('heading', {name:'Available Games'}).waitFor();
    assert.equal(await page.locator('html').getAttribute('lang'), 'en');
    await page.locator('#labLanguageSelect').selectOption('ja');
    await page.getByRole('heading', {name:'公開中ゲーム'}).waitFor();
    assert.equal(await page.locator('html').getAttribute('lang'), 'ja');
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
    await page.locator('#labLanguageSelect').selectOption('en');
    await page.waitForFunction(() => document.querySelector('#pageLead')?.textContent.includes('jewel-stealing'));
    assert.equal(await page.locator('#bestRanking .rank-name').first().textContent(), 'A<&>',
      'Language switching must never translate player names');
    assert.equal(await page.locator('#totalPlayCount').textContent(), '4 plays');
    assert.equal(await page.getByText('Normal mode leaderboard participants',{exact:true}).count(), 1);
    await page.locator('#labLanguageSelect').selectOption('ja');
    await page.waitForFunction(() => document.querySelector('#totalPlayCount')?.textContent === '4回');
    assert.equal(await page.locator('#bestRanking .rank-score').first().textContent(), '50棟 · 99.99%');
    assert.equal(await page.locator('#bestRanking').getAttribute('data-version'),'17');
    assert.equal(await page.locator('#totalPlayCount').textContent(),'4回');
    assert.equal(await page.locator('#playerCount').textContent(),'1人');
    assert.deepEqual(await page.locator('.stats .stat-label').allTextContents(),
      ['通常モードのプレイ回数','通常モードのランキング参加者','通常モードの50棟クリア人数（殿堂入り）']);
    await page.locator('#rankingParticipantCount').getByRole('button',{name:'再試行'}).click();
    await page.waitForFunction(() => document.querySelector('#rankingParticipantCount')?.textContent === '2人');
    assert.equal(await page.locator('#totalPlayCount').textContent(),'4回');
    assert.equal(await page.locator('#playerCount').textContent(),'1人');
    assert.equal(await page.getByRole('tab').count(),2);
    assert.equal(await page.locator('#hallTab .hall-tab-crown[aria-hidden="true"]').count(), 1);
    assert.equal(await page.locator('#hallTab').evaluate(el => getComputedStyle(el).borderTopWidth), '2px');
    assert.equal(await page.locator('#hallTab').evaluate(el => getComputedStyle(el).borderTopColor), 'rgb(229, 184, 75)');
    await page.getByRole('tab', {name:'殿堂入り'}).click();
    assert.equal(await page.locator('#hallTab').getAttribute('aria-selected'),'true');
    await page.locator('#hallRanking .rank-row').first().waitFor();
    assert.equal(await page.getByRole('heading', {name:'殿堂入り-50棟完全クリア者一覧-'}).count(), 1);
    assert.equal(await page.locator('.hof-title-main').textContent(), '殿堂入り');
    assert.equal(await page.locator('.hof-title-sub').textContent(), '-50棟完全クリア者一覧-');
    assert.equal(await page.locator('#hallRanking .hof-founder').count(), 0);
    assert.equal(await page.locator('#hallRanking .hof-plate').count(), 1);
    assert.equal(await page.locator('body.theme-chameleol-hof.hof-active').count(), 1);
    assert.equal(await page.locator('#hofSearch').count(), 0, 'Hall should not ask for a name');
    assert.equal(await page.locator('.hof-firework').count(), 0, 'there is no manual fireworks button');
    // A confirmed Hall entry, not the header or tab switch, triggers the one-off salute.
    await page.locator('#hallRanking .hof-plate').first().evaluate(el => el.scrollIntoView({block:'center'}));
    await page.waitForFunction(() => document.querySelector('#hallPanel')?.dataset.hofCelebrated === 'true');
    assert.equal(await page.locator('canvas.hof-particles').count(), 1);
    assert.equal(await page.locator('#hallPanel').getAttribute('data-hof-particles'),'playing');
    await page.waitForFunction(() => {
      const canvas = document.querySelector('canvas.hof-particles');
      if (!canvas) return false;
      const pixels = canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height).data;
      if (!pixels) return false;
      for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 0) return true;
      return false;
    }, null, {timeout:2500});
    await page.locator('#hallRanking .hof-plate').first().click();
    assert.equal(await page.locator('.hof-dialog[role="dialog"][aria-modal="true"]').count(), 1);
    assert.equal(await page.locator('.hof-dialog-number').textContent(), '第1号 殿堂入り');
    assert.equal(await page.locator('.hof-dialog-name').textContent(), '最初の<クリア>');
    assert.equal(await page.locator('.hof-dialog-caption').first().textContent(), '夜明けを盗むカメレオン');
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable:true, value:{writeText: async value => { window.__hofCopiedShare = value; }},
      });
    });
    await page.locator('.hof-dialog').getByRole('button',{name:'SNSシェア文をコピー'}).click();
    await page.waitForFunction(() => typeof window.__hofCopiedShare === 'string');
    assert.match(await page.evaluate(() => window.__hofCopiedShare), /第1号として殿堂入り/);
    assert.match(await page.evaluate(() => window.__hofCopiedShare), /夜明けを盗むカメレオン/);
    assert.match(await page.evaluate(() => window.__hofCopiedShare), /ranking\.html\?game=chameleol/);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.hof-modal-backdrop').isVisible(), false);
    await page.locator('#hofEmblem').click();
    assert.equal(await page.locator('#hallPanel').evaluate(el => el.style.getPropertyValue('--spotlight-tint')), 'rgba(224,49,90,.22)');
    assert.equal(await page.locator('canvas.hof-particles').count(), 1);
    assert.equal(await page.locator('#hallPanel').getAttribute('data-hof-celebrated'), 'true');
    assert.deepEqual(await page.locator('#hallRanking .rank-name').allTextContents(), ['最初の<クリア>']);
    assert.deepEqual(await page.locator('#hallRanking .rank-score').allTextContents(), ['一致率 95.43%']);
    await page.getByRole('button', {name:'次の50件'}).click();
    await page.locator('#hallRanking .rank-row').nth(1).waitFor();
    assert.deepEqual(await page.locator('#hallRanking .rank-no').allTextContents(), ['1人目','2人目']);
    assert.deepEqual(await page.locator('#hallRanking .rank-score').allTextContents(), ['一致率 95.43%','一致率 98.76%']);
    assert.equal(await page.locator('#bestPanel').isVisible(), false);
    assert.equal(await page.locator('#hallRanking .hof-plate').count(), 2);
    assert.deepEqual(await page.locator('#hallRanking .hof-title-tag').allTextContents(),
      ['夜明けを盗むカメレオン','月影の宝石怪盗']);
    await page.locator('#hallRanking .hof-plate').nth(1).click();
    await page.locator('.hof-dialog').getByRole('button',{name:'閉じる'}).click();
    assert.equal(await page.locator('.hof-modal-backdrop').isVisible(),false);
    assert.equal(await page.getByRole('link',{name:'ゲームで遊ぶ'}).getAttribute('href'),base+'/chameleol/');
    assert.deepEqual(await page.evaluate(() => window.rpcCalls), []);
    // All hall members keep the same visual rank; their titles are unique by ordinal.
    // The 50-item cursor must keep working with 105 entrants and long hostile names.
    hallRows = Array.from({length:105}, (_,i) => ({
      ordinal:i+1,
      name: i===3 ? '極端に長い名前'.repeat(28) + '<img src=x onerror=alert(1)>' : '完走者' + (i+1),
      average: 8000 + i,
    }));
    await page.reload();
    await page.getByRole('tab',{name:'殿堂入り'}).click();
    await page.waitForFunction(() => document.querySelectorAll('#hallRanking .hof-plate').length === 50);
    assert.equal(await page.locator('#hallRanking .hof-founder').count(),0);
    assert.equal(await page.locator('#hallRanking img').count(),0,'untrusted names must never become HTML');
    assert.equal(await page.locator('#hallRanking .hof-medal').count(),0,'old milestone badges must be removed');
    await page.getByRole('button',{name:'次の50件'}).click();
    await page.waitForFunction(() => document.querySelectorAll('#hallRanking .hof-plate').length === 100);
    assert.equal(await page.locator('#hallRanking .hof-medal').count(),0,'no milestone badge for any ordinal');
    await page.getByRole('button',{name:'次の50件'}).click();
    await page.waitForFunction(() => document.querySelectorAll('#hallRanking .hof-plate').length === 105);
    assert.equal(await page.locator('#hallRanking .hof-medal').count(),0);
    assert.equal(await page.locator('#hallRanking .hof-plate').last().getAttribute('data-ordinal'),'105');
    assert.equal(await page.locator('#hallMore').isVisible(),false);
    await page.setViewportSize({width:360,height:750});
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2),
      'Hall content must not overflow a 360px viewport');
    assert.equal(await page.locator('#hofSearch').count(), 0);
    await page.locator('#hallRanking').evaluate(el => el.scrollIntoView({block:'center'}));
    await page.waitForFunction(() => document.querySelector('#hallPanel')?.dataset.hofCelebrated === 'true');
    await page.locator('#bestTab').click();
    await page.locator('#hallTab').click();
    assert.equal(await page.locator('.hof-firework').count(), 0);
    assert.equal(await page.locator('#hallPanel').getAttribute('data-hof-celebrated'), 'true',
      'tab changes must not repeat the celebration');
    // iPhone-size viewport: honour reduced motion, but resume on a motion setting change.
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.reload();
    await page.getByRole('tab',{name:'殿堂入り'}).click();
    await page.waitForFunction(() => document.querySelectorAll('#hallRanking .hof-plate').length === 50);
    await page.locator('#hallRanking .hof-plate').first().evaluate(el => el.scrollIntoView({block:'center'}));
    await page.waitForTimeout(100);
    assert.equal(await page.locator('#hallPanel').getAttribute('data-hof-celebrated'),null);
    assert.equal(await page.locator('canvas.hof-particles').count(),0);
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.evaluate(() => window.dispatchEvent(new Event('scroll')));
    await page.waitForFunction(() => document.querySelector('#hallPanel')?.dataset.hofCelebrated === 'true');
    assert.equal(await page.locator('canvas.hof-particles').count(),1);
    assert.equal(await page.locator('#hallPanel').getAttribute('data-hof-particles'),'playing');
    await page.setViewportSize({width:1280,height:800});
    hallRows = null;

    rankingRows = boundaryRows;
    totalPlays = 42;
    await page.reload();
    await page.waitForFunction(() => document.querySelectorAll('#bestRanking .rank-row').length === 32);
    assert.equal(await page.locator('#bestRanking .rank-no').last().textContent(),'30位');
    assert.equal(await page.locator('#bestMore').isVisible(), false);

    // The experiment lab shows 100 at a time; the game overview still stops at rank 30.
    rankingRows = Array.from({length:205}, (_,i) => ({
      position:i+1, rank:i+1, name:'全件' + (i+1), buildings:50, average:10000-i,
    }));
    await page.reload();
    await page.waitForFunction(() => document.querySelectorAll('#bestRanking .rank-row').length === 100);
    assert.equal(await page.locator('#bestRanking .rank-name').nth(99).textContent(),'全件100');
    await page.getByRole('button', {name:'次の100名を表示'}).click();
    await page.waitForFunction(() => document.querySelectorAll('#bestRanking .rank-row').length === 200);
    await page.getByRole('button', {name:'次の100名を表示'}).click();
    await page.waitForFunction(() => document.querySelectorAll('#bestRanking .rank-row').length === 205);
    assert.equal(await page.locator('#bestRanking .rank-no').last().textContent(),'205位');
    assert.equal(await page.locator('#bestRanking .rank-name').nth(100).textContent(),'全件101');
    assert.equal(await page.locator('#bestMore').isVisible(),false);

    rankingRows = [];
    totalPlays = 0;
    await page.reload();
    await page.locator('#bestRanking').getByText('まだ記録がありません').waitFor();
    assert.equal(await page.locator('#totalPlayCount').textContent(),'0回');
    await page.waitForFunction(() => document.querySelector('#rankingParticipantCount')?.textContent === '0人');
    assert.equal(await page.locator('#playerCount').textContent(),'0人');
    await page.getByRole('tab', {name:'殿堂入り'}).click();
    await page.getByText('まだ殿堂入りした方はいません').waitFor();
    await page.locator('#hallRanking').evaluate(el => el.scrollIntoView({block:'center'}));
    assert.equal(await page.locator('#hallPanel').getAttribute('data-hof-celebrated'), null,
      'an empty Hall must not fire fireworks');
    assert.equal(await page.locator('canvas.hof-particles').count(), 0);
    const attackUrl = base + '/chameleonjp_lab/ranking.html?game=chameleol&tab=time-attack';
    await page.goto(attackUrl);
    await page.waitForURL(url => !url.searchParams.has('tab'));
    assert.equal(await page.locator('#timeAttackTab').isVisible(), false);
    assert.equal(await page.locator('#bestTab').getAttribute('aria-selected'), 'true');

    timeAttackAvailable = true;
    failNextAttackStats = failNextAttackTitles = true;
    totalPlays = 4;
    rankingRows = acceptanceRows;
    await page.goto(attackUrl);
    await page.locator('#timeAttackRanking').getByRole('button', {name:'再試行'}).waitFor();
    await page.locator('#timeAttackStatsError').getByRole('button', {name:'再試行'}).waitFor();
    assert.equal(await page.locator('#timeAttackTab').getAttribute('aria-selected'), 'true');
    assert.equal(await page.getByRole('tab').count(), 3);
    await page.waitForFunction(() => document.querySelector('#totalPlayCount')?.textContent === '4回');
    assert.equal(await page.locator('#playerCount').textContent(), '1人');
    await page.locator('#timeAttackStatsError').getByRole('button', {name:'再試行'}).click();
    await page.locator('#timeAttackRanking').getByRole('button', {name:'再試行'}).click();
    await page.waitForFunction(() => document.querySelectorAll('#timeAttackRanking .time-attack-row').length === 100);
    await page.waitForFunction(() => document.querySelector('#timeAttackPlayers')?.textContent === '205人');
    assert.ok(calls.some(raw => {
      const url = new URL(raw);
      return url.pathname.endsWith('/chameleol-time-attack.js') && url.searchParams.get('retry') === '1';
    }));
    assert.equal(await page.locator('#timeAttackPlays').textContent(), '217回');
    assert.deepEqual(await page.locator('#timeAttackRanking .rank-no').allTextContents().then(rows => rows.slice(0,3)),
      ['1位', '1位', '3位']);
    assert.equal(await page.locator('#timeAttackRanking .rank-name').first().textContent(), '<img src=x>');
    assert.equal(await page.locator('#timeAttackRanking img').count(), 0);
    assert.equal(await page.locator('#timeAttackRanking .time-attack-time').first().textContent(), '00:25.01');
    await page.locator('#labLanguageSelect').selectOption('en');
    assert.equal(await page.locator('#timeAttackRanking .time-attack-title').first().textContent(), timeAttackTitles[0].labels.en);
    assert.equal(await page.locator('#timeAttackRanking .rank-name').first().textContent(), '<img src=x>');
    await page.getByRole('tab', {name:'Time Attack'}).waitFor();
    for (const [width, height] of [[360,750], [402,700], [430,900], [640,900], [874,402]]) {
      await page.setViewportSize({width,height});
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2),
        'Time Attack must fit ' + width + '×' + height);
      const tabs = await page.getByRole('tab').evaluateAll(elements =>
        elements.map(element => [element.offsetWidth, element.offsetHeight]));
      assert.ok(tabs.every(([tabWidth, tabHeight]) => Math.abs(tabs[0][0] - tabWidth) <= 1 && tabs[0][1] === tabHeight));
    }
    await page.locator('#labLanguageSelect').selectOption('ja');
    failNextAttackPage = true;
    await page.locator('#timeAttackMore').click();
    await page.locator('#timeAttackPageStatus').getByRole('button', {name:'再試行'}).waitFor();
    assert.equal(await page.locator('#timeAttackRanking .time-attack-row').count(), 100);
    timeAttackVersion++;
    attackRows = [{...timeAttackRows[0], name:'版更新後'}, ...timeAttackRows.slice(1)];
    await page.locator('#timeAttackPageStatus').getByRole('button', {name:'再試行'}).click();
    await page.waitForFunction(() => document.querySelector('#timeAttackRanking')?.dataset.version === '4');
    assert.equal(await page.locator('#timeAttackRanking .rank-name').first().textContent(), '版更新後');
    assert.equal(await page.locator('#timeAttackRanking .time-attack-row').count(), 100);
    for (const expected of [200,205]) {
      await page.locator('#timeAttackMore').click();
      await page.waitForFunction(count => document.querySelectorAll('#timeAttackRanking .time-attack-row').length === count, expected);
    }
    assert.equal(await page.locator('#timeAttackRanking .rank-no').nth(99).textContent(), '100位');
    assert.equal(await page.locator('#timeAttackRanking .rank-no').nth(100).textContent(), '100位');
    assert.equal(await page.locator('#timeAttackRanking .rank-no').last().textContent(), '205位');
    assert.equal(await page.locator('#timeAttackRanking .time-attack-time').last().textContent(), '10:00.01');
    assert.equal(await page.locator('#timeAttackRanking .time-attack-title').last().textContent(), '30棟完走');
    assert.equal(await page.locator('#timeAttackMore').isVisible(), false);
    await page.locator('#hallTab').click();
    assert.equal(new URL(page.url()).searchParams.has('tab'), false);
    await page.locator('#timeAttackTab').click();
    assert.equal(new URL(page.url()).searchParams.get('tab'), 'time-attack');
    assert.equal(await page.locator('#timeAttackRanking .time-attack-row').count(), 205);

    attackRows = [];
    await page.reload();
    await page.locator('#timeAttackRanking').getByText('まだ記録がありません').waitFor();
    await page.waitForFunction(() => document.querySelector('#timeAttackPlayers')?.textContent === '0人');
    await page.locator('#bestRanking .rank-row').first().waitFor({state:'attached'});
    await page.locator('#hallRanking .hof-plate').first().waitFor({state:'attached'});
    allColors = true;
    attackRows = [{ ...timeAttackRows[0], name:'全色の記録', family:'all', elapsedCs:1000, titleId:'ta.title.01' }];
    await page.goto(base + '/chameleonjp_lab/ranking.html?game=chameleol&tab=time-attack&course=legacy');
    await page.locator('#timeAttackRanking').getByText('全色の記録', {exact:true}).waitFor();
    assert.equal(await page.locator('#timeAttackRanking .time-attack-time').textContent(), '00:10.00');
    assert.equal(await page.locator('#timeAttackRanking .time-attack-family').count(), 0);
    assert.match(await page.locator('#timeAttackPanel .ranking-sub').textContent(), /20棟/);
    await page.waitForFunction(() => document.querySelector('#timeAttackPlayers')?.textContent === '1人');
    await page.locator('#bestRanking .rank-row').first().waitFor({state:'attached'});
    await page.locator('#hallRanking .hof-plate').first().waitFor({state:'attached'});
    await page.goto(base + '/chameleonjp_lab/index.html');
    assert.equal(await page.locator('[data-accordion=chameleol]').count(), 1);
    assert.equal(await page.locator('[data-accordion=chameleol_time_attack]').count(), 0);
    rankingRows = [];
    totalPlays = 0;
    for (const [game, abnormal] of [[takkeu, 'get_takkeu_abnormal_entries_v1'], [iroate, 'get_disqualified_score_entries']]) {
      await page.goto(base + '/chameleonjp_lab/ranking.html?game=' + game.game_slug + '&tab=time-attack');
      await page.locator('#bestRanking .player-name').first().waitFor();
      assert.equal(new URL(page.url()).searchParams.has('tab'), false);
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
