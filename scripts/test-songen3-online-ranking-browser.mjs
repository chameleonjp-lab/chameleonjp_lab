import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';

const base = new URL('https://chameleonjp-lab.github.io/chameleonjp_lab/');
const output = new URL('../dist/', import.meta.url);
const { games } = JSON.parse(await readFile(new URL('../catalog/games.json', import.meta.url), 'utf8'));
const slug = 'songen_wo_kakeyouka3_online';
const game = games.find(game => game.game_slug === slug);
const detail = new URL(`ranking.html?game=${slug}&lang=en`, base);
const types = { html: 'text/html', js: 'text/javascript', css: 'text/css' };
const sample = {
  rank: 1, display_name: '<img src=x>', best_score: 2000, match_count: 10, wins: 6,
  losses: 3, draws: 1, record_points: 3000, total_score: 8000, songen_points: 2400
};
const negativePoints = {
  rank: 2, display_name: 'Negative points', best_score: -150, match_count: 1, wins: 1,
  losses: 0, draws: 0, record_points: 909, total_score: -150, songen_points: -14
};
const bestRows = Array.from({ length: 52 }, (_, index) => ({
  ...sample,
  display_name: index === 0 ? sample.display_name : `Player ${index + 1}`,
  rank: index === 50 ? 50 : index + 1,
  best_score: index === 51 ? -20 : index >= 49 ? -10 : 2000 - index
}));

