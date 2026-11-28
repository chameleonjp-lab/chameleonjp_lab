-- Stage the catalog row while the game and Lab pull requests are reviewed.
BEGIN;

LOCK TABLE public.games IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.games WHERE display_order = 68 AND game_slug <> 'galaxy_shark') THEN
    RAISE EXCEPTION 'Galaxy Shark display order 68 is already in use';
  END IF;
END;
$$;

INSERT INTO public.games
  (game_slug, title, game_url, description, share_text, display_order, is_active,
   release_date, submission_mode, top_ranking_type, score_order, score_unit, score_scale,
   score_decimals, score_label, first_score_label, best_score_label, score_min, score_max)
VALUES
  ('galaxy_shark', 'ギャラクシーシャーク', 'https://chameleonjp-lab.github.io/galaxy_shark/',
   '獲物を食べてサメを育て、海から宇宙へ。最後は銀河を丸のみする3Dアクション。', E'ギャラクシーシャーク\n獲物を食べてサメを育て、海から宇宙へ。最後は銀河を丸のみする3Dアクション。\n#ギャラクシーシャーク\nhttps://chameleonjp-lab.github.io/galaxy_shark/',
   68, false, DATE '2026-11-28', 'shared', 'best', 'desc', '点', 1, 0,
   'スコア', '初回スコア', '自己ベスト', 0, 2147483647)
ON CONFLICT (game_slug) DO NOTHING;

COMMIT;
