-- Keep Saisupi's detail-page statistics aligned with its ranking rows.
-- Applied to the production Supabase project as migration:
-- 20260921180630_restore_saisupi_ranking_play_stats

create or replace function public.get_game_play_stats(p_game_slug text)
returns table(total_play_count bigint, player_count bigint)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_game_slug text := lower(btrim(coalesce(p_game_slug, '')));
begin
  if v_game_slug = 'saisupi' then
    return query
    select
      coalesce(sum(gs.play_count), 0)::bigint,
      count(*)::bigint
    from public.game_scores as gs
    where gs.game_slug = v_game_slug
      and coalesce(gs.ranking_status, 'normal') = 'normal';

    return;
  end if;

  return query
  select
    count(*)::bigint,
    count(distinct s.normalized_name)::bigint
  from private.game_play_sessions as s
  where s.game_slug = v_game_slug;
end;
$function$;
