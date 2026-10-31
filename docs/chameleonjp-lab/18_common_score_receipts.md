# 既存スコア登録の重複防止（適用前）

対象は既存の `public.submit_score` を使うゲーム。新RPCを用意しただけで、本番に適用した状態ではない。GitHub PagesのCIはSQLを実行しない。本番データ・公開URL・公開フラグは変更していない。

## 維持する契約

`submit_score_once_shared_v1` は、同一プレイのUUIDと固定した名前・slug・点数・client versionを受け取る。初回は現在の `submit_score` をそのまま呼び、返答を非公開の受領記録へ保存する。スコア登録と受領記録は同じトランザクション。再送は同じ返答を返し、スコア履歴・プレイ回数を増やさない。同じUUIDに別の内容を送ると `PT409` で拒否する。

負点、大小の優劣、ゲーム別の上限、Sainomeの既存処理、検証付きゲームとTakkeuの旧RPC拒否を引き継ぐ。新しい開始・終了レコードを合成しない。既存の名前キー、スコア表、集計、匿名開始統計、関数は書き換えない。**同名の別人・改名後の本人継続は解決しない**。これは別途判断が必要な既存の本人識別問題である。

関数の引数:

```text
p_submission_id uuid  (プレイ開始時に生成した固定ID)
p_display_name text   (開始時の参加名)
p_game_slug text      (既存の送信slug)
p_score integer      (既存と同じ精度で確定した値)
p_client_version text
```

返答は従来の8項目に `was_duplicate boolean` を追加した1行。再送では、別プレイにより自己ベストが更新されていても、最初の返答を返す。最新ランキングは成功後に別の読取RPCで取得する。

**今回の適用範囲は通常版RPCだけです。** イロナラベPR #22とイロアテPR #6は通常版のみを使用します。既存 `submit_score_with_metadata` の定義・ACLは変更せず、新しい `submit_score_with_metadata_once_shared_v1` を作成・公開しません。2026-10-31の読取では旧metadata RPCはanon/authenticatedともEXECUTE不可でした。SECURITY DEFINERのwrapperに権限を付けると、その閉じた経路を開くためです。metadataを送るゲームの後続PRは本SQLで公開可能とは扱わず、個別レビューと承認を要します。旧版SQLの適用済み環境で新metadata wrapperが存在する場合は、修正版SQLが変更前に例外で停止します。自動DROP・REVOKE・上書きで取り除きません。

## クライアントの適用条件

- 名前・参加可否・UUIDは開始時に固定し、確定結果とともに端末キューへ保存する。空欄のプレイは送信・受領記録とも作らない。
- 再表示・言語切替・再読込・再試行は同じUUIDと内容を使う。別プレイには新しいUUIDを使う。送信成功を確認したUUIDだけをキューから取り除く。
- 新RPCの失敗時に旧 `submit_score` へ自動フォールバックしない。成功した返答だけが失われた場合に二重登録されるため。結果を表示したまま未送信キューを保持し、同じRPCへ再試行する。
- 旧版で既に送信した可能性があり、UUIDのない結果をこのキューへ自動移行しない。新IDを付けると別プレイとして登録される。旧データは消さず、状態不明と表示する。
- 名前を後から入力しても、過去の匿名結果をキューへ追加しない。既存のスコア確定条件や異常記録の判定を維持する。
- ストレージ拒否時のメモリ内保持は再読込に耐えない。保存できなかった状態を保持できたと報告しない。

## 適用順・読戻し

1. 実験場PRの固定commitのSQLとCIの受領・権限回帰テストをレビューする。本番DB適用とマージは別承認であり、このPR修正の承認には含まれない。関連ゲームPRはこの手順を依存関係として明示する。未適用の間に依存ゲームを公開しない。
2. Supabaseの対象プロジェクト `mlpnjgezrnhdxsxolyzj` を確認し、管理権限のSQL Editorまたは既存のマイグレーション手順で [common-score-receipt-v1.sql](sql/common-score-receipt-v1.sql) を実行する。既存の関数定義・ACL・件数を事前に読取保存して比較する。通常submit_scoreのanon/authenticated公開が既存契約と一致すること、metadata wrapperが不存在であることを確認する。存在時は適用せず、所有者・定義・利用者を調査して別判断する。
3. 次の読取SQLで、関数、権限、RLSを確認する。本番への架空スコア登録は不要。

