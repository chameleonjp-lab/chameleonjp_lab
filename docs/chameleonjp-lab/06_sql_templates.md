# Supabase SQLテンプレート

最終更新: 2026-06-12
対象: Supabaseの確認、ゲーム登録、ランキング連携確認

## 1. この文書の使い方

この文書は、Supabase SQL Editorへ貼り付けて使うためのテンプレート集である。

実行前に、必ず `game_slug`、表示名、URL、公開日などを対象ゲームに合わせて変える。

このプロジェクトでは、SQLを出す時はファイル添付ではなく、コピペできる形で出す運用が多い。この文書も、そのままコピーしやすい形にしている。

## 2. 登録済みゲーム一覧を確認するSQL

```sql
select
  display_order,
  game_slug,
  title,
  game_url,
  description,
  is_active,
  top_ranking_type,
  score_order,
  score_unit,
  score_scale,
  score_decimals,
  score_label,
  first_score_label,
  best_score_label,
  release_date
from public.games
order by display_order asc, game_slug asc;
```

## 3. 公開中ゲームだけ確認するSQL

```sql
select
  display_order,
  game_slug,
  title,
  game_url,
  is_active,
  top_ranking_type,
  score_order,
  score_unit,
  score_scale,
  score_decimals
from public.games
where is_active = true
order by display_order asc, game_slug asc;
```

## 4. 1ゲームだけ確認するSQL

```sql
select
  display_order,
  game_slug,
  title,
  game_url,
  description,
  share_text,
  is_active,
  top_ranking_type,
  score_order,
  score_unit,
  score_scale,
  score_decimals,
  score_label,
  first_score_label,
  best_score_label,
  release_date
from public.games
where game_slug = 'ここに_game_slug';
```

## 5. 新規ゲーム登録・更新SQL

`game_slug` が既にある場合は更新し、ない場合は追加する。

```sql
insert into public.games (
  game_slug,
  title,
  game_url,
  description,
  share_text,
  is_active,
  display_order,
  top_ranking_type,
  score_order,
  score_unit,
  score_scale,
  score_decimals,
  score_label,
  first_score_label,
  best_score_label,
  release_date
)
values (
  'ここに_game_slug',
  'ここにゲーム名',
  'https://chameleonjp.codeberg.page/ここに_game_slug/',
  'ここに短い説明',
  'ここにシェア文',
  true,
  999,
  'best',
  'desc',
  '点',
  1,
  0,
  'スコア',
  '初回スコア',
  '最高スコア',
  '2026-06-12'
)
on conflict (game_slug) do update
set
  title = excluded.title,
  game_url = excluded.game_url,
  description = excluded.description,
  share_text = excluded.share_text,
  is_active = excluded.is_active,
  display_order = excluded.display_order,
  top_ranking_type = excluded.top_ranking_type,
  score_order = excluded.score_order,
  score_unit = excluded.score_unit,
  score_scale = excluded.score_scale,
  score_decimals = excluded.score_decimals,
  score_label = excluded.score_label,
  first_score_label = excluded.first_score_label,
  best_score_label = excluded.best_score_label,
  release_date = excluded.release_date;
```

## 6. 点数ゲームの登録例

点数が高いほど良いゲームの例。

```sql
insert into public.games (
  game_slug,
  title,
  game_url,
  description,
  share_text,
  is_active,
  display_order,
  top_ranking_type,
  score_order,
  score_unit,
  score_scale,
  score_decimals,
  score_label,
  first_score_label,
  best_score_label,
  release_date
)
values (
  'sample_score_game',
  'サンプル点数ゲーム',
  'https://chameleonjp.codeberg.page/sample_score_game/',
  '点数を伸ばして競うスマホ向けミニゲームです。',
  'サンプル点数ゲーム\n点数を伸ばして競うスマホ向けミニゲームです。\nhttps://chameleonjp.codeberg.page/sample_score_game/',
  true,
  999,
  'best',
  'desc',
  '点',
  1,
  0,
  'スコア',
  '初回スコア',
  '最高スコア',
  '2026-06-12'
)
on conflict (game_slug) do update
set
  title = excluded.title,
  game_url = excluded.game_url,
  description = excluded.description,
  share_text = excluded.share_text,
  is_active = excluded.is_active,
  display_order = excluded.display_order,
  top_ranking_type = excluded.top_ranking_type,
  score_order = excluded.score_order,
  score_unit = excluded.score_unit,
  score_scale = excluded.score_scale,
  score_decimals = excluded.score_decimals,
  score_label = excluded.score_label,
  first_score_label = excluded.first_score_label,
  best_score_label = excluded.best_score_label,
  release_date = excluded.release_date;
```

