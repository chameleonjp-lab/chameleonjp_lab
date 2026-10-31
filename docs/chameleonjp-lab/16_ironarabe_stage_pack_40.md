# イロナラベ40ステージと匿名開始RPC（未適用）

2026-10-31。**匿名開始回数のSQLは本番未適用（UNAPPLIED）**。この作業では本番への開始RPC呼出し、匿名開始SQL適用、スコア送信を行わない。以前の匿名回数SQLがマージ済みでも、DBへの適用済みを意味しない。先行する8問版のPages公開は成功し、公開後受入後にゲーム登録1件のURL2列だけを更新済み。公開記録は[公開URL切替](15_ironarabe_github_pages_migration.md)を参照する。

## ステージIDと互換性

基礎client_versionは `ironarabe-web-1.4.1-stagepack001-v2-` のまま。family順は以下で固定し、それぞれ `r0`, `r1`, `r2`, `r3` の順で合計40種とする。

| 順序 | family | 対応するsuffix |
| --- | --- | --- |
| 1 | sunset | sunset-r0 ～ sunset-r3（既存） |
| 2 | aurora | aurora-r0 ～ aurora-r3（既存） |
| 3 | ocean | ocean-r0 ～ ocean-r3 |
| 4 | leaf | leaf-r0 ～ leaf-r3 |
| 5 | amber | amber-r0 ～ amber-r3 |
| 6 | wisteria | wisteria-r0 ～ wisteria-r3 |
| 7 | coral | coral-r0 ～ coral-r3 |
| 8 | nebula | nebula-r0 ～ nebula-r3 |
| 9 | breeze | breeze-r0 ～ breeze-r3 |
| 10 | autumn | autumn-r0 ～ autumn-r3 |

例: `ironarabe-web-1.4.1-stagepack001-v2-ocean-r0`。匿名開始RPCのallowlistのみを8種から40種へ拡張する。既存8種のID、開始UUID再送時のplay_id、入力検証、毎分10000件上限を維持する。未知のfamily、r4以降、別version、前後の空白や末尾追加文字は受け付けない。

名前ありの `submit_score`、初回/ベスト/名前別回数/日時、ゲームの `ironarabe` 識別子、`shared`、`asc/100/2` は変更しない。匿名開始は専用表への回数記録だけで、プレイヤー名、参加者、スコア、履歴、順位を作らない。statsの応答は `total_play_count` と `player_count` の2フィールドを維持する。

## 管理者が選ぶ適用経路

事前の読取情報では、guest RPCとguest表は両方NULLで、旧8種用SQLも未適用。公開前提の再確認では共通statsにIroate分岐が追加され、定義MD5は `a509efcc07ccae488c47ab849ad25dda` になっている。以下は将来の手動適用手順であり、この文書の作成時に匿名開始SQLを適用した記録ではない。

認証済み管理接続で、適用直前に読取だけを行い、実際の状態から経路を選ぶ。以下は関数定義/権限の照会であり、開始RPCを呼び出さない。

```sql
select
  pg_catalog.to_regprocedure('public.start_ironarabe_guest_play_v1(uuid,text,text)') as guest_rpc,
  pg_catalog.to_regclass('private.ironarabe_guest_plays_v1') as guest_table;

select p.oid::regprocedure::text as signature,
  pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid)) as definition_md5,
  p.proowner::regrole::text as owner, p.proacl::text as acl
from pg_catalog.pg_proc as p
where p.oid in (
  pg_catalog.to_regprocedure('public.start_ironarabe_guest_play_v1(uuid,text,text)'),
  pg_catalog.to_regprocedure('public.get_game_play_stats(text)')
);
```

### 初回インストール: guest RPCと表が両方ない場合

