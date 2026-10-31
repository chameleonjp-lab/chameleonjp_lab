#!/usr/bin/env node

// Real PostgreSQL 17/WASM in process, with synthetic local fixtures only.
// No URL, connection string, remote client, environment secrets, or server port.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const originalDigest = 'b267a6060af97a4845c2d18f5e3ab02e';
const originalGuestDigest = '3bd02ffa7b92def627e1334750085989';
const validVersion = 'ironarabe-web-1.4.1-stagepack001-v2-sunset-r0';
const stageFamilies = ['sunset', 'aurora', 'ocean', 'leaf', 'amber', 'wisteria', 'coral',
  'nebula', 'breeze', 'autumn'];
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const load = relative => readFile(new URL(relative, import.meta.url), 'utf8');
const [fixture, namedRanking, beforeStats, migration, originalGuestMigration, guestUpgrade] = await Promise.all([
  load('./fixtures/ironarabe-guest-db.sql'),
  load('../docs/chameleonjp-lab/sql/20261013202016_restore_legacy_play_count_ranking.sql'),
  load('./fixtures/ironarabe-play-stats-before.sql'),
  load('../docs/chameleonjp-lab/sql/ironarabe-guest-play-count.sql'),
  // Captured byte-for-byte from origin/main at 419e25e, before the allowlist edit.
  load('./fixtures/ironarabe-guest-play-count-8.sql'),
  load('../docs/chameleonjp-lab/sql/ironarabe-guest-stage-pack-40.sql')
]);

async function setup() {
  const db = new PGlite();
  await db.exec(fixture);
  // Use the real committed named-player helper and play-count ranking RPC.
  await db.exec(namedRanking);
  await db.exec(beforeStats);
  const [{ digest }] = (await db.query(`select pg_catalog.md5(pg_catalog.pg_get_functiondef(
    'public.get_game_play_stats(text)'::regprocedure)) as digest`)).rows;
  assert.equal(digest, originalDigest, 'fixture must reproduce the real function precondition');
  return db;
}

async function stats(db, slug) {
  return (await db.query('select * from public.get_game_play_stats($1)', [slug])).rows[0];
}

async function guest(db, id = randomUUID(), version = validVersion, slug = 'ironarabe') {
  return (await db.query('select public.start_ironarabe_guest_play_v1($1::uuid, $2, $3) as result',
    [id, slug, version])).rows[0].result;
}

async function asRole(db, role, callback) {
  assert.ok(['anon', 'authenticated', 'service_role'].includes(role));
  await db.exec(`set role ${role}`);
  try { return await callback(); } finally { await db.exec('reset role'); }
}

async function rowSnapshots(db) {
  const snapshots = {};
  for (const table of ['public.games', 'public.players', 'public.game_scores', 'public.score_runs',
    'private.game_play_sessions', 'private.takkeu_guest_plays_v1']) {
    // Full JSON rows include score history, client metadata, names and dates.
    snapshots[table] = (await db.query(`select pg_catalog.to_jsonb(t)::text as row from ${table} as t order by row`)).rows;
  }
  return snapshots;
}

async function rpcSnapshots(db, includeStats = false) {
  return (await db.query(`select n.nspname, p.proname, p.oid::text as oid,
    p.oid::regprocedure::text as signature, p.proowner::regrole::text as owner,
    pg_catalog.pg_get_functiondef(p.oid) as definition, p.proacl::text as acl
    from pg_catalog.pg_proc as p join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private') and ($1::boolean or p.proname <> 'get_game_play_stats')
      and p.proname <> 'start_ironarabe_guest_play_v1'
    order by signature`, [includeStats])).rows;
}

async function guestRows(db) {
  return (await db.query(`select pg_catalog.to_jsonb(t)::text as row
    from private.ironarabe_guest_plays_v1 as t order by row`)).rows;
}

async function guestFunction(db) {
  return (await db.query(`select pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid)) as digest,
    pg_catalog.pg_get_functiondef(p.oid) as definition,
    (pg_catalog.to_jsonb(p) - 'prosrc')::text as metadata
    from pg_catalog.pg_proc as p where p.oid =
      'public.start_ironarabe_guest_play_v1(uuid,text,text)'::regprocedure`)).rows[0];
}

