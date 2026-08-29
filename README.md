# chameleonjp_lab

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
