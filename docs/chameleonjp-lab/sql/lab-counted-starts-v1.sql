-- Install with no enabled games. Enable each mode after its new client is
-- deployed and verified. Only ordinary starts use this shared counter.
begin;

create table private.lab_counted_start_modes_v1 (
  game_slug text primary key references public.games(game_slug),
  legacy_play_count bigint not null check (legacy_play_count >= 0),
  enabled_at timestamptz not null default pg_catalog.now()
);

create table private.lab_counted_starts_v1 (
  play_id uuid primary key,
  game_slug text not null references private.lab_counted_start_modes_v1(game_slug),
  started_at timestamptz not null default pg_catalog.now()
);

create index lab_counted_starts_v1_game_time
  on private.lab_counted_starts_v1(game_slug, started_at desc);

alter table private.lab_counted_start_modes_v1 enable row level security;
alter table private.lab_counted_starts_v1 enable row level security;
revoke all on private.lab_counted_start_modes_v1, private.lab_counted_starts_v1
  from public, anon, authenticated;

create function public.lab_record_play_start_v1(p_play_id uuid, p_game_slug text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_recorded_game text;
begin
  if p_play_id is null or p_game_slug is null or length(p_game_slug) > 80 then
    return false;
  end if;
  if p_play_id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return false;
  end if;

  -- Serialize admissions within a mode so the write ceiling holds during a burst.
  perform 1 from private.lab_counted_start_modes_v1 m
    join public.games g on g.game_slug = m.game_slug
    where m.game_slug = p_game_slug and g.is_active is true for update of m;
  if not found then return false; end if;

  select s.game_slug into v_recorded_game
  from private.lab_counted_starts_v1 s where s.play_id = p_play_id;
  if found then return v_recorded_game = p_game_slug; end if;

  if (select count(*) from private.lab_counted_starts_v1 s
      where s.game_slug = p_game_slug
        and s.started_at >= pg_catalog.now() - interval '1 minute') >= 120 then
    return false;
  end if;

  insert into private.lab_counted_starts_v1(play_id, game_slug)
    values (p_play_id, p_game_slug) on conflict (play_id) do nothing
    returning game_slug into v_recorded_game;
  if found then return true; end if;

  select s.game_slug into v_recorded_game
  from private.lab_counted_starts_v1 s where s.play_id = p_play_id;
  return coalesce(v_recorded_game = p_game_slug, false);
end;
$function$;

revoke all on function public.lab_record_play_start_v1(uuid, text) from public, anon, authenticated;
grant execute on function public.lab_record_play_start_v1(uuid, text) to anon;

-- This is the current shared stats reader with an opt-in branch. The old
-- endpoints and per-name ranks are still used for games that have their own
-- start counters. Scores are never written by the new counter.
create or replace function public.get_game_play_stats(p_game_slug text)
returns table(total_play_count bigint, player_count bigint)
language sql
stable
security definer
set search_path = ''
as $function$
  with game as (
    select pg_catalog.lower(pg_catalog.btrim(coalesce(p_game_slug, ''))) as slug
  ), named as (
    select coalesce(sum(pc.play_count), 0)::bigint as total, count(*)::bigint as players
    from private.get_game_player_counts_v1(p_game_slug) as pc
  )
  select coalesce(
    (select m.legacy_play_count + (select count(*) from private.lab_counted_starts_v1 s
                                  where s.game_slug = m.game_slug)
     from private.lab_counted_start_modes_v1 m where m.game_slug = game.slug),
    named.total + case game.slug
      when 'takkeu' then (select count(*) from private.takkeu_guest_plays_v1)
      when 'iroate' then (select count(*) from private.iroate_guest_plays_v1)
      when 'ironarabe' then (select count(*) from private.ironarabe_guest_plays_v1)
      else 0::bigint end),
    named.players
  from game cross join named;
$function$;

-- This helper is callable only by the migration owner. Capture the old total
-- once, just before enabling the corresponding client. Keeping a snapshot
-- prevents the new start and later named score from both adding to the total.
create function private.enable_lab_counted_starts_v1(p_game_slug text)
returns boolean
language plpgsql
set search_path = ''
as $function$
begin
  insert into private.lab_counted_start_modes_v1(game_slug, legacy_play_count)
    select g.game_slug, s.total_play_count
    from public.games g
    cross join lateral public.get_game_play_stats(g.game_slug) s
    where g.game_slug = p_game_slug and g.is_active is true
      and g.game_slug not in ('chameleol', 'inubo', 'ikagetto', 'junglegym_onigokko',
        'medjedshin_ha_mamotteru', 'songen_wo_kakeyouka3_online',
        'faitofuraito_normal', 'faitofuraito_easy', 'takkeu')
    on conflict (game_slug) do nothing;
  return exists (select 1 from private.lab_counted_start_modes_v1
                 where game_slug = p_game_slug);
end;
$function$;

revoke all on function private.enable_lab_counted_starts_v1(text) from public, anon, authenticated;
notify pgrst, 'reload schema';
commit;
