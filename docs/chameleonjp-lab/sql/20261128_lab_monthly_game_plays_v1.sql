-- Public game totals only. Read dated plays, never a player's lifetime counter.
create function public.lab_monthly_game_plays_v1()
returns table (game_slug text, play_count bigint)
language sql stable security definer set search_path = ''
as $body$
  with period as (
    select (now() at time zone 'Asia/Tokyo' - interval '1 month') at time zone 'Asia/Tokyo' as lo, now() as hi
  ), modes as (
    select g.game_slug as slug, p.lo, p.hi, least(p.hi, m.enabled_at) as legacy_end
    from public.games g cross join period p
    left join private.lab_counted_start_modes_v1 m on m.game_slug = g.game_slug
    where g.is_active and g.game_slug <> 'songen_wo_kakeyouka3'
  ), dedicated(slug, played_at) as (
    select 'ikagetto', started_at from ikagetto_ranking_private.runs where mode = 'fishing'
    union all select 'inubo', started_at from inubo_ranking_private.runs
    union all select 'inubo', g.started_at from inubo_ranking_private.guest_starts g
      where not exists (select from inubo_ranking_private.runs r where r.run_id = g.run_id)
    union all select 'chameleol', received_at from private.kamereoru_launches
    union all select 'junglegym_onigokko', started_at from jungle_gym_ranking.runs
    union all select 'medjedshin_ha_mamotteru', started_at from medjed_ranking_private.runs
    union all select 'songen_wo_kakeyouka3_online', to_timestamp(started_at_ms / 1000.0)
      from songen3_online_ranking.events where kind = 'start'
    union all select game_slug, started_at from private.sabasaba_run_sessions
    union all select game_slug, started_at from private.tomatoku_runs_v1
  ), common_modes as (
    select * from modes where slug not in ('ikagetto','inubo','chameleol','junglegym_onigokko',
      'medjedshin_ha_mamotteru','songen_wo_kakeyouka3_online','sabasaba_normal','sabasaba_endless','tomatoku_competition_v1')
  ), named_sources(slug, player, n) as (
    select m.slug, s.normalized_name, count(*) from common_modes m join private.game_play_sessions s
      on s.game_slug = m.slug and s.started_at >= m.lo and s.started_at < m.legacy_end
      group by 1, 2
    union all
    -- Some older games send only a score. Prefer the start timestamp for linked submissions.
    select m.slug, s.normalized_name, count(*) from common_modes m join public.score_runs s
      on s.game_slug = m.slug and s.created_at >= m.lo
      left join private.game_play_sessions r on r.play_id = s.play_id and r.game_slug = s.game_slug
      where coalesce(r.started_at, s.created_at) >= m.lo and coalesce(r.started_at, s.created_at) < m.legacy_end
      group by 1, 2
    union all
    -- Sainome creates its single event at start with a provisional retire result.
    select m.slug, e.normalized_name, count(*) from common_modes m join public.game_play_events e
      on e.game_slug = m.slug and e.created_at >= m.lo and e.created_at < m.legacy_end
      where e.result_type = 'play' or (m.slug = 'sainome_300_seconds' and e.play_id is not null)
      group by 1, 2
  ), guests(slug, played_at) as (
    select 'iroate', started_at from private.iroate_guest_plays_v1
    union all select 'ironarabe', started_at from private.ironarabe_guest_plays_v1
    union all select 'takkeu', started_at from private.takkeu_guest_plays_v1
    union all select game_slug, started_at from private.faitofuraito_guest_plays_v1
  ), totals(slug, n) as (
    select m.slug, count(*) from modes m join private.lab_counted_starts_v1 s
      on s.game_slug = m.slug and s.started_at >= greatest(m.lo, m.legacy_end) and s.started_at < m.hi group by 1
    union all
    select m.slug, count(*) from modes m join dedicated d on m.slug = d.slug
      and d.played_at >= m.lo and d.played_at < m.legacy_end group by 1
    union all
    select m.slug, count(*) from common_modes m join guests g on m.slug = g.slug
      and g.played_at >= m.lo and g.played_at < m.legacy_end group by 1
    union all
    -- The legacy receipts and sessions overlap. Keep the existing per-player maximum rule.
    select s.slug, max(s.n) from named_sources s group by s.slug, s.player
  )
  select t.slug, sum(t.n)::bigint from totals t group by t.slug order by sum(t.n) desc, t.slug;
$body$;
revoke all on function public.lab_monthly_game_plays_v1() from public;
grant execute on function public.lab_monthly_game_plays_v1() to anon, authenticated, service_role;
