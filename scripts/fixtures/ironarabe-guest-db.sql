-- Synthetic local fixtures only. Never run this file against a hosted database.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema private;
grant usage on schema public to anon, authenticated, service_role;
revoke all on schema private from public, anon, authenticated;

create table public.games (
  game_slug text primary key,
  is_active boolean not null,
  submission_mode text not null,
  score_order text not null,
  score_scale integer not null,
  score_decimals integer not null
);
create table public.players (
  normalized_name text primary key,
  display_name text not null,
  created_at timestamptz not null,
  last_played_at timestamptz not null
);
create table public.game_scores (
  game_slug text not null,
  normalized_name text not null,
  display_name text not null,
  first_score integer not null,
  best_score integer not null,
  play_count integer not null,
  first_score_at timestamptz not null,
  best_score_at timestamptz not null,
  updated_at timestamptz not null,
  ranking_status text,
  primary key (game_slug, normalized_name)
);
create table public.score_runs (
  id bigint primary key,
  game_slug text not null,
  normalized_name text not null,
  score integer not null,
  client_version text not null,
  metadata jsonb not null,
  created_at timestamptz not null
);
create table private.game_play_sessions (
  play_id uuid primary key default pg_catalog.gen_random_uuid(),
  start_id uuid not null unique,
  game_slug text not null,
  normalized_name text not null,
  display_name text not null,
  client_version text not null,
  started_at timestamptz not null,
  updated_at timestamptz not null
);
create table private.takkeu_guest_plays_v1 (
  start_id uuid primary key,
  play_id uuid not null unique default pg_catalog.gen_random_uuid(),
  client_version text not null,
  started_at timestamptz not null
);
alter table private.game_play_sessions enable row level security;
alter table private.takkeu_guest_plays_v1 enable row level security;
revoke all on all tables in schema private from public, anon, authenticated;

insert into public.games values
  ('ironarabe', true, 'shared', 'asc', 100, 2),
  ('takkeu', true, 'shared', 'desc', 1, 0),
  ('fixture-other', true, 'shared', 'desc', 10, 1);
insert into public.players
select fixture_name, fixture_name, '2026-01-01'::timestamptz, '2026-01-02'::timestamptz
from (values ('fixture-a'), ('fixture-b'), ('fixture-hidden'), ('fixture-session'),
  ('fixture-takkeu'), ('fixture-other')) as fixtures(fixture_name);
insert into public.game_scores values
  ('ironarabe', 'fixture-a', 'fixture-a', 8100, 6071, 3, '2026-01-01', '2026-01-02', '2026-01-02', 'normal'),
  ('ironarabe', 'fixture-b', 'fixture-b', 10000, 9000, 2, '2026-01-01', '2026-01-02', '2026-01-02', null),
  ('ironarabe', 'fixture-hidden', 'fixture-hidden', 5000, 5000, 50, '2026-01-01', '2026-01-02', '2026-01-02', 'hidden'),
  ('takkeu', 'fixture-takkeu', 'fixture-takkeu', 10, 20, 4, '2026-01-01', '2026-01-02', '2026-01-02', 'normal'),
  ('fixture-other', 'fixture-other', 'fixture-other', 30, 40, 7, '2026-01-01', '2026-01-02', '2026-01-02', 'normal');
insert into public.score_runs values
  (1, 'ironarabe', 'fixture-a', 8100, 'ironarabe-web-1.4.1-stagepack001-v2-sunset-r0', '{"stage":"sunset-r0","fixture":true}', '2026-01-01'),
  (2, 'ironarabe', 'fixture-a', 6071, 'ironarabe-web-1.4.1-stagepack001-v2-aurora-r3', '{"stage":"aurora-r3","fixture":true}', '2026-01-02'),
  (3, 'ironarabe', 'fixture-b', 10000, 'ironarabe-web-1.4.1-stagepack001-v2-sunset-r2', '{"stage":"sunset-r2","fixture":true}', '2026-01-01'),
  (4, 'takkeu', 'fixture-takkeu', 20, 'fixture-takkeu-v1', '{"fixture":true}', '2026-01-02'),
  (5, 'fixture-other', 'fixture-other', 40, 'fixture-other-v1', '{"fixture":true}', '2026-01-02');
insert into private.game_play_sessions
  (start_id, game_slug, normalized_name, display_name, client_version, started_at, updated_at) values
  ('10000000-0000-4000-8000-000000000001', 'ironarabe', 'fixture-a', 'fixture-a', 'fixture-named-v1', '2026-01-01', '2026-01-02'),
  ('10000000-0000-4000-8000-000000000002', 'ironarabe', 'fixture-a', 'fixture-a', 'fixture-named-v1', '2026-01-01', '2026-01-02'),
  ('10000000-0000-4000-8000-000000000003', 'ironarabe', 'fixture-session', 'fixture-session', 'fixture-named-v1', '2026-01-01', '2026-01-02'),
  ('10000000-0000-4000-8000-000000000004', 'takkeu', 'fixture-takkeu', 'fixture-takkeu', 'fixture-named-v1', '2026-01-01', '2026-01-02'),
  ('10000000-0000-4000-8000-000000000005', 'fixture-other', 'fixture-other', 'fixture-other', 'fixture-named-v1', '2026-01-01', '2026-01-02');
insert into private.takkeu_guest_plays_v1 (start_id, client_version, started_at) values
  ('20000000-0000-4000-8000-000000000001', 'fixture-takkeu-v1', '2026-01-01'),
  ('20000000-0000-4000-8000-000000000002', 'fixture-takkeu-v1', '2026-01-01');

-- Deliberately hostile defaults: the new RPC/table must revoke these explicit
-- inherited default grants before exposing only EXECUTE to anon.
alter default privileges in schema private grant all on tables to anon, authenticated;
alter default privileges in schema public grant execute on functions to authenticated, service_role;
