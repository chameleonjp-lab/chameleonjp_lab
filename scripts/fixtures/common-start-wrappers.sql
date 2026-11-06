-- LOCAL PROPOSAL ONLY, NOT A MIGRATION. UNEXECUTED. Requires frozen base candidate.
-- Apply only together with reviewed owner/ACL proposal in one approved transaction.
-- Existing names cause failure, never replace anything. No API access enabled here.
BEGIN;
CREATE TABLE common_start_candidate_v1.mode_era (
 game_slug text PRIMARY KEY CHECK (game_slug ~ '^[a-z0-9_]{1,80}$'),
 cutoff_at timestamptz NOT NULL,
 era_label text NOT NULL CHECK (era_label = 'browser-start-v1')
);
ALTER TABLE common_start_candidate_v1.mode_era ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER mode_era_immutable BEFORE UPDATE OR DELETE OR TRUNCATE
ON common_start_candidate_v1.mode_era FOR EACH STATEMENT
EXECUTE FUNCTION common_start_candidate_v1.reject_ledger_mutation();
REVOKE ALL ON common_start_candidate_v1.mode_era FROM PUBLIC, anon, authenticated, service_role;
-- Era rows are deployment metadata: seed once before first accepted event; no client writes.
CREATE FUNCTION public.record_game_start_v1(p_event jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF p_event IS NULL OR pg_catalog.jsonb_typeof(p_event) <> 'object'
    OR pg_catalog.octet_length(p_event::text)>1024 THEN
  RETURN pg_catalog.jsonb_build_object('accepted',false,'reason','invalid_payload');
 END IF;
 IF NOT EXISTS (SELECT 1 FROM common_start_candidate_v1.mode_era e
    WHERE e.game_slug=p_event->>'gameSlug' AND e.cutoff_at<=pg_catalog.clock_timestamp()) THEN
  RETURN pg_catalog.jsonb_build_object('accepted',false,'reason','era_unavailable');
 END IF;
 RETURN common_start_candidate_v1.record_start(p_event);
END;
$$;
CREATE FUNCTION public.game_start_stats_v1(p_game_slug text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE era common_start_candidate_v1.mode_era%ROWTYPE; starts bigint; browsers bigint;
BEGIN
 IF p_game_slug IS NULL OR p_game_slug !~ '^[a-z0-9_]{1,80}$' THEN
  RETURN pg_catalog.jsonb_build_object('available',false,'reason','invalid_mode');
 END IF;
 SELECT * INTO era FROM common_start_candidate_v1.mode_era WHERE game_slug=p_game_slug;
 IF NOT FOUND OR era.cutoff_at>pg_catalog.statement_timestamp() THEN
  RETURN pg_catalog.jsonb_build_object('available',false,'reason','era_unavailable');
 END IF;
 SELECT pg_catalog.count(*),pg_catalog.count(DISTINCT l.participant_id) INTO starts,browsers
 FROM common_start_candidate_v1.start_ledger l
 WHERE l.game_slug=p_game_slug AND l.accepted_at >= era.cutoff_at;
 RETURN pg_catalog.jsonb_build_object('available',true,'gameSlug',p_game_slug,
   'era',era.era_label,'cutoffAt',pg_catalog.to_char(era.cutoff_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
   'asOf',pg_catalog.to_char(pg_catalog.statement_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
   'starts',starts::text,'participantBrowsers',browsers::text,
   'historicalIncluded',false,'timeBasis','server_receipt');
END;
$$;
REVOKE ALL ON FUNCTION public.record_game_start_v1(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.game_start_stats_v1(text) FROM PUBLIC, anon, authenticated, service_role;
COMMIT;
-- Function return is not a committed HTTP ACK. PostgREST/gateway commit ordering is a release gate.