async function guestTableSchema(db) {
  return {
    table: (await db.query(`select pg_catalog.to_jsonb(c)::text as definition
      from pg_catalog.pg_class as c where c.oid = 'private.ironarabe_guest_plays_v1'::regclass`)).rows,
    columns: (await db.query(`select pg_catalog.to_jsonb(a)::text as definition
      from pg_catalog.pg_attribute as a where a.attrelid = 'private.ironarabe_guest_plays_v1'::regclass
      order by a.attnum`)).rows,
    constraints: (await db.query(`select c.oid::text, pg_catalog.pg_get_constraintdef(c.oid) as definition
      from pg_catalog.pg_constraint as c where c.conrelid = 'private.ironarabe_guest_plays_v1'::regclass
      order by c.oid`)).rows,
    indexes: (await db.query(`select i.indexrelid::text, pg_catalog.pg_get_indexdef(i.indexrelid) as definition
      from pg_catalog.pg_index as i where i.indrelid = 'private.ironarabe_guest_plays_v1'::regclass
      order by i.indexrelid`)).rows,
    policies: (await db.query(`select pg_catalog.to_jsonb(p)::text as definition
      from pg_catalog.pg_policy as p where p.polrelid = 'private.ironarabe_guest_plays_v1'::regclass`)).rows
  };
}

async function setupOriginalGuest() {
  const db = await setup();
  await db.exec(originalGuestMigration);
  assert.equal((await guestFunction(db)).digest, originalGuestDigest,
    'original 8-ID fixture must reproduce the upgrade precondition');
  return db;
}

async function rankings(db) {
  await db.exec('begin read only');
  try {
    return {
      play: (await db.query("select * from public.get_play_count_ranking('ironarabe', 100)")).rows,
      scores: (await db.query(`select gs.normalized_name, gs.first_score, gs.best_score,
        gs.play_count, gs.first_score::numeric / g.score_scale as first_seconds,
        gs.best_score::numeric / g.score_scale as best_seconds,
        rank() over (order by gs.best_score asc) as best_rank,
        rank() over (order by gs.first_score asc) as first_rank
        from public.game_scores as gs join public.games as g using (game_slug)
        where gs.game_slug = 'ironarabe' and coalesce(gs.ranking_status, 'normal') = 'normal'
        order by gs.normalized_name`)).rows
    };
  } finally { await db.exec('commit'); }
}

