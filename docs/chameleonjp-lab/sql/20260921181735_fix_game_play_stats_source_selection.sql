-- Keep the public top page and detail page statistics aligned with the
-- source used by each game's ranking integration.
-- Applied to the production Supabase project as migration:
-- 20260921181735_fix_game_play_stats_source_selection

create or replace function public.get_game_play_stats(p_game_slug text)
returns table(total_play_count bigint, player_count bigint)
language plpgsql
stable
security definer
set search_path to ''
as $function$
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
$function$;

grant execute on function public.get_game_play_stats(text) to anon, authenticated;
