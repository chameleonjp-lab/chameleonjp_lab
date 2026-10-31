-- Exact existing body read before this change. pg_get_functiondef MD5 must be
-- b267a6060af97a4845c2d18f5e3ab02e; no production connection is needed to test it.
create or replace function public.get_game_play_stats(p_game_slug text)
returns table(total_play_count bigint, player_count bigint)
language sql stable security definer set search_path = ''
as $function$
  select named.total_play_count + case
    when pg_catalog.lower(pg_catalog.btrim(coalesce(p_game_slug, ''))) = 'takkeu'
      then (select count(*) from private.takkeu_guest_plays_v1) else 0::bigint end,
    named.player_count
  from (
    select coalesce(sum(pc.play_count), 0)::bigint as total_play_count, count(*)::bigint as player_count
    from private.get_game_player_counts_v1(p_game_slug) as pc
  ) as named;
$function$;
revoke all on function public.get_game_play_stats(text) from public;
grant execute on function public.get_game_play_stats(text) to anon, authenticated;
grant execute on function public.get_play_count_ranking(text, integer) to anon, authenticated;
