import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const migration = await readFile(new URL('../docs/chameleonjp-lab/sql/songen3-online-ranking-v1.sql', import.meta.url), 'utf8');
const { games } = JSON.parse(await readFile(new URL('../catalog/games.json', import.meta.url), 'utf8'));
const slug = 'songen_wo_kakeyouka3_online';
const matchId = id => `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`;
const playerId = name => createHash('sha256').update(name).digest('hex');
const start = (id, seat = 0, player = null, displayName = null) => ({
  matchId: matchId(id), seat, kind: 'start', playerId: player, displayName,
  startedAt: 1_795_000_000_000 + id, outcome: null, finishReason: null, score: null
});
const result = (event, outcome, finishReason, score) => ({ ...event, kind: 'result', outcome, finishReason, score });

async function asRole(db, role, fn) {
  await db.exec(`set role ${role}`);
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
  }
}

const submit = (db, event) => db.query('select public.record_songen3_online_event($1::jsonb) as recorded', [JSON.stringify(event)]);
const stats = db => db.query('select * from public.songen3_online_stats_v1()').then(data => data.rows[0]);
const board = (db, tab, offset = 0, limit = 50) => db.query('select * from public.songen3_online_board_v1($1, $2, $3)', [tab, offset, limit]).then(data => data.rows);
const errorCode = code => error => error.code === code;

