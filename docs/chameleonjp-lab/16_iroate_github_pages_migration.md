# イロアテの公開URL切替

2026-10-31 UTC。ゲーム新版の公開を確認してPR②を準備した。**実験場のマージと本番登録URLの切替は未完了。正式公開完了とはしない。**

## 対象と公開確認

- 実験場の開始main: `419e25e68f3ee57f9e9d5030106d3fa418c43435`。作業branch: `codex/iroate-github-pages-url`。
- 本体PR①: [iroate #3](https://github.com/chameleonjp-lab/iroate/pull/3)。利用者がマージ済み。
- 公開main SHA: `570fc1215c93d4dfb12a0a89c29dec557fccb421`。
- 新正式URL: https://chameleonjp-lab.github.io/iroate/
- 旧URL: https://chameleonjp.codeberg.page/iroate/
- `game_id` / `game_slug`: `iroate`。`client_version`: `iroate-ranking-v1`。
- スコア契約: `asc` / `秒` / `100` / `2` / `shared`。名前ありは従来の `submit_score`、匿名の開始だけ `start_iroate_guest_play_v1`。URLからゲーム識別子を生成しない。

[mainのActions run](https://github.com/chameleonjp-lab/iroate/actions/runs/41163474834) はテスト・build・配備とも成功。`version.json` とHTMLの公開SHA、25アセットの取得を検証した。公開URLをLinux WebKitで20問プレイし、誤答+5秒、結果、初回/ベストの公開読取（25名）、再戦、リタイア、共有URL、667×375横画面を確認。ブラウザ内で匿名開始の書込み2回をmockし、スコア送信は0回。本番に試験記録を追加していない。

ただしPages設定APIでは、確認時点でも `build_type=legacy`、`source=main:/`。独自Actionsの配備成功と、Pages Sourceの設定完了は区別する。設定変更APIは403 `Resource not accessible by integration` のため、管理者が [Settings → Pages](https://github.com/chameleonjp-lab/iroate/settings/pages) の **Build and deployment → Source: GitHub Actions** に変更し、APIと次回配備で再確認する。mainへ直接pushしない。

実機iPhone Safariは未確認。Linux WebKitの成功を実機確認済みとは扱わない。

## 実験場の変更

`catalog/games.json`（2参照）、`index.html` fallback（2参照）、`ranking.html` fallback（4参照）、現行ゲーム一覧文書（1参照）のイロアテURLだけを置換。共有文はURL以外を維持する。他の37ゲーム、順位、保存倍率、名前、説明、識別子は変更しない。

本番の正本は `public.games`。ファイルのfallback更新だけで本番のリンクが切り替わったとは判断しない。旧URLは移行記録・SQLの事前条件・回帰テストにのみ残す。

## 名前なしの回数と記録保全

名前入力は任意。入力した場合だけランキングへ参加し、空欄ならスコアやランキングの名前を作らず開始回数を数える。結果には初回/ベスト各上位30名を表示する。本体から実験場へのリンクは `ranking.html?game=iroate` の詳細を使う。

匿名計測用DDLは本体PR①に含まれ、既に適用済み。`private.iroate_guest_plays_v1` に名前・スコアを保存せずUUIDで重複を防ぐ。既存スコアの保存方式は維持する。

本体実装前と、公開確認後03:27 UTCの読取で全列の行ハッシュ集計が一致した。個人名・個別記録は証拠に出力していない。

| 保存先（iroateのみ） | 件数 | 集計MD5 |
|---|---:|---|
| public.game_scores | 25 | a3d58ad196a515fa6c96294c8f696ddf |
| public.score_runs | 175 | c496ef4790e0111cda9002e0f7be8033 |

計算は各行 `md5(to_jsonb(row)::text)` を、game_scoresはdisplay_name順、score_runsは数値id順に空文字区切りで連結し、再度md5する。今回の比較では欠落・改変・追加0。実利用による追加は許容し、後の差分を巻き戻さない。

端末内の `iroAteBestTime` / `iroAtePlayerName` はCodebergとGitHubのorigin間で共有できない。自動移行は行わない。Supabase上の既存ランキングが消えることとは別である。

## 本番URLの切替手順（未実行）

1. PagesのSource是正と公開SHAを再確認し、利用者がこの実験場PR②をマージする。エージェントはマージしない。
2. 管理接続で `game_slug='iroate'` が1行であること、現在値を記録する。現在のgame_urlは旧URL、share_textは `イロアテ\n文字の意味と文字の色を見分けて、20問の最終タイムを競うゲームです。\nhttps://chameleonjp.codeberg.page/iroate/`。改行表現を変えない。
3. 本体リポジトリの [URL更新SQL](https://github.com/chameleonjp-lab/iroate/blob/570fc1215c93d4dfb12a0a89c29dec557fccb421/docs/sql/iroate-url-after-deploy.sql) を認証済み接続で実行する。トランザクション・行ロック・旧値一致・1行/2列限定・他列不変の検査付き。`game_url` / `share_text` 内の旧URLだけを新URLへ置換する。
4. 対象行と記録保全を再読取し、1行・両URLの正しさ・スコア設定不変を確認する。スコア表へ書き込まない。
5. 配備後の実験場トップと詳細ランキングから新URLへ遷移し、両方の共有URL、ランキング、匿名回数の表示を確認する。URL・公開SHA・記録が整合してから正式公開完了を判断する。

SQL・管理秘密鍵を公開JavaScriptやActionsへ埋め込まない。旧サイトの停止、他ゲームのURL更新、スコア移行・削除・初期化は行わない。

## テストと敵対的レビュー

- `npm test`: 38ゲーム/38entry、inline JavaScript構文、Takkeu表示回帰、既存Ironarabeテスト、隔離PostgreSQLの15試験、イロアテのURL限定変更が成功。
- `npm run test:browser`: Chromium/WebKitそれぞれ、Supabase catalogと全通信不通fallbackの一覧/詳細/共有/順位を成功。イロアテは名前あり17回+匿名3回=20回/3名の表示を検証。すべての通信をmockし、本番へアクセスしない。
- `NODE_USE_ENV_PROXY=1 node scripts/check-public-rankings.mjs`: 45ゲームの公開読取、順位・スコア方向・回数・集計の整合に成功。書込みなし。
- 独立レビューで、公開用3ソースと一覧文書がmainに対する正確なURL置換だけであることを確認。既存Ironarabeの全データfingerprintは許可したイロアテURL分だけ更新し、他ゲーム保護を維持。匿名加算を明示するfixtureへ補強して再試験した。残るコード上の重大指摘なし。
- PRのCI結果はPRチェック欄を正とする。切替後の実験場本番導線と実機Safariは未検証。

集約証拠: [iroate-pages-acceptance-20261031.json](../evidence/iroate-pages-acceptance-20261031.json)。
