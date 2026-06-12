# Claude Code 作業前の必読仕様

最終更新: 2026-06-12
対象: `chameleonjp-lab/chameleonjp_lab`

このリポジトリは、カメレオンJPの実験場、詳細ランキング、Supabaseランキング連携、新規ゲーム側の必須実装を、Claude Codeが間違えずに確認するための仕様置き場です。

## 1. 作業前に必ず読む順番

1. `README.md`
2. `docs/chameleonjp-lab/00_project_overview.md`
3. 作業対象に合う詳細ファイル

作業対象ごとの詳細ファイルは次です。

| 作業 | 必読ファイル |
|---|---|
| 実験場トップ修正 | `docs/chameleonjp-lab/01_lab_top_index.md` |
| 詳細ランキング修正 | `docs/chameleonjp-lab/02_ranking_detail_page.md` |
| Supabaseランキング連携修正 | `docs/chameleonjp-lab/03_supabase_ranking_flow.md` |
| ゲーム本体にランキングを入れる | `docs/chameleonjp-lab/04_game_supabase_required.md` |
| 新規ゲーム登録 | `docs/chameleonjp-lab/05_new_game_registration_checklist.md` |
| SQL作成 | `docs/chameleonjp-lab/06_sql_templates.md` |
| 現在のゲーム一覧確認 | `docs/chameleonjp-lab/07_current_games_catalog.md` |

## 2. 絶対に守ること

### 実装方針

- ゲーム本体は原則 `index.html` 1ファイルで作る。
- HTML、CSS、JavaScriptは1ファイルにまとめる。
- 公開は基本的にCodeberg Pagesで行う。
- GitHubは、仕様共有とClaude Code作業用の置き場として使う。

### Supabase

- ブラウザ側へ入れてよいのはPublishable keyだけ。
- `service_role` キーは絶対に入れない。
- Supabase URLは `https://mlpnjgezrnhdxsxolyzj.supabase.co` を使う。
- Publishable keyは `sb_publishable_drzcy0v97knU6FgjqSgBHw_0A9XPdFM` を使う。
- テーブル名は `public.game_scores` を前提にする。`public.scores` は使わない。

### ランキング

- ゲーム終了時に自動送信する。
- 結果画面に「ランキング登録」ボタンを置いて、任意送信にしてはいけない。
- プレイヤー名は必須。初回入力後はブラウザ内に保存する。
- 同じ結果を二重送信しないよう、送信中・送信済みフラグを必ず持つ。
- 初回ランキングとベストランキングの両方を扱う。

### 実験場トップ

- 最新方針では、表示ゲームの正はSupabase `public.games`。
- 固定配列 `GAMES` が既存コードに残っている場合は、旧実装またはフォールバックとして扱う。
- 新規改修で固定配列だけを正にしてはいけない。
- `is_active = true` のゲームだけ表示する。
- `display_order` で並べる。

### 詳細ランキング

- URLは `ranking.html?game=game_slug` 形式。
- `game_slug` からSupabase `public.games` を引き、ゲーム情報を決める。
- 固定配列だけでゲーム情報を決めてはいけない。
- 初回ランキングとベストランキングをタブで切り替える。

## 3. よくある失敗を防ぐための禁止事項

- `public.scores` に問い合わせる。
- `created_at` だけで並べる。実テーブルでは `updated_at` が中心になる場合がある。
- Publishable keyの未設定判定を残したまま、実キーを入れ忘れる。
- `Authorization: Bearer <publishable key>` をRESTフォールバックで付け忘れる。
- `apikey` ヘッダーをRESTフォールバックで付け忘れる。
- 秒系ゲームの内部スコアを表示用小数へ変換し忘れる。
- 結果画面で任意のランキング登録ボタンにしてしまう。
- Supabase登録だけで実験場に出る前提なのに、ページ側が固定配列のままで放置する。
- 既存のスマホ操作対策を消す。
- 横スクロール、ピンチズーム、長押しコピー、ダブルタップ拡大の抑制を消す。

## 4. 修正時の確認順

修正時は、次の順で確認する。

1. 仕様上の正しい状態を確認する。
2. 現在コードが固定配列方式か、Supabase中心方式かを見る。
3. Supabase URLとPublishable keyが正しく入っているか見る。
4. `games` 取得、ランキング取得、集計取得、スコア送信の順に確認する。
5. iPhone SE級の画面幅でも横にはみ出さないか見る。
6. 結果画面でスコアが自動送信され、二重送信されないか見る。
7. 実験場トップと詳細ランキングの両方で表示が揃っているか見る。

## 5. コードを書く時の姿勢

このプロジェクトでは、予定外の機能削除を最も嫌う。修正対象以外の既存仕様を消さないこと。

大きな修正では、先に影響範囲を確認し、次に修正し、最後に確認する。対応負荷を理由に仕様を切り捨てないこと。
