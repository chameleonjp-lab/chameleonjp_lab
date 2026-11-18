-- Serialize order selection with other catalog writes during this short registration.
begin;
lock table public.games in share row exclusive mode;
insert into public.games as existing (
  display_order, game_slug, title, game_url, description, share_text, release_date, top_ranking_type, score_order, score_unit, score_scale, score_decimals, score_label, first_score_label, best_score_label, is_active, submission_mode, score_min, score_max
) values (
  greatest(60, (select coalesce(max(display_order), 0) + 1 from public.games)),
  'chameleol',
  'カメレオる',
  'https://chameleonjp-lab.github.io/chameleol/',
  '宝石を盗んだカメレオンが、壁と同じ色に変身して警察から逃げるゲームです。',
  '宝石を盗んだカメレオン、壁と同じ色に変身して警察から逃げ切ろう！ #カメレオる https://chameleonjp-lab.github.io/chameleol/',
  '2026-11-10',
  'best',
  'desc',
  '棟',
  1,
  0,
  'クリア棟数',
  '初回クリア棟数',
  '自己ベスト',
  true,
  'verified',
  0,
  50
) on conflict (game_slug) do update set
  display_order = case
    when existing.display_order > 0 and not exists (
      select 1 from public.games as occupied
      where occupied.game_slug <> existing.game_slug
        and occupied.is_active is true and occupied.display_order = existing.display_order
    ) then existing.display_order
    else excluded.display_order
  end,
  title = excluded.title,
  game_url = excluded.game_url,
  description = excluded.description,
  share_text = excluded.share_text,
  release_date = excluded.release_date,
  top_ranking_type = excluded.top_ranking_type,
  score_order = excluded.score_order,
  score_unit = excluded.score_unit,
  score_scale = excluded.score_scale,
  score_decimals = excluded.score_decimals,
  score_label = excluded.score_label,
  first_score_label = excluded.first_score_label,
  best_score_label = excluded.best_score_label,
  is_active = excluded.is_active,
  submission_mode = excluded.submission_mode,
  score_min = excluded.score_min,
  score_max = excluded.score_max;
commit;
