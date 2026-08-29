# 新規ゲーム登録・ランキング公開チェックリスト

最終更新: 2026-08-29  
対象: 新しいゲームをカメレオンJPの実験場とランキングへ追加する作業

> 最上位規約は`11_ranking_integration_standard.md`です。  
> このチェックリストは、規約に沿って登録漏れを防ぐために使います。

## 1. 完了の考え方

新規ゲーム登録は、次の連携がすべて同じ値で動いた時に完了です。

1. ゲーム側の仕様
2. `ranking-manifest.json`
3. 公開ページ
4. Supabase
5. 実験場トップ
6. 詳細ランキング
7. iPhone Safariの本番確認

Supabaseへ行を追加しただけ、ゲーム側から送信できただけ、自動テストが通っただけでは完了にしません。

## 2. 作業開始前

- [ ] 対象リポジトリを確認した。
- [ ] デフォルトブランチを確認した。
- [ ] 正式URLを決めた。
- [ ] `game_id`を決めた。
- [ ] 単一モードか複数モードか決めた。
- [ ] すべての`game_slug`を決めた。
- [ ] `submission_mode`を`shared`または`verified`から決めた。
- [ ] どの終了結果をランキングへ送るか決めた。
- [ ] プレイ回数を数える時点を「開始成立時」に決めた。
- [ ] スコアの内部整数、最小値、最大値を決めた。
- [ ] 値が大きいほど良いか、小さいほど良いか決めた。
- [ ] 候補コミットと公開版の記録方法を決めた。

## 3. マニフェスト

ゲーム側へ`ranking-manifest.json`を作ります。

参照:

- `schemas/ranking-manifest-v1.schema.json`
- `examples/ranking-manifest-v1.example.json`

確認:

- [ ] `schema_version`が`chameleonjp-ranking-manifest-v1`。
- [ ] `game_id`が作品の固定値。
- [ ] `canonical_url`が`https://`、末尾`/`、クエリなし。
- [ ] `client_version`が候補版と一致。
- [ ] `submission_mode`がSupabase登録予定と一致。
- [ ] `lab.representative_slug`がランキング項目の一つを指す。
- [ ] すべてのモードを`ranking_entries`へ列挙した。
- [ ] 各`game_slug`が重複していない。
- [ ] 各`display_order`が登録予定と一致。
- [ ] スコア単位、倍率、小数桁がゲーム実装と一致。
- [ ] 送信対象の終了結果を列挙した。
- [ ] 開始記録RPCを指定した。
- [ ] スコア送信RPCを指定した。
- [ ] 開始とスコア送信の同一送信対策が`true`。
- [ ] 秘密情報を入れていない。
- [ ] JSON Schemaに合格した。

## 4. ゲーム側

### 4.1 名前と開始

- [ ] 名前なしではランキング対象プレイを開始できない。
- [ ] 名前は前後の空白を除いた1文字以上20文字以下。
- [ ] 名前を勝手に10文字へ切り詰めない。
- [ ] 名前保存に失敗しても、今回の入力は利用できる。
- [ ] 開始要求ごとに`start_id`を1つ作り、サーバー発行の`play_id`を保持する。
- [ ] 同じ`start_id`で開始を再送し、同じ`play_id`が返る。
- [ ] ページ閲覧やチュートリアルだけではプレイ回数を増やさない。
- [ ] 新しい再戦では新しい`play_id`を作る。

### 4.2 結果と送信

- [ ] 終了結果を一度だけ確定する。
- [ ] 一つの結果に一つの`submission_id`を作る。
- [ ] 結果画面を先に表示し、自動送信を始める。
- [ ] 任意の「ランキング登録」ボタンだけで送る作りではない。
- [ ] 自動送信と再送で同じ内容を使う。
- [ ] 送信前に待ちデータを保存する。
- [ ] 成功応答を検査した後だけ待ちデータを削除する。
- [ ] 送信失敗で結果画面を消さない。

### 4.3 状態と再送

- [ ] 状態は`idle`、`submitting`、`submitted`、`retryable_failed`、`permanent_failed`で管理する。
- [ ] 表示中の日本語から状態を推測しない。
- [ ] 再送可能な失敗だけで再送ボタンを出す。
- [ ] 再送ボタンは押せる時に`disabled`が外れる。
- [ ] ボタンの高さは44px以上。
- [ ] 押した直後に送信中表示へ変わる。
- [ ] 連打しても一つの送信だけ動く。
- [ ] 成功後に再送ボタンが消える。

### 4.4 URL、公開版、JavaScript

