BEGIN;

CREATE TABLE inubo_ranking_private.guest_starts (
  run_id uuid PRIMARY KEY,
  started_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp()
);
CREATE INDEX inubo_guest_starts_recent ON inubo_ranking_private.guest_starts (started_at);
ALTER TABLE inubo_ranking_private.guest_starts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON inubo_ranking_private.guest_starts FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON inubo_ranking_private.guest_starts TO inubo_ranking_executor;
CREATE POLICY executor_guest_starts_read ON inubo_ranking_private.guest_starts
  FOR SELECT TO inubo_ranking_executor USING (true);
CREATE POLICY executor_guest_starts_insert ON inubo_ranking_private.guest_starts
  FOR INSERT TO inubo_ranking_executor WITH CHECK (true);

CREATE FUNCTION inubo_ranking_private.guest_start(p_run_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_run_id IS NULL THEN RETURN 'rejected'; END IF;
  -- Retry the same run id without adding another play, even at the minute cap.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('inubo_guest_starts:minute_cap', 0::bigint)
  );
  IF EXISTS (SELECT 1 FROM inubo_ranking_private.guest_starts WHERE run_id = p_run_id) THEN
    RETURN 'duplicate';
  END IF;
  IF EXISTS (SELECT 1 FROM inubo_ranking_private.runs WHERE run_id = p_run_id) THEN
    RETURN 'rejected';
  END IF;
  IF (SELECT count(*) FROM inubo_ranking_private.guest_starts
      WHERE started_at >= pg_catalog.clock_timestamp() - interval '1 minute') >= 10000 THEN
    RETURN 'tooEarly';
  END IF;
  INSERT INTO inubo_ranking_private.guest_starts (run_id) VALUES (p_run_id);
  RETURN 'accepted';
END;
$$;

CREATE FUNCTION inubo_ranking_private.play_stats()
RETURNS TABLE(total_play_count bigint, player_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT count(*) + (
    SELECT count(*) FROM inubo_ranking_private.guest_starts g
    WHERE NOT EXISTS (SELECT 1 FROM inubo_ranking_private.runs r WHERE r.run_id = g.run_id)
  ), count(DISTINCT participant_id)
  FROM inubo_ranking_private.runs;
$$;

GRANT CREATE ON SCHEMA inubo_ranking_private TO inubo_ranking_executor;
ALTER FUNCTION inubo_ranking_private.guest_start(uuid) OWNER TO inubo_ranking_executor;
ALTER FUNCTION inubo_ranking_private.play_stats() OWNER TO inubo_ranking_executor;
REVOKE CREATE ON SCHEMA inubo_ranking_private FROM inubo_ranking_executor;
REVOKE ALL ON FUNCTION inubo_ranking_private.guest_start(uuid), inubo_ranking_private.play_stats()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION inubo_ranking_private.guest_start(uuid), inubo_ranking_private.play_stats()
  TO anon, authenticated;

CREATE FUNCTION public.start_inubo_guest_play_v1(p_run_id uuid)
RETURNS text LANGUAGE sql SECURITY INVOKER SET search_path = ''
RETURN inubo_ranking_private.guest_start(p_run_id);

CREATE FUNCTION public.get_inubo_play_stats_v1()
RETURNS TABLE(total_play_count bigint, player_count bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
BEGIN ATOMIC
  SELECT * FROM inubo_ranking_private.play_stats();
END;

REVOKE ALL ON FUNCTION public.start_inubo_guest_play_v1(uuid), public.get_inubo_play_stats_v1()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.start_inubo_guest_play_v1(uuid), public.get_inubo_play_stats_v1()
  TO anon, authenticated;

-- The live catalog entry is enabled after the matching Pages build is available.
INSERT INTO public.games
  (game_slug, title, game_url, description, share_text, display_order, is_active,
   release_date, submission_mode, top_ranking_type, score_order, score_unit, score_scale,
   score_decimals, score_label, first_score_label, best_score_label, score_min, score_max)
VALUES ('inubo', 'イヌボー', 'https://chameleonjp-lab.github.io/inubo/',
  '犬に乗って公園を駆け抜け、ジャンプと空中トリックでハイスコアを狙うゲームです。',
  '犬に乗って飛んで、回って、ハイスコアを狙おう！ #イヌボー https://chameleonjp-lab.github.io/inubo/',
  63, false, DATE '2026-11-21', 'verified', 'best', 'desc', '点', 1, 0,
  '総合点', '初回スコア', '自己ベスト', 0, 2147483647);

COMMIT;
