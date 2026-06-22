# ゲーム別スコア表示仕様

最終更新: 2026-06-22
対象: 実験場トップ `index.html` と詳細ランキング `ranking.html`

## 1. この文書の役割

この文書は、`public.games` の `score_scale` と `score_decimals` だけでは表示しきれないゲーム別スコア表示を残すための仕様書である。

通常のゲームは、共通の `formatScore(score, game)` で表示する。

```js
function formatScore(score, game) {
  const scale = Number(game.score_scale || 1);
  const decimals = Number(game.score_decimals || 0);
  const unit = game.score_unit || "点";
  const value = Number(score || 0) / scale;
  return `${value.toFixed(decimals)}${unit}`;
}
```

ただし、1つの整数スコアの中に複数の意味を詰めるゲームでは、ゲーム別の分解表示を使う。

## 2. 実装ルール

実験場トップと詳細ランキングは、同じ表示関数を使うこと。

- トップページの上位ランキング
- 詳細ランキングの初回タブ
- 詳細ランキングのベストタブ

上記すべてで同じ表示にする。

`game_slug` ごとの例外は、共通関数の先頭で分岐する。

```js
function formatScore(score, game) {
  const slug = game?.game_slug || game?.slug || "";

  if (slug === "uchikaeru") {
    return formatUchikaeruScore(score);
  }

  const scale = Number(game?.score_scale || 1);
  const decimals = Number(game?.score_decimals || 0);
  const unit = game?.score_unit || "点";
  const value = Number(score || 0) / scale;
  return `${value.toFixed(decimals)}${unit}`;
}
```

既存コードに複数の `formatScore` がある場合は、トップと詳細でロジックがずれないように統一する。

## 3. うちかえる `uchikaeru`

### 3-1. 内部スコア

`うちかえる` は、クリア済み波数を最優先で順位に反映するため、ゲーム本体から次の整数を送る。

```text
RANK_BASE = 2,000,000
rankingScore = clearWave * 2,000,000 + min(1,999,999, detailScore)
```

用語:

- `clearWave`: クリア済み波数
- `detailScore`: ゲーム中の `battleScore` をベースに、残り拠点HPボーナスや60波クリアボーナスを加えた補助点
- 送信用 `detailScore` は最大 `1,999,999` に丸める。
- `RANK_BASE = 2,000,000`

最大送信値:

```text
60 * 2,000,000 + 1,999,999 = 121,999,999
```

`122,000,000` は `61波クリア / 0点` 相当になるため仕様外である。Supabase側では `uchikaeru` の最大値を `121,999,999` とする。

例:

```text
59波クリア、detailScore 1,070,642
=> 119,070,642
=> 59波クリア / 1,070,642点

60波クリア、detailScore 2,037,256
=> detailScore は 1,999,999 に丸め
=> 121,999,999
=> 60波クリア / 1,999,999点
```

この内部値をそのまま `119,070,642点` や `121,999,999点` のように表示してはいけない。

### 3-2. 表示形式

実験場トップと詳細ランキングでは、必ず次の形式で表示する。

```text
59波クリア / 1,070,642点
60波クリア / 1,999,999点
```

実装例:

```js
const UCHIKAERU_RANK_BASE = 2000000;

function formatUchikaeruScore(score) {
  const raw = Number(score || 0);
  const wave = Math.floor(raw / UCHIKAERU_RANK_BASE);
  const detailScore = raw % UCHIKAERU_RANK_BASE;
  return `${wave}波クリア / ${detailScore.toLocaleString("ja-JP")}点`;
}
```

### 3-3. Supabase `games` 側の登録値

`public.games` には、次の考え方で登録する。

```text
game_slug: uchikaeru
title: うちかえる
top_ranking_type: best
score_order: desc
score_unit: 点
score_scale: 1
score_decimals: 0
score_label: クリア波数＋スコア
first_score_label: 初回記録
best_score_label: 最高記録
```

`score_scale = 1`、`score_decimals = 0` は、内部値を保存するための基本設定である。
表示では必ず `formatUchikaeruScore()` で分解する。

### 3-4. `uchikaeru` 登録SQL

`うちかえる` を `public.games` へ登録または更新する場合は、次を使う。

