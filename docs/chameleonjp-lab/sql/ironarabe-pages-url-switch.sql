-- UNAPPLIED. Run only AFTER PR-A #16 is merged and the new Pages site passes acceptance.
-- Use an authenticated administrator's SQL Editor on project mlpnjgezrnhdxsxolyzj.
-- Do not run with a public key or put an administrator key in HTML / Actions.
-- Replace the sentinel below with the 40-character MERGED commit SHA verified in release.json.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';
SET LOCAL ironarabe.pages_verified_sha = 'REPLACE_WITH_VERIFIED_MERGED_COMMIT_SHA';

-- Review this result before executing the DO block: exactly one old-URL row is required.
SELECT game_slug, game_url, share_text, score_order, score_scale, score_decimals
FROM public.games
WHERE game_slug = 'ironarabe';
SELECT count(*) AS planned_updates FROM public.games WHERE game_slug = 'ironarabe';

DO $switch$
DECLARE
  old_url constant text := 'https://chameleonjp.codeberg.page/ironarabe/';
  new_url constant text := 'https://chameleonjp-lab.github.io/ironarabe/';
  before_row jsonb;
  after_row jsonb;
  target_count bigint;
  affected bigint;
BEGIN
  IF coalesce(current_setting('ironarabe.pages_verified_sha', true), '') !~ '^[0-9a-f]{40}$' THEN
    RAISE EXCEPTION 'STOP: verify the published merged SHA and complete acceptance first; replace the sentinel.';
  END IF;

  SELECT count(*) INTO target_count FROM public.games WHERE game_slug = 'ironarabe';
  IF target_count <> 1 THEN
    RAISE EXCEPTION 'STOP: expected exactly 1 target, found %', target_count;
  END IF;
  SELECT to_jsonb(g) INTO before_row FROM public.games AS g
  WHERE game_slug = 'ironarabe' FOR UPDATE;

  IF before_row->>'game_url' IS DISTINCT FROM old_url THEN
    RAISE EXCEPTION 'STOP: game_url changed since preflight; inspect before applying.';
  END IF;
  IF before_row->>'score_order' IS DISTINCT FROM 'asc'
     OR before_row->>'score_scale' IS DISTINCT FROM '100'
     OR before_row->>'score_decimals' IS DISTINCT FROM '2' THEN
    RAISE EXCEPTION 'STOP: ranking contract differs from asc/100/2.';
  END IF;
  IF before_row->>'share_text' IS NULL OR
     length(before_row->>'share_text') - length(replace(before_row->>'share_text', old_url, '')) <> length(old_url) THEN
    RAISE EXCEPTION 'STOP: share_text must contain the old URL exactly once; preserve all other text.';
  END IF;

  -- The only write in this script. It updates only the permitted URL columns of one game.
  UPDATE public.games
  SET game_url = new_url,
      share_text = replace(share_text, old_url, new_url)
  WHERE game_slug = 'ironarabe'
    AND game_url = old_url
    AND share_text = (before_row->>'share_text');
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN
    RAISE EXCEPTION 'STOP: expected exactly 1 updated row, got %', affected;
  END IF;

  SELECT to_jsonb(g) INTO after_row FROM public.games AS g WHERE game_slug = 'ironarabe';
  IF after_row->>'game_url' IS DISTINCT FROM new_url
     OR after_row->>'share_text' IS DISTINCT FROM replace(before_row->>'share_text', old_url, new_url)
     OR (after_row - 'game_url' - 'share_text') IS DISTINCT FROM (before_row - 'game_url' - 'share_text') THEN
    RAISE EXCEPTION 'STOP: unexpected change; transaction will roll back.';
  END IF;
  RAISE NOTICE 'Updated one ironarabe game URL and only the URL substring in share_text; score tables untouched.';
END
$switch$;

SELECT game_slug, game_url, share_text, score_order, score_scale, score_decimals
FROM public.games WHERE game_slug = 'ironarabe';
COMMIT;
-- Any exception aborts this transaction. Issue ROLLBACK before further work after an error.
