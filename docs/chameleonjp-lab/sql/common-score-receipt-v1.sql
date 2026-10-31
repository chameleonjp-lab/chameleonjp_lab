-- Apply only after review; this file is not executed by the Pages workflow.
-- Add a receipt around the existing legacy score contract. Do not replace it.
begin;

create table if not exists private.common_score_receipts_v1 (
  submission_id uuid primary key,
  request_payload jsonb not null,
  response_payload jsonb not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp()
);
alter table private.common_score_receipts_v1 enable row level security;
revoke all on private.common_score_receipts_v1 from public, anon, authenticated;

create or replace function public.submit_score_once_shared_v1(
  p_submission_id uuid,
  p_display_name text,
  p_game_slug text,
  p_score integer,
  p_client_version text default ''
)
returns table (
  accepted boolean,
  result_normalized_name text,
  result_display_name text,
  result_first_score integer,
  result_best_score integer,
  result_play_count integer,
  is_first_play boolean,
  is_new_best boolean,
  was_duplicate boolean
)
language plpgsql security definer set search_path = ''
as $function$
declare
  v_request jsonb;
  v_receipt private.common_score_receipts_v1%rowtype;
  v_response jsonb;
  v_duplicate boolean := false;
begin
  if p_submission_id is null then
    raise exception 'submission id is required' using errcode = '22023';
  end if;
  v_request := pg_catalog.jsonb_build_object(
    'display_name', p_display_name, 'game_slug', p_game_slug,
    'score', p_score, 'client_version', p_client_version
  );
  -- Serialize the absent-row case as well as an existing receipt. Hash
  -- collisions only delay another request; the exact UUID is the primary key.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'common-score-receipt-v1:' || p_submission_id::text, 0::bigint
  ));
  select * into v_receipt from private.common_score_receipts_v1
    where submission_id = p_submission_id;
  if found then
    if v_receipt.request_payload is distinct from v_request then
      raise exception 'submission id payload does not match' using errcode = 'PT409';
    end if;
    v_response := v_receipt.response_payload;
    v_duplicate := true;
  else
    -- The existing function retains name validation, score ranges, asc/desc,
    -- special-game processing, and the verified-game/Takkeu prohibition.
    -- No synthetic start/finish record is introduced for a legacy game.
    select pg_catalog.to_jsonb(result) into strict v_response
    from public.submit_score(p_display_name, p_game_slug, p_score, p_client_version) as result;
    if v_response ->> 'accepted' is distinct from 'true' then
      raise exception 'score was not accepted' using errcode = 'PT422';
    end if;
    insert into private.common_score_receipts_v1(submission_id, request_payload, response_payload)
      values (p_submission_id, v_request, v_response);
  end if;
  return query select
    (v_response ->> 'accepted')::boolean,
    v_response ->> 'result_normalized_name',
    v_response ->> 'result_display_name',
    (v_response ->> 'result_first_score')::integer,
    (v_response ->> 'result_best_score')::integer,
    (v_response ->> 'result_play_count')::integer,
    (v_response ->> 'is_first_play')::boolean,
    (v_response ->> 'is_new_best')::boolean,
    v_duplicate;
end;
$function$;
revoke all on function public.submit_score_once_shared_v1(uuid,text,text,integer,text) from public;
grant execute on function public.submit_score_once_shared_v1(uuid,text,text,integer,text) to anon, authenticated;

-- Companion for games that already attach result metadata.
create or replace function public.submit_score_with_metadata_once_shared_v1(
  p_submission_id uuid,
  p_display_name text,
  p_game_slug text,
  p_score integer,
  p_client_version text default '',
  p_metadata jsonb default null
)
returns table (
  accepted boolean,
  result_normalized_name text,
  result_display_name text,
  result_first_score integer,
  result_best_score integer,
  result_play_count integer,
  is_first_play boolean,
  is_new_best boolean,
  was_duplicate boolean
)
language plpgsql security definer set search_path = ''
as $function$
declare
  v_request jsonb;
  v_receipt private.common_score_receipts_v1%rowtype;
  v_response jsonb;
  v_duplicate boolean := false;
begin
  if p_submission_id is null then
    raise exception 'submission id is required' using errcode = '22023';
  end if;
  v_request := pg_catalog.jsonb_build_object(
    'rpc', 'submit_score_with_metadata', 'metadata', p_metadata,
    'display_name', p_display_name, 'game_slug', p_game_slug,
    'score', p_score, 'client_version', p_client_version
  );
  -- Serialize the absent-row case as well as an existing receipt. Hash
  -- collisions only delay another request; the exact UUID is the primary key.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'common-score-receipt-v1:' || p_submission_id::text, 0::bigint
  ));
  select * into v_receipt from private.common_score_receipts_v1
    where submission_id = p_submission_id;
  if found then
    if v_receipt.request_payload is distinct from v_request then
      raise exception 'submission id payload does not match' using errcode = 'PT409';
    end if;
    v_response := v_receipt.response_payload;
    v_duplicate := true;
  else
    -- The metadata wrapper delegates to the existing score function, retaining
    -- the original metadata attachment and name validation, ranges, asc/desc,
    -- special-game processing, and the verified-game/Takkeu prohibition.
    -- No synthetic start/finish record is introduced for a legacy game.
    select pg_catalog.to_jsonb(result) into strict v_response
    from public.submit_score_with_metadata(p_display_name, p_game_slug, p_score, p_client_version, p_metadata) as result;
    if v_response ->> 'accepted' is distinct from 'true' then
      raise exception 'score was not accepted' using errcode = 'PT422';
    end if;
    insert into private.common_score_receipts_v1(submission_id, request_payload, response_payload)
      values (p_submission_id, v_request, v_response);
  end if;
  return query select
    (v_response ->> 'accepted')::boolean,
    v_response ->> 'result_normalized_name',
    v_response ->> 'result_display_name',
    (v_response ->> 'result_first_score')::integer,
    (v_response ->> 'result_best_score')::integer,
    (v_response ->> 'result_play_count')::integer,
    (v_response ->> 'is_first_play')::boolean,
    (v_response ->> 'is_new_best')::boolean,
    v_duplicate;
end;
$function$;
revoke all on function public.submit_score_with_metadata_once_shared_v1(uuid,text,text,integer,text,jsonb) from public;
grant execute on function public.submit_score_with_metadata_once_shared_v1(uuid,text,text,integer,text,jsonb) to anon, authenticated;
commit;
