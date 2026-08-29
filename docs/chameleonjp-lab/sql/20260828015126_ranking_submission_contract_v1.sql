-- Ranking submission contract v1.
-- This migration is additive. It does not delete or rewrite existing ranking data.

alter table public.games
  add column if not exists score_min integer,
  add column if not exists score_max integer;

update public.games
set
  score_min = coalesce(score_min, -100000000),
  score_max = coalesce(
    score_max,
    case
      when game_slug = 'maron_hikou' then 400000000
      when game_slug = 'uchikaeru' then 121999999
      else 100000000
    end
  );

alter table public.games
  alter column score_min set default -100000000,
  alter column score_max set default 100000000,
  alter column score_min set not null,
  alter column score_max set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.games'::regclass
      and conname = 'games_score_bounds_check'
  ) then
    alter table public.games
      add constraint games_score_bounds_check
      check (score_min <= score_max);
  end if;
end
$$;

alter table public.score_runs
  add column if not exists submission_id uuid,
  add column if not exists play_id uuid;

create unique index if not exists score_runs_submission_id_uidx
  on public.score_runs (submission_id)
  where submission_id is not null;

create unique index if not exists score_runs_play_id_uidx
  on public.score_runs (play_id)
  where play_id is not null;

create unique index if not exists games_active_display_order_uidx
  on public.games (display_order)
  where is_active is true and display_order is not null;

create table if not exists private.game_play_sessions (
  play_id uuid primary key default gen_random_uuid(),
  game_slug text not null references public.games(game_slug),
  normalized_name text not null references public.players(normalized_name),
  display_name text not null,
  client_version text not null default '',
  result_type text not null default 'play'
    check (result_type in ('play', 'clear', 'game_over', 'retire')),
  reached_wave integer not null default 1
    check (reached_wave >= 1 and reached_wave <= 30),
  score integer not null default 0
    check (score >= 0),
  ranking_score integer
    check (ranking_score is null or ranking_score >= 0),
  submission_id uuid unique,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table private.game_play_sessions enable row level security;

revoke all on table private.game_play_sessions from public, anon, authenticated;

create index if not exists game_play_sessions_game_player_started_idx
  on private.game_play_sessions (game_slug, normalized_name, started_at);

create index if not exists game_play_sessions_game_started_idx
  on private.game_play_sessions (game_slug, started_at);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.score_runs'::regclass
      and conname = 'score_runs_play_id_fkey'
  ) then
    alter table public.score_runs
      add constraint score_runs_play_id_fkey
      foreign key (play_id)
      references private.game_play_sessions(play_id);
  end if;
end
$$;

