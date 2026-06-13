# 現在のゲーム一覧・現行コード注意

最終更新: 2026-06-12
対象: カメレオンJPの実験場に出すゲーム台帳

## 1. この文書の役割

この文書は、Claude Codeがゲーム一覧を扱う時に、`game_slug`、表示名、スコア設定、表示順を間違えないようにするための確認表である。

重要な注意として、実験場トップと詳細ランキングの実コードは、時期によって次の2パターンがある。

1. Supabase `public.games` からゲーム一覧を取得する方式
2. `index.html` や `ranking.html` 内の `GAMES` 固定配列を使う方式

新規改修の理想は `public.games` 中心だが、現行コードに `GAMES` 固定配列が残っている場合は、それを無視してはいけない。修正前に実コードを確認し、必要なら `public.games` と `GAMES` の両方を揃える。

## 2. 最新方針

今後の正本は、原則としてSupabase `public.games` に寄せる。

ただし、公開中の `index.html` や `ranking.html` に固定配列が残っている場合、Supabaseだけ更新しても実験場や詳細ランキングに出ない可能性がある。

その場合は、次の順で対応する。

1. 現行コードが `public.games` 方式か `GAMES` 固定配列方式か確認する。
2. `GAMES` 固定配列方式なら、Supabase登録だけでなく固定配列も更新する。
3. 可能なら、固定配列を減らして `public.games` 中心へ寄せる。
4. ただし、表示が壊れる大規模変更は一気に行わず、実験場トップと詳細ランキングを同時に確認する。

## 3. 現在の登録・表示基準一覧

2026-06-12時点で、このプロジェクト内の仕様・会話履歴から扱うゲーム一覧は次の通り。

| 表示順 | game_slug | title | score_order | score_unit | score_scale | score_decimals | top_ranking_type | 備考 |
|---:|---|---|---|---|---:|---:|---|---|
| 1 | `torani_yasashiku` | 虎に優しく | `desc` | 点 | 1 | 0 | `best` | 60秒ミニゲーム |
| 2 | `nayuta_no_himatsubushi` | 暇つぶし | `desc` | 点 | 1 | 0 | `best` | ブロック崩し系 |
| 3 | `iroate` | イロアテ | `asc` | 秒 | 100 | 2 | `best` | 色と文字の判定 |
| 4 | `yume_wo_mitandakedosa` | 夢を見たんだけどさ | `desc` | 点 | 1 | 0 | `best` | 点数ゲーム |
| 5 | `suiteki_catch` | 水滴キャッチ | `desc` | 点 | 1 | 0 | `first` | 初回ランキング重視 |
| 6 | `juden_ga` | 充電ｶﾞｯ | `desc` | 点 | 1 | 0 | `best` | 10回勝負 |
| 7 | `anatano_1byou` | あなたの1秒って | `asc` | 秒 | 100 | 2 | `best` | 誤差が小さいほど良い |
| 8 | `jouzuni_kakerukana` | 上手に描けるかな？ | `desc` | % | 1 | 0 | `best` | 達成率ゲーム |
| 9 | `bekutoru` | ベク取る | `asc` | 秒 | 1000 | 3 | `best` | クリアタイム。終了時自動送信 |
| 10 | `songen_wo_kakeyouka` | 尊厳を賭けようか | `desc` | 点 | 1 | 0 | `best` | 1P対CPUの戦闘ゲーム |
| 11 | `hito_wo_yurusuna` | ヒトを許すな | `desc` | 点 | 1 | 0 | `best` | タワーディフェンス型ゲーム |

## 4. URLの基本形

各ゲームのURLは、原則として次の形にする。

```text
https://chameleonjp.codeberg.page/<game_slug>/
```

例:

```text
https://chameleonjp.codeberg.page/bekutoru/
https://chameleonjp.codeberg.page/hito_wo_yurusuna/
```

実験場トップは次。

```text
https://chameleonjp.codeberg.page/chameleonjp_lab/
```