test('Ironarabe guest SQL uses only the isolated database', async t => {
  const db = await setup();
  try {
    const storedBefore = await rowSnapshots(db);
    const rpcsBefore = await rpcSnapshots(db);
    const rankingsBefore = await rankings(db);
    assert.equal(storedBefore['public.game_scores'].length, 31);
    assert.equal(storedBefore['public.score_runs'].length, 569);
    assert.deepEqual((await db.query(`select
      (select count(*)::integer from public.game_scores where game_slug = 'ironarabe') as names,
      (select count(*)::integer from public.score_runs where game_slug = 'ironarabe') as histories`)).rows,
    [{ names: 29, histories: 567 }]);
    const statsAclBefore = (await db.query(`select proacl::text as acl from pg_catalog.pg_proc
      where oid = 'public.get_game_play_stats(text)'::regprocedure`)).rows;
    assert.deepEqual(await stats(db, 'ironarabe'), { total_play_count: 6, player_count: 3 });
    assert.deepEqual(await stats(db, 'takkeu'), { total_play_count: 6, player_count: 1 });
    assert.deepEqual(await stats(db, 'fixture-other'), { total_play_count: 7, player_count: 1 });
    await db.exec(migration);
    assert.ok((await db.query(`select pg_catalog.to_regprocedure(
      'public.start_ironarabe_guest_play_v1(uuid,text,text)') as rpc`)).rows[0].rpc,
    'guest start RPC is missing');

    let first;
    const firstId = randomUUID();
    await t.test('one unnamed start increases only total_play_count by one', async () => {
      first = await asRole(db, 'anon', () => guest(db, firstId));
      assert.deepEqual(Object.keys(first).sort(),
        ['accepted', 'client_version', 'duplicate', 'game_slug', 'play_id', 'start_id']);
      assert.equal(first.accepted, true);
      assert.equal(first.duplicate, false);
      assert.equal(first.start_id, firstId);
      assert.equal(first.game_slug, 'ironarabe');
      assert.equal(first.client_version, validVersion);
      assert.match(first.play_id, uuidPattern);
      assert.notEqual(first.play_id, first.start_id);
      assert.deepEqual(await stats(db, 'ironarabe'), { total_play_count: 7, player_count: 3 });
      assert.deepEqual(await rowSnapshots(db), storedBefore);
    });

    await t.test('retry returns the same play and does not increment twice', async () => {
      const retry = await asRole(db, 'anon', () => guest(db, firstId));
      assert.deepEqual(retry, { ...first, duplicate: true });
      assert.deepEqual(await stats(db, 'ironarabe'), { total_play_count: 7, player_count: 3 });
    });

    await t.test('a reused start ID with a different valid stage is rejected', async () => {
      assert.deepEqual(await guest(db, firstId, 'ironarabe-web-1.4.1-stagepack001-v2-aurora-r3'),
        { accepted: false, reason: 'start_id_conflict' });
      assert.deepEqual(await stats(db, 'ironarabe'), { total_play_count: 7, player_count: 3 });
    });

    await t.test('an existing named-session start ID cannot become a guest start', async () => {
      assert.deepEqual(await guest(db, '10000000-0000-4000-8000-000000000001'),
        { accepted: false, reason: 'start_id_conflict' });
    });

    await t.test('all 40 supported stages are accepted as independent plays', async () => {
      const playIds = new Set();
      for (const theme of stageFamilies) {
        for (const rotation of [0, 1, 2, 3]) {
          const version = `ironarabe-web-1.4.1-stagepack001-v2-${theme}-r${rotation}`;
          const result = await asRole(db, 'anon', () => guest(db, randomUUID(), version));
          assert.equal(result.accepted, true, version);
          assert.equal(result.duplicate, false);
          playIds.add(result.play_id);
        }
      }
      assert.equal(playIds.size, 40);
      assert.deepEqual(await stats(db, 'ironarabe'), { total_play_count: 47, player_count: 3 });
    });

    await t.test('missing, untrimmed, overlong and unrecognized inputs cannot add plays', async () => {
      const current = await stats(db, 'ironarabe');
      for (const args of [[null, validVersion, 'ironarabe'], [randomUUID(), null, 'ironarabe'],
        [randomUUID(), validVersion, null]]) {
        assert.deepEqual(await guest(db, ...args), { accepted: false, reason: 'required_input_missing' });
      }
      for (const slug of ['', 'Ironarabe', ' ironarabe', 'ironarabe ', 'takkeu', 'fixture-other']) {
        assert.deepEqual(await guest(db, randomUUID(), validVersion, slug),
          { accepted: false, reason: 'invalid_input' });
      }
      for (const version of ['', ` ${validVersion}`, `${validVersion} `, 'x'.repeat(81),
        'ironarabe-web-1.4.1-stagepack001-v2', `${validVersion}\n`, `${validVersion}-extra`,
        'ironarabe-web-1.4.1-stagepack001-v2-aurora-r4',
        'ironarabe-web-1.4.1-stagepack001-v2-ocean-r4',
        'ironarabe-web-1.4.1-stagepack001-v2-unknown-r0',
        'ironarabe-web-1.4.1-stagepack001-v2-Ocean-r0',
        'ironarabe-web-1.4.1-stagepack001-v2-autumn-r04',
        'ironarabe-web-1.4.2-stagepack001-v2-sunset-r0']) {
        assert.deepEqual(await guest(db, randomUUID(), version), { accepted: false, reason: 'invalid_input' });
      }
      await assert.rejects(guest(db, 'invalid-uuid'), error => error.code === '22P02');
      assert.deepEqual(await stats(db, 'ironarabe'), current);
    });

    await t.test('inactive and non-shared games reject new starts while retries remain idempotent', async () => {
      for (const change of ["is_active = false", "submission_mode = 'fixture-disabled'"]) {
        await db.exec('begin');
        try {
          await db.exec(`update public.games set ${change} where game_slug = 'ironarabe'`);
          assert.deepEqual(await guest(db), { accepted: false, reason: 'game_not_available' });
          assert.deepEqual(await guest(db, firstId), { ...first, duplicate: true });
        } finally { await db.exec('rollback'); }
      }
    });

    await t.test('Takkeu, other games, null slugs and named-player normalization keep existing statistics', async () => {
      assert.deepEqual(await stats(db, 'takkeu'), { total_play_count: 6, player_count: 1 });
      assert.deepEqual(await stats(db, ' TAKKEU '), { total_play_count: 6, player_count: 1 });
      assert.deepEqual(await stats(db, 'fixture-other'), { total_play_count: 7, player_count: 1 });
      assert.deepEqual(await stats(db, ' IRONARABE '), { total_play_count: 47, player_count: 3 });
      for (const slug of [null, '', 'fixture-missing']) {
        assert.deepEqual(await stats(db, slug), { total_play_count: 0, player_count: 0 });
      }
    });

    await t.test('scores, history, all names, game configuration and existing RPCs are unchanged', async () => {
      assert.deepEqual(await rowSnapshots(db), storedBefore);
      assert.deepEqual(await rpcSnapshots(db), rpcsBefore);
      assert.deepEqual((await db.query(`select proacl::text as acl from pg_catalog.pg_proc
        where oid = 'public.get_game_play_stats(text)'::regprocedure`)).rows, statsAclBefore);
      assert.deepEqual((await db.query("select score_order, score_scale, score_decimals from public.games where game_slug='ironarabe'")).rows,
        [{ score_order: 'asc', score_scale: 100, score_decimals: 2 }]);
    });

    await t.test('read-only named rankings preserve first, best, play counts and asc/100/2 values', async () => {
      assert.deepEqual(await rankings(db), rankingsBefore);
      assert.deepEqual(rankingsBefore.scores.map(row => [row.normalized_name, Number(row.first_seconds),
        Number(row.best_seconds), row.first_rank, row.best_rank]),
      [['fixture-a', 81, 60.71, 1, 1], ['fixture-b', 100, 90, 2, 2]]);
      await asRole(db, 'anon', async () => {
        await db.exec('begin read only');
        try {
          assert.deepEqual((await db.query("select * from public.get_play_count_ranking('ironarabe', 100)")).rows,
            rankingsBefore.play);
          assert.deepEqual(await stats(db, 'ironarabe'), { total_play_count: 47, player_count: 3 });
        } finally { await db.exec('commit'); }
      });
    });

    await t.test('only anon can execute the new definer RPC and no browser role can write its table', async () => {
      const [{ relrowsecurity, policies }] = (await db.query(`select c.relrowsecurity,
        (select count(*)::integer from pg_catalog.pg_policy as p where p.polrelid = c.oid) as policies
        from pg_catalog.pg_class as c where c.oid = 'private.ironarabe_guest_plays_v1'::regclass`)).rows;
      assert.equal(relrowsecurity, true);
      assert.equal(policies, 0);
      for (const role of ['anon', 'authenticated']) {
        assert.equal((await db.query(`select pg_catalog.has_table_privilege($1,
          'private.ironarabe_guest_plays_v1', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') as allowed`, [role])).rows[0].allowed, false);
        await asRole(db, role, async () => {
          await assert.rejects(db.query('select * from private.ironarabe_guest_plays_v1'), error => error.code === '42501');
          await assert.rejects(db.query(`insert into private.ironarabe_guest_plays_v1 (start_id, client_version)
            values ($1::uuid, $2)`, [randomUUID(), validVersion]), error => error.code === '42501');
        });
      }
      for (const [role, allowed] of [['anon', true], ['authenticated', false], ['service_role', false]]) {
        assert.equal((await db.query(`select pg_catalog.has_function_privilege($1,
          'public.start_ironarabe_guest_play_v1(uuid,text,text)', 'EXECUTE') as allowed`, [role])).rows[0].allowed, allowed);
      }
      await asRole(db, 'authenticated', () => assert.rejects(guest(db), error => error.code === '42501'));
      const [{ prosecdef, proconfig, public_execute }] = (await db.query(`select p.prosecdef, p.proconfig,
        exists (select 1 from pg_catalog.aclexplode(p.proacl) as a
          where a.grantee = 0 and a.privilege_type = 'EXECUTE') as public_execute
        from pg_catalog.pg_proc as p where p.oid =
          'public.start_ironarabe_guest_play_v1(uuid,text,text)'::regprocedure`)).rows;
      assert.equal(prosecdef, true);
      assert.deepEqual(proconfig, ['search_path=""']);
      assert.equal(public_execute, false);
      assert.equal((await db.query(`select count(*)::integer as grants
        from pg_catalog.pg_class as c cross join lateral pg_catalog.aclexplode(c.relacl) as a
        where c.oid = 'private.ironarabe_guest_plays_v1'::regclass and a.grantee = 0`)).rows[0].grants, 0);
    });

    await t.test('minute cap ignores old plays, accepts the 10000th, rejects the next, and permits retry', async () => {
      await db.query(`insert into private.ironarabe_guest_plays_v1 (start_id, client_version, started_at)
        values ($1::uuid, $2, pg_catalog.clock_timestamp() - interval '2 minutes')`, [randomUUID(), validVersion]);
      await db.exec(`insert into private.ironarabe_guest_plays_v1 (start_id, client_version)
        select pg_catalog.gen_random_uuid(), '${validVersion}' from pg_catalog.generate_series(1,
          9999 - (select count(*)::integer from private.ironarabe_guest_plays_v1
            where started_at >= pg_catalog.clock_timestamp() - interval '1 minute'))`);
      const lastId = randomUUID();
      const last = await guest(db, lastId);
      assert.equal(last.accepted, true);
      assert.equal(last.duplicate, false);
      assert.deepEqual(await guest(db), { accepted: false, reason: 'play_rate_limited' });
      assert.deepEqual(await guest(db, lastId), { ...last, duplicate: true });
      assert.equal((await db.query(`select count(*)::integer as count from private.ironarabe_guest_plays_v1
        where started_at >= pg_catalog.clock_timestamp() - interval '1 minute'`)).rows[0].count, 10000);
      assert.deepEqual(await rowSnapshots(db), storedBefore);
    });
  } finally { await db.close(); }
});