create or replace function public.start_game_play_v1(
  p_display_name text,
  p_game_slug text,
  p_client_version text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_game public.games%rowtype;
  v_display_name text;
  v_normalized_name text;
  v_game_slug text;
  v_client_version text;
  v_play_id uuid;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if p_display_name is null
     or p_game_slug is null
     or p_client_version is null then
    return jsonb_build_object(
      'accepted', false,
      'reason', 'required_input_missing'
    );
  end if;

  v_display_name := btrim(p_display_name);
  v_game_slug := lower(btrim(p_game_slug));
  v_client_version := btrim(p_client_version);

  if p_display_name <> v_display_name
     or p_game_slug <> v_game_slug
     or char_length(v_display_name) < 1
     or char_length(v_display_name) > 20
     or char_length(v_game_slug) < 1
     or char_length(v_game_slug) > 80
     or char_length(v_client_version) < 1
     or char_length(v_client_version) > 80 then
    return jsonb_build_object(
      'accepted', false,
      'reason', 'invalid_input'
    );
  end if;

  v_normalized_name := public.normalize_player_name(v_display_name);

  select *
  into v_game
  from public.games
  where game_slug = v_game_slug
    and is_active is true
    and submission_mode = 'shared'
  for share;

  if not found then
    return jsonb_build_object(
      'accepted', false,
      'reason', 'game_not_available',
      'game_slug', v_game_slug
    );
  end if;

  if (
    select count(*)
    from private.game_play_sessions
    where game_slug = v_game_slug
      and normalized_name = v_normalized_name
      and started_at >= v_now - interval '1 minute'
  ) >= 60 then
    return jsonb_build_object(
      'accepted', false,
      'reason', 'play_rate_limited',
      'game_slug', v_game_slug
    );
  end if;

  insert into public.players (
    normalized_name,
    display_name,
    created_at,
    last_played_at
  )
  values (
    v_normalized_name,
    v_display_name,
    v_now,
    v_now
  )
  on conflict (normalized_name) do update set
    display_name = excluded.display_name,
    last_played_at = excluded.last_played_at;

  v_play_id := pg_catalog.gen_random_uuid();

  insert into private.game_play_sessions (
    play_id,
    game_slug,
    normalized_name,
    display_name,
    client_version,
    result_type,
    reached_wave,
    score,
    started_at,
    created_at,
    updated_at
  )
  values (
    v_play_id,
    v_game_slug,
    v_normalized_name,
    v_display_name,
    v_client_version,
    'play',
    1,
    0,
    v_now,
    v_now,
    v_now
  );

  return jsonb_build_object(
    'accepted', true,
    'duplicate', false,
    'play_id', v_play_id,
    'game_slug', v_game_slug,
    'display_name', v_display_name,
    'normalized_name', v_normalized_name,
    'client_version', v_client_version,
    'started_at', v_now
  );
end;
$function$;

create or replace function public.finish_game_play_v1(
  p_play_id uuid,
  p_display_name text,
  p_game_slug text,
  p_result_type text,
  p_reached_wave integer,
  p_score integer,
  p_client_version text,
  p_ranking_score integer default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_game public.games%rowtype;
  v_session private.game_play_sessions%rowtype;
  v_display_name text;
  v_normalized_name text;
  v_game_slug text;
  v_result_type text;
  v_client_version text;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if p_play_id is null
     or p_display_name is null
     or p_game_slug is null
     or p_result_type is null
     or p_reached_wave is null
     or p_score is null
     or p_client_version is null then
    return jsonb_build_object(
      'accepted', false,
      'reason', 'required_input_missing'
    );
  end if;

  v_display_name := btrim(p_display_name);
  v_game_slug := lower(btrim(p_game_slug));
  v_result_type := lower(btrim(p_result_type));
  v_client_version := btrim(p_client_version);
  v_normalized_name := public.normalize_player_name(v_display_name);

  if p_display_name <> v_display_name
     or p_game_slug <> v_game_slug
     or p_result_type <> v_result_type
     or char_length(v_display_name) < 1
     or char_length(v_display_name) > 20
     or v_result_type not in ('clear', 'game_over', 'retire')
     or p_reached_wave < 1
     or p_reached_wave > 30
     or p_client_version <> v_client_version
     or char_length(v_client_version) < 1
     or char_length(v_client_version) > 80 then
    return jsonb_build_object(
      'accepted', false,
      'reason', 'invalid_input'
    );
  end if;

  if p_score < 0
     or (p_ranking_score is not null and p_ranking_score < 0) then
    return jsonb_build_object(
      'accepted', false,
      'reason', 'invalid_score'
    );
  end if;

  select *
  into v_game
  from public.games
  where game_slug = v_game_slug
    and is_active is true
    and submission_mode = 'shared'
  for share;

  if not found then
    return jsonb_build_object(
      'accepted', false,
      'reason', 'game_not_available',
      'game_slug', v_game_slug
    );
  end if;

  if p_score < v_game.score_min or p_score > v_game.score_max then
    return jsonb_build_object(
      'accepted', false,
      'reason', 'score_out_of_range',
      'score_min', v_game.score_min,
      'score_max', v_game.score_max
    );
  end if;

  select *
  into v_session
  from private.game_play_sessions
  where play_id = p_play_id
  for update;

  if not found then
    return jsonb_build_object(
      'accepted', false,
      'reason', 'play_not_found'
    );
  end if;

  if v_session.game_slug <> v_game_slug
     or v_session.normalized_name <> v_normalized_name
     or v_session.client_version <> v_client_version then
    return jsonb_build_object(
      'accepted', false,
      'reason', 'play_payload_mismatch'
    );
  end if;

  if v_session.result_type <> 'play' then
    if v_session.result_type = v_result_type
       and v_session.reached_wave = p_reached_wave
       and v_session.score = p_score
       and v_session.ranking_score is not distinct from p_ranking_score then
      return jsonb_build_object(
        'accepted', true,
        'duplicate', true,
        'play_id', p_play_id,
        'game_slug', v_game_slug,
        'result_type', v_result_type,
        'reached_wave', p_reached_wave,
        'score', p_score
      );
    end if;

    return jsonb_build_object(
      'accepted', false,
      'reason', 'play_already_finished'
    );
  end if;

  v_now := pg_catalog.clock_timestamp();

  update private.game_play_sessions
  set
    result_type = v_result_type,
    reached_wave = p_reached_wave,
    score = p_score,
    ranking_score = p_ranking_score,
    finished_at = v_now,
    updated_at = v_now
  where play_id = p_play_id;

  return jsonb_build_object(
    'accepted', true,
    'duplicate', false,
    'play_id', p_play_id,
    'game_slug', v_game_slug,
    'result_type', v_result_type,
    'reached_wave', p_reached_wave,
    'score', p_score,
    'finished_at', v_now
  );
end;
$function$;

create or replace function public.submit_score_idempotent_v1(
  p_play_id uuid,
  p_submission_id uuid,
  p_display_name text,
  p_game_slug text,
  p_score integer,
  p_client_version text
)
returns table(
  accepted boolean,
  result_submission_id uuid,
  result_play_id uuid,
  result_normalized_name text,
  result_display_name text,
  result_first_score integer,
  result_best_score integer,
  result_play_count integer,
  is_first_play boolean,
  is_new_best boolean,
  was_duplicate boolean
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_game public.games%rowtype;
  v_session private.game_play_sessions%rowtype;
  v_existing public.score_runs%rowtype;
  v_score public.game_scores%rowtype;
  v_display_name text;
  v_normalized_name text;
  v_game_slug text;
  v_client_version text;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_run_id bigint;
  v_is_first_play boolean := false;
  v_is_new_best boolean := false;
  v_result_first_score integer;
  v_result_best_score integer;
  v_result_play_count integer;
  v_existing_submission boolean := false;
begin
  if p_play_id is null
     or p_submission_id is null
     or p_display_name is null
     or p_game_slug is null
     or p_score is null
     or p_client_version is null then
    raise exception 'required input is missing'
      using errcode = '22023';
  end if;

  v_display_name := btrim(p_display_name);
  v_normalized_name := public.normalize_player_name(v_display_name);
  v_game_slug := lower(btrim(p_game_slug));
  v_client_version := btrim(p_client_version);

  if p_display_name <> v_display_name
     or p_game_slug <> v_game_slug
     or char_length(v_display_name) < 1
     or char_length(v_display_name) > 20
     or char_length(v_game_slug) < 1
     or char_length(v_game_slug) > 80
     or char_length(v_client_version) < 1
     or char_length(v_client_version) > 80 then
    raise exception 'ranking submission input is invalid'
      using errcode = '22023';
  end if;

  select *
  into v_game
  from public.games
  where game_slug = v_game_slug
    and is_active is true
    and submission_mode = 'shared'
  for share;

  if not found then
    raise exception 'game is not available for this submission contract'
      using errcode = '42501';
  end if;

  if p_score < v_game.score_min or p_score > v_game.score_max then
    raise exception 'score is outside the game range'
      using errcode = '22003';
  end if;

  select *
  into v_existing
  from public.score_runs
  where submission_id = p_submission_id
  for update;

  if found then
    if v_existing.play_id is distinct from p_play_id
       or v_existing.game_slug <> v_game_slug
       or v_existing.normalized_name <> v_normalized_name
       or v_existing.score <> p_score
       or coalesce(v_existing.client_version, '') <> v_client_version then
      raise exception 'submission id payload does not match'
        using errcode = 'PT409';
    end if;

    select *
    into v_score
    from public.game_scores
    where normalized_name = v_normalized_name
      and game_slug = v_game_slug;

    if not found then
      raise exception 'submission aggregate is unavailable'
        using errcode = 'PT500';
    end if;

    v_result_first_score :=
      coalesce(nullif(v_existing.metadata ->> 'result_first_score', '')::integer, v_score.first_score);
    v_result_best_score :=
      coalesce(nullif(v_existing.metadata ->> 'result_best_score', '')::integer, v_score.best_score);
    v_result_play_count :=
      coalesce(nullif(v_existing.metadata ->> 'result_play_count', '')::integer, v_score.play_count);

    return query
    select
      true,
      p_submission_id,
      p_play_id,
      v_score.normalized_name,
      v_score.display_name,
      v_result_first_score,
      v_result_best_score,
      v_result_play_count,
      coalesce((v_existing.metadata ->> 'is_first_play')::boolean, false),
      coalesce((v_existing.metadata ->> 'is_new_best')::boolean, false),
      true;
    return;
  end if;

  select *
  into v_session
  from private.game_play_sessions
  where play_id = p_play_id
  for update;

  if not found then
    raise exception 'play is unavailable'
      using errcode = 'PT410';
  end if;

  if v_session.game_slug <> v_game_slug
     or v_session.normalized_name <> v_normalized_name
     or v_session.client_version <> v_client_version then
    raise exception 'play payload does not match'
      using errcode = 'PT409';
  end if;

  if v_session.result_type = 'play' then
    raise exception 'play has not been finished'
      using errcode = 'PT425';
  end if;

  if v_session.submission_id is not null
     and v_session.submission_id <> p_submission_id then
    raise exception 'play already has another submission'
      using errcode = 'PT409';
  end if;

  if (
    select count(*)
    from public.score_runs
    where game_slug = v_game_slug
      and normalized_name = v_normalized_name
      and play_id is not null
      and created_at >= v_now - interval '1 minute'
  ) >= 60 then
    raise exception 'score submission rate limit exceeded'
      using errcode = '42900';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_game_slug || ':' || v_normalized_name,
      0::bigint
    )
  );

  insert into public.score_runs (
    normalized_name,
    game_slug,
    score,
    client_version,
    created_at,
    metadata,
    play_id,
    submission_id
  )
  values (
    v_normalized_name,
    v_game_slug,
    p_score,
    v_client_version,
    v_now,
    jsonb_build_object('contract_version', 'ranking-submission-v1'),
    p_play_id,
    p_submission_id
  )
  on conflict do nothing
  returning id into v_run_id;

  if v_run_id is null then
    select *
    into v_existing
    from public.score_runs
    where submission_id = p_submission_id
    for update;

    if found then
      if v_existing.play_id is distinct from p_play_id
         or v_existing.game_slug <> v_game_slug
         or v_existing.normalized_name <> v_normalized_name
         or v_existing.score <> p_score
         or coalesce(v_existing.client_version, '') <> v_client_version then
        raise exception 'submission id payload does not match'
          using errcode = 'PT409';
      end if;

      select *
      into v_score
      from public.game_scores
      where normalized_name = v_normalized_name
        and game_slug = v_game_slug;

      if not found then
        raise exception 'submission aggregate is unavailable'
          using errcode = 'PT500';
      end if;

      return query
      select
        true,
        p_submission_id,
        p_play_id,
        v_score.normalized_name,
        v_score.display_name,
        coalesce(nullif(v_existing.metadata ->> 'result_first_score', '')::integer, v_score.first_score),
        coalesce(nullif(v_existing.metadata ->> 'result_best_score', '')::integer, v_score.best_score),
        coalesce(nullif(v_existing.metadata ->> 'result_play_count', '')::integer, v_score.play_count),
        coalesce((v_existing.metadata ->> 'is_first_play')::boolean, false),
        coalesce((v_existing.metadata ->> 'is_new_best')::boolean, false),
        true;
      return;
    end if;

    raise exception 'submission conflicts with an existing play'
      using errcode = 'PT409';
  end if;

  select *
  into v_score
  from public.game_scores
  where normalized_name = v_normalized_name
    and game_slug = v_game_slug
  for update;

  if not found then
    v_is_first_play := true;
    v_is_new_best := true;

    insert into public.game_scores (
      normalized_name,
      game_slug,
      display_name,
      first_score,
      best_score,
      play_count,
      first_score_at,
      best_score_at,
      updated_at
    )
    values (
      v_normalized_name,
      v_game_slug,
      v_display_name,
      p_score,
      p_score,
      1,
      v_now,
      v_now,
      v_now
    )
    returning * into v_score;
  else
    v_is_new_best :=
      (v_game.score_order = 'desc' and p_score > v_score.best_score)
      or (v_game.score_order = 'asc' and p_score < v_score.best_score);

    update public.game_scores
    set
      display_name = v_display_name,
      best_score = case when v_is_new_best then p_score else best_score end,
      play_count = v_score.play_count + 1,
      best_score_at = case when v_is_new_best then v_now else best_score_at end,
      updated_at = v_now
    where normalized_name = v_normalized_name
      and game_slug = v_game_slug
    returning * into v_score;
  end if;

  v_result_first_score := v_score.first_score;
  v_result_best_score := v_score.best_score;
  v_result_play_count := v_score.play_count;

  update public.score_runs
  set metadata = jsonb_build_object(
    'contract_version', 'ranking-submission-v1',
    'result_first_score', v_result_first_score,
    'result_best_score', v_result_best_score,
    'result_play_count', v_result_play_count,
    'is_first_play', v_is_first_play,
    'is_new_best', v_is_new_best
  )
  where id = v_run_id;

  update private.game_play_sessions
  set
    submission_id = p_submission_id,
    updated_at = v_now
  where play_id = p_play_id;

  return query
  select
    true,
    p_submission_id,
    p_play_id,
    v_score.normalized_name,
    v_score.display_name,
    v_score.first_score,
    v_score.best_score,
    v_score.play_count,
    v_is_first_play,
    v_is_new_best,
    false;
end;
$function$;

create or replace function public.get_game_play_stats(p_game_slug text)
returns table(
  total_play_count bigint,
  player_count bigint
)
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
          from (
            select normalized_name
            from private.game_play_sessions
            where game_slug = p_game_slug
            union
            select normalized_name
            from public.game_play_events
            where game_slug = p_game_slug
          ) players
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
          from (
            select normalized_name
            from private.game_play_sessions
            where game_slug = p_game_slug
            union
            select normalized_name
            from public.score_runs
            where game_slug = p_game_slug
              and play_id is null
          ) players
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
      count(distinct normalized_name)::bigint
    from public.game_play_events
    where game_slug = p_game_slug;
  else
    return query
    select
      coalesce(sum(gs.play_count), 0)::bigint,
      count(*)::bigint
    from public.game_scores gs
    where gs.game_slug = p_game_slug;
  end if;
end;
$function$;

revoke all on function public.start_game_play_v1(text, text, text) from public;
grant execute on function public.start_game_play_v1(text, text, text) to anon;

revoke all on function public.finish_game_play_v1(uuid, text, text, text, integer, integer, text, integer) from public;
grant execute on function public.finish_game_play_v1(uuid, text, text, text, integer, integer, text, integer) to anon;

revoke all on function public.submit_score_idempotent_v1(uuid, uuid, text, text, integer, text) from public;
grant execute on function public.submit_score_idempotent_v1(uuid, uuid, text, text, integer, text) to anon;

revoke execute
on function public.submit_score_with_metadata(text, text, integer, text, jsonb)
from public, anon, authenticated;
