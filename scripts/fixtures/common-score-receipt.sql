-- Synthetic local fixture; real function definitions observed 2026-10-31, no production rows.
create role anon nologin;
create role authenticated nologin;
create schema private;
revoke all on schema private from public;
grant usage on schema public to anon,authenticated;
create table public.games(game_slug text primary key,is_active boolean,submission_mode text,score_order text);
create table public.players(normalized_name text primary key,display_name text,created_at timestamptz,last_played_at timestamptz);
create table public.game_scores(normalized_name text,game_slug text,display_name text,first_score integer,best_score integer,play_count integer,first_score_at timestamptz,best_score_at timestamptz,updated_at timestamptz,primary key(normalized_name,game_slug));
create table public.score_runs(id bigint generated always as identity primary key,normalized_name text,game_slug text,score integer,client_version text,created_at timestamptz,metadata jsonb default '{}');
create table public.game_play_events(id bigint generated always as identity primary key,game_slug text,normalized_name text,display_name text,ranking_score integer,result_type text,created_at timestamptz,score integer,client_version text);
insert into public.games values('negative',true,'shared','desc'),('ascending',true,'shared','asc'),('verified',true,'verified','desc'),('takkeu',true,'shared','desc'),('inactive',false,'shared','desc');
insert into public.game_scores values('old','negative','Old',-100,-10,9,'2026-01-01','2026-01-02','2026-01-02');
CREATE OR REPLACE FUNCTION public.normalize_player_name(input_name text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select btrim(coalesce(input_name, ''));
$function$
;
CREATE OR REPLACE FUNCTION public.submit_score_unverified(p_display_name text, p_game_slug text, p_score integer, p_client_version text DEFAULT ''::text)
 RETURNS TABLE(accepted boolean, result_normalized_name text, result_display_name text, result_first_score integer, result_best_score integer, result_play_count integer, is_first_play boolean, is_new_best boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_normalized_name text;
  v_display_name text;
  v_score_order text;
  v_old_first_score integer;
  v_old_best integer;
  v_old_play_count integer;
  v_is_first_play boolean := false;
  v_is_new_best boolean := false;
  v_now timestamptz := clock_timestamp();
  v_max_score integer;
  v_provisional_event_id bigint;
  v_final_result_type text;
begin
  v_display_name := btrim(coalesce(p_display_name, ''));
  v_normalized_name := public.normalize_player_name(p_display_name);

  if char_length(v_normalized_name) = 0 then
    raise exception 'name is empty';
  end if;
  if char_length(v_normalized_name) > 20 then
    raise exception 'name is too long';
  end if;
  if p_score is null then
    raise exception 'invalid score';
  end if;
  if p_score < -100000000 then
    raise exception 'score is too small';
  end if;
  if p_game_slug = 'sainome_300_seconds' and p_score < 0 then
    raise exception 'invalid score';
  end if;

  v_max_score := case
    when p_game_slug = 'maron_hikou' then 400000000
    when p_game_slug = 'uchikaeru' then 121999999
    else 100000000
  end;
  if p_score > v_max_score then
    raise exception 'score is too large';
  end if;

  select g.score_order into v_score_order
  from public.games as g
  where g.game_slug = p_game_slug and g.is_active = true;
  if v_score_order is null then
    raise exception 'game not found';
  end if;

  insert into public.players (normalized_name, display_name, created_at, last_played_at)
  values (v_normalized_name, v_display_name, v_now, v_now)
  on conflict (normalized_name) do update set
    display_name = excluded.display_name,
    last_played_at = excluded.last_played_at;

  if p_game_slug = 'sainome_300_seconds' then
    select gpe.id
    into v_provisional_event_id
    from public.game_play_events as gpe
    where gpe.game_slug = p_game_slug
      and gpe.normalized_name = v_normalized_name
      and gpe.ranking_score is null
      and gpe.result_type in ('play', 'retire')
      and gpe.created_at >= v_now - interval '24 hours'
    order by gpe.created_at desc, gpe.id desc
    limit 1
    for update;

    if v_provisional_event_id is not null then
      select not exists (
        select 1
        from public.score_runs as sr
        where sr.normalized_name = v_normalized_name
          and sr.game_slug = p_game_slug
      ) into v_is_first_play;

      v_final_result_type := case when p_score = 0 then 'retire' else 'clear' end;

      update public.game_play_events as gpe set
        display_name = v_display_name,
        result_type = v_final_result_type,
        score = p_score,
        ranking_score = p_score,
        client_version = coalesce(p_client_version, '')
      where gpe.id = v_provisional_event_id;

      insert into public.score_runs (
        normalized_name,
        game_slug,
        score,
        client_version,
        created_at,
        metadata
      ) values (
        v_normalized_name,
        p_game_slug,
        p_score,
        coalesce(p_client_version, ''),
        v_now,
        jsonb_build_object(
          'source', 'sainome_provisional_retire',
          'play_event_id', v_provisional_event_id,
          'result_type', v_final_result_type
        )
      );

      select gs.first_score, gs.best_score, gs.play_count
      into v_old_first_score, v_old_best, v_old_play_count
      from public.game_scores as gs
      where gs.normalized_name = v_normalized_name
        and gs.game_slug = p_game_slug
      for update;

      if v_old_best is null then
        v_is_new_best := p_score > 0;
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
        ) values (
          v_normalized_name,
          p_game_slug,
          v_display_name,
          0,
          p_score,
          1,
          v_now,
          v_now,
          v_now
        );
      else
        if (v_score_order = 'desc' and p_score > v_old_best)
           or (v_score_order = 'asc' and p_score < v_old_best) then
          v_is_new_best := true;
          update public.game_scores as gs set
            display_name = v_display_name,
            best_score = p_score,
            best_score_at = v_now,
            updated_at = v_now
          where gs.normalized_name = v_normalized_name
            and gs.game_slug = p_game_slug;
        else
          update public.game_scores as gs set
            display_name = v_display_name,
            updated_at = v_now
          where gs.normalized_name = v_normalized_name
            and gs.game_slug = p_game_slug;
        end if;
      end if;

      return query
      select true, gs.normalized_name, gs.display_name, gs.first_score, gs.best_score,
             gs.play_count, v_is_first_play, v_is_new_best
      from public.game_scores as gs
      where gs.normalized_name = v_normalized_name
        and gs.game_slug = p_game_slug;
      return;
    end if;

    if exists (
      select 1
      from public.score_runs as sr
      where sr.normalized_name = v_normalized_name
        and sr.game_slug = p_game_slug
        and sr.score = p_score
        and coalesce(sr.client_version, '') = coalesce(p_client_version, '')
        and sr.created_at >= v_now - interval '2 minutes'
        and sr.metadata ->> 'source' = 'sainome_provisional_retire'
    ) then
      return query
      select true, gs.normalized_name, gs.display_name, gs.first_score, gs.best_score,
             gs.play_count, false, false
      from public.game_scores as gs
      where gs.normalized_name = v_normalized_name
        and gs.game_slug = p_game_slug;
      return;
    end if;
  end if;

  insert into public.score_runs (normalized_name, game_slug, score, client_version, created_at)
  values (v_normalized_name, p_game_slug, p_score, coalesce(p_client_version, ''), v_now);

  select gs.first_score, gs.best_score, gs.play_count
  into v_old_first_score, v_old_best, v_old_play_count
  from public.game_scores as gs
  where gs.normalized_name = v_normalized_name and gs.game_slug = p_game_slug
  for update;

  if v_old_best is null then
    v_is_first_play := true;
    v_is_new_best := true;
    insert into public.game_scores (
      normalized_name, game_slug, display_name, first_score, best_score, play_count,
      first_score_at, best_score_at, updated_at
    ) values (
      v_normalized_name, p_game_slug, v_display_name, p_score, p_score, 1,
      v_now, v_now, v_now
    );
  else
    if (v_score_order = 'desc' and p_score > v_old_best)
       or (v_score_order = 'asc' and p_score < v_old_best) then
      v_is_new_best := true;
      update public.game_scores as gs set
        display_name = v_display_name,
        best_score = p_score,
        play_count = v_old_play_count + 1,
        best_score_at = v_now,
        updated_at = v_now
      where gs.normalized_name = v_normalized_name and gs.game_slug = p_game_slug;
    else
      update public.game_scores as gs set
        display_name = v_display_name,
        play_count = v_old_play_count + 1,
        updated_at = v_now
      where gs.normalized_name = v_normalized_name and gs.game_slug = p_game_slug;
    end if;
  end if;

  return query
  select true, gs.normalized_name, gs.display_name, gs.first_score, gs.best_score,
         gs.play_count, v_is_first_play, v_is_new_best
  from public.game_scores as gs
  where gs.normalized_name = v_normalized_name and gs.game_slug = p_game_slug;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.submit_score(p_display_name text, p_game_slug text, p_score integer, p_client_version text DEFAULT ''::text)
 RETURNS TABLE(accepted boolean, result_normalized_name text, result_display_name text, result_first_score integer, result_best_score integer, result_play_count integer, is_first_play boolean, is_new_best boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- Takkeu requires a started, finished and matched play submission.
  if lower(btrim(coalesce(p_game_slug, ''))) = 'takkeu' then
    raise exception 'takkeu requires submit_score_idempotent_v1' using errcode = '42501';
  end if;

  if p_game_slug in ('sabasaba_normal', 'sabasaba_endless')
     or exists (
       select 1 from public.games g
       where g.game_slug = p_game_slug
         and g.submission_mode = 'verified'
     )
  then
    raise exception 'verified run required' using errcode = '42501';
  end if;

  return query
  select *
  from public.submit_score_unverified(
    p_display_name, p_game_slug, p_score, p_client_version
  );
end;
$function$
;
