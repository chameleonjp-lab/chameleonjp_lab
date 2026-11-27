import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { PGlite } from '@electric-sql/pglite';

test('opt-in starts preserve legacy totals, deduplicate retries, and keep names separate', async () => {
  const db = await PGlite.create();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create schema private;
      create table public.games (game_slug text primary key, is_active boolean);
      insert into public.games values ('torani_yasashiku', true), ('juden_ga', true),
        ('iroate', true), ('inubo', true), ('inactive_demo', false);
      create table private.named (game_slug text, play_count integer);
      insert into private.named values ('torani_yasashiku', 7), ('iroate', 3);
      create function private.get_game_player_counts_v1(p_slug text)
      returns table(play_count integer) language sql as
      'select n.play_count from private.named n where n.game_slug = p_slug';
      create table private.takkeu_guest_plays_v1 (id integer);
      create table private.iroate_guest_plays_v1 (id integer);
      create table private.ironarabe_guest_plays_v1 (id integer);
      insert into private.iroate_guest_plays_v1 values (1), (2);
    `);
    const sql = await readFile(new URL('../docs/chameleonjp-lab/sql/lab-counted-starts-v1.sql', import.meta.url), 'utf8');
    await db.exec(sql);
    const enable = async slug => (await db.query('select private.enable_lab_counted_starts_v1($1) as ok', [slug])).rows[0].ok;
    const stats = async slug => (await db.query('select * from public.get_game_play_stats($1)', [slug])).rows[0];
    const send = async (id, slug) =>
      (await db.query('select public.lab_record_play_start_v1($1, $2) as ok', [id,slug])).rows[0].ok;
    const first = randomUUID();
    const second = randomUUID();
    assert.deepEqual(await stats('iroate'), { total_play_count: 5, player_count: 1 });
    assert.equal(await send(first, 'torani_yasashiku'), false);
    assert.equal(await enable('inubo'), false);
    assert.equal(await enable('inactive_demo'), false);
    assert.equal(await enable('torani_yasashiku'), true);
    assert.equal(await enable('juden_ga'), true);
    await db.exec('set role anon');
    assert.equal(await send(first, 'torani_yasashiku'), true);
    assert.equal(await send(first, 'torani_yasashiku'), true);
    assert.equal(await send(first, 'juden_ga'), false);
    assert.equal(await send(second, 'torani_yasashiku'), true);
    assert.equal(await send('00000000-0000-0000-0000-000000000000', 'torani_yasashiku'), false);
    await assert.rejects(db.query('select * from private.lab_counted_starts_v1'), /permission denied/);
    await assert.rejects(db.query("select private.enable_lab_counted_starts_v1('iroate')"), /permission denied/);
    assert.deepEqual(await stats('torani_yasashiku'), { total_play_count: 9, player_count: 1 });
    await db.exec('reset role; update private.named set play_count = 8;');
    assert.deepEqual(await stats('torani_yasashiku'), { total_play_count: 9, player_count: 1 });
    assert.equal(await enable('torani_yasashiku'), true);
    assert.deepEqual(await stats('torani_yasashiku'), { total_play_count: 9, player_count: 1 });
    await db.exec("update public.games set is_active = false where game_slug = 'torani_yasashiku'");
    assert.equal(await send(randomUUID(), 'torani_yasashiku'), false);
  } finally {
    await db.close();
  }
});

test('browser sends only a fresh start ID and slug, and retries with the same ID', async () => {
  const source = await readFile(new URL('../play-start.js', import.meta.url), 'utf8');
  const stored = {};
  const calls = [];
  const timers = [];
  const localStorage = Object.assign(stored, {
    getItem: key => stored[key],
    setItem: (key, value) => { stored[key] = value; },
    removeItem: key => { delete stored[key]; },
  });
  const scope = {
    crypto: { randomUUID }, Date, AbortSignal, localStorage,
    setTimeout: callback => timers.push(callback),
    fetch: async (_url, request) => {
      calls.push(JSON.parse(request.body));
      return { ok: true, json: async () => calls.length > 1 };
    },
  };
  runInNewContext(source.replace('export function', 'function'), scope);
  scope.recordPlayStart('invalid slug');
  scope.recordPlayStart('tomatoku_competition_v1');
  await new Promise(setImmediate);
  assert.equal(calls.length, 1);
  assert.deepEqual(Object.keys(calls[0]).sort(), ['p_game_slug', 'p_play_id']);
  assert.equal(Object.keys(stored).filter(key => key.includes(':play-start:')).length, 1);
  timers[0]();
  await new Promise(setImmediate);
  assert.deepEqual(calls[1], calls[0]);
  assert.equal(Object.keys(stored).filter(key => key.includes(':play-start:')).length, 0);
  scope.recordPlayStart('tomatoku_competition_v1');
  await new Promise(setImmediate);
  assert.notEqual(calls[2].p_play_id, calls[0].p_play_id);
});
