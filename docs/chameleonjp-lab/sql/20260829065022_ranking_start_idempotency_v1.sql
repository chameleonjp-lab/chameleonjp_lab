begin;

alter table private.game_play_sessions
  add column if not exists start_id uuid;

create unique index if not exists game_play_sessions_start_id_key
  on private.game_play_sessions (start_id)
  where start_id is not null;

drop function if exists public.start_game_play_v1(text, text, text);

create or replace function public.start_game_play_v1(
  p_start_id uuid,
  p_display_name text,
  p_game_slug text,
  p_client_version text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_game public.games%rowtype;
  v_existing private.game_play_sessions%rowtype;
  v_display_name text;
  v_normalized_name text;
  v_game_slug text;
  v_client_version text;
  v_play_id uuid;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if p_start_id is null
     or p_display_name is null
     or p_game_slug is null
     or p_client_version is null then
    return pg_catalog.jsonb_build_object(
      'accepted', false,
      'reason', 'required_input_missing'
    );
  end if;

  v_display_name := pg_catalog.btrim(p_display_name);
  v_game_slug := pg_catalog.lower(pg_catalog.btrim(p_game_slug));
  v_client_version := pg_catalog.btrim(p_client_version);

  if p_display_name <> v_display_name
     or p_game_slug <> v_game_slug
     or pg_catalog.char_length(v_display_name) < 1
     or pg_catalog.char_length(v_display_name) > 20
     or pg_catalog.char_length(v_game_slug) < 1
     or pg_catalog.char_length(v_game_slug) > 80
     or pg_catalog.char_length(v_client_version) < 1
     or pg_catalog.char_length(v_client_version) > 80 then
    return pg_catalog.jsonb_build_object(
      'accepted', false,
      'reason', 'invalid_input'
    );
  end if;

  v_normalized_name := public.normalize_player_name(v_display_name);

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_start_id::text, 0::bigint)
  );

  select *
  into v_existing
  from private.game_play_sessions
  where start_id = p_start_id
  for update;

  if found then
    if v_existing.game_slug <> v_game_slug
       or v_existing.normalized_name <> v_normalized_name
       or v_existing.client_version <> v_client_version then
      return pg_catalog.jsonb_build_object(
        'accepted', false,
        'reason', 'start_id_conflict'
      );
    end if;

    return pg_catalog.jsonb_build_object(
      'accepted', true,
      'duplicate', true,
      'start_id', p_start_id,
      'play_id', v_existing.play_id,
      'game_slug', v_existing.game_slug,
      'display_name', v_existing.display_name,
      'normalized_name', v_existing.normalized_name,
      'client_version', v_existing.client_version,
      'started_at', v_existing.started_at
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
    return pg_catalog.jsonb_build_object(
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
    return pg_catalog.jsonb_build_object(
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
    start_id,
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
    p_start_id,
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

  return pg_catalog.jsonb_build_object(
    'accepted', true,
    'duplicate', false,
    'start_id', p_start_id,
    'play_id', v_play_id,
    'game_slug', v_game_slug,
    'display_name', v_display_name,
    'normalized_name', v_normalized_name,
    'client_version', v_client_version,
    'started_at', v_now
  );
end;
$function$;

revoke all on function public.start_game_play_v1(uuid, text, text, text) from public;
revoke all on function public.start_game_play_v1(uuid, text, text, text) from authenticated;
grant execute on function public.start_game_play_v1(uuid, text, text, text) to anon;

commit;
