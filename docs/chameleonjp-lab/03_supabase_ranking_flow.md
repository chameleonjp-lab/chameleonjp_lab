# Supabaseランキング連携 仕様

最終更新: 2026-08-29  
対象: 実験場トップ、詳細ランキング、各ゲームの開始記録とスコア送信

> ランキング連携の最上位規約は`11_ranking_integration_standard.md`です。  
> この文書は、現在のSupabase構成と実装時の確認方法を説明します。古いゲームの互換処理を、新規ゲーム向けの完成形と判断してはいけません。

## 1. 接続情報

ブラウザ側では、公開用の値だけを使います。

```js
const SUPABASE_URL = "https://mlpnjgezrnhdxsxolyzj.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_drzcy0v97knU6FgjqSgBHw_0A9XPdFM";
```

Publishable keyは公開クライアント用です。`service_role`キー、管理用トークン、個人のアクセストークンをゲームへ入れてはいけません。

`ranking-manifest.json`には、Supabaseのキーを入れません。

## 2. 現在の主な表

| 用途 | 名前 | 注意 |
|---|---|---|
| ゲーム台帳 | `public.games` | 実験場と共通ランキングの本番登録値 |
| プレイヤー | `public.players` | 共通方式の名前単位の行 |
| 集約スコア | `public.game_scores` | 初回、ベスト、プレイ回数 |
| 各送信履歴 | `public.score_runs` | 共通`submit_score`の送信履歴 |
| プレイイベント | `public.game_play_events` | ゲームごとの開始・終了記録に利用される |
| サイノメ専用 | `private.sainome_v2_*` | 全ゲーム共通として使わない |

`public.scores`は使いません。

## 3. 現在の主なRPCと扱い

| RPC | 現在の用途 | 新規ゲームでの扱い |
|---|---|---|
| `submit_score` | 共通の旧スコア送信 | 再送識別子がないため完成形として使わない |
| `submit_score_once` | サイノメの受付番号付き送信 | サイノメ専用。全ゲームへ流用しない |
| `record_game_play` | 旧プレイ記録 | `play_id`がないため新規開始記録に使わない |
| `record_play_event` | 一部ゲームの結果イベント | 結果種別・波数の制約があり、全ゲームの開始記録には使わない |
| `get_first_try_ranking` | 初回ランキング取得 | 共通利用 |
| `get_best_score_ranking` | ベストランキング取得 | 共通利用 |
| `get_game_play_stats` | プレイ回数・参加人数取得 | 保存元の意味を確認して利用 |
| `check_player_name` | 名前確認 | 現在の共通名前上限の確認に利用可能 |

RPC名だけで用途を判断せず、本番の関数定義、引数、戻り値、権限を確認します。

## 4. 現行RPCの重要な制限

### 4.1 `submit_score`

現在の引数は次です。

```text
submit_score(
  p_display_name text,
  p_game_slug text,
  p_score integer,
  p_client_version text
)
```

`submission_id`を受け取りません。

そのため、Supabaseが登録を終えた直後に通信が切れ、ブラウザが成功応答を受け取れなかった場合、同じ結果を再送すると別の送信として保存される可能性があります。送信中フラグでは、この場合を防げません。

新規ゲームは、`submit_score_idempotent_v1`を使い、同じ`submission_id`を1件として扱います。開始は`start_game_play_v1`、終了は`finish_game_play_v1`を使います。

### 4.2 `submit_score_once`

名前は共通に見えますが、現在の関数は次へ固定されています。

- `sainome_300_seconds`
- サイノメの特定`client_version`
- サイノメの特定契約版
- `private.sainome_v2_plays`
- `private.sainome_v2_scores`

新規ゲームから呼んではいけません。全ゲーム向けにする場合は、別名と別契約で設計し、サイノメ専用表への依存をなくします。

### 4.3 `record_game_play`

現在の`record_game_play`は`play_id`を受け取りません。同じ開始処理を再送した時に、同じ1回として確認できません。

新規ゲームでは開始要求ごとに`start_id`を作り、`start_game_play_v1`から返された`play_id`を1件のプレイとして扱います。同じ`start_id`の再送には同じ`play_id`が返ります。

### 4.4 `record_play_event`

`record_play_event`には`play_id`があり、同じ値の重複を無視できます。ただし、現在は次の前提があります。

- 結果種別が`game_over`、`clear`、`retire`
- 到達波数が1から30
- 終了時のスコアを持つ

したがって、すべてのゲームの「開始した時に1回数える」共通処理としては使いません。

