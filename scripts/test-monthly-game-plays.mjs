import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema private; create schema ikagetto_ranking_private; create schema inubo_ranking_private;
    create schema jungle_gym_ranking; create schema medjed_ranking_private; create schema songen3_online_ranking;
    create table public.games(game_slug text primary key,is_active boolean);
    create table private.lab_counted_start_modes_v1(game_slug text, enabled_at timestamptz);
    create table private.lab_counted_starts_v1(game_slug text, started_at timestamptz);
    create table private.game_play_sessions(game_slug text, normalized_name text, play_id uuid, started_at timestamptz);
    create table public.score_runs(game_slug text, normalized_name text, play_id uuid, created_at timestamptz);
    create table public.game_play_events(game_slug text, normalized_name text, play_id text, result_type text, created_at timestamptz);
    create table ikagetto_ranking_private.runs(mode text, started_at timestamptz);
    create table inubo_ranking_private.runs(run_id integer, started_at timestamptz);
    create table inubo_ranking_private.guest_starts(like inubo_ranking_private.runs);
    create table private.kamereoru_launches(received_at timestamptz);
    create table jungle_gym_ranking.runs(started_at timestamptz);
    create table medjed_ranking_private.runs(started_at timestamptz);
    create table songen3_online_ranking.events(kind text, started_at_ms bigint);
    create table private.sabasaba_run_sessions(game_slug text, started_at timestamptz);
    create table private.tomatoku_runs_v1(like private.sabasaba_run_sessions);
    create table private.faitofuraito_guest_plays_v1(like private.sabasaba_run_sessions);
    create table private.iroate_guest_plays_v1(started_at timestamptz);
    create table private.ironarabe_guest_plays_v1(started_at timestamptz);
    create table private.takkeu_guest_plays_v1(started_at timestamptz);
  `);
  const migration = await readFile(new URL('../docs/chameleonjp-lab/sql/20261128_lab_monthly_game_plays_v1.sql', import.meta.url), 'utf8');
  await db.exec(migration);
  await db.exec(`
    begin;
    set local time zone 'Asia/Tokyo';
    insert into public.games values ('old',true),('inactive',false),('ikagetto',true),('inubo',true),('iroate',true),('new',true),('sainome_300_seconds',true);
    insert into private.lab_counted_start_modes_v1 values ('new',now()-interval '4 days');
    insert into private.lab_counted_starts_v1 values ('new',now()-interval '1 day');
    insert into private.game_play_sessions values
      ('new','p',null,now()-interval '6 days'),('new','p',null,now()-interval '1 day'),
      ('old','p','00000000-0000-0000-0000-000000000001',now()-interval '35 days'),
      ('old','q',null,now()-interval '1 month'),('old','q',null,now()-interval '1 month 1 second');
    insert into public.score_runs values
      ('old','p','00000000-0000-0000-0000-000000000001',now()-interval '2 days'),
      ('old','q',null,now()-interval '1 day'),('old','r',null,now()-interval '1 day'),
      ('inactive','p',null,now()-interval '1 day');
    insert into inubo_ranking_private.runs values (1, now()-interval '4 days');
    insert into inubo_ranking_private.guest_starts values (1,now()-interval '4 days'),(2,now()-interval '2 days');
    insert into ikagetto_ranking_private.runs values ('fishing',now()-interval '3 days'),('cooking',now()-interval '2 days');
    insert into private.iroate_guest_plays_v1 values (now()-interval '1 day'),(now()+interval '1 day');
    insert into public.game_play_events values ('sainome_300_seconds','p','id','retire',now()-interval '1 week');
    set local role anon;
  `);
  const {rows} = await db.query('select * from public.lab_monthly_game_plays_v1()');
  assert.deepEqual(Object.fromEntries(rows.map(r => [r.game_slug, Number(r.play_count)])), {
    inubo:2, old:2, new:2, ikagetto:1, iroate:1, sainome_300_seconds:1
  });
  await db.exec('rollback');
  console.log('Monthly play totals verified across period boundaries, mode cutover, guest starts and overlapping sources.');
} finally {await db.close();}