async function createDatabase() {
  const db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create table public.games (
      game_slug text primary key, title text, game_url text, description text, share_text text,
      display_order integer unique, is_active boolean, release_date date, submission_mode text,
      top_ranking_type text, score_order text, score_unit text, score_scale integer,
      score_decimals integer, score_label text, first_score_label text, best_score_label text,
      score_min integer, score_max integer
    );
    insert into public.games (game_slug, display_order) values
      ('songen_wo_kakeyouka', 11), ('songen_wo_kakeyouka3', 58), ('medjedshin_ha_mamotteru', 66);
  `);
  return db;
}

test('Songen 3 online registers the separate game and keeps confirmed events and IDs private', async () => {
  const db = await createDatabase();
  try {
    // Supabase can grant default permissions for new public functions, so test explicit revocation.
    await db.exec('alter default privileges in schema public grant execute on functions to anon, authenticated, service_role');
    await db.exec(migration);
    const { rows: [catalogRow] } = await db.query('select * from public.games where game_slug = $1', [slug]);
    assert.deepEqual({ ...catalogRow, release_date: catalogRow.release_date.toISOString().slice(0, 10) },
      games.find(game => game.game_slug === slug));
    assert.deepEqual(await asRole(db, 'anon', () => stats(db)), { total_play_count: 0, player_count: 0 });
    const event = start(1);
    for (const role of ['anon', 'authenticated']) {
      await asRole(db, role, async () => {
        await assert.rejects(submit(db, event), errorCode('42501'));
        await assert.rejects(db.query('select * from songen3_online_ranking.events'), errorCode('42501'));
        assert.deepEqual(await board(db, 'best'), []);
      });
    }
    await asRole(db, 'service_role', async () => {
      await assert.rejects(db.query('select * from songen3_online_ranking.events'), errorCode('42501'));
      assert.deepEqual(await stats(db), { total_play_count: 0, player_count: 0 });
      assert.deepEqual((await submit(db, event)).rows, [{ recorded: true }]);
      assert.deepEqual((await submit(db, event)).rows, [{ recorded: true }]);
      assert.deepEqual((await submit(db, start(1, 1))).rows, [{ recorded: true }]);
      await assert.rejects(submit(db, { ...event, startedAt: event.startedAt + 1 }), errorCode('PT409'));
    });
    // Re-applying the migration keeps data and permissions intact.
    await db.exec(migration);
    assert.deepEqual(await asRole(db, 'anon', () => stats(db)), { total_play_count: 2, player_count: 0 });
    assert.deepEqual(await asRole(db, 'authenticated', () => board(db, 'record')), []);
  } finally {
    await db.close();
  }
});

test('only valid named, decided results are accepted, with strict retries and signed scores', async () => {
  const db = await createDatabase();
  try {
    await db.exec(migration);
    const started = start(2, 0, playerId('A'), '😀'.repeat(24));
    const decided = result(started, 'draw', 'double-heart', -2147483648);
    await asRole(db, 'service_role', async () => {
      // An independently retried start can arrive after the result.
      assert.deepEqual((await submit(db, decided)).rows, [{ recorded: true }]);
      assert.deepEqual((await submit(db, started)).rows, [{ recorded: true }]);
      assert.deepEqual((await submit(db, decided)).rows, [{ recorded: true }]);
      await assert.rejects(submit(db, { ...decided, score: -20 }), errorCode('PT409'));
      for (const event of [null, [], 'start', {},
        { ...started, unknown: 'do not store' }, { ...started, seat: '0' }, { ...started, seat: 2 },
        { ...started, matchId: 'old-round' }, { ...started, startedAt: '1795000000000' },
        { ...started, startedAt: -1 }, { ...started, startedAt: 0.5 }, { ...started, startedAt: 9007199254740992 },
        { ...started, playerId: 'not-a-hash' }, { ...started, playerId: null }, { ...started, displayName: null },
        { ...started, displayName: '' }, { ...started, displayName: ' ' },
        { ...started, displayName: 'A\nB' }, { ...started, displayName: '😀'.repeat(25) },
        { ...started, score: 0 }, { ...decided, playerId: null, displayName: null }, { ...decided, outcome: null },
        { ...decided, finishReason: 'interrupted' }, { ...decided, score: null }, { ...decided, score: '0' },
        { ...decided, score: 0.5 }, { ...decided, score: -2147483649 }, { ...decided, score: 2147483648 }
      ]) {
        await assert.rejects(submit(db, event), errorCode('PT400'), JSON.stringify(event));
      }
    });
    await asRole(db, 'anon', async () => {
      assert.deepEqual(await stats(db), { total_play_count: 1, player_count: 1 });
      const [row] = await board(db, 'best');
      assert.equal(row.best_score, -2147483648);
      assert.equal(row.total_score, -2147483648);
      assert.equal(row.draws, 1);
      assert.equal(row.songen_points, 0);
      assert.equal(row.display_name, '😀'.repeat(24));
      assert.ok(!Object.hasOwn(row, 'player_id') && !Object.hasOwn(row, 'match_id'));
      for (const args of [[null, 0, 1], ['invalid', 0, 1], ['best', -1, 1], ['best', 0, 102], ['best', 0, 0]]) {
        await assert.rejects(board(db, ...args), errorCode('PT400'));
      }
    });
  } finally {
    await db.close();
  }
});

test('three tabs use exact integer points, ordinary scores, latest names and ranks across pages', async () => {
  const db = await createDatabase();
  try {
    await db.exec(migration);
    const a = playerId('A');
    const record = [
      ['win', 'heart', 2000], ['win', 'timeout', 1800], ['win', 'heart', 1500],
      ['win', 'heart', 1300], ['win', 'forfeit', 1200], ['win', 'heart', 1100],
      ['loss', 'heart', 500], ['loss', 'heart', 200], ['loss', 'timeout', -750], ['draw', 'double-heart', 350]
    ];
    await asRole(db, 'service_role', async () => {
      const olderName = '以前の名前';
      const currentName = '同じ名前';
      for (const [index, [outcome, reason, score]] of record.entries().toArray().reverse()) {
        const event = start(index + 1, 0, a, index === record.length - 1 ? currentName : olderName);
        await submit(db, event);
        await submit(db, result(event, outcome, reason, score));
      }
      for (const [event, outcome, reason, score] of [
        [start(1, 1, playerId('B'), currentName), 'loss', 'heart', 2000],
        [start(20, 0, playerId('C'), '降参だけ'), 'win', 'forfeit', 99999],
        [start(21, 0, playerId('D'), '負のスコア'), 'win', 'heart', -150]
      ]) {
        await submit(db, event);
        await submit(db, result(event, outcome, reason, score));
      }
      await submit(db, start(21, 1));
      await submit(db, start(22, 0, playerId('E'), '中断だけ'));
      await submit(db, start(22, 1));
    });
    await asRole(db, 'anon', async () => {
      assert.deepEqual(await stats(db), { total_play_count: 16, player_count: 5 });
      const best = await board(db, 'best');
      assert.deepEqual(best.map(row => [row.rank, row.display_name, row.best_score]), [
        [1, '同じ名前', 2000], [1, '同じ名前', 2000], [3, '負のスコア', -150]
      ]);
      assert.deepEqual(await board(db, 'best', 0, 1), best.slice(0, 1));
      assert.deepEqual(await board(db, 'best', 1, 1), best.slice(1, 2));
      assert.deepEqual(await board(db, 'best', 3, 1), []);
      const records = await board(db, 'record');
      assert.deepEqual(records[0], {
        rank: 1, display_name: '同じ名前', best_score: 2000, match_count: 10,
        wins: 6, losses: 3, draws: 1, record_points: 3000, total_score: 8000, songen_points: 2400
      });
      assert.deepEqual(records.slice(1).map(row => row.rank), [2, 2, 4]);
      const forfeitOnly = records.find(row => row.display_name === '降参だけ');
      assert.equal(forfeitOnly.best_score, null);
      assert.equal(forfeitOnly.match_count, 1);
      assert.equal(forfeitOnly.record_points, 909);
      assert.equal(forfeitOnly.total_score, 0);
      const points = await board(db, 'points');
      assert.deepEqual(points.map(row => [row.rank, row.songen_points]), [[1, 2400], [2, 0], [2, 0], [2, 0]]);
    });
  } finally {
    await db.close();
  }
});