1. [ironarabe-guest-play-count.sql](sql/ironarabe-guest-play-count.sql) をreviewする。40種の匿名開始RPC、初回用の表/RLS/権限制限に加え、下記の2つの確認済みstats定義だけに対応する。
2. 既存 `get_game_play_stats(text)` の定義MD5が `b267a6060af97a4845c2d18f5e3ab02e`（Takkeu分岐あり）、または `a509efcc07ccae488c47ab849ad25dda`（TakkeuとIroate分岐あり）であることを確認する。現在観測済みの本番は後者。guest RPC/表がないこと、既存記録の件数/全列hash、関数の署名/OID/owner/ACLを読取で保管する。
3. 共通stats関数のDDLを停止した適用時間帯に、認証済み管理者がSQL全体をtransactionとして手動適用する。最初のguardで確認済み定義の全文をtransaction内だけの設定へ保存し、置換直前に全文の一致とfingerprintを再確認する。2つの確認済み定義間の変化も拒否する。不明な定義や既存オブジェクトとの衝突は停止/rollbackする。
4. statsは取得した既存 `pg_get_functiondef` のCASE fallback直前へIronarabe分岐を1つ挿入する。Takkeu/Iroateの既存分岐、名前別集計、それ以外の定義文字列をそのまま維持する。`CREATE OR REPLACE` で署名/OID/owner/ACLを保ち、statsのGRANT/REVOKEは行わない。
5. 読取で、40種用guest関数とprivate表/RLS/権限制限、statsの署名/OID/owner/ACL、既存分岐と全既存行を確認する。Ironarabeの匿名表件数だけをtotalへ加え、player_countは変えない。Iroateありの適用後stats定義MD5は `f0593366cc04e9439a6fefa7f3d595f8`、以前のTakkeuのみからは従来どおり `9a968d97abd64bf1d26e1568a36b373d` となる。

### 公開前提の再確認: Iroate追加後の共通stats（匿名SQL未適用）

利用者が40問版PRと実験場PRをマージした後、実験場main `a6086cf86d888a34fb409ac9e299abd54c5e2059` を基準に互換性を再確認した。先行するIroateの匿名回数追加により、共通statsは上記の `a509efcc07ccae488c47ab849ad25dda`。この状態では旧 `b267...` 専用guardが拒否するため、guardを迂回せず確認済み定義をもう1つ追加した。Ironarabe guest RPC/表は引き続き両方NULLで、匿名SQLは本番未適用。

確認済みの既存statsはOID `17801`、owner `postgres`、ACL `{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres}`。既存PUBLIC実行権限を含めて維持し、匿名開始専用RPCとは別の権限として扱う。`submit_score` の定義MD5 `7cee4fd2b0c1d67c9f005a897058eb2d` を変更しない。公開受入や本番適用の完了記録はこの前提確認に含めない。

Iroateありの元定義は[ローカルfixture](../../scripts/fixtures/ironarabe-play-stats-with-iroate.sql)に固定し、定義fingerprintを再現した。fixtureの行とIroate RPC sentinelは合成データで、実ユーザー記録や本番Iroate開始RPCのコピーではない。初回SQLのSHA-256は `b1e4e8231407d7f1249f3bae9b3b824982f132dc0588f9bbc4c2fc1918190fef`。8→40のupgrade SQLは今回変更せず、適用経路は以下のまま。

### 旧8種を適用済み: guest RPCと表がある場合

1. [ironarabe-guest-stage-pack-40.sql](sql/ironarabe-guest-stage-pack-40.sql) だけを使用する。初回用SQLを再実行しない。
2. guest関数の定義MD5が **`3bd02ffa7b92def627e1334750085989`** であることを確認する。この値は開始SHA `419e25e` の `origin/main` にあった旧8種SQLを[固定fixture](../../scripts/fixtures/ironarabe-guest-play-count-8.sql)へそのまま保存し、隔離DBで `md5(pg_get_functiondef(...))` を計算した値。ファイル自体のhashではない。
3. 適用前にguest表の全行、guest関数の署名/OID/owner/ACL、共通statsと他RPCの定義/権限、既存記録の件数/全列hashを読取で保管する。対象guest関数の同時DDLを停止する。
4. 管理者がupgrade SQL全体をtransactionとして手動適用する。guardは欠落/変更済み/適用済み関数を拒否する。`CREATE OR REPLACE FUNCTION public.start_ironarabe_guest_play_v1` だけでbodyを更新し、関数の署名/OID/owner/ACLを維持する。GRANT/REVOKE、表の作成/変更/再作成/削除、既存データの書換え、statsの再定義は含まない。
5. 適用後は読取でbody、owner/ACL、guest行、stats/他RPC、名前/スコア/履歴が不変かを確認する。新しいguest関数の定義MD5は `01149a1c07d405799c433f2dff91d9df`。2回目のupgradeはguardで拒否される。

