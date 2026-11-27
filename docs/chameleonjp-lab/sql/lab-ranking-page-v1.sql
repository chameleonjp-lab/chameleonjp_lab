-- Apply before publishing the matching detail page. The existing ranking
-- functions continue to serve game clients and the Lab home previews.
create schema lab_ranking_private;
revoke all on schema lab_ranking_private from public;
grant usage on schema lab_ranking_private to anon, authenticated;

create function lab_ranking_private.board_page(
  p_game_slug text, p_tab text, p_offset integer, p_limit integer
)
returns table (
  rank_no bigint, display_name text, first_score integer,
  best_score integer, play_count integer
)
language sql
stable
security definer
set search_path = ''
as $function$
  with game as (
    select g.game_slug, coalesce(g.score_order, 'desc') as score_order
    from public.games as g
    where g.game_slug = pg_catalog.lower(pg_catalog.btrim(p_game_slug))
      and g.is_active
      and p_tab in ('first', 'best', 'plays')
      and p_offset >= 0
      and p_limit between 1 and 501
  ), entries as (
    select pc.*, game.score_order,
      case p_tab
        when 'first' then pc.first_score
        when 'best' then pc.best_score
        else pc.play_count
      end as standing
    from game
    cross join lateral private.get_game_player_counts_v1(game.game_slug) as pc
    where p_tab = 'plays' or pc.first_score is not null
  ), ranked as (
    select entries.*, pg_catalog.rank() over (
      order by
        (case when p_tab <> 'plays' and score_order = 'asc' then standing end) asc nulls last,
        (case when p_tab = 'plays' or score_order <> 'asc' then standing end) desc nulls last
    ) as place
    from entries
  )
  select r.place, r.display_name, r.first_score, r.best_score, r.play_count
  from ranked as r
  order by r.place, r.updated_at, r.display_name, r.normalized_name
  offset greatest(p_offset, 0)
  limit least(greatest(p_limit, 1), 501)
$function$;

revoke all on function lab_ranking_private.board_page(text, text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function lab_ranking_private.board_page(text, text, integer, integer)
  to anon, authenticated;

create function public.lab_ranking_page_v1(
  p_game_slug text, p_tab text, p_offset integer, p_limit integer
)
returns table (
  rank_no bigint, display_name text, first_score integer,
  best_score integer, play_count integer
)
language sql
stable
security invoker
set search_path = ''
begin atomic
  select * from lab_ranking_private.board_page(p_game_slug, p_tab, p_offset, p_limit);
end;

revoke all on function public.lab_ranking_page_v1(text, text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.lab_ranking_page_v1(text, text, integer, integer)
  to anon, authenticated;
notify pgrst, 'reload schema';
