import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';

const base = new URL('https://chameleonjp-lab.github.io/chameleonjp_lab/');
const output = new URL('../dist/', import.meta.url);
const catalog = JSON.parse(await readFile(new URL('../catalog/games.json', import.meta.url), 'utf8'));
const game = catalog.games.find(row => row.game_slug === 'ikagetto');
const thumbnail = new URL('assets/ikagetto-share-v1.jpg', game.game_url);
const detail = new URL('ranking.html', game.game_url);
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
      if (url.pathname === detail.pathname) return route.fulfill({ body: '<title>Ikagetto ranking</title>', contentType: 'text/html' });
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
        assert.equal(rpc, 'ikagetto_fishing_board_v2');
        assert.deepEqual(args, { p_limit: 3 });
        return route.fulfill({ json: outcome === 'empty' ? [] : [
          { rank: 1, display_name: 'A<&>', score: 48000, length_meters: 27, weight_kg: 4512, elapsed_ms: 65683 },
          { rank: 1, display_name: 'B', score: 48000 }
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
    await card.getByRole('heading', { name: 'Fishing leaderboard' }).waitFor();
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
    await card.locator('#ranking-ikagetto').getByText('Could not load', { exact: true }).waitFor();
    await card.locator('#plays-ikagetto').filter({ hasText: 'Could not load' }).waitFor();

    outcome = 'scores';
    await toggle.click();
    await toggle.click();
    await card.locator('.rank-name').first().filter({ hasText: 'A<&>' }).waitFor();
    const measurements = card.locator('.rank-catch');
    assert.equal(await measurements.count(), 1);
    assert.equal(await measurements.textContent(), 'Length 27 m / Weight 4,512 kg / Time 65.7 s');
    await page.locator('#labLanguageSelect').selectOption('ja');
    assert.equal(await measurements.textContent(), '全長 27 m ／ 重さ 4,512 kg ／ 時間 65.7秒');
    await page.locator('#labLanguageSelect').selectOption('en');
    assert.deepEqual(await card.locator('.rank-no').allTextContents(), ['Rank 1', 'Rank 1']);
    assert.match(await card.locator('.rank-score').first().textContent(), /48,000/);
    assert.match(await card.locator('#plays-ikagetto').textContent(), /^7\D/);
    assert.match(await card.locator('#players-ikagetto').textContent(), /^2\D/);
    await card.locator('#detail-ikagetto').click();
    await page.waitForURL(`${detail.href}?lang=en`);

    outcome = 'empty';
    await page.goto(home.href);
    await toggle.click();
    await card.locator('#ranking-ikagetto .empty').waitFor();
    assert.match(await card.locator('#plays-ikagetto').textContent(), /^0\D/);
    assert.match(await card.locator('#players-ikagetto').textContent(), /^0\D/);
    assert.equal(calls.filter(({ rpc }) => rpc === 'ikagetto_stats_v1').length, 3);
    assert.equal(calls.filter(({ rpc }) => rpc === 'ikagetto_fishing_board_v2').length, 3);

    active = false;
    await page.goto(home.href);
    await page.waitForFunction(() => document.querySelector('#sortStatus').textContent.includes('Recently added'));
    assert.equal(await card.count(), 0);
    assert.deepEqual(errors, []);
    console.log(`${engine.name()}: Ikagetto card, fishing counts and ranking, retry, empty results, and detail link passed`);
  } finally {
    await browser.close();
  }
}
