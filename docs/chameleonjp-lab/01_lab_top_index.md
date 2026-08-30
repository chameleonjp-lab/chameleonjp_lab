# 実験場トップ `index.html` 仕様

最終更新: 2026-06-21
対象: カメレオンJPの実験場トップページ

## 1. ページの役割

実験場トップは、公開中のゲームを一覧で見せるページである。

このページでは、ゲームを選ぶだけでなく、各ゲームの説明、合計プレイ回数、参加人数、上位ランキング、シェア、詳細ランキングへの導線をまとめる。

ユーザー向け公開URLは次を前提にする。

```text
https://chameleonjp-lab.github.io/chameleonjp_lab/
```

## 2. 表示ゲームの取得元

最新方針では、表示ゲームの正はSupabase `public.games` である。

取得条件は次の通り。

```text
is_active = true
order by display_order asc
```

必要な列は次を読む。

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

古いコードでは `GAMES` 固定配列を使っていた時期がある。新規改修では、固定配列だけを正にしてはいけない。

## 3. Supabase接続値

ページ内では次の値を使う。

```js
const SUPABASE_URL = "https://mlpnjgezrnhdxsxolyzj.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_drzcy0v97knU6FgjqSgBHw_0A9XPdFM";
```

Publishable keyは公開HTMLに入れてよい。ただし、`service_role` キーは絶対に使わない。

## 4. 基本画面構成

トップページには、最低限次の要素を置く。

| 要素 | 内容 |
|---|---|
| ヘッダー | `カメレオンJPの実験場` |
| 説明文 | スマホで遊べるミニゲーム置き場であることを説明 |
| 並び替え | 追加順、プレイ回数、参加人数で切り替え |
| ゲームカード一覧 | Supabase `games` から作る |
| 各カードの開閉 | タイトルを押すと詳細を開く |
| supporter枠 | カメレオン診断、λアルク教λなど |

## 5. ゲームカードの仕様

各ゲームはカードで表示する。

閉じている時は、ゲーム名、短い説明、公開状態が分かる程度にする。開いた時は、次の情報を出す。

| 表示 | 内容 |
|---|---|
| 説明 | `description` |
| 合計プレイ回数 | `get_game_play_stats` の結果 |
| 参加人数 | `get_game_play_stats` の結果 |
| ランキング上位 | `top_ranking_type` に従って取得 |
| 遊ぶボタン | `game_url` へ移動 |
| シェアボタン | `share_text` と `game_url` を共有 |
| 詳細ランキング | `ranking.html?game=game_slug` へ移動 |

## 6. ランキング表示

トップページでは、各ゲームの上位3件を表示する。

どちらのランキングを出すかは `top_ranking_type` で決める。

| `top_ranking_type` | 使うRPC |
|---|---|
| `first` | `get_first_try_ranking` |
| `best` | `get_best_score_ranking` |
| 未設定 | `get_best_score_ranking` と同じ扱い |

ランキングが0件の時は、エラー扱いにしない。`coming soon` や `まだ記録がありません` のように表示する。

スコア表示は通常 `score_scale` と `score_decimals` を使う。ただし、`うちかえる` のように内部整数を分解して表示するゲームは、`docs/chameleonjp-lab/07_game_specific_score_display.md` のゲーム別ルールを優先する。

## 7. 集計表示

合計プレイ回数と参加人数は、`get_game_play_stats` から取得する。

表示例は次の通り。

```text
合計プレイ回数: 123回
参加人数: 45人
```

取得に失敗した時は、ページ全体を壊さない。該当カードだけ `集計を取得できませんでした` のように出す。

## 8. 並び替え

並び替えは、最低限次を持つ。

| 並び替え | 内容 |
|---|---|
| 追加順 | `display_order asc` |
| プレイ回数の多い順 | 集計取得後、合計プレイ回数の多い順 |
| プレイ回数の少ない順 | 集計取得後、合計プレイ回数の少ない順 |
| 参加人数の多い順 | 集計取得後、参加人数の多い順 |
| 参加人数の少ない順 | 集計取得後、参加人数の少ない順 |

集計が未取得のゲームは、並び替え時に0扱いにしてよい。ただし、通信失敗と0件は表示上で区別できるとよい。

## 9. シェア仕様

シェアボタンでは、まずブラウザの共有機能を試す。使えない時はクリップボードコピーに切り替える。

共有文は次の優先順位で作る。

1. `share_text` があれば、それを使う。
2. なければ `title` と `description` と `game_url` から作る。
3. URLは必ず含める。

## 10. スマホ操作対策

トップページでは、ゲーム本体ほど強い操作抑制は不要だが、スマホ閲覧で邪魔になる動作は抑える。

必ず守ること。

- 横スクロールを出さない。
- `touch-action: manipulation;` をボタンやリンクに付ける。
- 通常テキストの長押し選択を抑える。
- ただし、リンク長押しは必要に応じて使えるようにする。
- 小さい画面ではカード幅と余白を狭める。

## 11. データ取得の基本順

推奨する取得順は次の通り。

1. Supabase接続値を確認する。
2. `public.games` から `is_active = true` のゲームを取得する。
3. 取得したゲームを `display_order` で並べる。
4. カードの土台を描画する。
5. 各カードの集計を取得する。
6. カードが開かれた時にランキングを取得する。

初期表示で全ゲームのランキングを一度に取ると重くなりやすい。開いたカードだけランキングを取る作りが安全。

## 12. RESTフォールバック

Supabase JavaScriptクライアントが使えない時のために、RESTフォールバックを持ってよい。

ただし、RESTで呼ぶ場合は必ず次のヘッダーを付ける。

```text
apikey: <SUPABASE_PUBLISHABLE_KEY>
Authorization: Bearer <SUPABASE_PUBLISHABLE_KEY>
Content-Type: application/json
```

Bearerを忘れると、キーを入れていても取得できない場合がある。

## 13. やってはいけないこと

- 固定配列 `GAMES` だけを正にする。
- Supabase `public.games` に登録されたゲームを無視する。
- `is_active = false` のゲームを表示する。
- 詳細ランキングURLを固定で書き、slugとずらす。
- 集計取得失敗でページ全体を真っ白にする。
- ranking.html側とゲーム一覧がずれる状態にする。

## 14. 修正後の確認項目

修正後は、最低限次を見る。

- `public.games` の登録ゲームが表示される。
- `is_active = false` は表示されない。
- 表示順が `display_order` と一致する。
- 遊ぶボタンが `game_url` に飛ぶ。
- 詳細ランキングが `ranking.html?game=slug` で開く。
- 上位ランキングが3件まで出る。
- ランキング0件でも壊れない。
- iPhone SE級の横幅で横スクロールが出ない。