### 4.5 `get_game_play_stats`

現在の`get_game_play_stats`は、対象`game_slug`に`game_play_events`が1件でもあればイベント件数を使い、1件もなければ`game_scores.play_count`を合計します。

このため、イベントを途中から導入すると、同じ「プレイ回数」でも保存元と意味が変わる可能性があります。

新規ゲームでは、開始時の同一送信対策付きイベントを正とし、途中で集計元を切り替えません。既存ゲームで切り替える場合は、過去件数の扱いと切替日時を移行文書へ残します。

## 5. `public.games`

`public.games`は、実験場と共通ランキングの本番登録値です。

主な列は次です。

| 列 | 内容 |
|---|---|
| `game_slug` | ランキング保存単位の識別子 |
| `title` | 表示名 |
| `game_url` | クエリなしの正式URL |
| `description` | 実験場の説明 |
| `share_text` | シェア用の文 |
| `score_order` | `asc`または`desc` |
| `score_unit` | `点`、`秒`、`%`など |
| `is_active` | 実験場表示と共通送信受付の有効状態 |
| `release_date` | 公開日 |
| `score_scale` | 内部整数を表示値へ直す倍率 |
| `score_decimals` | 0から3の表示小数桁 |
| `score_label` | 通常スコアの表示名 |
| `first_score_label` | 初回ランキングの表示名 |
| `best_score_label` | ベストランキングの表示名 |
| `display_order` | 実験場の表示順 |
| `top_ranking_type` | `first`または`best` |
| `submission_mode` | `shared`または`verified` |

### 5.1 現在の制約

現在、データベースで確認できる主な制約は次です。

- `game_slug`は主キー。
- `score_order`は`asc`または`desc`。
- `score_scale`は1以上。
- `score_decimals`は0から3。
- `top_ranking_type`は`first`または`best`。
- `submission_mode`は`shared`または`verified`。

次は、現在データベースの一意制約だけでは防げません。

- `display_order`の重複
- `game_url`の重複
- 正式URLにクエリやハッシュが入ること
- `game_slug`の表記規則
- マニフェストと登録値の食い違い

そのため、公開前のSQL確認を必須とします。

## 6. 登録前の確認SQL

### 6.1 対象ゲーム

```sql
select
  game_slug,
  title,
  game_url,
  is_active,
  display_order,
  submission_mode,
  top_ranking_type,
  score_order,
  score_unit,
  score_scale,
  score_decimals,
  score_label,
  first_score_label,
  best_score_label
from public.games
where game_slug = '対象slug';
```

### 6.2 有効な表示順の重複

```sql
select
  display_order,
  count(*) as row_count,
  array_agg(game_slug order by game_slug) as game_slugs
from public.games
where is_active = true
  and display_order is not null
group by display_order
having count(*) > 1
order by display_order;
```

0行であることを確認します。

### 6.3 URLの重複

一つの作品に複数モードがある場合は同じURLを意図的に使えます。結果を見て、同じ作品か誤登録かを判断します。

```sql
select
  game_url,
  count(*) as row_count,
  array_agg(game_slug order by game_slug) as game_slugs
from public.games
group by game_url
having count(*) > 1
order by game_url;
```

### 6.4 旧slugの残存

```sql
select
  game_slug,
  title,
  is_active,
  display_order
from public.games
where game_slug like '対象ゲームの接頭辞%';
```

マニフェストにない旧slugが残っていないか確認します。記録がある旧slugは、調査せず削除しません。

### 6.5 RPCの存在

```sql
select
  p.oid::regprocedure::text as signature
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'private')
  and p.proname in (
    '開始記録RPC名',
    'スコア送信RPC名',
    'get_first_try_ranking',
    'get_best_score_ranking',
    'get_game_play_stats'
  )
order by signature;
```

名前だけでなく、必要に応じて`pg_get_functiondef`で実装も確認します。

## 7. 新規登録の順番

1. ゲーム側へ`ranking-manifest.json`を作る。
2. JSON Schemaへ合格させる。
3. 候補版を正式URLへ配備する。
4. `public.games`へ`is_active = false`で登録する。
5. マニフェストと登録値を照合する。
6. RPCの引数、戻り値、権限、保存先を確認する。
7. 候補コミット、公開版、正式URLを固定する。
8. 対象行を有効化する。
9. iPhone Safariの正式URLで本番受入を行う。
10. 失敗した場合は`is_active = false`へ戻す。
11. 成功した場合だけ有効状態を維持する。

