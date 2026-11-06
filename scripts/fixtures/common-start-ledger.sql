-- LOCAL REVIEW CANDIDATE ONLY. Not a migration; never executed against any database.
-- Fresh isolated schema; intentional name collision failure instead of overwriting.
-- No public endpoint, no allowlist seed, no grants, no legacy reads/writes.
BEGIN;
CREATE SCHEMA common_start_candidate_v1;
REVOKE ALL ON SCHEMA common_start_candidate_v1 FROM PUBLIC;
CREATE TABLE common_start_candidate_v1.allowed_release (
  game_slug text NOT NULL CHECK (game_slug ~ '^[a-z0-9_]{1,80}$'),
  client_version text NOT NULL CHECK (client_version ~ '^[A-Za-z0-9._+-]{1,80}$'),
  enabled boolean NOT NULL DEFAULT false,
  opens_at timestamptz NOT NULL,
  PRIMARY KEY (game_slug, client_version)
);
CREATE TABLE common_start_candidate_v1.start_ledger (
  start_id uuid PRIMARY KEY CHECK (start_id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  participant_id uuid NOT NULL CHECK (participant_id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  game_slug text NOT NULL,
  client_version text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (game_slug, client_version)
    REFERENCES common_start_candidate_v1.allowed_release (game_slug, client_version)
);
CREATE INDEX start_ledger_game_participant ON common_start_candidate_v1.start_ledger (game_slug, participant_id);
ALTER TABLE common_start_candidate_v1.allowed_release ENABLE ROW LEVEL SECURITY;
ALTER TABLE common_start_candidate_v1.start_ledger ENABLE ROW LEVEL SECURITY;
-- No policies: non-owner roles fail closed even if table ACLs accidentally change.
CREATE FUNCTION common_start_candidate_v1.reject_ledger_mutation()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'start_ledger_is_append_only' USING ERRCODE = '55000';
END;
$$;
CREATE TRIGGER start_ledger_immutable BEFORE UPDATE OR DELETE OR TRUNCATE
ON common_start_candidate_v1.start_ledger FOR EACH STATEMENT
EXECUTE FUNCTION common_start_candidate_v1.reject_ledger_mutation();

CREATE FUNCTION common_start_candidate_v1.record_start(p_event jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  prior common_start_candidate_v1.start_ledger%ROWTYPE;
  sid text; pid text; slug text; ver text;
  uuid4 constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
BEGIN
  IF p_event IS NULL OR pg_catalog.jsonb_typeof(p_event) <> 'object' THEN
    RETURN pg_catalog.jsonb_build_object('accepted',false,'reason','invalid_payload');
  END IF;
  IF (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_object_keys(p_event)) <> 4
     OR NOT (p_event ?& ARRAY['startId','participantId','gameSlug','clientVersion'])
     OR EXISTS (SELECT 1 FROM pg_catalog.jsonb_each(p_event) AS x WHERE pg_catalog.jsonb_typeof(x.value) <> 'string') THEN
    RETURN pg_catalog.jsonb_build_object('accepted',false,'reason','invalid_payload');
  END IF;
  sid := p_event->>'startId'; pid := p_event->>'participantId';
  slug := p_event->>'gameSlug'; ver := p_event->>'clientVersion';
  IF sid !~ uuid4 OR pid !~ uuid4 OR slug !~ '^[a-z0-9_]{1,80}$'
     OR ver !~ '^[A-Za-z0-9._+-]{1,80}$' THEN
    RETURN pg_catalog.jsonb_build_object('accepted',false,'reason','invalid_payload');
  END IF;
  -- Requires fresh snapshots after wait. Fail instead of using stale RR/SERIALIZABLE snapshots.
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'read_committed_required' USING ERRCODE = '40001';
  END IF;
  -- Transaction-level serialization covers the initially absent row. Hash collisions
  -- only serialize unrelated IDs; exact primary key and payload checks remain decisive.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('common-start-v1:' || sid,0));
  SELECT * INTO prior FROM common_start_candidate_v1.start_ledger WHERE start_id = sid::uuid;
  IF FOUND THEN
    IF prior.participant_id = pid::uuid AND prior.game_slug = slug AND prior.client_version = ver THEN
      RETURN pg_catalog.jsonb_build_object('accepted',true,'duplicate',true,'event',p_event);
    END IF;
    RETURN pg_catalog.jsonb_build_object('accepted',false,'reason','payload_conflict');
  END IF;
  -- Share lock makes an authorized enable/disable change linearize before or after this insert.
  PERFORM 1 FROM common_start_candidate_v1.allowed_release
    WHERE game_slug = slug AND client_version = ver AND enabled AND opens_at <= pg_catalog.clock_timestamp()
    FOR SHARE;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('accepted',false,'reason','release_unavailable');
  END IF;
  INSERT INTO common_start_candidate_v1.start_ledger (start_id,participant_id,game_slug,client_version)
  VALUES (sid::uuid,pid::uuid,slug,ver);
  RETURN pg_catalog.jsonb_build_object('accepted',true,'duplicate',false,'event',p_event);
END;
$$;

CREATE FUNCTION common_start_candidate_v1.start_stats(p_game_slug text)
RETURNS TABLE (play_count bigint,participant_count bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT count(*), count(DISTINCT participant_id)
  FROM common_start_candidate_v1.start_ledger WHERE game_slug = p_game_slug;
$$;
REVOKE ALL ON ALL TABLES IN SCHEMA common_start_candidate_v1 FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA common_start_candidate_v1 FROM PUBLIC;
-- Deployment must separately inspect inherited/default ACLs and known API roles.
-- This file intentionally contains no role creation, permission grants, policies or API exposure.
COMMIT;
