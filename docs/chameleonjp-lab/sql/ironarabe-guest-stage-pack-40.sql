-- UNAPPLIED. Administrator-reviewed manual SQL only; never load in a browser.
-- Upgrade only installations of the exact original 8-stage guest count RPC.
-- Fresh installations use ironarabe-guest-play-count.sql instead.
-- Pause concurrent DDL on this function while applying; the guard detects
-- definition drift at application time, not a later non-cooperating DDL writer.
-- CREATE OR REPLACE preserves the function OID, signature, owner and ACL.
-- No table, stored play, score/history, game row or statistics RPC is changed.
BEGIN;

DO $precondition$
DECLARE
  v_guest_rpc pg_catalog.regprocedure := pg_catalog.to_regprocedure(
    'public.start_ironarabe_guest_play_v1(uuid,text,text)');
BEGIN
  IF v_guest_rpc IS NULL THEN
    RAISE EXCEPTION 'start_ironarabe_guest_play_v1 precondition failed; original 8-stage function is missing';
  END IF;
  -- Derived locally from the committed original SQL in the 419e25e baseline.
  IF pg_catalog.md5(pg_catalog.pg_get_functiondef(v_guest_rpc))
       IS DISTINCT FROM '3bd02ffa7b92def627e1334750085989' THEN
    RAISE EXCEPTION 'start_ironarabe_guest_play_v1 precondition failed; re-read the current definition before applying';
  END IF;
END;
$precondition$;

CREATE OR REPLACE FUNCTION public.start_ironarabe_guest_play_v1(
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

COMMIT;
