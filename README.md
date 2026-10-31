# chameleonjp_lab

## カメレオンの実験場とは

短いブラウザゲームを探し、気になる作品を遊びに行けるゲーム紹介サイトです。ゲームごとの紹介、プレイ入口、ランキングや詳しい順位への案内をまとめています。すきま時間に遊ぶゲームを見つけたい人向けです。

[カメレオンの実験場を開く](https://chameleonjp-lab.github.io/chameleonjp_lab/)

作品カードの説明からゲームを選び、プレイ用のボタンで各作品のページへ進んでください。ランキングは対応するゲームとデータ取得状況によって表示が異なり、未公開・準備中のものもあります。各ゲームのルールや遊び方は、その作品側の案内を確認してください。

このリポジトリにはサイトのファイルに加えて、ゲームを登録・保守する人向けの共通仕様を収録しています。以下は主にその開発・運用資料です。資料に記された新しい契約と、現在公開中の実装は区別しています。

## 開発・運用資料

このリポジトリは、カメレオンJPの実験場、詳細ランキング、Supabase連携、新規ゲーム登録の共通仕様を置く場所です。

最終更新: 2026-08-29

## 最初に読むファイル

ランキングまたは実験場へ関係する作業では、次の順で確認します。

1. ルートの`CLAUDE.md`
2. `docs/chameleonjp-lab/11_ranking_integration_standard.md`
3. 作業内容に合う詳細文書
4. 対象ゲーム側の仕様書と`ranking-manifest.json`

| 目的 | 読むファイル |
|---|---|
| ランキング連携の共通ルール | `docs/chameleonjp-lab/11_ranking_integration_standard.md` |
| 実験場トップを直す | `docs/chameleonjp-lab/01_lab_top_index.md` |
| 詳細ランキングページを直す | `docs/chameleonjp-lab/02_ranking_detail_page.md` |
| Supabase連携を確認する | `docs/chameleonjp-lab/03_supabase_ranking_flow.md` |
| ゲーム側へランキング送信を入れる | `docs/chameleonjp-lab/04_game_supabase_required.md` |
| 新しいゲームを実験場へ追加する | `docs/chameleonjp-lab/05_new_game_registration_checklist.md` |
| SQLを作る | `docs/chameleonjp-lab/06_sql_templates.md` |
| 現在のゲーム一覧を確認する | `docs/chameleonjp-lab/07_current_games_catalog.md` |
| ゲーム別の特殊表示を確認する | `docs/chameleonjp-lab/07_game_specific_score_display.md` |
| 過去の注意事項を確認する | `docs/chameleonjp-lab/08_game_ranking_cautions.md` |

## このリポジトリで扱う範囲

ここでは、次の共通部分を扱います。

- カメレオンJPの実験場トップ
- 詳細ランキングページ
- Supabaseを使った開始記録、スコア送信、集計、ランキング取得
- ゲーム側のランキング連携契約
- `ranking-manifest.json`の形式
- 新しいゲームを登録する時のSQLと受入手順
- `score_scale`だけでは表せないゲーム別表示
- 障害時に調べる順番と必要な証拠

ゲームのルール、難易度、スコア計算そのものは、各ゲーム側の仕様書を正とします。ランキングの識別子、送信、再送、登録、表示、受入は、このリポジトリの共通規約を正とします。

## 正として扱う場所

| 内容 | 正として扱う場所 |
|---|---|
| 作ろうとしているランキング契約 | ゲーム側の`ranking-manifest.json` |
| 本番で現在使われている登録値 | Supabase `public.games` |
| ゲーム固有のスコア計算 | 各ゲーム側の仕様書 |
| 実験場とランキングの共通ルール | `11_ranking_integration_standard.md` |
| 配備後に一致した証拠 | ゲームごとの受入記録 |

マニフェストとSupabaseのどちらか一方だけを変更してはいけません。公開前に両者を照合します。

## 現在の実装前提

- ゲームは`index.html`一つに限定しません。必要に応じてHTML、CSS、JavaScript、画像、3Dデータを分割できます。
- 正式な公開先は、ゲームごとの`ranking-manifest.json`へ一つだけ記録します。
- 新規ゲームは原則として`https://chameleonjp-lab.github.io/<repository>/`形式のGitHub Pagesを使います。既存のCodeberg Pagesは、移行を決めるまで有効な正式URLとして扱えます。
- Supabaseでは、ブラウザへ入れてよい公開用のPublishable keyだけを使います。
- `service_role`キーを公開HTML、JavaScript、マニフェストへ入れてはいけません。
- 表示ゲームの本番値はSupabase `public.games`です。固定配列は旧実装または一時的な補助として扱います。
- 新規ゲームの開始記録とスコア送信は、同じ内容を再送しても1件だけになる処理を必須とします。
- 現行の`submit_score`は再送識別子を受け取らないため、新規ゲーム向けの完成形として扱いません。
- 現行の`submit_score_once`はサイノメ専用です。全ゲーム共通処理として流用しません。

## マニフェスト

新規ゲームと、ランキング処理を変更する既存ゲームは、ゲーム側のリポジトリへ`ranking-manifest.json`を追加します。

形式:

- `docs/chameleonjp-lab/schemas/ranking-manifest-v1.schema.json`
- `docs/chameleonjp-lab/examples/ranking-manifest-v1.example.json`

マニフェストには、正式URL、`game_slug`、`client_version`、スコア表示、送信対象結果、開始記録処理、スコア送信処理を記録します。秘密情報は入れません。

## 個別スコア表示

保存用の整数と表示内容が一致しないゲームは、`docs/chameleonjp-lab/07_game_specific_score_display.md`も確認します。

たとえば`うちかえる`は、`clearWave * 100000000 + battleScore`を保存し、表示では`○波クリア / ○○点`へ分けます。

ビンカラビンは、クリアタイムをミリ秒で送る短いほど良いゲームです。Supabase側は次を使います。

- `score_order`: `asc`
- `score_unit`: `秒`
- `score_scale`: `1000`
- `score_decimals`: `3`


## イロナラベのGitHub Pages切替（公開待ち）

[本体追補PR #17](https://github.com/chameleonjp-lab/ironarabe/pull/17) のマージ・公開後受入が終わるまで、DB追補PR #38はマージしません。新URLが未公開の間、Supabase登録URLを変更しません。

切替対象は `ironarabe` だけです。他ゲーム・既存記録・ランキング方式は維持します。公開順序、未適用のURL2列だけの安全なSQL、読取証拠、管理画面操作は [切替手順](docs/chameleonjp-lab/15_ironarabe_github_pages_migration.md) を参照してください。

## イロアテのGitHub Pages移行

本体PR①のマージ・新版の公開とプレイを確認済みです。実験場PR②のマージとSupabase登録URLの切替は未完了です。Pagesの公開元設定、URL2列だけの切替手順、既存25名/175履歴の保全、テストと残作業は [イロアテ切替記録](docs/chameleonjp-lab/16_iroate_github_pages_migration.md) を参照してください。

追加検証:

```bash
npm ci
npm test
npx playwright install --with-deps chromium webkit
npm run test:browser
```

ブラウザ試験は外部通信をmockにし、本番スコアを送信しません。既存の `scripts/check-public-rankings.mjs` は読取専用API確認です。