片方のオブジェクトしかない場合やfingerprintが違う場合は中止し、現在の定義を再読取/reviewする。guardを外したり、未知の関数を上書きしたりしない。guardが確認した後に別接続がDDLを行う競合は防がないため、同時DDL停止を適用条件とする。失敗時はtransactionを `ROLLBACK` してから再確認する。

## 既存記録と検証範囲

[既存読取証拠](../evidence/ironarabe-pages-preflight-20261031.json)の基準は、Ironarabeのgame_scores 29件（全列MD5 `440f2cfaee093e2b24d0a51c953251c1`）、score_runs 567件（全列MD5 `e82361709acd36e75fcf012533e944fe`）。今回の公開確認とゲームURL2列切替の前後でも同じ件数・hashを再読取した（[最新証拠](../evidence/ironarabe-pages-live-20261031.json)）。本番スコアと履歴への書込みは行っていない。将来の匿名開始SQL適用でも正当な新規プレイを考慮して前後を比較し、試験スコアを投入/削除しない。

ローカルは既存の `@electric-sql/pglite@0.3.14` による隔離PostgreSQL 17/WASMだけを使う。固定8種fixtureを含む `scripts/fixtures/` は合成データ専用で、本番に実行しない。29件の名前行/567件の履歴を合成し、スコア、metadata、client_version、名前、日時を含む全行JSONの一致を確認する。他ゲームとTakkeuの行も比較する。

`node scripts/test-ironarabe-guest-db.mjs` は既存24ケースを維持して計31ケース。40種追加時は旧allowlistの `ocean-r0` で失敗するRED後に初回用SQLを変えてGREEN。今回もIroateありの初回適用、既知定義間のdrift検出、stats欠落の3箇所でREDを確認後、互換SQLで31/31成功した。初回と旧8種からのupgradeの両方で40種受入/未知ID拒否、UUID再送/競合を確認する。旧8種の保存済みplay_id、全既存行、関数と表のOID/署名/owner/ACL、RLS/索引/制約、stats/他RPCを維持する。Iroate/Takkeuの行、既存RPC、名前別順位、stats値も前後で比較し、IroateありでもIronarabeのtotalだけが増えることを確認する。

欠落/変更済み/再適用のguardとtransaction rollbackも検証する。Iroateありの未知定義は先頭guardで拒否し、最初の確認後に別の既知定義へ変わった場合も、作成途中のIronarabe表/RPCを含めてrollbackする。PGliteは単一接続のため、適用中の定義変更をguard直前へ注入する試験であり、複数接続の同時DDLを再現した試験ではない。`npm test` が同じファイルを実行するので、新しい依存関係やCI stepは不要。

実験場の `npm test` はcatalog38件/38entry、Takkeu回帰、Ironarabe/IroateのURL回帰、DB31ケースが全て成功。`npm run test:browser` は既存の共有browser配置を使用し、Chromium/WebKit各々のcatalog/fallbackを両ゲームで検証し、計8シナリオが成功した。全59リクエストを遮断/mockし、gameリンク先へ遷移せずに確認した。実行環境では `PLAYWRIGHT_BROWSERS_PATH=/workspace/pw-browsers`、`LD_LIBRARY_PATH=/workspace/pw-libs/usr/lib/x86_64-linux-gnu`、`PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1` が必要。

未完了は匿名開始SQLの本番適用、40問版の公開後受入、実機Safari確認。40種用RPCの適用済みや本番での匿名回数受入済みとして報告しない。
