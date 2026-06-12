# Supabaseランキング連携 仕様

最終更新: 2026-06-12
対象: 実験場トップ / 詳細ランキング / 各ゲームのスコア送信

## 1. この文書の役割

この文書は、カメレオンJPのランキング連携がどう動くべきかを説明する。

Claude Codeがランキングまわりを直す時は、まずこの文書を読むこと。

## 2. 接続情報

ブラウザ側で使う値は次の通り。

```js
const SUPABASE_URL = "https://mlpnjgezrnhdxsxolyzj.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_drzcy0v97knU6FgjqSgBHw_0A9XPdFM";
```

このPublishable keyは公開HTMLに入れてよい前提で共有されている。

ただし、`service_role` キーは絶対に公開HTMLへ入れない。

## 3. 使用するテーブルとRPC

| 用途 | 名前 |
|---|---|
| ゲーム台帳 | `public.games` |
| スコア保存 | `public.game_scores` |
| スコア送信 | `submit_score` |
| 初回ランキング | `get_first_try_ranking` |
| ベストランキング | `get_best_score_ranking` |
| プレイ集計 | `get_game_play_stats` |

重要: `public.scores` は使わない。過去に `public.scores` を読みに行って失敗した履歴がある。

## 4. 全体の流れ

ランキング連携は、次の流れで動く。

1. ゲーム側でプレイヤー名を入力する。
2. ゲーム終了時に、ゲーム側から `submit_score` を呼ぶ。
3. Supabase側で `game_scores` に記録する。
4. 実験場トップが `get_game_play_stats` で合計プレイ回数と参加人数を読む。
5. 実験場トップが `get_first_try_ranking` または `get_best_score_ranking` で上位3件を読む。
6. 詳細ランキングが同じRPCで最大100件を読む。

## 5. `public.games` の役割

`public.games` は、ゲームの表示設定を持つ。

主な列は次の通り。

| 列 | 例 | 内容 |
|---|---|---|
| `game_slug` | `bekutoru` | ゲームを識別する値 |
| `title` | `ベク取る` | 表示名 |
| `game_url` | `https://.../bekutoru/` | ゲームURL |
| `description` | `可愛い🐼を逃がしてあげよう！` | 説明 |
| `share_text` | `ベク取る...` | シェア文 |
| `is_active` | `true` | 表示するか |
| `display_order` | `9` | 実験場での並び順 |
| `top_ranking_type` | `best` | トップで出すランキング |
| `score_order` | `asc` | 良いスコアの方向 |
| `score_unit` | `秒` | 表示単位 |
| `score_scale` | `1000` | 表示変換倍率 |
| `score_decimals` | `3` | 小数桁 |
| `score_label` | `クリアタイム` | 通常表示名 |
| `first_score_label` | `初回タイム` | 初回表示名 |
| `best_score_label` | `ベストタイム` | ベスト表示名 |

## 6. `public.game_scores` の役割

`public.game_scores` は、実際のスコアを保存する。

このテーブルの正確な列はSupabase側で確認すること。ただし、このプロジェクトでは少なくとも次の考え方で使う。

| 情報 | 内容 |
|---|---|
| ゲームslug | どのゲームの記録か |
| プレイヤー名 | ランキングに出す名前 |
| スコア | 内部整数スコア |
| クライアントバージョン | どの版のゲームから送られたか |
| 更新日時 | ベスト更新や表示補助に使う |

過去のエラーから、`created_at` が存在する前提でSQLを書くのは危険。必要ならSupabaseの列一覧を確認してから使う。

## 7. スコア送信 `submit_score`

ゲーム側は、ゲーム終了時に `submit_score` を呼ぶ。

基本の引数名は次の通り。

```js
await supabase.rpc("submit_score", {
  p_display_name: displayName,
  p_game_slug: GAME_SLUG,
  p_score: score,
  p_client_version: CLIENT_VERSION
});
```

`score` は内部整数で送る。

例:

| ゲーム種別 | 表示 | 送信する内部整数 |
|---|---:|---:|
| 点数ゲーム | `12345点` | `12345` |
| 秒、小数2桁 | `34.15秒` | `3415` |
| 秒、小数3桁 | `1.234秒` | `1234` |
| パーセント | `87%` | `87` |

## 8. 初回ランキング `get_first_try_ranking`

初回ランキングは、プレイヤーごとの最初の記録を使う。

基本の呼び方は次の通り。

```js
await supabase.rpc("get_first_try_ranking", {
  p_game_slug: gameSlug,
  p_limit: 100
});
```

トップページでは `p_limit: 3`、詳細ランキングでは `p_limit: 100` を使う。

## 9. ベストランキング `get_best_score_ranking`

ベストランキングは、プレイヤーごとの一番良い記録を使う。

基本の呼び方は次の通り。

```js
await supabase.rpc("get_best_score_ranking", {
  p_game_slug: gameSlug,
  p_limit: 100
});
```

良いスコアの方向は、`public.games.score_order` に従う。

| `score_order` | 意味 |
|---|---|
| `desc` | 大きいほど良い |
| `asc` | 小さいほど良い |

## 10. プレイ集計 `get_game_play_stats`

合計プレイ回数と参加人数は、`get_game_play_stats` で取得する。

基本の呼び方は次の通り。

```js
await supabase.rpc("get_game_play_stats", {
  p_game_slug: gameSlug
});
```

期待する表示は次の通り。

```text
合計プレイ回数: n回
参加人数: n人
```

戻り値の列名は、実際のRPCに合わせる。フロント側では、候補名を吸収できるようにしておくと安全。

例:

```js
const totalPlays = row.total_plays ?? row.play_count ?? row.total_count ?? 0;
const playerCount = row.player_count ?? row.unique_players ?? row.user_count ?? 0;
```

## 11. 同率順位

同率順位はSupabase側で作る。

RPCは `rank_no` を返す。フロント側は `rank_no` をそのまま表示する。

フロント側で `index + 1` を順位として使ってはいけない。

正しい表示例:

```text
1位  Aさん  100点
1位  Bさん  100点
3位  Cさん   90点
```

## 12. RESTフォールバック

Supabase JavaScriptクライアントが読み込めない場合、RESTでRPCを呼んでもよい。

この場合、必ず次のヘッダーを入れる。

```text
apikey: <SUPABASE_PUBLISHABLE_KEY>
Authorization: Bearer <SUPABASE_PUBLISHABLE_KEY>
Content-Type: application/json
```

RPCのURL例:

```text
POST https://mlpnjgezrnhdxsxolyzj.supabase.co/rest/v1/rpc/get_best_score_ranking
```

Body例:

```json
{
  "p_game_slug": "bekutoru",
  "p_limit": 100
}
```

## 13. エラー時の扱い

ランキング連携で通信エラーが出ても、ゲームそのものを壊してはいけない。

ゲーム側では、スコア送信に失敗した場合、結果画面に次のような文言を出す。

```text
ランキング送信に失敗しました。通信状態を確認してください。
```

実験場トップや詳細ランキングでは、該当箇所だけ次のように出す。

```text
ランキングを取得できませんでした。
```

ページ全体を真っ白にしてはいけない。

## 14. よくある失敗

- `public.scores` を読みに行く。
- `created_at` がある前提でSQLを書く。
- `Authorization: Bearer` を付け忘れる。
- `apikey` を付け忘れる。
- `score_scale` を使わず秒表示が壊れる。
- `rank_no` を使わず、同率順位が壊れる。
- ゲーム終了時ではなく、結果画面の任意ボタンで送信する。
- 二重送信防止を入れず、1回の結果が何度も送られる。

## 15. 修正後の確認

Supabaseまわりを直した後は、最低限次を確認する。

1. `public.games` からゲーム一覧を取得できる。
2. `submit_score` でスコアを送れる。
3. `get_game_play_stats` で集計を取れる。
4. `get_first_try_ranking` で初回ランキングを取れる。
5. `get_best_score_ranking` でベストランキングを取れる。
6. 同率順位が `rank_no` 通りに出る。
7. 送信失敗時もゲーム結果画面が壊れない。
