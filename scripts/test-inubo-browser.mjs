import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';

const base = 'https://chameleonjp-lab.github.io/chameleonjp_lab/';
const output = new URL('../dist/', import.meta.url);
const catalog = JSON.parse(await readFile(new URL('../catalog/games.json', import.meta.url), 'utf8'));
const game = catalog.games.find(row => row.game_slug === 'inubo');
const sdk = `window.supabase={createClient:()=>({from(){
  const query={select:()=>query,eq:()=>query,order:async()=>({data:[${JSON.stringify(game)}]}),
    maybeSingle:async()=>({data:${JSON.stringify(game)}})};
  return query;
}})};`;

for (const engine of [chromium, webkit]) {
  const browser = await engine.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 402, height: 700 } });
    const errors = [];
    const calls = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'cdn.jsdelivr.net') return route.fulfill({ body: sdk, contentType: 'text/javascript' });
      if (url.hostname.endsWith('.supabase.co')) {
        const rpc = url.pathname.split('/').at(-1);
        const body = route.request().postDataJSON();
        calls.push({ rpc, body });
        if (rpc === 'get_inubo_play_stats_v1') return route.fulfill({ json: [{ total_play_count: 5, player_count: 3 }] });
        assert.equal(rpc, 'inubo_ranking_board');
        assert.equal(body.p_course_version, 'park-5');
        const value = body.p_metric === 'time' ? 1850 : 2700;
        return route.fulfill({ json: [{ rank: 1, display_name: 'A<&>', value }, { rank: 1, display_name: 'B', value }] });
      }
      if (!url.href.startsWith(base)) return route.abort();
      const file = url.pathname.slice(new URL(base).pathname.length) || 'index.html';
      const types = { html: 'text/html', js: 'text/javascript', css: 'text/css' };
      return route.fulfill({ body: await readFile(new URL(file, output)), contentType: types[file.split('.').at(-1)] ?? 'image/jpeg' });
    });

    await page.goto(base + '?lang=en');
    await page.getByRole('button', { name: 'Inubo', exact: true }).click();
    const card = page.locator('#game-inubo');
    await card.locator('.rank-name').getByText('A<&>', { exact: true }).waitFor();
    assert.equal(await card.locator('.rank-no').count(), 2);
    assert.match(await card.locator('#plays-inubo').textContent(), /5/);
    assert.match(await card.locator('#players-inubo').textContent(), /3/);
    assert.equal(await card.getByRole('link', { name: 'Play', exact: true }).getAttribute('href'), game.game_url);
    const detail = card.locator('#detail-inubo');
    await page.waitForFunction(() => document.querySelector('#detail-inubo')?.getAttribute('href')?.endsWith('?lang=en'));
    await detail.click();
    await page.getByRole('button', { name: 'Time', exact: true }).click();
    await page.locator('#rows strong').getByText('18.50 s', { exact: true }).first().waitFor();
    await page.goto(base + 'ranking.html?game=inubo&lang=fr');
    await page.getByRole('button', { name: 'Temps', exact: true }).waitFor();
    assert.match(page.url(), /inubo-ranking\.html\?lang=fr$/);
    assert.deepEqual(errors, []);
    assert.ok(calls.some(({ rpc, body }) => rpc === 'inubo_ranking_board' && body.p_limit === 3 && body.p_metric === 'total'));
    console.log(engine.name() + ': Inubo game card, play totals and ranking links passed');
  } finally {
    await browser.close();
  }
}
