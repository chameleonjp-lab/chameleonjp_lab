-- Apply once the paired Game Pages update and Lab catalog are ready.
-- To suspend the listing and both write paths, set is_active = false for this slug.
-- Suspending preserves recorded starts and scores.
BEGIN;

DO $$
BEGIN
  UPDATE public.games
  SET is_active = true
  WHERE game_slug = 'galaxy_shark' AND display_order = 68
    AND game_url = 'https://chameleonjp-lab.github.io/galaxy_shark/'
    AND submission_mode = 'shared';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Galaxy Shark catalog entry is missing or inconsistent';
  END IF;
  IF NOT private.enable_lab_counted_starts_v1('galaxy_shark') THEN
    RAISE EXCEPTION 'Galaxy Shark start counter could not be enabled';
  END IF;
END;
$$;

COMMIT;