```sql
select pg_get_functiondef('public.submit_score_once_shared_v1(uuid,text,text,integer,text)'::regprocedure);
select has_function_privilege('anon', 'public.submit_score_once_shared_v1(uuid,text,text,integer,text)', 'EXECUTE') as anon_execute,
       has_function_privilege('authenticated', 'public.submit_score_once_shared_v1(uuid,text,text,integer,text)', 'EXECUTE') as authenticated_execute,
       has_table_privilege('anon','private.common_score_receipts_v1','SELECT') as anon_can_read_receipts;
select relrowsecurity from pg_class where oid='private.common_score_receipts_v1'::regclass;
select to_regprocedure('public.submit_score_with_metadata_once_shared_v1(uuid,text,text,integer,text,jsonb)') is null as metadata_wrapper_absent;
select has_function_privilege('anon','public.submit_score_with_metadata(text,text,integer,text,jsonb)','EXECUTE') as old_metadata_anon,
       has_function_privilege('authenticated','public.submit_score_with_metadata(text,text,integer,text,jsonb)','EXECUTE') as old_metadata_authenticated;
select pg_get_functiondef('public.submit_score_with_metadata(text,text,integer,text,jsonb)'::regprocedure);
select proacl from pg_proc where oid='public.submit_score_with_metadata(text,text,integer,text,jsonb)'::regprocedure;
```

期待値は関数がレビューした定義と一致、`true / true / false`、RLS `true`、metadata wrapper不存在 `true`、旧metadata権限は事前の `false / false` と不変。旧metadata定義・ACLも事前保存と完全一致すること。受領テーブルを公開するポリシーは追加しない。

4. 関連ゲームPRを利用者がマージし、検証・配備成功後の公開URLとrelease SHAを確認する。匿名プレイの非公開・名前の保存・ランキング読取・X共有を実機で確認。スコア送信は本人が希望する通常の1プレイで確認し、同じ結果の再試行で増分が1のままか監査する。

## 元へ戻す

先に依存ゲームの新規利用を止めるrevert PRをマージする。未送信キューと受領テーブルは残す。旧RPCへキューを再送してはならない。必要なら新RPCの `anon, authenticated` 向けEXECUTEを取り消し、理由と再開条件を記録する。既存スコア・参加者・匿名統計は削除しない。

受領テーブルには重複防止の証拠があるため、rollbackや期限経過を理由に自動削除しない。再開時は同じテーブルとUUIDで再送する。旧APIで完了した不明状態のプレイへ新しいUUIDを発行し直さない。

## 検証

`node scripts/test-common-score-receipt.mjs` はPGlite内のPostgreSQLを使い、2026-10-31に読取確認した既存関数の定義と合成データだけで実行する。本番の名前・記録・接続情報は使用しない。

負点・昇順・降順・別プレイ後も同一返答・名前/slug/score/version不一致・匿名拒否・検証付きゲーム拒否・非公開ゲーム拒否・範囲外・権限・全体rollback・受領記録失敗時のスコアrollback・再適用を確認。12回の同一UUID呼出しでも1記録。PGliteは単一接続であり、このテスト単独では複数の独立接続によるロック競合を証明しない。別途、以下の隔離PostgreSQL検査を行う。

旧metadata関数の定義・ACLが変わらずanon/authenticatedの実呼出しが拒否されること、新metadata入口が作られないことを確認する。既に新metadata wrapperがある環境では適用が安全停止し、既存定義・ACLを変更しないことも確認する。受領作成失敗後の同UUID再送は成功1回とduplicate応答を検査する。CIはこのファイルをPRでも実行するが、本番DBへ接続しない。

## 敵対的検証：独立PostgreSQL接続

`scripts/test-common-score-receipt-postgres.mjs` をPR専用workflow `receipt-adversarial.yml` で実行する。GitHub標準runner内の使い捨てPostgreSQL 17 serviceだけを使い、host URLを受け取らず、host portを公開しない。既存の配備workflow・branch protection・本番DBは変更しない。この検査はPR内追加検証であり、自動配備の必須gateを設定したものではない。

2026-10-31 22:29 UTC、[実行41248372229](https://github.com/chameleonjp-lab/chameleonjp_lab/actions/runs/41248372229)（コードcommit `cddda0f3b5376c6a57cbe9a80d2ccadd3e62899e`、PostgreSQL 17.11）で7 tests成功・失敗0・skip0を確認した。別backend PID 2個と実advisory lock待機を観測してから先行transactionを解放するため、単に並列要求を並べただけではない。

- 同UUID/同payload競合：受領と実score_runsが各1、play_count増分1、重複応答が初回と一致。
- 同UUID/異payload競合：待機後にPT409、受領/実スコアとも1。
- 先行transaction rollback：待機側が初回として1回だけ成功。
- null/不正UUID/空・過長名/非公開・検証付き・Takkeu/範囲外/小数/整数overflowは記録を増やさない。上下限ちょうどと20文字Unicode名は許容。
- anon/authenticatedはreceiptの読取/追加/変更/削除と旧metadata実行が不可。通常送信は実行可能。RLS有効・公開policyなし・新metadata入口なし。
- 旧スコアと旧関数の定義/ACL不変。受領作成失敗後の同UUID再送は別のPGlite suiteで検査する。

検査は既存の名前ベース・未検証スコア契約の安全性を拡張保証しない。名前だけでは同名別人の識別や改名時の本人継続は解決せず、クライアント提出スコアの真偽を新たに認証する仕組みでもない。本番の適用・実機・公開後検査は引き続き別工程。
