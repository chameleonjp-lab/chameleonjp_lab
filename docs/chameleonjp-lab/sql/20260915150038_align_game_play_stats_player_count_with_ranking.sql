-- Align the detail-page participant count with the public ranking scope.
-- Applied to the production Supabase project as migration:
-- 20260915150038_align_game_play_stats_player_count_with_ranking

create or replace function public.get_game_play_stats(p_game_slug text)
returns table(total_play_count bigint, player_count bigint)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_session_count bigint;
  v_event_count bigint;
begin
  select count(*)::bigint
  into v_session_count
  from private.game_play_sessions
  where game_slug = p_game_slug;

  if v_session_count > 0 then
    select count(*)::bigint
    into v_event_count
    from public.game_play_events
    where game_slug = p_game_slug;

    if v_event_count > 0 then
      return query
      select
        (v_session_count + v_event_count)::bigint,
        (
          select count(*)::bigint
          from public.game_scores
          where game_slug = p_game_slug
            and coalesce(ranking_status, 'normal') = 'normal'
        );
    else
      return query
      select
        (
          v_session_count
          + (
            select count(*)::bigint
            from public.score_runs
            where game_slug = p_game_slug
              and play_id is null
          )
        )::bigint,
        (
          select count(*)::bigint
          from public.game_scores
          where game_slug = p_game_slug
            and coalesce(ranking_status, 'normal') = 'normal'
        );
    end if;

    return;
  end if;

  select count(*)::bigint
  into v_event_count
  from public.game_play_events
  where game_slug = p_game_slug;

  if v_event_count > 0 then
    return query
    select
      count(*)::bigint,
      (
        select count(*)::bigint
        from public.game_scores
        where game_slug = p_game_slug
          and coalesce(ranking_status, 'normal') = 'normal'
      )
    from public.game_play_events
    where game_slug = p_game_slug;
  else
    return query
    select
      coalesce(sum(gs.play_count), 0)::bigint,
      count(*)::bigint
    from public.game_scores gs
    where gs.game_slug = p_game_slug
      and coalesce(gs.ranking_status, 'normal') = 'normal';
  end if;
end;
$function$;