test('upstream statistics function change rolls back instead of replacing it', async () => {
  const db = await setup();
  try {
    await db.exec(`create or replace function public.get_game_play_stats(p_game_slug text)
      returns table(total_play_count bigint, player_count bigint) language sql stable security definer
      set search_path = '' as 'select 123::bigint, 456::bigint';`);
    const before = (await db.query(`select pg_catalog.pg_get_functiondef(
      'public.get_game_play_stats(text)'::regprocedure) as definition`)).rows;
    await assert.rejects(db.exec(migration), /get_game_play_stats.*precondition/i);
    await db.exec('rollback');
    assert.deepEqual((await db.query(`select pg_catalog.pg_get_functiondef(
      'public.get_game_play_stats(text)'::regprocedure) as definition`)).rows, before);
    assert.deepEqual((await db.query(`select pg_catalog.to_regclass('private.ironarabe_guest_plays_v1') as guest_table,
      pg_catalog.to_regprocedure('public.start_ironarabe_guest_play_v1(uuid,text,text)') as guest_rpc`)).rows,
    [{ guest_table: null, guest_rpc: null }]);
  } finally { await db.close(); }
});

test('a later DDL conflict rolls back the earlier table creation atomically', async () => {
  const db = await setup();
  try {
    await db.exec(`create function public.start_ironarabe_guest_play_v1(uuid, text, text)
      returns jsonb language sql as 'select null::jsonb';`);
    await assert.rejects(db.exec(migration), error => error.code === '42723');
    await db.exec('rollback');
    assert.equal((await db.query(`select pg_catalog.to_regclass('private.ironarabe_guest_plays_v1') as guest_table`)).rows[0].guest_table, null);
    assert.equal((await db.query(`select pg_catalog.md5(pg_catalog.pg_get_functiondef(
      'public.get_game_play_stats(text)'::regprocedure)) as digest`)).rows[0].digest, originalDigest);
  } finally { await db.close(); }
});

