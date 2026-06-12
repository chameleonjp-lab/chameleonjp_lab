# chameleonjp_lab

このリポジトリは、カメレオンJPの実験場とランキング連携を、Claude Codeなどのコード作成ツールが迷わず読めるように整理した仕様置き場です。

最終更新: 2026-06-12

## まず読むファイル

Claude Codeに作業を依頼する場合は、最初にルートの `CLAUDE.md` を読ませてください。

そのあと、作業内容に合わせて次のファイルを読ませます。

| 目的 | 読むファイル |
|---|---|
| 実験場トップを直す | `docs/chameleonjp-lab/01_lab_top_index.md` |
| 詳細ランキングページを直す | `docs/chameleonjp-lab/02_ranking_detail_page.md` |
| Supabase連携を確認する | `docs/chameleonjp-lab/03_supabase_ranking_flow.md` |
| 新しいゲームにランキング送信を入れる | `docs/chameleonjp-lab/04_game_supabase_required.md` |
| 新しいゲームを実験場へ追加する | `docs/chameleonjp-lab/05_new_game_registration_checklist.md` |
| SQLを作る | `docs/chameleonjp-lab/06_sql_templates.md` |

## このリポジトリで扱う範囲

ここでは、次の仕様を扱います。

- カメレオンJPの実験場トップページ
- 詳細ランキングページ
- Supabaseを使ったランキング取得、集計、スコア送信
- 新規ゲームの `index.html` に必ず入れるSupabase対応
- 新しいゲームを登録する時のSQLと確認手順

ゲーム本体の個別仕様は、それぞれのゲーム側の仕様書を正とします。このリポジトリは、実験場とランキング連携の共通部分を正とします。

## 重要な前提

- ゲーム本体は、原則として `index.html` 1ファイルで作ります。
- HTML、CSS、JavaScriptは1ファイルにまとめます。
- 公開先は基本的にCodeberg Pagesです。
- GitHubは、Claude Codeに読ませやすい仕様置き場として使います。
- Supabaseでは公開用のPublishable keyだけをブラウザ側に入れます。
- `service_role` キーは、絶対に公開HTMLへ入れません。

## 最新方針

実験場トップと詳細ランキングページは、Supabaseの `public.games` を中心に扱います。
古い実装では `GAMES` という固定配列を使っていた時期がありますが、最新の方針では、表示ゲームの正は `public.games` です。

もし既存コードに固定配列が残っている場合は、旧実装またはフォールバックとして扱ってください。新規改修では、固定配列だけを正にしてはいけません。
