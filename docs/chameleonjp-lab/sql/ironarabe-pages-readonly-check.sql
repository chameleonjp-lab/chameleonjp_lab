-- Read only. Run before URL cutover and again after it; save results privately.
BEGIN READ ONLY;
SELECT game_slug, game_url, share_text, score_order, score_scale, score_decimals
FROM public.games WHERE game_slug = 'ironarabe';
SELECT count(*) AS target_rows FROM public.games WHERE game_slug = 'ironarabe';

-- All columns participate, including names, first/best, counts, timestamps and stage/client metadata.
SELECT 'game_scores' AS source, count(*) AS rows,
       md5(coalesce(string_agg(row_to_json(s)::text, E'\n' ORDER BY normalized_name), '')) AS digest
FROM public.game_scores s WHERE game_slug = 'ironarabe'
UNION ALL
SELECT 'score_runs', count(*),
       md5(coalesce(string_agg(row_to_json(s)::text, E'\n' ORDER BY id), ''))
FROM public.score_runs s WHERE game_slug = 'ironarabe';

SELECT count(*) AS best_ranking_rows, min(best_score) AS minimum_best_score, min(rank_no) AS first_rank
FROM public.get_best_score_ranking('ironarabe', 30);
COMMIT;
