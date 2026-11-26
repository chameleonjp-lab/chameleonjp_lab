begin;

create schema if not exists songen3_online_ranking;
revoke all on schema songen3_online_ranking from public, anon, authenticated, service_role;

create table if not exists songen3_online_ranking.events (
  match_id uuid not null,
  seat smallint not null check (seat in (0, 1)),
  kind text not null check (kind in ('start', 'result')),
  player_id text,
  display_name text,
  started_at_ms bigint not null,
  outcome text,
  finish_reason text,
  score integer,
  primary key (match_id, seat, kind)
);
alter table songen3_online_ranking.events enable row level security;
revoke all on table songen3_online_ranking.events from public, anon, authenticated, service_role;
create index if not exists songen3_online_latest_result
  on songen3_online_ranking.events (player_id, started_at_ms desc, match_id desc, seat desc)
  where kind = 'result';

create or replace function public.record_songen3_online_event(p_event jsonb)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare
  incoming songen3_online_ranking.events%rowtype;
  stored songen3_online_ranking.events%rowtype;
  result_score bigint;
begin
  if pg_catalog.jsonb_typeof(p_event) is distinct from 'object' then
    raise exception 'Invalid ranking event' using errcode = 'PT400';
  end if;
  if p_event - array['matchId', 'seat', 'kind', 'playerId', 'displayName', 'startedAt',
                     'outcome', 'finishReason', 'score'] <> '{}'::jsonb
    or coalesce(p_event->>'matchId', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or pg_catalog.jsonb_typeof(p_event->'seat') is distinct from 'number'
    or p_event->>'seat' not in ('0', '1')
    or coalesce(p_event->>'kind', '') not in ('start', 'result')
    or pg_catalog.jsonb_typeof(p_event->'startedAt') is distinct from 'number'
    or p_event->>'startedAt' !~ '^[0-9]{1,16}$'
    or coalesce(pg_catalog.jsonb_typeof(p_event->'playerId'), 'null') not in ('null', 'string')
    or coalesce(pg_catalog.jsonb_typeof(p_event->'displayName'), 'null') not in ('null', 'string') then
    raise exception 'Invalid ranking event' using errcode = 'PT400';
  end if;

  incoming.match_id := (p_event->>'matchId')::uuid;
  incoming.seat := (p_event->>'seat')::smallint;
  incoming.kind := p_event->>'kind';
  incoming.player_id := p_event->>'playerId';
  incoming.display_name := p_event->>'displayName';
  incoming.started_at_ms := (p_event->>'startedAt')::bigint;
  incoming.outcome := p_event->>'outcome';
  incoming.finish_reason := p_event->>'finishReason';

  if incoming.started_at_ms > 9007199254740991
    or (incoming.player_id is null) <> (incoming.display_name is null)
    or incoming.player_id !~ '^[0-9a-f]{64}$'
    or pg_catalog.char_length(incoming.display_name) > 24
    or incoming.display_name ~ '[[:cntrl:]]|^[[:space:]]*$' then
    raise exception 'Invalid ranking event' using errcode = 'PT400';
  end if;

  if incoming.kind = 'start' then
    if incoming.outcome is not null or incoming.finish_reason is not null or p_event->>'score' is not null then
      raise exception 'Start event contains a result' using errcode = 'PT400';
    end if;
  else
    if incoming.player_id is null
      or coalesce(incoming.outcome, '') not in ('win', 'loss', 'draw')
      or coalesce(incoming.finish_reason, '') not in ('heart', 'double-heart', 'timeout', 'forfeit')
      or pg_catalog.jsonb_typeof(p_event->'score') is distinct from 'number'
      or p_event->>'score' !~ '^-?[0-9]{1,10}$' then
      raise exception 'Invalid decided result' using errcode = 'PT400';
    end if;
    result_score := (p_event->>'score')::bigint;
    if result_score not between -2147483648 and 2147483647 then
      raise exception 'Result score outside the integer range' using errcode = 'PT400';
    end if;
    incoming.score := result_score::integer;
  end if;

  insert into songen3_online_ranking.events
    (match_id, seat, kind, player_id, display_name, started_at_ms, outcome, finish_reason, score)
  values (incoming.match_id, incoming.seat, incoming.kind, incoming.player_id, incoming.display_name,
          incoming.started_at_ms, incoming.outcome, incoming.finish_reason, incoming.score)
  on conflict (match_id, seat, kind) do nothing;
  if found then return true; end if;

  -- The insert waits for any concurrent writer of the same key. At the default
  -- read-committed isolation level the next statement sees that committed row.
  select e.* into stored
    from songen3_online_ranking.events as e
    where e.match_id = incoming.match_id and e.seat = incoming.seat and e.kind = incoming.kind;
  if stored is distinct from incoming then
    raise exception 'Ranking event key already contains a different record' using errcode = 'PT409';
  end if;
  return true;
end;
$$;

create or replace function public.songen3_online_stats_v1()
returns table (total_play_count bigint, player_count bigint)
language sql stable security definer set search_path = ''
as $$
  select count(*), count(distinct e.player_id)
  from songen3_online_ranking.events as e
  where e.kind = 'start'
$$;

create or replace function public.songen3_online_board_v1(p_tab text, p_offset integer, p_limit integer)
returns table (rank bigint, display_name text, best_score integer, match_count bigint,
               wins bigint, losses bigint, draws bigint, record_points integer,
               total_score bigint, songen_points bigint)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if p_tab is null or p_tab not in ('best', 'record', 'points')
    or p_offset is null or p_offset < 0
    or p_limit is null or p_limit not between 1 and 101 then
    raise exception 'Invalid ranking page' using errcode = 'PT400';
  end if;

  return query
    with totals as (
      select e.player_id,
        max(e.score) filter (where e.finish_reason <> 'forfeit') as best_score,
        coalesce(sum(e.score) filter (where e.finish_reason <> 'forfeit'), 0) as total_score,
        count(*) as match_count,
        count(*) filter (where e.outcome = 'win') as wins,
        count(*) filter (where e.outcome = 'loss') as losses,
        count(*) filter (where e.outcome = 'draw') as draws
      from songen3_online_ranking.events as e
      where e.kind = 'result'
      group by e.player_id
    ), performance as (
      select t.*, div(10000::numeric * t.wins, t.match_count::numeric + 10)::integer as record_points
      from totals as t
    ), points as (
      select p.*, div(greatest(0, p.total_score)::numeric * p.record_points, 10000)::bigint as songen_points
      from performance as p
    ), board as (
      select p.*, case p_tab
        when 'best' then p.best_score
        when 'record' then p.record_points
        else p.songen_points
      end as ordering_score
      from points as p
      where p_tab <> 'best' or p.best_score is not null
    ), requested_page as (
      select b.*, rank() over (order by b.ordering_score desc) as rank
      from board as b
      order by b.ordering_score desc, b.player_id
      offset p_offset limit p_limit
    )
    select page.rank, latest.display_name, page.best_score, page.match_count,
      page.wins, page.losses, page.draws, page.record_points, page.total_score, page.songen_points
    from requested_page as page
    cross join lateral (
      select e.display_name
      from songen3_online_ranking.events as e
      where e.kind = 'result' and e.player_id = page.player_id
      order by e.started_at_ms desc, e.match_id desc, e.seat desc
      limit 1
    ) as latest
    order by page.ordering_score desc, page.player_id;
end;
$$;

revoke all on function public.record_songen3_online_event(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.record_songen3_online_event(jsonb) to service_role;
revoke all on function public.songen3_online_stats_v1(), public.songen3_online_board_v1(text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.songen3_online_stats_v1(), public.songen3_online_board_v1(text, integer, integer)
  to anon, authenticated, service_role;

lock table public.games in share row exclusive mode;
do $$
begin
  if exists (select 1 from public.games where display_order = 67 and game_slug <> 'songen_wo_kakeyouka3_online') then
    raise exception 'Songen 3 Online display order 67 is already in use';
  end if;
end;
$$;
insert into public.games
  (game_slug, title, game_url, description, share_text, display_order, is_active,
   release_date, submission_mode, top_ranking_type, score_order, score_unit, score_scale,
   score_decimals, score_label, first_score_label, best_score_label, score_min, score_max)
values ('songen_wo_kakeyouka3_online', '尊厳を賭けようか3（オンライン対戦）',
  'https://chameleonjp-lab.github.io/songen_wo_kakeyouka3/',
  '部屋を作って友だちを招き、オンラインで1対1の対戦をしよう。',
  E'尊厳を賭けようか3でオンライン対戦！\n#尊厳を賭けようか3\nhttps://chameleonjp-lab.github.io/songen_wo_kakeyouka3/',
  67, true, date '2026-11-27', 'verified', 'best', 'desc', '点', 1, 0,
  'スコア', '初回スコア', 'ベストスコア', -2147483648, 2147483647)
on conflict (game_slug) do nothing;

commit;