test('the 8-to-40 upgrade keeps existing guest plays and changes only the stage allowlist', async t => {
  const db = await setupOriginalGuest();
  try {
    const originalPlays = [];
    for (const family of ['sunset', 'aurora']) {
      for (const rotation of [0, 1, 2, 3]) {
        const version = `ironarabe-web-1.4.1-stagepack001-v2-${family}-r${rotation}`;
        const startId = randomUUID();
        const result = await asRole(db, 'anon', () => guest(db, startId, version));
        assert.equal(result.accepted, true);
        originalPlays.push({ startId, version, result });
      }
    }
    assert.deepEqual(await guest(db, randomUUID(), 'ironarabe-web-1.4.1-stagepack001-v2-ocean-r0'),
      { accepted: false, reason: 'invalid_input' });
    const before = {
      rows: await rowSnapshots(db), guestRows: await guestRows(db),
      rpcs: await rpcSnapshots(db, true), rankings: await rankings(db),
      guestFunction: await guestFunction(db), guestTable: await guestTableSchema(db)
    };
    assert.deepEqual(await stats(db, 'ironarabe'), { total_play_count: 14, player_count: 3 });
    await db.exec(guestUpgrade);

    await t.test('upgrade preserves existing rows, all other RPCs, table schema, owner and ACL', async () => {
      assert.deepEqual(await rowSnapshots(db), before.rows);
      assert.deepEqual(await guestRows(db), before.guestRows);
      assert.deepEqual(await rpcSnapshots(db, true), before.rpcs);
      assert.deepEqual(await rankings(db), before.rankings);
      assert.deepEqual(await guestTableSchema(db), before.guestTable);
      const afterFunction = await guestFunction(db);
      assert.equal(afterFunction.metadata, before.guestFunction.metadata);
      assert.equal(afterFunction.definition, before.guestFunction.definition.replace('(sunset|aurora)',
        '(sunset|aurora|ocean|leaf|amber|wisteria|coral|nebula|breeze|autumn)'));
      assert.deepEqual(await stats(db, 'ironarabe'), { total_play_count: 14, player_count: 3 });
    });

    await t.test('all original 8-ID retries keep their play IDs and add no plays', async () => {
      for (const { startId, version, result } of originalPlays) {
        assert.deepEqual(await asRole(db, 'anon', () => guest(db, startId, version)),
          { ...result, duplicate: true });
      }
      assert.deepEqual(await guestRows(db), before.guestRows);
      assert.deepEqual(await stats(db, 'ironarabe'), { total_play_count: 14, player_count: 3 });
    });

    await t.test('upgraded RPC accepts all 40 IDs with unchanged duplicate and conflict rules', async () => {
      const newPlayIds = new Set();
      for (const family of stageFamilies) {
        for (const rotation of [0, 1, 2, 3]) {
          const version = `ironarabe-web-1.4.1-stagepack001-v2-${family}-r${rotation}`;
          const startId = randomUUID();
          const first = await asRole(db, 'anon', () => guest(db, startId, version));
          assert.equal(first.accepted, true, version);
          assert.equal(first.duplicate, false);
          newPlayIds.add(first.play_id);
          assert.deepEqual(await asRole(db, 'anon', () => guest(db, startId, version)),
            { ...first, duplicate: true });
          const differentVersion = version.endsWith('-r0') ? version.replace(/-r0$/, '-r1') : validVersion;
          assert.deepEqual(await guest(db, startId, differentVersion),
            { accepted: false, reason: 'start_id_conflict' });
        }
      }
      assert.equal(newPlayIds.size, 40);
      assert.deepEqual(await stats(db, 'ironarabe'), { total_play_count: 54, player_count: 3 });
      assert.deepEqual(await stats(db, 'takkeu'), { total_play_count: 6, player_count: 1 });
      assert.deepEqual(await stats(db, 'fixture-other'), { total_play_count: 7, player_count: 1 });
      assert.deepEqual(await rowSnapshots(db), before.rows);
      assert.deepEqual(await rpcSnapshots(db, true), before.rpcs);
    });

    await t.test('upgraded RPC rejects unknown stages and keeps browser write restrictions', async () => {
      const rowsBefore = await guestRows(db);
      for (const version of ['ironarabe-web-1.4.1-stagepack001-v2-unknown-r0',
        'ironarabe-web-1.4.1-stagepack001-v2-autumn-r4',
        'ironarabe-web-1.4.2-stagepack001-v2-ocean-r0', `${validVersion}\n`]) {
        assert.deepEqual(await asRole(db, 'anon', () => guest(db, randomUUID(), version)),
          { accepted: false, reason: 'invalid_input' });
      }
      await asRole(db, 'authenticated', () => assert.rejects(guest(db), error => error.code === '42501'));
      await asRole(db, 'anon', () => assert.rejects(
        db.query('select * from private.ironarabe_guest_plays_v1'), error => error.code === '42501'));
      assert.deepEqual(await guestRows(db), rowsBefore);
      assert.deepEqual(await guestTableSchema(db), before.guestTable);
    });
  } finally { await db.close(); }
});