## 7. タイムゲームの登録例

秒が短いほど良いゲームの例。内部スコアをミリ秒で送る場合は、`score_scale = 1000`、`score_decimals = 3` にする。

```sql
insert into public.games (
  game_slug,
  title,
  game_url,
  description,
  share_text,
  is_active,
  display_order,
  top_ranking_type,
  score_order,
  score_unit,
  score_scale,
  score_decimals,
  score_label,
  first_score_label,
  best_score_label,
  release_date
)
values (
  'sample_time_game',
  'サンプルタイムゲーム',
  'https://chameleonjp.codeberg.page/sample_time_game/',
  'クリアタイムを競うスマホ向けミニゲームです。',
  'サンプルタイムゲーム\nクリアタイムを競うスマホ向けミニゲームです。\nhttps://chameleonjp.codeberg.page/sample_time_game/',
  true,
  999,
  'best',
  'asc',
  '秒',
  1000,
  3,
  'クリアタイム',
  '初回タイム',
  'ベストタイム',
  '2026-06-12'
)
on conflict (game_slug) do update
set
  title = excluded.title,
  game_url = excluded.game_url,
  description = excluded.description,
  share_text = excluded.share_text,
  is_active = excluded.is_active,
  display_order = excluded.display_order,
  top_ranking_type = excluded.top_ranking_type,
  score_order = excluded.score_order,
  score_unit = excluded.score_unit,
  score_scale = excluded.score_scale,
  score_decimals = excluded.score_decimals,
  score_label = excluded.score_label,
  first_score_label = excluded.first_score_label,
  best_score_label = excluded.best_score_label,
  release_date = excluded.release_date;
```

## 8. RPCが存在するか確認するSQL

```sql
select
  routine_name,
  routine_type
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'submit_score',
    'get_first_try_ranking',
    'get_best_score_ranking',
    'get_game_play_stats'
  )
order by routine_name;
```

4件出るのが目安。

## 9. スコア件数を確認するSQL

`public.game_scores` を使う。`public.scores` ではない。

```sql
select
  game_slug,
  count(*) as score_count
from public.game_scores
group by game_slug
order by score_count desc, game_slug asc;
```

## 10. 1ゲームの最新スコアを確認するSQL

列名はSupabase側の実テーブルに合わせる。`updated_at` が使える場合の例。

```sql
select *
from public.game_scores
where game_slug = 'ここに_game_slug'
order by updated_at desc
limit 100;
```

もし `updated_at` がない場合は、先に列一覧を確認する。

```sql
select
  column_name,
  data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'game_scores'
order by ordinal_position;
```

## 11. 初回ランキングを確認するRPC呼び出し

```sql
select *
from public.get_first_try_ranking(
  p_game_slug := 'ここに_game_slug',
  p_limit := 100
);
```

環境によっては、名前付き引数ではなくJSON RPC経由で使う実装の場合がある。その場合はフロント側の呼び方に合わせる。

## 12. ベストランキングを確認するRPC呼び出し

```sql
select *
from public.get_best_score_ranking(
  p_game_slug := 'ここに_game_slug',
  p_limit := 100
);
```

## 13. プレイ集計を確認するRPC呼び出し

```sql
select *
from public.get_game_play_stats(
  p_game_slug := 'ここに_game_slug'
);
```

## 14. テスト名を探すSQL

ランキング登録テストで使った名前を探す時の例。

```sql
select *
from public.game_scores
where display_name in ('カメレオン', 'テスト')
order by updated_at desc
limit 100;
```

列名が違う場合は、先に `game_scores` の列一覧を確認する。

## 15. 注意点

- `public.scores` は使わない。
- `created_at` が必ずある前提でSQLを書かない。
- `game_slug` はゲーム本体の `GAME_SLUG` と完全一致させる。
- `score_order` を間違えると、ランキングが逆になる。
- 秒系ゲームでは `score_scale` と `score_decimals` を必ず設定する。
- `is_active = false` のゲームは実験場トップに出ない。
- 公開HTMLに入れるのはPublishable keyだけ。`service_role` キーは使わない。
