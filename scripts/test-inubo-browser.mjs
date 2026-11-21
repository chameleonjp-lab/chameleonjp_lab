import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';

const base = 'https://chameleonjp-lab.github.io/chameleonjp_lab/';
const output = new URL('../dist/', import.meta.url);
const catalog = JSON.parse(await readFile(new URL('../catalog/games.json', import.meta.url), 'utf8'));
const game = catalog.games.find(row => row.game_slug === 'inubo');
const iroate = catalog.games.find(row => row.game_slug === 'iroate');
const legacyGame = catalog.games.find(row => row.game_slug === 'torani_yasashiku');
const thumbnailUrl = game.game_url + 'social-card.jpg';
const tigerPlayUrl = 'https://chameleonjp-lab.github.io/toraniyasashiku/';
const tigerThumbnailUrl = new URL('social-card-677e9d04.jpg', tigerPlayUrl).href;
const iroateThumbnailUrl = iroate.game_url + 'assets/social-preview.png';
const placeholderImage = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
const sdk = `window.supabase={createClient:()=>({from(){
  const rows=${JSON.stringify([legacyGame, iroate, game])};
  let slug;
  const query={select:()=>query,eq:(column,value)=>{if(column==='game_slug') slug=value; return query;},
    order:async()=>({data:rows}), maybeSingle:async()=>({data:rows.find(row=>row.game_slug===slug)})};
  return query;
},rpc:async()=>({data:[]})})};`;

for (const engine of [chromium, webkit]) {
  const browser = await engine.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 402, height: 700 } });
    const errors = [];
    const calls = [];
    const imageRequests = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'cdn.jsdelivr.net') return route.fulfill({ body: sdk, contentType: 'text/javascript' });
      if (url.href === thumbnailUrl || url.href === tigerThumbnailUrl) {
        imageRequests.push(url.href);
        return route.fulfill({ body: placeholderImage, contentType: 'image/gif' });
      }
      if (url.href === iroateThumbnailUrl) return route.fulfill({ status: 404 });
      if (url.href === game.game_url) return route.fulfill({ body: 'Inubo', contentType: 'text/html' });
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
    const sort = page.locator('#gameSortSelect');
    const cardOrder = () => page.locator('#gameList > .game-card').evaluateAll(cards => cards.map(card => card.id));
    const newestOrder = ['game-inubo', 'game-iroate', 'game-torani_yasashiku'];
    await page.waitForFunction(() => document.querySelector('#sortStatus').textContent.includes('Recently added'));
    assert.equal(await sort.inputValue(), 'newest');
    assert.equal(await sort.locator('option:checked').textContent(), 'Recently added');
    assert.deepEqual(await cardOrder(), newestOrder);
    await sort.selectOption('added');
    assert.deepEqual(await cardOrder(), newestOrder.slice().reverse());
    await sort.selectOption('newest');
    assert.deepEqual(await cardOrder(), newestOrder);
    assert.equal(await page.locator('.game-thumbnail').count(), 0);
    assert.deepEqual(imageRequests, []);

    await page.getByRole('button', { name: 'Inubo', exact: true }).click();
    const card = page.locator('#game-inubo');
    const thumbnail = card.locator('.accordion-content > .game-thumbnail:first-child');
    await thumbnail.waitFor({ state: 'visible' });
    assert.deepEqual(imageRequests, [thumbnailUrl]);
    assert.equal(await thumbnail.getAttribute('href'), game.game_url);
    assert.equal(await thumbnail.locator('img').getAttribute('alt'), 'Inubo');
    const mobileLayout = await card.evaluate(el => ({
      titleBottom: el.querySelector('.game-title').getBoundingClientRect().bottom,
      thumbnail: el.querySelector('.game-thumbnail').getBoundingClientRect().toJSON(),
      descriptionTop: el.querySelector('.game-description').getBoundingClientRect().top,
      pageWidth: document.documentElement.clientWidth
    }));
    assert.ok(mobileLayout.titleBottom <= mobileLayout.thumbnail.top);
    assert.ok(mobileLayout.thumbnail.bottom <= mobileLayout.descriptionTop);
    assert.ok(mobileLayout.thumbnail.right <= mobileLayout.pageWidth);
    await card.locator('.rank-name').getByText('A<&>', { exact: true }).waitFor();
    assert.equal(await card.locator('.rank-no').count(), 2);
    assert.match(await card.locator('#plays-inubo').textContent(), /5/);
    assert.match(await card.locator('#players-inubo').textContent(), /3/);
    assert.equal(await card.getByRole('link', { name: 'Play', exact: true }).getAttribute('href'), game.game_url);
    const detail = card.locator('#detail-inubo');
    await page.waitForFunction(() => document.querySelector('#detail-inubo')?.getAttribute('href')?.endsWith('?lang=en'));

    const failedImage = page.waitForResponse(iroateThumbnailUrl);
    await page.locator('[data-accordion=iroate]').click();
    assert.equal((await failedImage).status(), 404);
    await page.locator('#game-iroate .game-thumbnail').waitFor({ state: 'detached' });
    await page.locator('#game-iroate .game-description').waitFor({ state: 'visible' });
    await thumbnail.waitFor({ state: 'hidden' });
    const tigerImageLoaded = page.waitForResponse(tigerThumbnailUrl);
    await page.locator('[data-accordion=torani_yasashiku]').click();
    await page.locator('#game-torani_yasashiku .game-description').waitFor({ state: 'visible' });
    assert.equal((await tigerImageLoaded).status(), 200);
    const tiger = page.locator('#game-torani_yasashiku');
    const tigerThumbnail = tiger.locator('.accordion-content > .game-thumbnail:first-child');
    await tigerThumbnail.waitFor({ state: 'visible' });
    assert.equal(await tigerThumbnail.getAttribute('href'), tigerPlayUrl);
    assert.equal(await tigerThumbnail.locator('img').getAttribute('src'), tigerThumbnailUrl);
    assert.equal(await tiger.locator('.actions a.button').getAttribute('href'), tigerPlayUrl);
    const tigerDetail = new URL(await tiger.locator('#detail-torani_yasashiku').getAttribute('href'), base);
    assert.equal(tigerDetail.searchParams.get('game'), 'torani_yasashiku');
    await page.getByRole('button', { name: 'Inubo', exact: true }).click();
    await thumbnail.waitFor({ state: 'visible' });
    assert.deepEqual(imageRequests, [thumbnailUrl, tigerThumbnailUrl]);

    await detail.click();
    await page.getByRole('button', { name: 'Time', exact: true }).click();
    await page.locator('#rows strong').getByText('18.50 s', { exact: true }).first().waitFor();
    await page.goto(base + 'ranking.html?game=inubo&lang=fr');
    await page.getByRole('button', { name: 'Temps', exact: true }).waitFor();
    assert.match(page.url(), /inubo-ranking\.html\?lang=fr$/);
    await page.goto(base + '?lang=en');
    await page.getByRole('button', { name: 'Inubo', exact: true }).click();
    await thumbnail.click();
    await page.waitForURL(game.game_url);
    assert.deepEqual(errors, []);
    assert.ok(calls.some(({ rpc, body }) => rpc === 'inubo_ranking_board' && body.p_limit === 3 && body.p_metric === 'total'));
    console.log(engine.name() + ': newest order, linked thumbnails, Inubo play totals and ranking links passed');
  } finally {
    await browser.close();
  }
}
