# プレイ回数ランキングの復旧記録

作成日: 2026-10-14（日本時間）
対象: chameleonjp-lab/chameleonjp_lab
本番URL: https://chameleonjp-lab.github.io/chameleonjp_lab/
調査時のmain: 18ed5f3e6b29ab65df6488d10295cc31fd9a9225
データ保存先: chameleonJP-Lab（mlpnjgezrnhdxsxolyzj）

## 確認できた原因

2026-09-28の開始記録対応後、get_play_count_rankingがprivate.game_play_sessionsだけを起点にしていました。
従来のpublic.game_scoresには記録が残っていますが、開始記録方式へ移行していないゲームは対象から外れました。
本番の44種類の有効なgame_slug中、38種類がこの状態でした。
実際に「虎に優しく」の詳細ページは152回・40人を表示する一方、プレイ回数タブでは「まだ記録がありません」と表示しました。

初回・ベストランキングは、44種類とも取得できていました。スコア記録の消失は確認していません。

## 修正

private.get_game_player_counts_v1に、名前ごとの回数を取得する処理をまとめました。
game_scoresとgame_play_sessionsの両方にある名前は、従来の初回・ベストランキングと同じく大きい方の回数を採用します。
両方の回数を単純に足しません。新しい開始記録を使いながら旧スコア送信を使うゲームも実在し、提出番号だけでは同じプレイの重なりを判断できないためです。
一方にだけある名前も残します。開始だけのプレイは回数の対象にし、初回・ベストの値はNULLのままにします。
normal以外のランキング状態は除外します。

get_play_count_rankingとget_game_play_statsがこの共通処理を使います。
同率順位はrank()を使い、最大100件、従来の引数・返却列を維持します。
スコア送信、ゲームの登録値、ページ本体は変更していません。
この変更は現在の集計規則を復旧するもので、番号で結び付けられない旧履歴から別々のプレイ数を推測するものではありません。

## 本番への反映

本番の移行履歴: 20261013202016_restore_legacy_play_count_ranking
修正SQL: sql/20261013202016_restore_legacy_play_count_ranking.sql
反映日時: 2026-10-14 05:20 JST
取り消し用SQL: sql/rollback_restore_legacy_play_count_ranking.sql

本番へ反映済みです。このPRのマージを待たず公開ページが修正済みの取得処理を使います。
取り消し用SQLは、保存済みのプレイヤー記録に手を加えず取得処理を旧定義へ戻します。
新しい内部関数は、取り消し後もprivateに残りますが公開利用者からは実行できません。

## 検証

- 旧記録だけ、開始記録だけ、混在、同一名の重なり、除外状態、同率、空データの9項目: 合格。
- 本番44種類のプレイ回数ランキング: 44種類すべてに行が戻り、事前に確認した名前数・回数と一致。
- 修正前後のgame_scores 677行、game_play_sessions 19行: 全内容の比較用値が一致。
- 初回・ベストランキングの44種類: 修正前後の返却内容が一致。
- NULL、空文字、未登録slug: 空ランキングと0回・0人を返す。
- 既存のカタログ・構文検査: 合格（予備カタログ38種類。本番の44種類は別に確認）。
- Chromeで本番詳細ページを再読込: 「虎に優しく」のプレイ回数タブに40人分のランキングを確認。
- 公開用キーによる全件通信検査: 44種類の初回・ベスト・プレイ回数・集計を取得し、並び順、同率、回数と人数の一致を確認（2026-10-14 05:25 JST）。
- iPhone実機Safariからの新規プレイ送信: 未実施。今回は送信処理とページ本体を変更していません。

## 権限

内部関数はSECURITY INVOKER、search_pathは空。PUBLIC・anon・authenticatedへの実行権限を明示的に外しています。
変更した2つの公開関数は、非公開の開始記録を読むため、以前からあるSECURITY DEFINERと公開実行権限を維持しています。
権限の追加は行っていません。

Supabaseの自動確認も実行しました。既存の公開SECURITY DEFINER関数には警告が表示されますが、対象2関数の公開実行はランキング表示の既存仕様です。
新しい内部関数への警告はありません。
参考: https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable

## 再確認する方法

scripts/test-play-count-sources.sqlは、保存データを書き換えないSQLの例です。9項目のpassedがtrueになることを確認します。
scripts/check-public-rankings.mjsは、公開用キーで有効な全game_slugの初回・ベスト・プレイ回数・集計を読みます。
公開権限、スコアの並び順、同率順位、プレイ回数と合計の一致を確認します。新しいプレイやスコアは登録しません。

```sh
node scripts/validate-lab.mjs
node scripts/check-public-rankings.mjs
```

通信の中継設定がある環境では、対応するNode.jsで `node --use-env-proxy scripts/check-public-rankings.mjs` を使います。
最初の検査はこの設定がないため時間切れになり、設定後の全件検査に合格しました。
実行結果は../../evidence/ranking-repair-public-api-20261014.jsonに保存しています。

公開ページの確認画像は../../evidence/ranking-repaired-20261014.jpgです。

