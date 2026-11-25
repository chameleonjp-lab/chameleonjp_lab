BEGIN;

-- Reserve the manifest's display order while the game and Lab builds are deployed.
LOCK TABLE public.games IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.games WHERE display_order = 64 AND game_slug <> 'ikagetto') THEN
    RAISE EXCEPTION 'Ikagetto display order 64 is already in use';
  END IF;
END;
$$;

INSERT INTO public.games
  (game_slug, title, game_url, description, share_text, display_order, is_active,
   release_date, submission_mode, top_ranking_type, score_order, score_unit, score_scale,
   score_decimals, score_label, first_score_label, best_score_label, score_min, score_max)
VALUES ('ikagetto', 'イカゲット', 'https://chameleonjp-lab.github.io/ikagetto/',
  '夜の海へ出港し、巨大なダイオウイカを釣り上げよう。釣ったイカは観察、解体、アヒージョ作りまで楽しめます。',
  E'大きいイカを釣って自慢しよう\n#イカゲット\nhttps://chameleonjp-lab.github.io/ikagetto/',
  64, false, DATE '2026-11-25', 'verified', 'best', 'desc', '点', 1, 0,
  '釣りスコア', '初回スコア', '釣り', 0, 50000)
ON CONFLICT (game_slug) DO NOTHING;

COMMIT;