for (const engine of [chromium, webkit]) {
  const browser = await engine.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 402, height: 700 }, hasTouch: true });
    const calls = [];
    const errors = [];
    let failNextPage = true;
    let gameIsPublic = true;
    let catalogUnavailable = false;
    let releaseRecord;
    const recordResponse = new Promise(resolve => { releaseRecord = resolve; });
    let delayRecord = true;
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.hostname === 'cdn.jsdelivr.net') {
        const sdk = `window.supabase = {createClient:()=>({from(){
          const query={
            select:()=>query,eq:()=>query,
            order:async()=>${catalogUnavailable ? '({error:new Error("Catalog unavailable")})' : '({data:' + JSON.stringify(gameIsPublic ? [game] : []) + '})'},
            maybeSingle:async()=>({data:${JSON.stringify(gameIsPublic ? game : null)}})
          };
          return query;
        }})};`;
        return route.fulfill({ body: sdk, contentType: 'text/javascript' });
      }
      if (url.hostname.endsWith('.supabase.co')) {
        if (url.pathname === '/rest/v1/games') return route.fulfill({ status: 503 });
        const rpc = url.pathname.split('/').at(-1);
        const args = request.postDataJSON();
        assert.match(request.headers().apikey, /^sb_publishable_/);
        assert.equal(request.headers().authorization, undefined);
        calls.push({ rpc, args });
        if (rpc === 'songen3_online_stats_v1') {
          assert.deepEqual(args, {});
          return route.fulfill({ json: [{ total_play_count: 104, player_count: 53 }] });
        }
        assert.equal(rpc, 'songen3_online_board_v1');
        const { p_tab: tab, p_offset: offset, p_limit: limit } = args;
        assert.ok(['best', 'record', 'points'].includes(tab));
        assert.ok([0, 50].includes(offset));
        assert.ok([3, 51].includes(limit));
        if (tab === 'best') {
          if (failNextPage && offset === 50) {
            failNextPage = false;
            return route.fulfill({ status: 503 });
          }
          return route.fulfill({ json: bestRows.slice(offset, offset + limit) });
        }
        if (tab === 'record' && delayRecord) {
          delayRecord = false;
          await recordResponse;
          return route.fulfill({ json: [] });
        }
        if (tab === 'points') return route.fulfill({ json: [sample, negativePoints] });
        return route.fulfill({ json: [sample] });
      }
      if (!url.href.startsWith(base.href)) return route.abort();
      const file = url.pathname.slice(base.pathname.length) || 'index.html';
      return route.fulfill({ body: await readFile(new URL(file, output)), contentType: types[file.split('.').at(-1)] ?? 'image/jpeg' });
    });

    await page.goto(new URL('?lang=en', base).href);
    await page.getByRole('button', { name: 'Dignity Duel 3 (Online Versus)' }).click();
    const card = page.locator(`#game-${slug}`);
    await card.locator('.rank-name').first().filter({ hasText: sample.display_name }).waitFor();
    assert.equal(await card.locator('.rank-name img').count(), 0);
    assert.equal(await card.locator(`#detail-${slug}`).getAttribute('href'), `/chameleonjp_lab/ranking.html?game=${slug}&lang=en`);
    await card.locator(`#detail-${slug}`).click();
    await page.waitForURL(detail.href);
    const tabs = page.getByRole('tab');
    const best = page.locator('#songen3-panel-best');
    const record = page.locator('#songen3-panel-record');
    const points = page.locator('#songen3-panel-points');
    await best.getByText('Player 50', { exact: true }).waitFor();
    assert.equal(await tabs.count(), 3);
    assert.equal(await tabs.first().getAttribute('aria-selected'), 'true');
    assert.equal(await best.locator('li').count(), 50);
    assert.equal(await best.locator('.player-name').first().textContent(), sample.display_name);
    assert.equal(await best.locator('.player-name img').count(), 0);
    assert.equal(await page.locator('#songen3-plays').textContent(), '104');
    assert.equal(await page.locator('#songen3-players').textContent(), '53');
    assert.equal(await page.locator('#songen3-play').getAttribute('href'), `${game.game_url}?lang=en`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 402);

    await best.getByRole('button', { name: 'Next page' }).click();
    await best.getByText('Could not load', { exact: true }).waitFor();
    await best.getByRole('button', { name: 'Retry' }).click();
    await best.getByText('Player 51', { exact: true }).waitFor();
    assert.deepEqual(await best.locator('.rank-no').allTextContents(), ['Rank 50', 'Rank 52']);
    assert.deepEqual(await best.locator('dd').allTextContents(), ['-10', '-20']);
    assert.equal(await best.getByRole('button', { name: 'Next page' }).count(), 0);
    await best.getByRole('button', { name: 'Previous page' }).click();
    await best.getByText('Player 50', { exact: true }).waitFor();

    const pendingRecord = page.waitForRequest(request => request.url().endsWith('songen3_online_board_v1') &&
      request.postDataJSON().p_tab === 'record');
    await tabs.first().focus();
    await page.keyboard.press('ArrowRight');
    await pendingRecord;
    assert.equal(await tabs.nth(1).getAttribute('aria-selected'), 'true');
    await page.keyboard.press('End');
    await points.getByText('2,400', { exact: true }).waitFor();
    const finishOldRecord = page.waitForResponse(response => response.url().endsWith('songen3_online_board_v1') &&
      response.request().postDataJSON().p_tab === 'record');
    releaseRecord();
    await finishOldRecord;
    await points.getByText('Negative points', { exact: true }).waitFor();
    await points.getByText('Rank 2', { exact: true }).waitFor();
    assert.deepEqual(await points.locator('dd').allTextContents(), ['2,400', '8,000', '3,000', '-14', '-150', '909']);
    assert.deepEqual(await points.locator('.rank-no').allTextContents(), ['Rank 1', 'Rank 2']);
    assert.equal(await record.isVisible(), false);

    await page.getByRole('tab', { name: 'Match record' }).click();
    await record.getByText('60%', { exact: true }).waitFor();
    assert.deepEqual(await record.locator('dd').allTextContents(), ['3,000', '10', '6', '3', '1', '60%']);
    await page.locator('#labLanguageSelect').selectOption('ja');
    await page.getByRole('tab', { name: '戦績' }).waitFor();
    assert.equal(await page.locator('#songen3-play').getAttribute('href'), game.game_url);
    assert.equal(await record.locator('.player-name').textContent(), sample.display_name);
    assert.deepEqual(errors, []);
    assert.ok(calls.some(({ args }) => args.p_limit === 3));
    gameIsPublic = false;
    const callsBeforeHold = calls.length;
    await page.goto(detail.href);
    await page.locator('.not-found-card').waitFor({ timeout: 5000 });
    assert.equal(await page.getByRole('tab').count(), 0);
    assert.equal(calls.length, callsBeforeHold);

    catalogUnavailable = true;
    await page.goto(base.href);
    await page.locator('#game-chameleol').waitFor({ timeout: 8000 });
    assert.equal(await page.locator(`#game-${slug}`).count(), 0);
    console.log(`${engine.name()}: rankings and the publication hold verified`);
  } finally {
    await browser.close();
  }
}
