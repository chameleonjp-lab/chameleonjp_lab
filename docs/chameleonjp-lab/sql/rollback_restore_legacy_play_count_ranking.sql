-- Restore the two function definitions recorded before the 2026-10-14 repair.
-- This rolls back query logic only; player records are never deleted.
CREATE OR REPLACE FUNCTION public.get_game_play_stats(p_game_slug text)
 RETURNS TABLE(total_play_count bigint, player_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_game_slug text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_game_slug, '')));
  v_session_count bigint;
begin
  if v_game_slug = '' then
    return query
    select 0::bigint, 0::bigint;
    return;
  end if;

  /*
   * Games using start_game_play_v1 write one accepted row at start time.
   * That source includes abandoned plays, which is the required meaning of
   * the public play count for those games.
   */
  select count(*)::bigint
  into v_session_count
  from private.game_play_sessions as s
  where s.game_slug = v_game_slug;

  if v_session_count > 0 then
    return query
    select
      v_session_count,
      count(distinct s.normalized_name)::bigint
    from private.game_play_sessions as s
    where s.game_slug = v_game_slug;

    return;
  end if;

  /*
   * Existing games that have not migrated to start_game_play_v1 keep their
   * accumulated count in game_scores.play_count. Keep only visible ranking
   * rows so the page agrees with the ranking data.
   */
  return query
  select
    coalesce(sum(gs.play_count), 0)::bigint,
    count(*)::bigint
  from public.game_scores as gs
  where gs.game_slug = v_game_slug
    and coalesce(gs.ranking_status, 'normal') = 'normal';
end;
$function$

CREATE OR REPLACE FUNCTION public.get_play_count_ranking(p_game_slug text, p_limit integer DEFAULT 100)
 RETURNS TABLE(rank_no bigint, display_name text, play_count integer, first_score integer, best_score integer, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with play_counts as (
    select
      s.game_slug,
      s.normalized_name,
      max(s.display_name) as display_name,
      count(*)::integer as play_count,
      max(s.updated_at) as last_played_at
    from private.game_play_sessions as s
    where s.game_slug = lower(btrim(p_game_slug))
    group by s.game_slug, s.normalized_name
  ),
  ranked as (
    select
      rank() over (order by pc.play_count desc) as rank_no,
      pc.display_name,
      pc.play_count,
      gs.first_score,
      gs.best_score,
      greatest(pc.last_played_at, coalesce(gs.updated_at, pc.last_played_at)) as updated_at
    from play_counts as pc
    left join public.game_scores as gs
      on gs.normalized_name = pc.normalized_name
     and gs.game_slug = pc.game_slug
    where coalesce(gs.ranking_status, 'normal') = 'normal'
  )
  select ranked.rank_no, ranked.display_name, ranked.play_count, ranked.first_score,
         ranked.best_score, ranked.updated_at
  from ranked
  order by ranked.rank_no asc, ranked.updated_at asc, ranked.display_name asc
  limit least(greatest(coalesce(p_limit, 100), 1), 100);
$function$

