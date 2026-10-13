-- Read-only regression cases; no stored player records are created or changed.
with
fixtures(game_slug) as (values ('legacy_only'),('session_only'),('mixed'),('overlap'),('moderation'),('ties'),('empty')),
fixture_scores(game_slug,normalized_name,display_name,play_count,first_score,best_score,updated_at,ranking_status) as (values
  ('legacy_only','old','old',7,20,30,'2026-10-01'::timestamptz,'normal'),
  ('mixed','old','old',11,10,20,'2026-10-01'::timestamptz,'normal'),
  ('overlap','a','a',3,10,20,'2026-10-01'::timestamptz,'normal'),
  ('overlap','b','b',1,10,20,'2026-10-01'::timestamptz,'normal'),
  ('moderation','hidden','hidden',99,10,20,'2026-10-01'::timestamptz,'hidden'),
  ('moderation','disqualified','disqualified',88,10,20,'2026-10-01'::timestamptz,'disqualified'),
  ('moderation','review','review',66,10,20,'2026-10-01'::timestamptz,'review'),
  ('moderation','visible','visible',1,0,0,'2026-10-01'::timestamptz,null),
  ('ties','a','a',4,10,20,'2026-10-01'::timestamptz,'normal'),
  ('ties','b','b',4,10,20,'2026-10-01'::timestamptz,'normal'),
  ('ties','c','c',2,10,20,'2026-10-01'::timestamptz,'normal')
),
session_fixture_counts(game_slug,normalized_name,play_count) as (values
  ('session_only','new',3),('mixed','new',3),('overlap','a',3),('overlap','b',4),
  ('moderation','hidden',2),('moderation','disqualified',2),('moderation','review',2)
),
fixture_sessions as (
  select s.game_slug,s.normalized_name,s.normalized_name as display_name,'2026-10-02'::timestamptz as updated_at
  from session_fixture_counts s cross join lateral generate_series(1,s.play_count)
),
expected(game_slug,total_play_count,player_count) as (values
  ('legacy_only',7,1),('session_only',3,1),('mixed',14,2),('overlap',7,2),
  ('moderation',1,1),('ties',10,3),('empty',0,0)
),
players as (
  select f.game_slug,pc.* from fixtures f cross join lateral (with session_counts as (
    select
      s.normalized_name,
      max(s.display_name) as display_name,
      count(*)::integer as play_count,
      max(s.updated_at) as updated_at
    from fixture_sessions as s
    where s.game_slug = pg_catalog.lower(pg_catalog.btrim(coalesce(f.game_slug, '')))
    group by s.normalized_name
  ),
  score_counts as (
    select
      gs.normalized_name, gs.display_name, gs.play_count,
      gs.first_score, gs.best_score, gs.updated_at, gs.ranking_status
    from fixture_scores as gs
    where gs.game_slug = pg_catalog.lower(pg_catalog.btrim(coalesce(f.game_slug, '')))
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
  where coalesce(gs.ranking_status, 'normal') = 'normal') pc
),
actual as (
  select f.game_slug,coalesce(sum(p.play_count),0) as total_play_count,count(p.normalized_name) as player_count
  from fixtures f left join players p on p.game_slug=f.game_slug group by f.game_slug
),
tie_ranks as (
  select normalized_name,rank() over(order by play_count desc) as rank_no from players where game_slug='ties'
),
checks as (
  select 'counts_' || e.game_slug as test_name,
    a.total_play_count=e.total_play_count and a.player_count=e.player_count as passed,
    jsonb_build_object('plays',a.total_play_count,'players',a.player_count) as details
  from expected e join actual a on a.game_slug=e.game_slug
  union all
  select 'same_rank_on_ties',jsonb_agg(rank_no order by normalized_name)='[1,1,3]'::jsonb,jsonb_agg(rank_no order by normalized_name) from tie_ranks
  union all
  select 'start_only_has_no_score',bool_and(first_score is null and best_score is null),jsonb_agg(jsonb_build_object('first',first_score,'best',best_score)) from players where game_slug='session_only'
)
select * from checks order by test_name;
