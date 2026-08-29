# ランキング受付契約 v1

最終更新: 2026-08-29

この文書は、ランキングを送るゲームが使う新しい受付方式を定義します。公開用キーだけで呼ばれるため、名前やスコアを完全に信用する仕組みではありません。ただし、送信の再送と、公開されていないゲームへの記録をデータベース側で拒否します。

## 本番への適用状況

次の追加変更を、接続中のSupabase本番プロジェクトへ適用済みです。

- `20260828015126_ranking_submission_contract_v1`
- `20260828015311_ranking_submission_contract_v1_index_fix`
- `20260829065022_ranking_start_idempotency_v1`
- `20260829065022_ranking_start_idempotency_v1`

既存の `games`、`score_runs`、`game_play_events` の記録は削除・更新していません。新方式用に `private.game_play_sessions` を追加し、既存データとの混在を避けています。

## 新しい流れ

1. ゲーム側で開始再送用の `start_id` を1回のプレイにつき1つ作り、結果画面まで保存します。
2. `start_game_play_v1` に同じ `start_id` を渡します。Supabaseが `play_id` を発行し、同じ開始要求の再送には同じ番号を返します。
3. ゲーム終了時に `finish_game_play_v1` を呼び、同じプレイの結果を更新します。
4. ランキング送信時に `submit_score_idempotent_v1` を呼びます。
5. `play_id` と `submission_id` の組み合わせを保存します。
6. 同じ `start_id` や `submission_id` を再送しても、開始数・`score_runs`・プレイ回数は増えません。

## 呼び出し例

開始:

```js
const startId = crypto.randomUUID();
// startIdは同じ開始要求の再送で使い回し、結果画面まで保存します。
const { data: start, error: startError } = await supabase.rpc("start_game_play_v1", {
  p_start_id: startId,
  p_display_name: playerName,
  p_game_slug: GAME_SLUG,
  p_client_version: CLIENT_VERSION
});
const playId = start?.play_id;
```

終了:

```js
const { data: finish, error: finishError } = await supabase.rpc("finish_game_play_v1", {
  p_play_id: playId,
  p_display_name: playerName,
  p_game_slug: GAME_SLUG,
  p_result_type: "clear",
  p_reached_wave: reachedWave,
  p_score: finalScore,
  p_client_version: CLIENT_VERSION,
  p_ranking_score: null
});
```

ランキング送信:

```js
const submissionId = crypto.randomUUID();

const { data: result, error } = await supabase.rpc("submit_score_idempotent_v1", {
  p_play_id: playId,
  p_submission_id: submissionId,
  p_display_name: playerName,
  p_game_slug: GAME_SLUG,
  p_score: finalScore,
  p_client_version: CLIENT_VERSION
});
```

通信失敗後の再送では、最初に作った `submission_id` を使い回します。再送のたびに新しい番号を作ると、別の結果として扱われます。

## データベース側の検査

新方式では次を必須にしています。

- `game_slug` は公開中、かつ `submission_mode = 'shared'` のゲームだけ許可
- 表示名は前後の空白を除いた1〜20文字
- ゲーム識別子、版、名前は開始時・終了時・送信時で一致
- スコアは `public.games.score_min` 以上、`score_max` 以下
- 開始番号、プレイ番号、送信番号は必須
- 同じ送信番号は一度だけ保存
- 同じプレイ番号へ別の送信番号を付けることを拒否
- 同じ名前・ゲームへの短時間の開始と送信を制限
- 公開中の `display_order` 重複を一意インデックスで拒否

`score_min` と `score_max` は既存の共通上限と、現在の `maron_hikou`・`uchikaeru` の上限を初期値として登録しています。ゲーム固有の正確な理論上限は、各ゲームの仕様確認後に更新します。

## 権限

- 新しい3関数は匿名利用者へ実行権限を付けています。ブラウザから呼ぶためです。
- 新方式の内部表は `private` スキーマに置き、匿名・認証済み利用者へ表の直接権限を付けていません。
- 関数は `SECURITY DEFINER` ですが、検索パスを空にし、表名・関数名を明示しています。
- `submit_score_with_metadata` は、現在確認できたゲーム側の呼び出しに使われていなかったため、匿名・認証済み利用者からの実行権限を取り消しました。
- Supabaseの診断に出る `SECURITY DEFINER` 警告は、匿名ブラウザ用の公開APIであることによる残存警告です。これだけで完全な不正防止になるわけではありません。

## 旧方式との関係

この段階では、既存の `submit_score`、`record_game_play`、`record_play_event` を停止していません。既存ゲームを一度に止めないためです。

したがって、このPRと本番SQLだけで、34件の既存ゲームが完全に検証済みになるわけではありません。ゲーム側を順に次の方式へ切り替え、切り替え済みゲームは旧受付へ戻らないようにします。

次の移行PRで行うこと:

- ゲーム開始処理へ `start_game_play_v1` を追加
- 終了処理へ `finish_game_play_v1` を追加
- 自動送信・再送処理を `submit_score_idempotent_v1` へ変更
- 送信失敗時に同じ `submission_id` を保存
- 切り替え後に旧関数の匿名実行権限を取り消す

## 検証済みの内容

本番の実データを汚さないため、次の試験は1つのトランザクション内で実行してロールバックしました。

- 同じ `start_id` の開始再送が同じ `play_id` を返す
- 開始で `play_id` が1件作られる
- 終了で同じセッションが更新される
- 同じ `submission_id` を2回送ってもスコア履歴が1件だけ
- 同じ `play_id` のセッションが1件だけ
- プレイ集計が1回だけ増える
- 非公開のAkerunが受付対象外になる
- Akerunを表示順35のまま公開しようとすると拒否される

偽スコアを本番へ残す試験、既存の記録削除、既存スコアの修正は行っていません。

## 未対応の残り

- 既存ゲームの新方式への切り替え
- 旧ゲームの名前正規化と過去データの整理
- プレイ回数の旧集計と新集計の表示切り替え
- トップページのゲーム別通信を一括取得へ変更
- 初回・ベスト・プレイ回数の個別エラー表示
- mainのブランチ保護設定
- ゲーム固有の厳密なスコア上限
