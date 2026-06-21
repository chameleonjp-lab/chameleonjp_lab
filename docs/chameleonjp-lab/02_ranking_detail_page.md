# 詳細ランキング `ranking.html` 仕様

最終更新: 2026-06-21
対象: `ranking.html?game=game_slug`

## 1. ページの役割

詳細ランキングページは、1つのゲームについて、初回ランキングとベストランキングを詳しく見せるページである。

実験場トップの各ゲームカードから、次の形式で遷移する。

```text
ranking.html?game=game_slug
```

例:

```text
ranking.html?game=bekutoru
ranking.html?game=hito_wo_yurusuna
```

## 2. ゲーム情報の決め方

URLの `game` パラメータを読む。

```js
const params = new URLSearchParams(location.search);
const gameSlug = params.get("game");
```

その `gameSlug` を使って、Supabase `public.games` からゲーム情報を取得する。

取得条件は次の通り。

```text
game_slug = <gameSlug>
is_active = true
```

固定配列 `GAMES` だけでゲーム情報を決めてはいけない。
既存コードに固定配列が残っている場合は、通信失敗時のフォールバックとして扱う。

## 3. 表示する主な情報

詳細ランキングには、最低限次を表示する。

| 表示 | 内容 |
|---|---|
| ゲーム名 | `games.title` |
| 説明 | `games.description` |
| 合計プレイ回数 | `get_game_play_stats` |
| 参加人数 | `get_game_play_stats` |
| ゲームで遊ぶ | `games.game_url` |
| シェア | `games.share_text` と `games.game_url` |
| 初回ランキング | `get_first_try_ranking` |
| ベストランキング | `get_best_score_ranking` |
| 実験場へ戻る | `./` または実験場トップURL |

## 4. タブ仕様

詳細ランキングでは、初回ランキングとベストランキングをタブで切り替える。

| タブ | 内容 | RPC |
|---|---|---|
| 初回 | 初回スコアだけで順位を出す | `get_first_try_ranking` |
| ベスト | プレイヤーごとの最高記録で順位を出す | `get_best_score_ranking` |

初期表示は、`games.top_ranking_type` に合わせる。

| `top_ranking_type` | 初期表示 |
|---|---|
| `first` | 初回タブ |
| `best` | ベストタブ |
| 未設定 | ベストタブ |

## 5. 取得件数

詳細ランキングでは、最大100件を取得する。

```js
const DETAIL_LIMIT = 100;
```

100件以上ある場合でも、まずは100件でよい。無限スクロールやページ送りは必須ではない。

## 6. スコア表示

Supabaseには整数スコアを保存する。表示時は、`score_scale` と `score_decimals` を使って変換する。
ただし、`うちかえる` のように内部整数を分解して表示するゲームは、`docs/chameleonjp-lab/07_game_specific_score_display.md` のゲーム別ルールを優先する。

```js
function formatScore(score, game) {
  const scale = Number(game.score_scale || 1);
  const decimals = Number(game.score_decimals || 0);
  const unit = game.score_unit || "点";
  const value = Number(score || 0) / scale;
  return `${value.toFixed(decimals)}${unit}`;
}
```

例:

| 内部スコア | `score_scale` | `score_decimals` | 表示 |
|---:|---:|---:|---|
| 12345 | 1 | 0 | `12345点` |
| 3415 | 100 | 2 | `34.15秒` |
| 1234 | 1000 | 3 | `1.234秒` |

## 7. 順位表示

RPCが返す `rank_no` をそのまま表示する。

これにより、同点や同タイムの場合に次のような順位を出せる。

```text
1位
1位
3位
```

フロント側で単純に `index + 1` を表示してはいけない。同率順位が壊れるため。

## 8. 期待するRPC戻り値

ランキングRPCは、最低限次のような列を返す前提で扱う。

| 列 | 内容 |
|---|---|
| `rank_no` | 順位 |
| `display_name` | プレイヤー名 |
| `score` | 内部整数スコア |
| `updated_at` | 更新日時。あれば表示補助に使う |

実装によって `created_at` がない場合がある。`created_at` を当然あるものとして扱ってはいけない。

## 9. 存在しないゲームの場合

次の場合は、壊れた空画面にせず、分かる文言を出す。

- `game` パラメータがない。
- `public.games` に該当ゲームがない。
- `is_active = false` になっている。
- Supabase接続に失敗した。

表示例:

```text
ランキング対象のゲームが見つかりませんでした。
実験場トップから開き直してください。
```

その下に、実験場トップへ戻るボタンを置く。

## 10. シェア仕様

シェアは、実験場トップと同じ考え方にする。

1. Web Share APIを試す。
2. 使えない場合はクリップボードコピーにする。
3. URLは必ず入れる。
4. コピー成功・失敗を画面に出す。

共有文は `games.share_text` を優先する。なければ `title`、`description`、`game_url` から作る。

## 11. データ取得の基本順

推奨する取得順は次の通り。

1. URLから `gameSlug` を取得する。
2. Supabase接続値を確認する。
3. `public.games` からゲーム情報を1件取得する。
4. `get_game_play_stats` で集計を取得する。
5. `get_first_try_ranking` で初回ランキングを取得する。
6. `get_best_score_ranking` でベストランキングを取得する。
7. タブと表示を描画する。

## 12. RESTフォールバック

Supabase JavaScriptクライアントを使わずにRESTで呼ぶ場合は、必ず次のヘッダーを入れる。

```text
apikey: <SUPABASE_PUBLISHABLE_KEY>
Authorization: Bearer <SUPABASE_PUBLISHABLE_KEY>
Content-Type: application/json
```

`apikey` だけでなく、`Authorization: Bearer` も必要。

## 13. やってはいけないこと

- 固定配列だけでゲームを決める。
- `game` パラメータなしで適当なゲームを表示する。
- `rank_no` を無視して `index + 1` を表示する。
- `created_at` が必ずある前提で並べる。
- ランキング0件をエラー扱いにする。
- トップページと違うSupabase keyを入れる。
- `service_role` キーを入れる。

## 14. 修正後の確認項目

修正後は、最低限次を見る。

- `ranking.html?game=torani_yasashiku` のように開ける。
- 存在しないslugでは、エラー文と戻るボタンが出る。
- 初回タブとベストタブが切り替わる。
- 同率順位がRPCの `rank_no` 通りに出る。
- 秒系ゲームが小数で表示される。
- 100件まで表示できる。
- スマホ幅で横スクロールが出ない。