`is_active`は、実験場表示だけでなく、現行`submit_score`の受付条件にも使われます。非公開状態では完全な本番送信試験ができないため、有効化後は直ちに受入を行います。

## 8. 名前

現在の共通`normalize_player_name`は、前後の空白を除く処理です。`submit_score`と`check_player_name`は、空文字を拒否し、20文字を超える名前を拒否します。

ゲーム側で独自に10文字へ切り詰めると、ゲームごとに表示名が変わります。新規実装では、共通規約の1文字以上20文字以下へ合わせます。

名前規則を強化する場合は、ブラウザとSupabaseを同じ変更で更新し、既存名への影響を確認します。

## 9. スコア保存

共通方式では、主に次へ保存されます。

- `public.score_runs`: 各送信
- `public.game_scores`: 名前と`game_slug`ごとの初回・ベスト・プレイ回数

`public.game_scores`の主キーは、名前の正規化値と`game_slug`の組み合わせです。

ランキングから除外する状態として、現在は次があります。

- `normal`
- `disqualified`
- `hidden`
- `review`

本番試験用の行を非表示にする場合は、証拠を残した後で保存方式に合う状態へ変更します。

## 10. ランキング取得

### 10.1 初回ランキング

```js
await supabase.rpc("get_first_try_ranking", {
  p_game_slug: gameSlug,
  p_limit: 100
});
```

### 10.2 ベストランキング

```js
await supabase.rpc("get_best_score_ranking", {
  p_game_slug: gameSlug,
  p_limit: 100
});
```

トップページは必要件数だけ、詳細ページは最大100件を取得します。

良いスコアの方向は`public.games.score_order`に従います。

| `score_order` | 意味 |
|---|---|
| `desc` | 大きいほど良い |
| `asc` | 小さいほど良い |

RPCが返す`rank_no`を表示します。フロント側で`index + 1`を順位として使いません。

## 11. スコア表示

ゲーム側が送る値は内部整数です。

| 表示 | 内部整数の例 | `score_scale` | `score_decimals` |
|---|---:|---:|---:|
| `12345点` | `12345` | 1 | 0 |
| `34.15秒` | `3415` | 100 | 2 |
| `1.234秒` | `1234` | 1000 | 3 |
| `87%` | `87` | 1 | 0 |

ゲーム側、マニフェスト、`public.games`を一致させます。

複合スコアは、`07_game_specific_score_display.md`のゲーム固有規則も確認します。

## 12. RESTでRPCを呼ぶ場合

Supabase JavaScriptクライアントを使わずRESTを直接呼ぶ場合は、ゲームごとに手書きせず、検証済みの共通処理を使います。

基本ヘッダー:

```text
apikey: <SUPABASE_PUBLISHABLE_KEY>
Authorization: Bearer <SUPABASE_PUBLISHABLE_KEY>
Content-Type: application/json
Accept: application/json
```

ネイティブ`fetch`を変数へ渡す場合は、次のどちらかで呼び出し先を固定します。

```js
const fetchImpl = globalThis.fetch.bind(globalThis);
```

```js
await fetchImpl.call(globalThis, url, options);
```

時間切れを設け、応答の件数、型、`game_slug`、名前、スコアを検査します。

## 13. エラーと再送

再送できる失敗と、設定を直すまで成功しない失敗を分けます。

再送できる例:

- 通信切断
- 時間切れ
- HTTP 408
- HTTP 425
- HTTP 429
- HTTP 500番台

原則として再送しない例:

- 未登録の`game_slug`
- 無効な名前、スコア、`client_version`
- 契約版の不一致
- 権限設定の不一致
- 同じ`submission_id`で内容が違う

再送時は同じ`submission_id`を使います。新しいIDを作り直しません。

## 14. 修正後の確認

- [ ] マニフェストとゲーム実装が一致する。
- [ ] マニフェストと`public.games`が一致する。
- [ ] 使用RPCが本番に存在する。
- [ ] 公開用ロールから必要なRPCを呼べる。
- [ ] 同じ`play_id`の再送が1回として扱われる。
- [ ] 同じ`submission_id`の再送が1回として扱われる。
- [ ] 初回ランキングを取得できる。
- [ ] ベストランキングを取得できる。
- [ ] `rank_no`どおりに同率表示される。
- [ ] プレイ回数の保存元と意味が決まっている。
- [ ] 通信失敗でもゲーム結果画面が残る。
- [ ] iPhone Safariの正式URLで送信と再送を確認した。