```sql
insert into public.games (
  game_slug,
  title,
  game_url,
  description,
  share_text,
  is_active,
  display_order,
  release_date,
  top_ranking_type,
  score_order,
  score_unit,
  score_scale,
  score_decimals,
  score_label,
  first_score_label,
  best_score_label
)
select
  'uchikaeru',
  'うちかえる',
  'https://chameleonjp.codeberg.page/uchikaeru/',
  '迫るカエルの大群を撃ち返し、ランダム武器を選びながら60波突破を目指す防衛ゲームです。',
  'うちかえる
迫るカエルの大群を撃ち返し、ランダム武器を選びながら60波突破を目指す防衛ゲームです。
https://chameleonjp.codeberg.page/uchikaeru/',
  true,
  coalesce(
    (select display_order from public.games where game_slug = 'uchikaeru'),
    (select coalesce(max(display_order), 0) + 1 from public.games)
  ),
  current_date,
  'best',
  'desc',
  '点',
  1,
  0,
  'クリア波数＋スコア',
  '初回記録',
  '最高記録'
on conflict (game_slug) do update
set
  title = excluded.title,
  game_url = excluded.game_url,
  description = excluded.description,
  share_text = excluded.share_text,
  is_active = excluded.is_active,
  display_order = excluded.display_order,
  release_date = excluded.release_date,
  top_ranking_type = excluded.top_ranking_type,
  score_order = excluded.score_order,
  score_unit = excluded.score_unit,
  score_scale = excluded.score_scale,
  score_decimals = excluded.score_decimals,
  score_label = excluded.score_label,
  first_score_label = excluded.first_score_label,
  best_score_label = excluded.best_score_label;
```

確認用SQL:

```sql
select
  game_slug,
  title,
  game_url,
  description,
  is_active,
  display_order,
  release_date,
  top_ranking_type,
  score_order,
  score_unit,
  score_scale,
  score_decimals,
  score_label,
  first_score_label,
  best_score_label
from public.games
where game_slug = 'uchikaeru';
```

### 3-5. 注意事項

- `score_scale` だけで `うちかえる` の表示を処理しない。
- ランキングの並び順は内部整数値の降順。
- 表示だけを分解する。
- Supabaseの保存値を分解して保存し直さない。
- `detailScore` が `0` でも、`○波クリア / 0点` と表示する。
- `detailScore` が `1,999,999` を超える場合は、ゲーム本体がランキング送信前に `1,999,999` へ丸める。
- 0波の場合も、`0波クリア / 0点` のように壊れず表示する。
- リタイア時も `submit_score` を呼び、0波リタイアでも `play_count` に計測する。
- `122,000,000` は `61波クリア / 0点` 相当になるため仕様外。
- Supabase側では `uchikaeru` の最大値を `121,999,999` とする。

### 3-6. `submit_score` 実測結果

`うちかえる` 本体の `RANK_BASE = 2,000,000` 反映後、次の送信結果を確認済み。

```text
p_score = 121,999,999 は accepted=true
p_score = 122,000,000 は score is too large
```

このため、`rankingScore` は必ず `clearWave * 2,000,000 + min(1,999,999, detailScore)` の範囲に収める。

旧仕様メモ: `RANK_BASE = 1,000,000` 時代の確認値は最新仕様の代表例として扱わない。

## 4. 今後同じ方式を使うゲーム

今後、1つの整数スコアに複数の意味を入れるゲームを追加する場合は、この文書に追記する。

例:

```text
内部スコア = 主順位要素 * 大きな基数 + 補助点
```

この方式を使う場合は、必ず次をセットで仕様化する。

1. 内部スコア式
2. 表示用の分解関数
3. 実験場トップでの表示
4. 詳細ランキングでの表示
5. Supabase `games` の登録値
6. 必要なら登録SQL

## 5. 修正後の確認項目

`uchikaeru` を実験場に反映した後は、最低限次を確認する。

- 実験場トップの `うちかえる` 上位ランキングが `○波クリア / ○○点` で表示される。
- 詳細ランキングの初回タブが `○波クリア / ○○点` で表示される。
- 詳細ランキングのベストタブが `○波クリア / ○○点` で表示される。
- 内部スコアは最大送信値 `121,999,999` 以内に収め、仕様外の `122,000,000` を送らない。
- `score_order = desc` の順位が壊れていない。
- ランキングが0件でも画面が壊れない。
