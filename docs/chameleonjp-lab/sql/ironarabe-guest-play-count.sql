-- UNAPPLIED. Administrator-reviewed manual SQL only; never load in a browser.
-- Count unnamed Ironarabe starts without creating players, named sessions,
-- scores or score history. Existing named score submission remains unchanged.
-- Apply during a window without concurrent changes to get_game_play_stats.
BEGIN;

DO $precondition$
DECLARE
  v_stats_rpc pg_catalog.regprocedure := pg_catalog.to_regprocedure('public.get_game_play_stats(text)');
  v_definition text;
BEGIN
  IF v_stats_rpc IS NULL THEN
    RAISE EXCEPTION 'get_game_play_stats precondition failed; function is missing';
  END IF;
  v_definition := pg_catalog.pg_get_functiondef(v_stats_rpc);
  -- Exact reviewed baselines: Takkeu only, or Takkeu plus deployed Iroate.
  IF pg_catalog.md5(v_definition) NOT IN (
       'b267a6060af97a4845c2d18f5e3ab02e', 'a509efcc07ccae488c47ab849ad25dda') THEN
    RAISE EXCEPTION 'get_game_play_stats precondition failed; re-read the current definition before applying';
  END IF;
  PERFORM pg_catalog.set_config('ironarabe_guest_install_v1.stats_definition_before', v_definition, true);
END;
$precondition$;

CREATE TABLE private.ironarabe_guest_plays_v1 (
  start_id uuid NOT NULL UNIQUE,
  play_id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  client_version text NOT NULL CHECK (pg_catalog.char_length(client_version) BETWEEN 1 AND 80),
  started_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp()
);
CREATE INDEX ironarabe_guest_plays_v1_started_at_idx
  ON private.ironarabe_guest_plays_v1 (started_at);
ALTER TABLE private.ironarabe_guest_plays_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.ironarabe_guest_plays_v1 FROM PUBLIC, anon, authenticated;

-- Intentionally public SECURITY DEFINER endpoint: it can append only one
-- validated count-only start for this game. No table access is granted.
CREATE FUNCTION public.start_ironarabe_guest_play_v1(
  p_start_id uuid,
  p_game_slug text,
  p_client_version text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_existing private.ironarabe_guest_plays_v1%ROWTYPE;
  v_play_id uuid;
  v_now timestamptz;
BEGIN
  IF p_start_id IS NULL OR p_game_slug IS NULL OR p_client_version IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('accepted', false, 'reason', 'required_input_missing');
  END IF;
  IF p_game_slug <> 'ironarabe'
     OR p_client_version <> pg_catalog.btrim(p_client_version)
     OR pg_catalog.char_length(p_client_version) NOT BETWEEN 1 AND 80
     OR p_client_version !~ '^ironarabe-web-1[.]4[.]1-stagepack001-v2-(sunset|aurora|ocean|leaf|amber|wisteria|coral|nebula|breeze|autumn)-r[0-3]$' THEN
    RETURN pg_catalog.jsonb_build_object('accepted', false, 'reason', 'invalid_input');
  END IF;

  -- Use the named-start lock key while checking for an already accepted named
  -- session. The existing named RPC is intentionally not modified here.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_start_id::text, 0::bigint)
  );
  SELECT * INTO v_existing
  FROM private.ironarabe_guest_plays_v1
  WHERE start_id = p_start_id
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing.client_version <> p_client_version THEN
      RETURN pg_catalog.jsonb_build_object('accepted', false, 'reason', 'start_id_conflict');
    END IF;
    RETURN pg_catalog.jsonb_build_object('accepted', true, 'duplicate', true,
      'start_id', p_start_id, 'play_id', v_existing.play_id,
      'game_slug', 'ironarabe', 'client_version', v_existing.client_version);
  END IF;
  IF EXISTS (SELECT 1 FROM private.game_play_sessions WHERE start_id = p_start_id) THEN
    RETURN pg_catalog.jsonb_build_object('accepted', false, 'reason', 'start_id_conflict');
  END IF;

  PERFORM 1 FROM public.games
  WHERE game_slug = 'ironarabe' AND is_active IS TRUE AND submission_mode = 'shared'
  FOR SHARE;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('accepted', false, 'reason', 'game_not_available');
  END IF;

  -- Global coarse flood protection, not guest identification. Serialize this
  -- check and append so different UUIDs cannot race past the minute cap.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ironarabe_guest_plays_v1:minute_cap', 0::bigint)
  );
  v_now := pg_catalog.clock_timestamp();
  IF (SELECT count(*) FROM private.ironarabe_guest_plays_v1
      WHERE started_at >= v_now - interval '1 minute') >= 10000 THEN
    RETURN pg_catalog.jsonb_build_object('accepted', false, 'reason', 'play_rate_limited');
  END IF;

  INSERT INTO private.ironarabe_guest_plays_v1 (start_id, client_version, started_at)
  VALUES (p_start_id, p_client_version, v_now)
  RETURNING play_id INTO v_play_id;
  RETURN pg_catalog.jsonb_build_object('accepted', true, 'duplicate', false,
    'start_id', p_start_id, 'play_id', v_play_id,
    'game_slug', 'ironarabe', 'client_version', p_client_version);
END;
$function$;
-- Revoke explicit default grants as well as the PostgreSQL PUBLIC default.
REVOKE ALL ON FUNCTION public.start_ironarabe_guest_play_v1(uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.start_ironarabe_guest_play_v1(uuid, text, text) TO anon;

-- Check again immediately before replacing the shared aggregate. Keep upstream
-- RPC DDL paused for this application; the guard never authorizes an overwrite
-- of a newly reviewed upstream definition.
DO $precondition$
DECLARE
  v_stats_rpc pg_catalog.regprocedure := pg_catalog.to_regprocedure('public.get_game_play_stats(text)');
  v_definition text;
  v_marker text := ' else 0::bigint end,';
  v_ironarabe_arm text := $ironarabe_arm$
    when pg_catalog.lower(pg_catalog.btrim(coalesce(p_game_slug, ''))) = 'ironarabe'
      then (select count(*) from private.ironarabe_guest_plays_v1)$ironarabe_arm$;
BEGIN
  IF v_stats_rpc IS NULL THEN
    RAISE EXCEPTION 'get_game_play_stats precondition failed; upstream definition changed during application';
  END IF;
  v_definition := pg_catalog.pg_get_functiondef(v_stats_rpc);
  IF v_definition IS DISTINCT FROM pg_catalog.current_setting(
       'ironarabe_guest_install_v1.stats_definition_before', true)
     OR pg_catalog.md5(v_definition) NOT IN (
       'b267a6060af97a4845c2d18f5e3ab02e', 'a509efcc07ccae488c47ab849ad25dda') THEN
    RAISE EXCEPTION 'get_game_play_stats precondition failed; upstream definition changed during application';
  END IF;
  IF pg_catalog.char_length(v_definition)
       - pg_catalog.char_length(pg_catalog.replace(v_definition, v_marker, ''))
       <> pg_catalog.char_length(v_marker) THEN
    RAISE EXCEPTION 'get_game_play_stats precondition failed; expected one reviewed CASE insertion point';
  END IF;
  -- Preserve every existing branch and all named-player aggregation verbatim.
  -- pg_get_functiondef supplies CREATE OR REPLACE, retaining OID/owner/ACL.
  -- Insert the Ironarabe arm immediately before the existing CASE fallback.
  EXECUTE pg_catalog.replace(v_definition, v_marker, v_ironarabe_arm || v_marker);
END;
$precondition$;

NOTIFY pgrst, 'reload schema';
COMMIT;
