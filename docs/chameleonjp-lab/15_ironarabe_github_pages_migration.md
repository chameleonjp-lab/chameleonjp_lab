# イロナラベの公開URL切替（未適用）

2026-10-31。**PR-A公開後の受入が終わるまで、このPR-Bをマージしない。Supabase更新SQLも実行しない。**

## 対象と正本

- 実験場: `chameleonjp-lab/chameleonjp_lab`、既定`main`、開始SHA `88ad6a8724e556ff5b22d614091ea248f5039706`。
- 本体: [本体追補PR #17](https://github.com/chameleonjp-lab/ironarabe/pull/17)。既定 `claude/ironarabe-new-game-wlys30` の8ステージ版 `2e0ef14` から変更。旧main/pagesは正本にしない。
- 新正式URL: `https://chameleonjp-lab.github.io/ironarabe/`
- 現在の旧公開URL: `https://chameleonjp.codeberg.page/ironarabe/`
- `game_id` / `game_slug`: `ironarabe`。URLから生成しない。
- client_version基礎値: `ironarabe-web-1.4.1-stagepack001-v2`。ステージsuffix8種を維持。
- submission_mode: `shared`。既存の `submit_score` をクリア時1回。名前ありは開始記録RPCを使用しない。追加依頼の名前なし開始のみ `start_ironarabe_guest_play_v1` を使う。
- 名前ありのランキング契約は維持する。追加依頼により匿名回数の専用集計も加える。名前ありの開始カウント/スコアRPC移行、新規ゲーム登録、スコア方式変更はしない。匿名回数のみ別の開始RPCと同一UUID再送を追加する。利用者の明示した既存互換性・データ維持を優先する。

## URL調査と変更範囲

`catalog/games.json` に2参照、`index.html` の表示用fallbackに2参照、`ranking.html` のグループ/ランキングentry fallbackに4参照。ゲームリンク、共有文内のURL、詳細ランキングの「遊ぶ」に使用される。

この8参照だけを新URLへ置換し、イロナラベの説明文、共有文のURL以外の文字、識別子、スコア設定、他の37ゲームは変更しない。既存の履歴文書・証拠画像を無差別に書き換えない。

実際の表示値は `public.games` が優先。コードのfallbackだけ変えてDBを残すと旧URL表示が続くため、公開後に1件のゲーム登録も切り替える。コードにDB優先を無視する上書きを追加しない。

## 公開順序

1. 管理者が本体の **Settings → Pages → Build and deployment → Source: GitHub Actions** を一度設定する。接続済みAPIで設定を試したが403 `Resource not accessible by integration` のため未設定。Actions使用許可とgithub-pages環境の既定ブランチ許可も確認する。
2. 利用者がPR-Aを現在の既定ブランチへマージする。PR-Bはdraftのまま待つ。自動merge・直接main pushは行わない。
3. 本体のActionsがマージSHAのartifactを配備し、公開URLの `release.json` と各ファイルhashを検証することを確認する。旧pages branchの配信は禁止。
4. 新URLでページ、15言語、効果音、開始→完成盤面4秒→結果、既存ランキングの読取を確認する。試験スコアを本番へ送らず、ゲーム試験は `submit_score` をmockで遮断する。本体のPlaywright試験は全Supabase通信をmockにしている。
5. iPhone 17 Pro Safari実機の縦横、聞こえ方、音設定、タッチ、背景復帰を確認する。今回の自動WebKit/Chromium確認を実機確認済みとして扱わない。
6. 公開後受入の結果・公開SHA・日時をこの文書/PR-Bへ追記し、draft解除可能か判断する。その後のみ、PR-Bマージと以下のDB切替を同じ切替時間帯に実施する。DB設定による表示が優先なので片方だけで完了としない。
7. 実験場の一覧カード/共有/詳細ランキングから新URLが案内されることを確認し、DBの既存記録を再読取する。

新URLは調査時HTTP404。稼働済み扱いにはしていない。旧Codebergサイトは停止・削除しない。旧サイトの案内/meta refreshは新URL受入後の任意の別作業。

## Supabase: 実行前確認と未適用SQL

プロジェクト: `mlpnjgezrnhdxsxolyzj`。OAuthの認証済み管理接続で読取を実施した。秘密鍵の公開・新しい公開書込権限追加はしていない。

現在の実構造に `game_url`, `share_text` が存在すること、対象が1件であることを確認した。`public.games` のuser triggerは0件。

- 対象行: `game_slug='ironarabe'` だけ。
- 変更前game_url: 旧Codeberg URL。
- 変更後game_url: 上記新GitHub Pages URL。
- share_text: 「イロナラベ」「色の流れを見ながら、7×9のタイルを正しい場所へ並べよう。」を含む現登録文。URLだけ置換し、改行表現を含むそれ以外を維持する。
- 更新予定件数: **1件**。
- score_order/scale/decimals: **asc/100/2** のまま。

適用用: [ironarabe-pages-url-switch.sql](sql/ironarabe-pages-url-switch.sql)。**未実行**。SQL先頭の公開確認済みマージSHAを設定しない限り停止する。URLの公開確認をSQL自身が行うわけではないため、先に上記の受入を実施すること。

適用手順:

1. 認証済み管理者がSQL Editorで [読取専用チェック](sql/ironarabe-pages-readonly-check.sql) を実行し、対象件数・2列の変更前値・asc/100/2を確認して結果を保管する。
2. 新URLの受入済みマージSHAを記録する。対象行が1件以外、URLやスコア契約が想定外、共有URLが1回以外なら中止し再調査する。
3. 適用SQLのsentinelをその40文字SHAへ置換する。先にSELECTの変更前値を確認したうえでトランザクションを実行する。行をFOR UPDATEでロックし、旧値一致・1件更新・許可2列以外が不変であることを検査する。異常時は例外でrollbackされる。
4. 成功後に読取専用SQLを再実行する。URL2列だけが新URLへ変わり、ランキング契約が維持されたことを確認する。スコア表に一切writeしない。
5. 公開サイトへの通常利用で新しいスコアが自然に増えた場合は、件数/hashの変化を誤って巻き戻さない。スナップショット差を、正当な新規プレイと既存行変更に分けて調べる。試験記録の投入・削除は行わない。

SQLをHTML・公開workflowへ入れず、管理接続だけで手動適用する。管理権限不足なら未適用として引き継ぐ。DBのスコアDELETE/TRUNCATE/一括UPDATE、新規ランキング再作成、ゲームslug変更は行わない。

## 既存記録の読取証拠

[preflight evidence](../evidence/ironarabe-pages-preflight-20261031.json) に個人名を含まない集約証拠を保存。

- 初回・ベスト・名前・回数・日時を含むgame_scores全列:29件、MD5 `440f2cfaee093e2b24d0a51c953251c1`。
- client_version/metadata/score/日時を含むscore_runs全列:567件、MD5 `e82361709acd36e75fcf012533e944fe`。
- 実装開始時と実装後の読取で両方一致。DB書込みなし。
- 公開best ranking RPCも読取成功:29行、最小best_score6071、先頭rank1。

これは**URL変更前の記録**。公開後・DB更新後の確認は未実施。全列JSONの順序固定MD5は比較用で、スコア計算方式や個人識別子としては使用しない。

## 検証と残作業

ローカル検証結果とCIはPR本文に記載する。ゲーム一覧とランキングの表示・共有はmockとfallback双方で検証する。本番API検証は既存の読取専用プログラムだけを使い、本番スコアを送信しない。

未完了: PR-Aマージ、Pages設定、公開後受入、実機Safari、PR-Bマージ、DB登録URL切替、切替後の既存記録再確認。


### 2026-10-31 追加検証記録

- 本体PR-AのGitHub CI [run 41159111504](https://github.com/chameleonjp-lab/ironarabe/actions/runs/41159111504) 成功。Node52テスト、既存7検証、Chromium/WebKitの全試験、exact-SHA build/hash検査を実行し、PRイベントのartifact upload/deploy/publication verificationはskip。PR段階での本番反映なし。
- `NODE_USE_ENV_PROXY=1 node scripts/check-public-rankings.mjs`: 本番45ゲームの公開read API、昇順/降順、同率順位、初回/ベスト/プレイ回数と集計の整合が成功。スコア送信なし。最初はNode fetchが環境proxyを使用せずECONNREFUSED、環境proxy使用を有効にして成功した。proxyを迂回していない。
- 適用SQL/読取SQLはローカルpglast8.7でSQL構文、DOのPL/pgSQL本体をparse成功。独立したread-onlyレビューでも1件・2列制限と例外rollbackを確認。DBで適用・試行はしていない。

- 実験場 `npm test`: catalog38ゲーム/38entry、既存Takkeu回帰、新規URL検証が全て成功。3公開用ソースは開始SHAと比較し、8か所のURL置換以外がbyte単位で同一。
- 実験場 `npm run test:browser`: Chromium/WebKit各々、Supabase catalog優先とSDK/REST不通のfallbackの4シナリオ（8ページload）成功。全30リクエストを遮断/mockし、本番へのアクセス・書込みなし。カード/共有/詳細の新URL、初回/ベスト/回数の同率1,1,3、ユーザー名の特殊文字、100/2秒表示、集計、tabを確認。


## 追加依頼: 名前任意と匿名回数（本番未適用）

利用者の追記に合わせ、タッケウ同様に開始前の名前を任意にした。空欄または「名前なしで遊ぶ」で開始可能。保存名は消さない。名前ありの既存スコア送信、初回/ベスト/名前別回数は従来どおりクリア時の方式を維持する。

匿名は実際にプレイ画面が始まった時点で数える。匿名の名前/参加者/スコア/順位は作らない。ホームと結果の実験場導線は `ranking.html?game=ironarabe` の詳細へ変更し、結果は名前の有無に関わらず上位30名を表示する。

追加用SQL: [ironarabe-guest-play-count.sql](sql/ironarabe-guest-play-count.sql)。**未適用**。これはURL切替SQLとは別で、本体の新規公開前に管理者が適用する必要がある。

1. このPRの確定commitのSQLとローカルDB試験結果をreviewする。既存共通stats関数の定義fingerprintが `b267a6060af97a4845c2d18f5e3ab02e` と一致することを管理接続で再読取する。他のstats関数DDLと同時に適用しない。
2. SQLを認証済みSQL Editorでtransaction実行する。privateの匿名開始表とRLS、直接table権限を持たないanon向けの限定開始RPCを追加する。新しく必要なのは匿名回数専用RPCの実行権限だけで、URL更新用やスコア表への公開書込権限は増やさない。
3. 既存 `get_game_play_stats` の署名/権限/タッケウ分岐/名前別計算は維持し、イロナラベのtotalに匿名表件数を加える。player_countや名前別ランキングを変えない。事前条件が不一致なら停止し、function定義を再確認・再reviewする。
4. SQL適用後もゲーム登録URLは変更せず、前述のPages設定→PR-Aマージ→公開後受入を進める。その後にのみURL2列切替SQLとPR-Bマージを行う。
5. 匿名開始の回数はstart UUIDで冪等。未送信queueは再プレイで消さず、reload/online/次の開始で再送する。匿名回数を送れなくてもゲームは停止しない。

検証はdev専用 `@electric-sql/pglite@0.3.14` の隔離PostgreSQL17/WASMへfixtureだけを作り、実際のSQLを適用して15テスト成功。1回加算、再送不変、8ステージ、入力拒否、権限、流量制限、全名前/スコア/履歴/他ゲーム/タッケウの不変、guardと途中DDL失敗時rollbackを検証した。本番DBへの試験書込みは行わない。

公開read API検証の「名前別回数総和=全回数」という旧assertは、匿名専用回数を持つタッケウ/イロナラベでは「全回数が名前別総和以上」へ変更し、正確な加算は隔離DBテストで検証する。その他ゲームの同一性チェックは維持する。

本体側の別レビューで見つかった応答body timeout・online再送競合・未送信queueの失敗表示を回帰テストで修正した。追加後の本番匿名回数・実機Safari・公開後の受入は未確認で、適用/公開済みとは報告しない。


### 初回マージ後の追補状況
初回本体#16/実験場#37は作業中にマージされたため、任意名の本体追補[#17](https://github.com/chameleonjp-lab/ironarabe/pull/17)、匿名回数SQLのDB追補[#38](https://github.com/chameleonjp-lab/chameleonjp_lab/pull/38)を最新既定branch（50cc78d/80143a9）から作成した。両方Draft。
初回公開run41159990774はconfigure-pagesの設定取得404で配備失敗、新URLも404。共通DBのironarabe登録URLは旧URLのまま。追加匿名SQLを本体追補公開前に、URL切替SQLは新URL受入後に、管理者が別々に適用する。本文のPR-A/PR-Bの残手順は追補#17/#38を対象とする。