test('40-ID upgrade aborts when the original guest function is missing', async () => {
  const db = await setup();
  try {
    const before = { rows: await rowSnapshots(db), rpcs: await rpcSnapshots(db, true) };
    await assert.rejects(db.exec(guestUpgrade), /start_ironarabe_guest_play_v1.*precondition/i);
    await assert.rejects(db.query('select 1'), error => error.code === '25P02');
    await db.exec('rollback');
    assert.deepEqual(await rowSnapshots(db), before.rows);
    assert.deepEqual(await rpcSnapshots(db, true), before.rpcs);
    assert.deepEqual((await db.query(`select
      pg_catalog.to_regclass('private.ironarabe_guest_plays_v1') as guest_table,
      pg_catalog.to_regprocedure('public.start_ironarabe_guest_play_v1(uuid,text,text)') as guest_rpc`)).rows,
    [{ guest_table: null, guest_rpc: null }]);
  } finally { await db.close(); }
});

test('40-ID upgrade refuses a modified function without overwriting it or its existing rows', async () => {
  const db = await setupOriginalGuest();
  try {
    await guest(db);
    const modified = (await guestFunction(db)).definition.replace('(sunset|aurora)',
      '(sunset|aurora|fixture-drift)');
    await db.exec(modified);
    const before = { guestFunction: await guestFunction(db), guestRows: await guestRows(db),
      rows: await rowSnapshots(db), rpcs: await rpcSnapshots(db, true) };
    await assert.rejects(db.exec(guestUpgrade), /start_ironarabe_guest_play_v1.*precondition/i);
    await db.exec('rollback');
    assert.deepEqual(await guestFunction(db), before.guestFunction);
    assert.deepEqual(await guestRows(db), before.guestRows);
    assert.deepEqual(await rowSnapshots(db), before.rows);
    assert.deepEqual(await rpcSnapshots(db, true), before.rpcs);
  } finally { await db.close(); }
});