- [ ] `<link rel="canonical">`が正式URLと一致。
- [ ] ホームと結果のシェアが正式URLを使う。
- [ ] HTMLに`chameleonjp-release`がある。
- [ ] 入口CSS・JavaScriptの公開版を更新した。
- [ ] 同じ内部モジュールをクエリ付きとクエリなしで読んでいない。
- [ ] ネイティブ`fetch`を渡す場合は呼び出し先を固定した。
- [ ] 通信に時間切れがある。
- [ ] HTTP成功だけでなく応答内容を検査する。

## 5. Supabase登録前

新規行は、最初に`is_active = false`で登録します。

登録する値:

| 列 | 確認する内容 |
|---|---|
| `game_slug` | マニフェストの各`game_slug` |
| `title` | 実験場へ表示する名前 |
| `game_url` | クエリなしの正式URL |
| `description` | 1文で分かる説明 |
| `share_text` | シェア用の文 |
| `display_order` | 有効なゲームと重複しない順番 |
| `is_active` | 最初は`false` |
| `submission_mode` | `shared`または`verified` |
| `top_ranking_type` | `first`または`best` |
| `score_order` | `desc`または`asc` |
| `score_unit` | `点`、`秒`、`%`など |
| `score_scale` | 内部整数から表示値へ直す倍率 |
| `score_decimals` | 0から3 |
| `score_label` | 通常表示名 |
| `first_score_label` | 初回ランキング名 |
| `best_score_label` | ベストランキング名 |
| `release_date` | 公開予定日 |

確認:

- [ ] マニフェストと登録SQLが一致。
- [ ] 未使用の旧`game_slug`を同時に作っていない。
- [ ] 同じ作品の複数モードは同じ正式URLを使う。
- [ ] 別作品と誤ってURLが重複していない。
- [ ] 使用RPCが本番に存在する。
- [ ] RPCの引数と戻り値を確認した。
- [ ] 公開用ロールの実行権限を確認した。
- [ ] 保存先を確認した。
- [ ] `submit_score_once`を共通RPCだと誤認していない。
- [ ] `record_game_play`を同一送信対策付き開始RPCだと誤認していない。

## 6. 登録値の確認SQL

### 6.1 対象行

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
where game_slug in (
  '対象slug_1',
  '対象slug_2'
)
order by display_order, game_slug;
```

### 6.2 表示順の重複

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

### 6.3 関連slug

```sql
select
  game_slug,
  title,
  game_url,
  is_active,
  display_order
from public.games
where game_slug like '対象ゲームの接頭辞%'
order by game_slug;
```

マニフェストにない旧slugがないか確認します。

### 6.4 関連スコア

公開前に旧slugが見つかった場合は、削除前に記録件数を確認します。

```sql
select
  game_slug,
  count(*) as player_rows,
  coalesce(sum(play_count), 0) as total_score_submissions
