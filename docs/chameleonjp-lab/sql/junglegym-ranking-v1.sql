begin;

create schema jungle_gym_ranking;
revoke all on schema jungle_gym_ranking from public, anon, authenticated;

create table jungle_gym_ranking.runs (
  run_id uuid primary key,
  player_key uuid not null,
  mode text not null check (mode in ('normal', 'hard', 'oni_hard')),
  display_name text check (char_length(display_name) between 1 and 24),
  started_at timestamptz not null default now(),
  score integer check (score between 1 and 1000)
);
alter table jungle_gym_ranking.runs enable row level security;

create table jungle_gym_ranking.bests (
  mode text not null check (mode in ('normal', 'hard', 'oni_hard')),
  player_key uuid not null,
  display_name text not null,
  score integer not null check (score between 1 and 1000),
  achieved_at timestamptz not null default now(),
  primary key (mode, player_key)
);
alter table jungle_gym_ranking.bests enable row level security;
create index jungle_gym_bests_board on jungle_gym_ranking.bests
  (mode, score desc, achieved_at, player_key);
create index jungle_gym_named_starts on jungle_gym_ranking.runs (player_key)
  where display_name is not null;

-- The public wrappers can touch only this game's private rows. A random, unpublished
-- player key binds starts and results. These are browser-reported game scores.
create function public.junglegym_start_v1(p_run_id uuid, p_player_key uuid, p_mode text, p_display_name text)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare
  clean_name text := nullif(btrim(p_display_name), '');
begin
  if p_run_id is null or p_player_key is null or p_mode is null
    or p_mode not in ('normal', 'hard', 'oni_hard')
    or char_length(clean_name) > 24 or clean_name ~ '[[:cntrl:]]' then
    return false;
  end if;
  insert into jungle_gym_ranking.runs (run_id, player_key, mode, display_name)
    values (p_run_id, p_player_key, p_mode, clean_name)
    on conflict (run_id) do nothing;
  return exists (
    select 1 from jungle_gym_ranking.runs as r where r.run_id = p_run_id
      and r.player_key = p_player_key and r.mode = p_mode
      and r.display_name is not distinct from clean_name
  );
end;
$$;

create function public.junglegym_finish_v1(p_run_id uuid, p_player_key uuid, p_score integer)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare
  played jungle_gym_ranking.runs%rowtype;
begin
  if p_score is null or p_score not between 1 and 1000 then return false; end if;
  select * into played from jungle_gym_ranking.runs
    where run_id = p_run_id and player_key = p_player_key and display_name is not null
    for update;
  if not found then return false; end if;
  if played.score is not null then return played.score = p_score; end if;
  update jungle_gym_ranking.runs set score = p_score where run_id = p_run_id;
  insert into jungle_gym_ranking.bests (mode, player_key, display_name, score)
    values (played.mode, played.player_key, played.display_name, p_score)
    on conflict (mode, player_key) do update
      set score = excluded.score, display_name = excluded.display_name, achieved_at = excluded.achieved_at
      where excluded.score > bests.score;
  return true;
end;
$$;

create function public.junglegym_stats_v1()
returns table (total_play_count bigint, player_count bigint)
language sql stable security definer set search_path = ''
as $$
  select count(*), count(distinct player_key) filter (where display_name is not null)
  from jungle_gym_ranking.runs
$$;

create function public.junglegym_board_v1(p_mode text, p_offset integer, p_limit integer)
returns table (rank bigint, display_name text, score integer)
language sql stable security definer set search_path = ''
as $$
  select rank() over (order by b.score desc), b.display_name, b.score
  from jungle_gym_ranking.bests b
  where b.mode = p_mode
  order by b.score desc, b.achieved_at, b.player_key
  offset greatest(p_offset, 0) limit least(greatest(p_limit, 1), 501)
$$;

revoke all on function public.junglegym_start_v1(uuid, uuid, text, text),
  public.junglegym_finish_v1(uuid, uuid, integer), public.junglegym_stats_v1(),
  public.junglegym_board_v1(text, integer, integer) from public, anon, authenticated;
grant execute on function public.junglegym_start_v1(uuid, uuid, text, text),
  public.junglegym_finish_v1(uuid, uuid, integer), public.junglegym_stats_v1(),
  public.junglegym_board_v1(text, integer, integer) to anon, authenticated;

lock table public.games in share row exclusive mode;
do $$
begin
  if exists (select 1 from public.games where display_order = 65 and game_slug <> 'junglegym_onigokko') then
    raise exception 'Jungle Gym Tag display order 65 is already in use';
  end if;
end;
$$;
insert into public.games
  (game_slug, title, game_url, description, share_text, display_order, is_active,
   release_date, submission_mode, top_ranking_type, score_order, score_unit, score_scale,
   score_decimals, score_label, first_score_label, best_score_label, score_min, score_max)
values ('junglegym_onigokko', 'ジャングルジム鬼ごっこ', 'https://chameleonjp-lab.github.io/junglegym_onigokko/',
  'カラフルなジャングルジムを登り降りしながら、鬼から逃げてスコアを競おう。',
  E'ジャングルジム鬼ごっこで遊ぼう！\n#ジャングルジム鬼ごっこ\nhttps://chameleonjp-lab.github.io/junglegym_onigokko/',
  65, true, date '2026-11-26', 'verified', 'best', 'desc', 'pt', 1, 0,
  'スコア', '初回スコア', '自己ベスト', 1, 1000);

commit;
