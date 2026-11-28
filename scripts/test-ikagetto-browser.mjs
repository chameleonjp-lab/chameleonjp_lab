import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';

const base = new URL('https://chameleonjp-lab.github.io/chameleonjp_lab/');
const output = new URL('../dist/', import.meta.url);
const catalog = JSON.parse(await readFile(new URL('../catalog/games.json', import.meta.url), 'utf8'));
const game = catalog.games.find(row => row.game_slug === 'ikagetto');
const thumbnail = new URL('assets/ikagetto-share-v1.jpg', game.game_url);
const detail = new URL('ranking.html?game=ikagetto', base);
const placeholder = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
const types = { html: 'text/html', js: 'text/javascript', css: 'text/css' };

for (const engine of [chromium, webkit]) {
  const browser = await engine.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 393, height: 852 } });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'share', { value: async ({ text }) => { window.sharedText = text; } });
    });
    const calls = [];
    const errors = [];
    let active = true;
    let outcome = 'unavailable';
    let failNextPage = true;
    let failHall = true;
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'cdn.jsdelivr.net') {
        const data = JSON.stringify(active ? [game] : []);
        const sdk = `window.supabase = {createClient:()=>({from(){
          const rows=${data};
          const query={select:()=>query,eq:()=>query,
            order:async()=>({data:rows}),maybeSingle:async()=>({data:rows[0]})};
          return query;
        }})};`;
        return route.fulfill({ body: sdk, contentType: 'text/javascript' });
      }
      if (url.href === thumbnail.href) return route.fulfill({ body: placeholder, contentType: 'image/gif' });
      if (url.hostname.endsWith('.supabase.co')) {
        const rpc = url.pathname.split('/').at(-1);
        const args = route.request().postDataJSON();
        calls.push({ rpc, args });
        if (outcome === 'unavailable') return route.fulfill({ status: 503 });
        if (rpc === 'ikagetto_stats_v1') {
          assert.deepEqual(args, {});
          if (outcome === 'empty') {
            return route.fulfill({ json: [{ total_play_count: 0, player_count: 0, fishing: 0, butcher: 0, cooking: 0 }] });
          }
          return route.fulfill({ json: [{ total_play_count: 7, player_count: 2, fishing: 2, butcher: 5, cooking: 6 }] });
        }
        if (rpc === 'ikagetto_hall_of_fame_v1') {
          assert.deepEqual(args, { p_offset: 0, p_limit: 500 });
          if (failHall) {
            failHall = false;
            return route.fulfill({ status: 503 });
          }
          return route.fulfill({ json: [
            { rank: 1, display_name: '<Fisher 1>', score: 74000, length_meters: 50, weight_kg: 41000, elapsed_ms: 166100, has_more: false },
            { rank: 2, display_name: 'Fisher 2', score: 80000, length_meters: 50, weight_kg: 45000, elapsed_ms: 160000, has_more: false }
          ] });
        }
        if (rpc === 'ikagetto_board_page_v3') {
          assert.equal(args.p_limit, 500);
          assert.ok([0, 500, 1000].includes(args.p_offset));
          assert.ok(['fishing', 'butcher', 'cooking'].includes(args.p_mode));
          if (args.p_mode === 'butcher') return route.fulfill({ json: [] });
          if (args.p_mode === 'cooking') return route.fulfill({ json: [
            { rank: 1, display_name: 'Cook A', score: 6100, has_more: false }
          ] });
          if (args.p_offset === 500 && failNextPage) {
            failNextPage = false;
            return route.fulfill({ status: 503 });
          }
          const count = Math.min(1001 - args.p_offset, args.p_limit);
          return route.fulfill({ json: Array.from({ length: count }, (_, index) => {
            const entry = args.p_offset + index + 1;
            const sample = entry === 1 ? { length_meters: 50, weight_kg: 45000, elapsed_ms: 166000 }
              : entry === 3 ? { length_meters: 13, weight_kg: 400, elapsed_ms: 0 } : {};
            return {
              rank: entry === 2 ? 1 : entry === 501 ? 500 : entry,
              display_name: entry === 1 ? 'A<&>' : `Fisher ${entry}`,
              score: entry <= 2 ? 80000 : 50001 - (entry === 501 ? 500 : entry),
              has_more: args.p_offset + count < 1001,
              ...sample
            };
          }) });
        }
        assert.equal(rpc, 'ikagetto_fishing_board_v2');
        assert.deepEqual(args, { p_limit: 3 });
        return route.fulfill({ json: outcome === 'empty' ? [] : [
          { rank: 1, display_name: 'A<&>', score: 80000, length_meters: 50, weight_kg: 45000, elapsed_ms: 166000 },
          { rank: 1, display_name: 'B', score: 80000 }
        ] });
      }
      if (!url.href.startsWith(base.href)) return route.abort();
      const file = url.pathname.slice(base.pathname.length) || 'index.html';
      return route.fulfill({ body: await readFile(new URL(file, output)), contentType: types[file.split('.').at(-1)] ?? 'image/jpeg' });
    });

    const home = new URL('?lang=en', base);
    const toggle = page.getByRole('button', { name: 'Ikagetto', exact: true });
    const card = page.locator('#game-ikagetto');
    await page.goto(home.href);
    await toggle.click();
    assert.equal(await page.locator('.game-card').count(), 1);
    await card.getByText('Fishing plays', { exact: true }).waitFor();
    await card.getByText('Registered fishers', { exact: true }).waitFor();
    assert.equal(await card.locator('.ranking, .rank-row').count(), 0);
    await card.locator('.game-thumbnail').waitFor({ state: 'visible' });
    assert.equal(await card.locator('.game-thumbnail img').getAttribute('src'), thumbnail.href);
    assert.equal(await card.getByRole('link', { name: 'Play', exact: true }).getAttribute('href'), game.game_url);
    const share = card.locator('[data-share=ikagetto]');
    await share.click();
    assert.equal(await page.evaluate(() => window.sharedText), `Catch a big squid and show it off\n#イカゲット\n${game.game_url}`);
    await page.locator('#labLanguageSelect').selectOption('ja');
    await share.click();
    assert.equal(await page.evaluate(() => window.sharedText), `大きいイカを釣って自慢しよう\n#イカゲット\n${game.game_url}`);
    await page.locator('#labLanguageSelect').selectOption('en');
    await card.locator('#plays-ikagetto').filter({ hasText: 'Could not load' }).waitFor();

    outcome = 'scores';
    await toggle.click();
    await toggle.click();
    await card.locator('#plays-ikagetto').filter({ hasText: '7' }).waitFor();
    assert.ok(calls.every(({ rpc }) => rpc === 'ikagetto_stats_v1'));
    assert.match(await card.locator('#plays-ikagetto').textContent(), /^7\D/);
    assert.match(await card.locator('#players-ikagetto').textContent(), /^2\D/);
    await card.locator('#detail-ikagetto').click();
    await page.waitForURL(`${detail.href}&lang=en&mode=fishing`);
    const rows = page.locator('#ikagetto-rows .detail-row');
    const nextPage = page.getByRole('button', { name: 'Next page' }).first();
    const previousPage = page.getByRole('button', { name: 'Previous page' }).first();
    await rows.last().getByText('Fisher 500', { exact: true }).waitFor();
    assert.equal(await rows.count(), 500);
    assert.equal(await rows.first().locator('.player-name').textContent(), 'A<&>');
    assert.equal(await rows.first().locator('.ikagetto-catch').textContent(), 'Length 50 m / Weight 45,000 kg / Time 166 s');
    assert.deepEqual(await rows.locator('.ikagetto-score').allTextContents().then(scores => scores.slice(0, 2)), ['80,000 pts', '80,000 pts']);
    assert.equal(await rows.nth(1).locator('.ikagetto-catch').count(), 0);
    assert.equal(await rows.nth(2).locator('.ikagetto-catch').textContent(), 'Length 13 m / Weight 400 kg / Time 0 s');
    assert.equal(await page.locator('#ikagetto-plays').textContent(), '7');
    assert.equal(await page.locator('#ikagetto-players').textContent(), '2');
    assert.equal(await page.getByRole('button', { name: 'Next page' }).count(), 2);
    assert.equal(await previousPage.isDisabled(), true);
    assert.equal(await page.getByRole('link', { name: 'Play Game' }).getAttribute('href'), `${game.game_url}?lang=en`);

    await nextPage.click();
    await page.locator('#ikagetto-status').filter({ hasText: 'Could not load' }).waitFor();
    assert.equal(await rows.count(), 500);
    await page.locator('#ikagetto-retry').click();
    await rows.first().getByText('Fisher 501', { exact: true }).waitFor();
    assert.equal(await rows.first().locator('.rank-no').textContent(), 'Rank 500');
    assert.equal(await rows.nth(1).locator('.rank-no').textContent(), 'Rank 502');
    assert.equal(await rows.count(), 500);
    await nextPage.click();
    await rows.first().getByText('Fisher 1001', { exact: true }).waitFor();
    assert.equal(await rows.count(), 1);
    assert.equal(await rows.first().locator('.rank-no').textContent(), 'Rank 1,001');
    assert.equal(await nextPage.isDisabled(), true);
    await previousPage.click();
    await rows.first().getByText('Fisher 501', { exact: true }).waitFor();

    await page.getByRole('tab', { name: 'Fishing', exact: true }).focus();
    await page.keyboard.press('ArrowRight');
    await page.getByRole('tab', { name: 'Butchering', exact: true, selected: true }).waitFor();
    await page.locator('#ikagetto-status').filter({ hasText: 'No records yet' }).waitFor();
    assert.equal(new URL(page.url()).searchParams.get('mode'), 'butcher');
    assert.equal(await page.locator('#ikagetto-players').textContent(), '2');
    await page.getByRole('tab', { name: 'Cooking', exact: true }).click();
    await rows.getByText('Cook A', { exact: true }).waitFor();
    assert.equal(await rows.locator('.ikagetto-catch').count(), 0);
    assert.equal(await rows.locator('.ikagetto-score').textContent(), '6,100 pts');
    await page.locator('#labLanguageSelect').selectOption('fr');
    await page.getByRole('tab', { name: 'Cuisine', exact: true, selected: true }).waitFor();
    assert.equal(new URL(page.url()).searchParams.get('mode'), 'cooking');
    assert.equal(new URL(page.url()).searchParams.get('lang'), 'fr');
    await page.goto(`${detail.href}&lang=ja&mode=cooking&source=game`);
    await page.getByRole('tab', { name: '料理', exact: true, selected: true }).waitFor();
    await rows.getByText('Cook A', { exact: true }).waitFor();
    assert.equal(new URL(page.url()).searchParams.get('source'), 'game');

    assert.equal(calls.filter(({ rpc }) => rpc === 'ikagetto_hall_of_fame_v1').length, 0);
    await page.setViewportSize({ width: 402, height: 700 });
    const hallTab = page.getByRole('tab', { name: '殿堂入り', exact: true });
    const tabBox = await hallTab.boundingBox();
    const cookingBox = await page.getByRole('tab', { name: '料理', exact: true }).boundingBox();
    assert.ok(tabBox.y >= cookingBox.y + cookingBox.height, 'hall below the three modes');
    await page.getByRole('tab', { name: '料理', exact: true }).focus();
    await page.keyboard.press('ArrowRight');
    await page.locator('#ikagetto-status').filter({ hasText: '取得できませんでした' }).waitFor();
    assert.equal(await hallTab.getAttribute('aria-selected'), 'true');
    await page.locator('#ikagetto-retry').click();
    await rows.getByText('<Fisher 1>', { exact: true }).waitFor();
    assert.deepEqual(await rows.locator('.rank-no').allTextContents(), ['1人目', '2人目']);
    assert.deepEqual(await rows.locator('.ikagetto-score').allTextContents(), ['74,000点', '80,000点']);
    assert.equal(await page.locator('#ikagetto-panel').getAttribute('data-mode'), 'hall');
    await page.locator('#labLanguageSelect').selectOption('en');
    await page.getByRole('tab', { name: 'Hall of Fame', exact: true, selected: true }).waitFor();
    assert.deepEqual(await rows.locator('.rank-no').allTextContents(), ['No. 1', 'No. 2']);
    assert.equal(await rows.first().locator('.ikagetto-catch').textContent(), 'Length 50 m / Weight 41,000 kg / Time 166.1 s');
    assert.equal(new URL(page.url()).searchParams.get('mode'), 'hall');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 402);
    await page.reload();
    await rows.getByText('<Fisher 1>', { exact: true }).waitFor();
    assert.equal(await page.getByRole('tab', { name: 'Hall of Fame', exact: true }).getAttribute('aria-selected'), 'true');

    outcome = 'empty';
    await page.goto(home.href);
    await toggle.click();
    await card.locator('#plays-ikagetto').filter({ hasText: /^0/ }).waitFor();
    assert.match(await card.locator('#plays-ikagetto').textContent(), /^0\D/);
    assert.match(await card.locator('#players-ikagetto').textContent(), /^0\D/);
    assert.equal(calls.filter(({ rpc }) => rpc === 'ikagetto_stats_v1').length, 6);
    assert.equal(calls.filter(({ rpc }) => rpc === 'ikagetto_fishing_board_v2').length, 0);
    assert.ok(calls.some(({ rpc, args }) => rpc === 'ikagetto_board_page_v3' && args.p_mode === 'fishing' && args.p_offset === 1000));

    active = false;
    await page.goto(home.href);
    await page.waitForFunction(() => document.querySelector('#sortStatus').textContent.includes('Recently added'));
    assert.equal(await card.count(), 0);
    assert.deepEqual(errors, []);
    console.log(`${engine.name()}: Ikagetto card, three rankings and Hall of Fame, 1,001 paginated rows, metrics, ties, locale and retry passed`);
  } finally {
    await browser.close();
  }
}
