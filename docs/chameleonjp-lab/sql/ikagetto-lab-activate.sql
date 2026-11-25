-- Run after the matching Ikagetto and Lab Pages builds are live.
BEGIN;

LOCK TABLE public.games IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
  IF to_regprocedure('public.ikagetto_stats_v1()') IS NULL OR
     to_regprocedure('public.ikagetto_board_v1(text,integer)') IS NULL THEN
    RAISE EXCEPTION 'Ikagetto ranking functions are unavailable';
  END IF;
  IF EXISTS (SELECT 1 FROM public.games WHERE display_order = 64 AND game_slug <> 'ikagetto') THEN
    RAISE EXCEPTION 'Ikagetto display order 64 is already in use';
  END IF;

  UPDATE public.games
  SET is_active = true
  WHERE game_slug = 'ikagetto'
    AND game_url = 'https://chameleonjp-lab.github.io/ikagetto/'
    AND display_order = 64
    AND submission_mode = 'verified'
    AND top_ranking_type = 'best'
    AND score_order = 'desc'
    AND score_unit = '点'
    AND score_scale = 1
    AND score_decimals = 0
    AND score_min = 0
    AND score_max = 50000;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ikagetto catalog entry is missing or has unexpected settings';
  END IF;
END;
$$;

COMMIT;
