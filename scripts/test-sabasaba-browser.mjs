import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';

const base = new URL('https://chameleonjp-lab.github.io/chameleonjp_lab/');
const dist = new URL('../dist/', import.meta.url);
const { games } = JSON.parse(await readFile(new URL('../catalog/games.json', import.meta.url), 'utf8'));
const normal = 'sabasaba_normal';
const endless = 'sabasaba_endless';
const modes = games.filter(game => [normal, endless].includes(game.game_slug));
const mime = { html: 'text/html', js: 'text/javascript', css: 'text/css', webp: 'image/webp' };
const players = { [normal]: 'Normal Player', [endless]: 'Endless Player' };
const plays = { [normal]: 20, [endless]: 16 };

for (const engine of [chromium, webkit]) {
  const browser = await engine.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 402, height: 700 }, hasTouch: true });
    const errors = [];
    let catalogUnavailable = false;
    let activeModes = [...modes].reverse();
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.hostname === 'cdn.jsdelivr.net') {
        const sdk = `window.supabase = { createClient: () => ({
          from() {
            let slug;
            const rows = ${JSON.stringify(activeModes)};
            const unavailable = ${catalogUnavailable};
            const query = {
              select: () => query,
              eq: (field, value) => { if (field === 'game_slug') slug = value; return query; },
              order: async () => unavailable ? { error: 'Catalog unavailable' } : { data: rows },
              maybeSingle: async () => unavailable ? { error: 'Catalog unavailable' }
                : { data: rows.find(row => row.game_slug === slug) ?? null }
            };
            return query;
          },
          async rpc(name, args) {
            const response = await fetch('./test-rpc/' + name, { method: 'POST', body: JSON.stringify(args) });
            return response.ok ? { data: await response.json() } : { error: 'Fixture failed' };
          }
        }) };`;
        return route.fulfill({ body: sdk, contentType: 'text/javascript' });
      }
      if (url.pathname.endsWith('/rpc/lab_monthly_game_plays_v1')) {
        return route.fulfill({ json: [{ game_slug: normal, play_count: 7 }, { game_slug: endless, play_count: 5 }] });
      }
      if (url.pathname.includes('/test-rpc/')) {
        const { p_game_slug: slug, p_tab: tab } = request.postDataJSON();
        assert.ok([normal, endless].includes(slug), `Unexpected ranking mode: ${slug}`);
        const name = url.pathname.split('/').at(-1);
        if (name === 'get_game_play_stats') {
          return route.fulfill({ json: [{ total_play_count: plays[slug], player_count: 1 }] });
        }
        if (name === 'lab_ranking_page_v1' && tab === 'best') {
          return route.fulfill({ json: [{ display_name: players[slug], rank_no: 1, best_score: 42, play_count: 1 }] });
        }
        return route.fulfill({ json: [] });
      }
      if (!url.href.startsWith(base.href)) return route.abort();
      const file = url.pathname.slice(base.pathname.length) || 'index.html';
      return route.fulfill({ body: await readFile(new URL(file, dist)), contentType: mime[file.split('.').at(-1)] });
    });

    const card = page.locator('#game-sabasaba');
    const dialog = card.getByRole('dialog');
    const best = page.locator('#bestRanking');
    const modeTabs = () => page.locator('[data-difficulty-tab]');

    async function checkCard() {
      await card.getByRole('button', { name: 'サバサバ', exact: true }).waitFor();
      assert.equal(await card.count(), 1);
      assert.equal(await page.locator(`#game-${normal}, #game-${endless}`).count(), 0);
    }

    async function checkMode(slug, key) {
      await best.getByText(players[slug], { exact: true }).waitFor();
      assert.equal(await best.locator('.player-name').count(), 1);
      const url = new URL(page.url());
      assert.equal(url.searchParams.get('game'), 'sabasaba');
      assert.equal(url.searchParams.get('difficulty'), key);
      if (key) assert.equal(await page.locator(`[data-difficulty-tab="${slug}"]`).getAttribute('aria-selected'), 'true');
    }

    await page.goto(base.href);
    await checkCard();
    await page.locator('#popularGames').tap();
    await card.locator('.monthly-count').getByText('12回').waitFor();
    await card.getByRole('button', { name: 'サバサバ', exact: true }).tap();
    await dialog.getByText('36回', { exact: true }).waitFor();
    assert.equal(await dialog.getByRole('link', { name: '遊ぶ', exact: true }).getAttribute('href'), modes[0].game_url);
    await dialog.getByRole('link', { name: '詳細ランキングを見る' }).tap();
    await checkMode(normal, 'normal');
    assert.deepEqual(await modeTabs().allTextContents(), ['ノーマル', 'エンドレス']);
    await page.setViewportSize({ width: 874, height: 402 });
    await page.getByRole('tab', { name: 'エンドレス', exact: true }).tap();
    await checkMode(endless, 'endless');
    await page.reload();
    await checkMode(endless, 'endless');

    for (const [slug, key] of [[normal, 'normal'], [endless, 'endless']]) {
      await page.goto(new URL(`ranking.html?game=${slug}`, base).href);
      await checkMode(slug, key);
    }

    activeModes = modes.filter(mode => mode.game_slug === endless);
    await page.goto(base.href);
    await checkCard();
    await page.goto(new URL('ranking.html?game=sabasaba', base).href);
    await checkMode(endless, null);
    assert.equal(await modeTabs().count(), 0);

    catalogUnavailable = true;
    await page.goto(base.href);
    await checkCard();
    await page.goto(new URL(`ranking.html?game=${endless}&lang=en`, base).href);
    await checkMode(endless, 'endless');
    await page.getByRole('tab', { name: 'Endless', exact: true, selected: true }).waitFor();
    await page.getByRole('tab', { name: 'Normal', exact: true }).tap();
    await checkMode(normal, 'normal');
    assert.deepEqual(errors, []);
    console.log(engine.name(), 'verified Sabasaba catalog, mode rankings, legacy links and fallback');
  } finally {
    await browser.close();
  }
}
