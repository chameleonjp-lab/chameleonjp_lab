BEGIN;

LOCK TABLE public.games IN SHARE ROW EXCLUSIVE MODE;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.games
    WHERE display_order = 66 AND game_slug <> 'medjedshin_ha_mamotteru'
  ) THEN
    RAISE EXCEPTION 'Medjed display order 66 is already in use';
  END IF;
END;
$$;

INSERT INTO public.games
  (game_slug, title, game_url, description, share_text, display_order, is_active,
   release_date, submission_mode, top_ranking_type, score_order, score_unit, score_scale,
   score_decimals, score_label, first_score_label, best_score_label, score_min, score_max)
VALUES
  ('medjedshin_ha_mamotteru', 'メジェド神は守ってる',
   'https://chameleonjp-lab.github.io/medjedshin_ha_mamotteru/',
   '冥界で死者たちの行進を守れ！40ウェーブの3Dアクション。',
   E'メジェド神は守ってる\n冥界で死者たちの行進を守れ！40ウェーブの3Dアクション。\n#メジェド神は守ってる\nhttps://chameleonjp-lab.github.io/medjedshin_ha_mamotteru/',
   66, true, DATE '2026-11-26', 'verified', 'best', 'desc', '点', 1, 0,
   'スコア', '初回スコア', '自己ベスト', 0, 2147483647)
ON CONFLICT (game_slug) DO NOTHING;

COMMIT;