test('definition drift detected inside the upgrade transaction rolls back atomically', async () => {
  const db = await setupOriginalGuest();
  try {
    await guest(db);
    const before = { guestFunction: await guestFunction(db), guestRows: await guestRows(db) };
    const drift = before.guestFunction.definition.replace('(sunset|aurora)',
      '(sunset|aurora|fixture-drift)');
    // PGlite has one connection. Inject an application-time definition change
    // before the guard rather than claiming to simulate concurrent connections.
    const withDrift = guestUpgrade.replace('BEGIN;', () => `BEGIN;\n${drift};`);
    await assert.rejects(db.exec(withDrift), /start_ironarabe_guest_play_v1.*precondition/i);
    await assert.rejects(db.query('select 1'), error => error.code === '25P02');
    await db.exec('rollback');
    assert.deepEqual(await guestFunction(db), before.guestFunction);
    assert.deepEqual(await guestRows(db), before.guestRows);
  } finally { await db.close(); }
});

test('40-ID upgrade refuses reapplication after a successful upgrade', async () => {
  const db = await setupOriginalGuest();
  try {
    await db.exec(guestUpgrade);
    const before = await guestFunction(db);
    await assert.rejects(db.exec(guestUpgrade), /start_ironarabe_guest_play_v1.*precondition/i);
    await db.exec('rollback');
    assert.deepEqual(await guestFunction(db), before);
  } finally { await db.close(); }
});
