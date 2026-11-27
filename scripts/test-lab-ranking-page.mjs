import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('shared rankings retain global ranks across 500-row pages and keep private data private', async () => {
  const db = new PGlite();
  try {
    await db.exec(await read('./fixtures/ironarabe-guest-db.sql'));
    await db.exec(await read('../docs/chameleonjp-lab/sql/20261013202016_restore_legacy_play_count_ranking.sql'));
    await db.exec(await read('../docs/chameleonjp-lab/sql/lab-ranking-page-v1.sql'));
    await db.exec(`
      insert into public.games values ('inactive-game', false, 'shared', 'desc', 1, 0);
      insert into public.game_scores
      select 'takkeu', 'entrant-' || n, 'Entrant ' || n, score, score, score,
        '2026-01-01', '2026-01-01', '2026-01-01', 'normal'
      from generate_series(1, 1001) n
      cross join lateral (select 2000 - case when n = 501 then 500 else n end as score) s;
      insert into public.game_scores values
        ('inactive-game', 'inactive', 'Hidden', 100, 100, 1, now(), now(), now(), 'normal'),
        ('takkeu', 'excluded', 'Excluded', 4000, 4000, 4000, now(), now(), now(), 'disqualified');
      set role anon;
    `);

    const page = async (slug, tab, offset, limit = 501) => (await db.query(
      'select * from public.lab_ranking_page_v1($1, $2, $3, $4)', [slug, tab, offset, limit]
    )).rows;
    for (const tab of ['first', 'best', 'plays']) {
      const first = await page('takkeu', tab, 0);
      const next = await page('takkeu', tab, 500);
      const last = await page('takkeu', tab, 1000);
      assert.equal(first.length, 501);
      assert.equal(next.length, 501);
      assert.equal(last.length, 2);
      assert.equal(first[499].rank_no, 500);
      assert.deepEqual(first[500], next[0]);
      assert.equal(next[0].rank_no, 500);
      assert.equal(next[1].rank_no, 502);
      assert.deepEqual(next[500], last[0]);
      assert.equal(last[1].display_name, 'fixture-takkeu');
      assert.ok([...first, ...next, ...last].every(row => row.display_name !== 'Excluded'));
    }

    const firstAscending = await page('ironarabe', 'first', 0);
    assert.deepEqual(firstAscending.map(row => row.first_score), [8100, 10000]);
    assert.deepEqual((await page('ironarabe', 'best', 0)).map(row => row.best_score), [6071, 9000]);
    const plays = await page('ironarabe', 'plays', 0);
    assert.equal(plays[0].play_count, 3);
    assert.ok(plays.some(row => row.display_name === 'fixture-session' && row.first_score === null));
    assert.deepEqual(Object.keys(plays[0]).sort(), ['best_score', 'display_name', 'first_score', 'play_count', 'rank_no']);
    for (const [slug, tab, offset, limit] of [
      ['inactive-game', 'best', 0, 501], ['unknown-game', 'best', 0, 501],
      ['takkeu', 'invalid', 0, 501], ['takkeu', 'best', -1, 501],
      ['takkeu', 'best', 0, 502], ['takkeu', 'best', 5000, 501]
    ]) {
      assert.deepEqual(await page(slug, tab, offset, limit), []);
    }
    await assert.rejects(db.query('select * from private.game_play_sessions'), /permission denied/);
  } finally {
    await db.close();
  }
});
