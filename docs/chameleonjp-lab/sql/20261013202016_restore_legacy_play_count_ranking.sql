-- Repair the 2026-09-28 regression that excluded legacy players from play rankings.
-- game_scores.play_count and start_game_play_v1 sessions can cover the same
-- plays (including games that still submit scores through a legacy RPC).
-- Retain the existing first/best-ranking policy: use the larger count per
-- normalized player, rather than adding the two overlapping counters.
-- No stored scores, sessions, game registrations or submission RPCs are changed.

create or replace function private.get_game_player_counts_v1(p_game_slug text)
returns table (
  normalized_name text,
  display_name text,
  play_count integer,
  first_score integer,
  best_score integer,
  updated_at timestamp with time zone
)
language sql
stable
security invoker
set search_path = ''
as $function$
  with session_counts as (
    select
      s.normalized_name,
      max(s.display_name) as display_name,
      count(*)::integer as play_count,
      max(s.updated_at) as updated_at
    from private.game_play_sessions as s
    where s.game_slug = pg_catalog.lower(pg_catalog.btrim(coalesce(p_game_slug, '')))
    group by s.normalized_name
  ),
  score_counts as (
    select
      gs.normalized_name, gs.display_name, gs.play_count,
      gs.first_score, gs.best_score, gs.updated_at, gs.ranking_status
    from public.game_scores as gs
    where gs.game_slug = pg_catalog.lower(pg_catalog.btrim(coalesce(p_game_slug, '')))
  )
  select
    coalesce(gs.normalized_name, sc.normalized_name) as normalized_name,
    coalesce(gs.display_name, sc.display_name) as display_name,
    greatest(coalesce(gs.play_count, 0), coalesce(sc.play_count, 0))::integer as play_count,
    gs.first_score,
    gs.best_score,
    greatest(gs.updated_at, sc.updated_at) as updated_at
  from score_counts as gs
  full join session_counts as sc on sc.normalized_name = gs.normalized_name
  where coalesce(gs.ranking_status, 'normal') = 'normal';
$function$;

-- Internal helper only. Existing public aggregate RPCs execute it as their
-- existing owner; browser roles cannot query the helper or private sessions.
revoke all on function private.get_game_player_counts_v1(text) from public, anon, authenticated;

create or replace function public.get_play_count_ranking(
  p_game_slug text,
  p_limit integer default 100
)
returns table (
  rank_no bigint,
  display_name text,
  play_count integer,
  first_score integer,
  best_score integer,
  updated_at timestamp with time zone
)
language sql
stable
security definer
set search_path = ''
as $function$
  with ranked as (
    select
      rank() over (order by pc.play_count desc) as rank_no,
      pc.display_name, pc.play_count, pc.first_score, pc.best_score, pc.updated_at
    from private.get_game_player_counts_v1(p_game_slug) as pc
  )
  select
    ranked.rank_no, ranked.display_name, ranked.play_count,
    ranked.first_score, ranked.best_score, ranked.updated_at
  from ranked
  order by ranked.rank_no asc, ranked.updated_at asc, ranked.display_name asc
  limit least(greatest(coalesce(p_limit, 100), 1), 100);
$function$;

create or replace function public.get_game_play_stats(p_game_slug text)
returns table (total_play_count bigint, player_count bigint)
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(sum(pc.play_count), 0)::bigint, count(*)::bigint
  from private.get_game_player_counts_v1(p_game_slug) as pc;
$function$;

-- CREATE OR REPLACE retains the existing public RPC ACLs and signatures.
-- Security-definer mode is retained only on the already-public aggregate
-- endpoints, which need to read private sessions without exposing the table.
notify pgrst, 'reload schema';
