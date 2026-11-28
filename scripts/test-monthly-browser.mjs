import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';

const base = 'https://chameleonjp-lab.github.io/chameleonjp_lab/';
const dist = new URL('../dist/', import.meta.url);
const types = { html:'text/html', js:'text/javascript', css:'text/css', webp:'image/webp', mp3:'audio/mpeg' };
// The fallback catalog includes all these games. The two reel difficulties share a card.
const totals = Object.entries({ meoshi_wo_seisu_hard:55, meoshi_wo_seisu_normal:46, iroate:99, ironarabe:75,
  ikagetto:75, inubo:34, chameleol:28, unlisted:999999 }).map(([game_slug, play_count]) => ({game_slug, play_count}));
for (const engine of [chromium, webkit]) {
  const browser = await engine.launch();
  try {
    const page = await browser.newPage({ viewport:{width:402,height:700}, hasTouch:true });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    let response, requests = 0;
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/rpc/lab_monthly_game_plays_v1')) {
        requests++;
        assert.equal(route.request().method(),'POST');
        assert.deepEqual(route.request().postDataJSON(),{});
        const body = await response;
        return route.fulfill(body ? {json:body} : {status:503});
      }
      if (!url.href.startsWith(base)) return route.abort();
      const file = url.pathname.slice(new URL(base).pathname.length) || 'index.html';
      return route.fulfill({ body:await readFile(new URL(file,dist)), contentType:types[file.split('.').pop()] || 'image/jpeg' });
    });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'share', {value:undefined});
      Object.defineProperty(navigator, 'clipboard', {value:undefined});
      document.execCommand = command => command === 'copy' && document.activeElement.matches('dialog[open] textarea');
    });
    await page.goto(base);
    const cards = page.locator('#gameList .game-card:visible');
    const ids = () => cards.evaluateAll(list => list.map(card => card.dataset.slug));
    const popular = page.locator('#popularGames'), reset = page.locator('#clearFilters');
    await cards.first().waitFor();
    const initial = await ids();
    assert.ok(initial.length > 5);
    assert.equal(await page.locator('#gameSortSelect').inputValue(),'newest');
    assert.equal(requests,0);
    await popular.tap();
    await page.locator('#popularRetry').waitFor();
    response = totals;
    await page.locator('#popularRetry').tap();
    await cards.first().waitFor();
    const sorted = await ids();
    assert.equal(sorted.length,5);
    assert.deepEqual(sorted.slice(0,2),['meoshi_wo_seisu','iroate']);
    assert.ok(sorted.slice(2,4).includes('ironarabe') && sorted.slice(2,4).includes('ikagetto'));
    assert.equal(sorted[4],'inubo');
    assert.deepEqual(await cards.locator('.monthly-count b').allTextContents(),['1位','2位','3位','3位','5位']);
    assert.equal(await cards.first().locator('.monthly-count span').textContent(),'101回');
    const trigger = cards.last().locator('[data-accordion]');
    assert.equal(await trigger.getAttribute('aria-describedby'),'monthly-inubo');
    await trigger.tap();
    await page.getByRole('dialog').waitFor();
    assert.equal(await page.locator('.accordion-icon').count(),0);
    assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('dialog-close')),true);
    await page.getByRole('dialog').locator('[data-share]').tap();
    await page.locator('dialog[open] #toast.show').getByText('シェア文をコピーしました').waitFor();
    await page.keyboard.press('Escape');
    assert.ok(await trigger.evaluate(el => el === document.activeElement));
    assert.deepEqual(await ids(),sorted);
    await reset.tap();
    assert.deepEqual(await ids(),initial);
    const pending = Promise.withResolvers();
    response = pending.promise;
    await popular.tap();
    await reset.tap();
    const settle = page.waitForResponse(r => r.url().endsWith('/rpc/lab_monthly_game_plays_v1'));
    pending.resolve(totals);
    await settle;
    assert.deepEqual(await ids(),initial);
    response = [];
    await popular.tap();
    await page.locator('#popularStatus').getByText('この期間のプレイ記録はありません。').waitFor();
    assert.equal(await cards.count(),0);
    await page.reload();
    await cards.first().waitFor();
    assert.deepEqual(await ids(),initial);
    assert.equal(requests,4);
    assert.deepEqual(errors,[]);
    console.log(engine.name(), 'verified monthly top five, mode totals, ties, retry, modal and newest reset');
  } finally { await browser.close(); }
}
