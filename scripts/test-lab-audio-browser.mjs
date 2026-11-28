import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';

const base = 'https://chameleonjp-lab.github.io/chameleonjp_lab/';
const dist = new URL('../dist/', import.meta.url);
const types = { js: 'text/javascript', html: 'text/html', css: 'text/css', mp3: 'audio/mpeg' };

for (const engine of [chromium, webkit]) {
  const browser = await engine.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 402, height: 700 }, hasTouch: true });
    let trackRequests = 0;
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (!url.href.startsWith(base)) return route.abort();
      const file = url.pathname.slice(new URL(base).pathname.length) || 'index.html';
      if (file.endsWith('.mp3')) trackRequests++;
      return route.fulfill({ body: await readFile(new URL(file, dist)), contentType: types[file.split('.').pop()] || 'image/jpeg' });
    });

    // Observe the real audio graph, including decoding the published track.
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'share', { configurable: true, value: async () => {} });
      const observed = window.heard = { notes: [], loops: [] };
      const frequencies = new WeakSet();
      const originalOscillator = AudioContext.prototype.createOscillator;
      AudioContext.prototype.createOscillator = function (...args) {
        observed.context = this;
        const oscillator = originalOscillator.apply(this, args);
        frequencies.add(oscillator.frequency);
        return oscillator;
      };
      const setValue = AudioParam.prototype.setValueAtTime;
      AudioParam.prototype.setValueAtTime = function (value, when) {
        if (frequencies.has(this)) observed.notes.push(Math.round(69 + 12 * Math.log2(value / 440)));
        return setValue.call(this, value, when);
      };
      const start = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (...args) {
        if (this.loop) {
          const samples = this.buffer.getChannelData(0).subarray(0, 16000);
          observed.loops.push({ seconds: this.buffer.duration, hasSound: samples.some(value => Math.abs(value) > .01) });
        }
        return start.apply(this, args);
      };
    });

    const sound = page.locator('#labSound');
    const notes = () => page.evaluate(() => window.heard.notes.splice(0));
    await page.goto(base + '?lang=en');
    assert.equal(await sound.getAttribute('aria-pressed'), 'true');
    assert.match(await sound.textContent(), /Sound/);
    assert.equal(trackRequests, 0);
    await sound.tap(); // First tap mutes, without starting the track.
    const card = page.locator('[data-accordion="iroate"]');
    await card.tap();
    assert.deepEqual(await notes(), []);
    assert.equal(trackRequests, 0);
    const closeDialog = page.locator("dialog[open] .dialog-close");
    await closeDialog.tap();
    await sound.tap();
    await page.waitForFunction(() => window.heard.context?.state === 'running' && window.heard.loops.length === 1);
    const [track] = await page.evaluate(() => window.heard.loops);
    assert.ok(track.seconds > 36 && track.seconds < 38 && track.hasSound);
    assert.deepEqual(await notes(), [76, 79]);
    for (const [area, expected] of [['action', [55, 62, 74]], ['puzzle', [83, 90, 95]], ['timing', [79, 67, 79]]]) {
      await page.locator('.map-pin.' + area).tap();
      assert.deepEqual(await notes(), expected);
    }
    await page.locator('#clearFilters').tap();
    assert.deepEqual(await notes(), [76, 79]);
    await card.tap();
    assert.deepEqual(await notes(), [62, 69, 77]);
    await closeDialog.tap();
    assert.deepEqual(await notes(), [62, 50]);
    await card.tap();
    assert.deepEqual(await notes(), [62, 69, 77]);
    assert.equal(trackRequests, 1);
    const gameCard = page.locator('#game-iroate');
    await gameCard.locator('[data-share]').tap();
    assert.deepEqual(await notes(), [79, 91, 86]);
    for (const [selector, expected] of [['.actions > a', [74, 77, 81]], ['.detail-link-wrap a', [81, 86]]]) {
      const link = gameCard.locator(selector);
      await link.evaluate(el => el.addEventListener('click', e => e.preventDefault(), { once: true }));
      await link.tap();
      assert.deepEqual(await notes(), expected, 'one entrance cue per tap');
    }
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    await page.waitForFunction(() => window.heard.context.state === 'suspended');
    await page.evaluate(() => window.dispatchEvent(new Event('pageshow')));
    await page.waitForFunction(() => window.heard.context.state === 'running');
    assert.equal(await page.evaluate(() => window.heard.loops.length), 1);
    await closeDialog.tap();
    assert.deepEqual(await notes(), [62, 50]);
    await page.locator('#labLanguageSelect').selectOption('fr');
    assert.match(await sound.textContent(), /Son/);
    assert.deepEqual(await notes(), []); // Programmatic language changes are silent.

    await sound.tap();
    await page.waitForFunction(() => window.heard.context.state === 'suspended');
    await card.tap();
    await page.locator('#detail-iroate').tap();
    await page.waitForURL('**/ranking.html?**');
    assert.equal(await sound.getAttribute('aria-pressed'), 'false');
    await page.locator('#bestTab').tap();
    assert.deepEqual(await notes(), []);
    assert.equal(trackRequests, 1);
    await sound.tap();
    await notes();
    await page.locator('#firstTab').focus();
    await page.keyboard.press('Enter');
    assert.deepEqual(await notes(), [69, 74]);

    await page.goto(base + 'inubo-ranking.html?lang=ko');
    assert.match(await sound.textContent(), /소리/);
    assert.equal(await sound.getAttribute('aria-pressed'), 'true');
    await page.locator('#time').tap();
    assert.deepEqual(await notes(), [69, 74]);
    await page.waitForFunction(() => window.heard.loops.length === 1);
    assert.deepEqual(errors, []);
    console.log(engine.name(), 'verified music decoding, distinct effects, first tap, mute, language and all three pages');
  } finally {
    await browser.close();
  }
}
