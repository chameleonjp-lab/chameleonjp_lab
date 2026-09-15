-- Align both detail-page statistics with the public ranking scope.
-- Applied to the production Supabase project as migration:
-- 20260915151357_align_game_play_stats_with_ranking_rows

create or replace function public.get_game_play_stats(p_game_slug text)
returns table(total_play_count bigint, player_count bigint)
language plpgsql
security definer
set search_path to ''
as $function$
begin
  return query
  select
    coalesce(sum(gs.play_count), 0)::bigint,
    count(*)::bigint
  from public.game_scores as gs
  where gs.game_slug = p_game_slug
    and coalesce(gs.ranking_status, 'normal') = 'normal';
end;
$function$;