詳細ランキングは次。

```text
https://chameleonjp.codeberg.page/chameleonjp_lab/ranking.html?game=<game_slug>
```

## 5. `public.games` 登録時の共通値

ゲーム登録時は、最低限次を入れる。

```text
game_slug
title
game_url
description
share_text
is_active
display_order
top_ranking_type
score_order
score_unit
score_scale
score_decimals
score_label
first_score_label
best_score_label
release_date
```

`is_active = true` のゲームだけ実験場トップに出す。

## 6. 固定配列 `GAMES` が残っている場合の項目対応

現行コードに `GAMES` 固定配列がある場合、次のような項目名が使われていることがある。

| 固定配列側 | Supabase `public.games` 側 |
|---|---|
| `slug` | `game_slug` |
| `title` | `title` |
| `url` | `game_url` |
| `description` | `description` |
| `shareText` | `share_text` |
| `topRanking` | `top_ranking_type` |
| `scoreOrder` | `score_order` |
| `scoreUnit` | `score_unit` |
| `scoreScale` | `score_scale` |
| `scoreDecimals` | `score_decimals` |

固定配列方式を直す時は、この対応を使って `public.games` と値を揃える。

## 7. 特に間違えやすいゲーム

### ベク取る

`bekutoru` はタイムゲームなので、スコアは小さいほど良い。

```text
score_order = asc
score_unit = 秒
score_scale = 1000
score_decimals = 3
top_ranking_type = best
```

ゲーム終了時に自動送信する。結果画面に任意のランキング登録ボタンは置かない。

### 水滴キャッチ

`suiteki_catch` はトップ表示が初回ランキング。

```text
top_ranking_type = first
```

### あなたの1秒って / イロアテ

どちらも小さいほど良い秒系ゲーム。

```text
score_order = asc
score_unit = 秒
score_scale = 100
score_decimals = 2
```

### ヒトを許すな

`hito_wo_yurusuna` は、ランキング表示で「クリア波数」とスコアを併記する仕様がある。通常の点数表示だけにすると情報が足りない場合がある。

## 8. 新規ゲーム追加時の注意

新規ゲームを追加する時は、`public.games` に登録するだけでなく、現行コードを見て固定配列が残っていないか確認する。

もし `index.html` と `ranking.html` の両方に `GAMES` がある場合は、両方を揃える。

片方だけ追加すると、次のような不具合が出る。

- 実験場トップには出るが、詳細ランキングが開けない。
- 詳細ランキングは開けるが、トップにカードが出ない。
- スコア単位がトップと詳細で違う。
- `score_order` がずれて、順位が逆になる。

## 9. GitHub更新方針

このリポジトリは、Claude Codeに読ませる仕様置き場として使う。

GitHubアカウント凍結リスクを避けるため、細かい更新を何度も繰り返さない。できるだけ内容を手元で固めてから、少ない回数で更新する。

ChatGPTのGitHub連携では、1ファイル作成・更新ごとにコミットされる場合がある。そのため、多数の小さな修正を連続で行う作業には向かない。

今後の望ましい進め方は次の通り。

1. まずチャット内で内容を固める。
2. 必要なら1つの大きめのMarkdownにまとめる。
3. まとまってからGitHubへ反映する。
4. 反映後は、必要最小限の確認だけ行う。

## 10. Claude Codeへの確認指示

Claude Codeに実験場やランキングを修正させる時は、次を必ず伝える。

```text
このリポジトリの CLAUDE.md と docs/chameleonjp-lab/ を読んでください。
実験場トップと詳細ランキングの現行コードに GAMES 固定配列が残っているか確認してください。
残っている場合は、Supabase public.games だけを更新して完了扱いにしないでください。
public.games と GAMES の値がずれないようにしてください。
ランキングは public.game_scores とRPCを使い、public.scores は使わないでください。
ゲーム側は終了時に submit_score で自動送信してください。
```