from public.game_scores
where game_slug like '対象ゲームの接頭辞%'
group by game_slug
order by game_slug;
```

記録がある行を、理由と移行計画なしで削除しません。

## 7. 公開候補

- [ ] 候補コミットSHAを固定した。
- [ ] 公開版を固定した。
- [ ] 正式URLを固定した。
- [ ] GitHub Pagesの配備処理が成功した。
- [ ] 正式URLからHTMLを開ける。
- [ ] HTMLの公開版が候補版と一致。
- [ ] 配備されたJavaScriptに対象`game_slug`と`client_version`がある。
- [ ] 旧配備方式やEdge Functionが意図せず残っていない。
- [ ] 試験用クエリを外した通常URLでも新しい処理が読まれる。

## 8. 有効化前の確認

- [ ] `is_active = false`の登録値を確認した。
- [ ] マニフェストとSupabaseを照合した。
- [ ] 表示順の重複がない。
- [ ] 正式URLの重複を確認した。
- [ ] 使用RPCと権限を確認した。
- [ ] 自動試験が合格した。
- [ ] 本番試験で使う名前とスコアを決めた。
- [ ] 失敗時に`is_active = false`へ戻すSQLを用意した。
- [ ] 受入記録を用意した。

## 9. 有効化と本番試験

対象行を`is_active = true`へ変更したら、同じ候補版で直ちに試験します。

### 9.1 iPhone Safari

実機はiPhone 17 Proを基準とします。狭い画面幅は自動試験またはブラウザの表示幅試験でも確認します。

- [ ] 正式URLを新しいタブで開いた。
- [ ] 公開版を確認した。
- [ ] 名前未入力では開始できなかった。
- [ ] 名前入力後に開始できた。
- [ ] プレイ回数が1回増えた。
- [ ] ゲームを終了した。
- [ ] 送信中表示が出た。
- [ ] 成功表示へ変わった。
- [ ] Supabaseに名前、`game_slug`、スコア、`client_version`が保存された。
- [ ] 実験場トップにカードと記録が出た。
- [ ] 詳細ランキングに記録が出た。
- [ ] シェア文にクエリなしの正式URLが入った。

### 9.2 通信失敗と再送

- [ ] 通信を切った状態でランキング対象結果を出した。
- [ ] 結果画面が残った。
- [ ] 再送ボタンが表示された。
- [ ] 再送ボタンが押せる見た目だった。
- [ ] 再送ボタンを実際に押せた。
- [ ] 押した直後に送信中表示へ変わった。
- [ ] 通信復帰後に同じ結果を送信できた。
- [ ] 同じ`submission_id`が使われた。
- [ ] 記録件数とプレイ回数が1回分だけ増えた。
- [ ] 成功後に再送ボタンが消えた。

### 9.3 同じ送信の確認

- [ ] 同じ`play_id`を2回送っても開始が1回だけ数えられた。
- [ ] 同じ`submission_id`を2回送っても結果が1件だけ保存された。
- [ ] 同じ`submission_id`で別スコアを送ると拒否された。
- [ ] 応答が失われた想定の自動試験を通した。

## 10. 実験場トップ

- [ ] `is_active = true`のカードが表示される。
- [ ] `display_order`どおりに並ぶ。
- [ ] ゲーム名と説明が正しい。
- [ ] 「遊ぶ」が正式URLへ移動する。
- [ ] 上位ランキングが正しい。
- [ ] 代表`game_slug`が正しい。
- [ ] 合計プレイ回数の意味が開始回数と一致する。
- [ ] 参加人数が表示される。
- [ ] 記録0件でも壊れない。
- [ ] 複数モードの同じ作品カードを意図せず重複表示しない。

## 11. 詳細ランキング

- [ ] `ranking.html?game=対象slug`で開ける。
- [ ] ゲーム名、説明、「遊ぶ」が正しい。
- [ ] 初回ランキングが表示される。
- [ ] ベストランキングが表示される。
- [ ] スコア単位、倍率、小数桁が正しい。
- [ ] `rank_no`どおりに同率表示される。
- [ ] 最大100件を扱える。
- [ ] 廃止モードが表示されない。
- [ ] 複数モードはマニフェストどおりに切り替わる。

## 12. 失敗した場合

一項目でも失敗したら、次を行います。

1. 対象行を`is_active = false`へ戻す。
2. 候補SHA、公開版、正式URL、発生時刻を記録する。
3. `game_slug`、`client_version`、`play_id`、`submission_id`を記録する。
4. ブラウザが要求を開始したか確認する。
5. Supabaseへ到達したか確認する。
6. RPC応答と保存先を確認する。
7. 実験場トップと詳細のどこで止まったか確認する。
8. 原因を一つに分けて修正する。
9. 新しい候補SHAで最初から試験する。

失敗中の行や履歴を先に削除しません。

## 13. 受入記録

- [ ] ゲームリポジトリ
- [ ] 候補コミットSHA
- [ ] 公開版
- [ ] 正式URL
- [ ] マニフェスト版
- [ ] 対象`game_slug`
- [ ] `client_version`
- [ ] `submission_mode`
- [ ] 試験日時
- [ ] iPhone 17 ProのOSとSafari
- [ ] 試験名
- [ ] 内部整数スコアと表示スコア
- [ ] 開始記録の確認
- [ ] スコア保存の確認
- [ ] 再送と重複なしの確認
- [ ] 実験場トップの確認
- [ ] 詳細ランキングの確認
- [ ] 最終判定

空欄や`未実施`がある場合は合格にしません。

## 14. コード作成ツールへの依頼文

```text
このリポジトリのCLAUDE.mdを読み、
docs/chameleonjp-lab/11_ranking_integration_standard.mdを最優先で確認してください。

新規ゲームをカメレオンJPの実験場へ登録します。
対象ゲーム側のranking-manifest.jsonを作成し、JSON Schemaに合格させてください。

プレイ回数は開始成立時に、play_idを使って1回だけ記録してください。
結果は終了時に自動送信し、submission_idを使って同じ結果を再送しても1件だけになるようにしてください。

最初はpublic.gamesへis_active=falseで登録するSQLを作ってください。
候補SHA、正式URL、Supabase、実験場トップ、詳細ランキング、iPhone Safariの受入記録まで確認対象にしてください。

現行submit_score、submit_score_once、record_game_playを、名前だけで新規ゲームへ流用しないでください。
```

## 15. 完了条件

次がすべて通った時だけ、新規ゲーム登録を完了とします。

1. マニフェストが検査に合格した。
2. ゲーム実装とマニフェストが一致した。
3. Supabase登録値とマニフェストが一致した。
4. 開始が1回だけ数えられた。
5. 結果が自動送信された。
6. 通信失敗後に再送できた。
7. 再送しても結果が1件だけだった。
8. 実験場トップへ表示された。
9. 詳細ランキングへ表示された。
10. 正式URLと公開版が一致した。
11. iPhone 17 ProのSafariで確認した。
12. 受入記録に未実施がない。
