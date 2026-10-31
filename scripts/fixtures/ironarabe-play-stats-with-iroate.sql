-- Synthetic supporting data and the exact stats body observed before the
-- Ironarabe deployment prerequisite. Local PGlite only; never run remotely.
create table private.iroate_guest_plays_v1 (
  start_id uuid primary key,
  play_id uuid not null unique default pg_catalog.gen_random_uuid(),
  client_version text not null,
  started_at timestamptz not null
);
alter table private.iroate_guest_plays_v1 enable row level security;
revoke all on private.iroate_guest_plays_v1 from public, anon, authenticated;
insert into public.games values ('iroate', true, 'shared', 'asc', 100, 2);
insert into public.players values ('fixture-iroate', 'Fixture Iroate', '2026-01-01', '2026-01-02');
insert into public.game_scores values
  ('iroate', 'fixture-iroate', 'Fixture Iroate', 3100, 2415, 4,
    '2026-01-01', '2026-01-02', '2026-01-02', 'normal');
insert into public.score_runs values
  (9000, 'iroate', 'fixture-iroate', 2415, 'iroate-ranking-v1', '{"fixture":true}', '2026-01-02');
insert into private.game_play_sessions
  (start_id, game_slug, normalized_name, display_name, client_version, started_at, updated_at) values
  ('30000000-0000-4000-8000-000000000001', 'iroate', 'fixture-iroate', 'Fixture Iroate',
    'iroate-ranking-v1', '2026-01-01', '2026-01-02');
insert into private.iroate_guest_plays_v1 (start_id, client_version, started_at) values
  ('30000000-0000-4000-8000-000000000002', 'iroate-ranking-v1', '2026-01-01'),
  ('30000000-0000-4000-8000-000000000003', 'iroate-ranking-v1', '2026-01-01'),
  ('30000000-0000-4000-8000-000000000004', 'iroate-ranking-v1', '2026-01-01');

-- A synthetic existing RPC sentinel, not the production Iroate start body.
-- Its definition, owner and ACL must survive the Ironarabe installation.
create function public.start_iroate_guest_play_v1(uuid, text, text)
returns jsonb language sql security definer set search_path = ''
as $function$ select '{"fixture":true}'::jsonb; $function$;
revoke all on function public.start_iroate_guest_play_v1(uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.start_iroate_guest_play_v1(uuid, text, text) to anon;

-- Reproduce the existing public aggregate grants observed for this baseline;
-- the fresh installation must preserve them, including PUBLIC's existing grant.
revoke all on function public.get_game_play_stats(text)
  from public, anon, authenticated, service_role;
grant execute on function public.get_game_play_stats(text) to public, anon, authenticated;

-- pg_get_functiondef MD5: a509efcc07ccae488c47ab849ad25dda.
-- This function body matches the reviewed production definition exactly.
create or replace function public.get_game_play_stats(p_game_slug text)
returns table(total_play_count bigint, player_count bigint)
language sql stable security definer set search_path = ''
as $function$
  select named.total_play_count + case
    when pg_catalog.lower(pg_catalog.btrim(coalesce(p_game_slug, ''))) = 'takkeu'
      then (select count(*) from private.takkeu_guest_plays_v1)
    when pg_catalog.lower(pg_catalog.btrim(coalesce(p_game_slug, ''))) = 'iroate'
      then (select count(*) from private.iroate_guest_plays_v1) else 0::bigint end,
    named.player_count
  from (
    select coalesce(sum(pc.play_count), 0)::bigint as total_play_count, count(*)::bigint as player_count
    from private.get_game_player_counts_v1(p_game_slug) as pc
  ) as named;
$function$;
