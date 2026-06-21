# ゲーム別スコア表示仕様

最終更新: 2026-06-21
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

`うちかえる` は、到達・クリアした波数を最優先で順位に反映するため、ゲーム本体から次の整数を送る。

```text
rankingScore = clearWave * 100000000 + battleScore
```

例:

```text
60波クリア、battleScore 2,037,256
=> 60002037256
```

この内部値をそのまま `60002037256点` のように表示してはいけない。

### 3-2. 表示形式

実験場トップと詳細ランキングでは、必ず次の形式で表示する。

```text
60波クリア / 2,037,256点
```

実装例:

```js
function formatUchikaeruScore(score) {
  const raw = Number(score || 0);
  const wave = Math.floor(raw / 100000000);
  const battleScore = raw % 100000000;
  return `${wave}波クリア / ${battleScore.toLocaleString("ja-JP")}点`;
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

### 3-4. 注意事項

- `score_scale` だけで `うちかえる` の表示を処理しようとしてはいけない。
- ランキングの並び順は、内部整数値の降順でよい。
- 表示だけを分解する。
- Supabaseの保存値を分解して保存し直さない。
- `battleScore` が0でも、`○波クリア / 0点` と表示する。
- 0波の場合も、`0波クリア / 0点` のように壊れず表示する。

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

## 5. 修正後の確認項目

`uchikaeru` を実験場に反映した後は、最低限次を確認する。

- 実験場トップの `うちかえる` 上位ランキングが `○波クリア / ○○点` で表示される。
- 詳細ランキングの初回タブが `○波クリア / ○○点` で表示される。
- 詳細ランキングのベストタブが `○波クリア / ○○点` で表示される。
- 内部スコア `60002037256` のような巨大な数値が、そのまま画面に出ない。
- `score_order = desc` の順位が壊れていない。
- ランキングが0件でも画面が壊れない。
