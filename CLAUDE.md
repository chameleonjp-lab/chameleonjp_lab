# Claude Code 作業前の必読仕様

最終更新: 2026-08-29  
対象: `chameleonjp-lab/chameleonjp_lab`

このリポジトリは、カメレオンJPの実験場、詳細ランキング、Supabaseランキング連携、新規ゲーム登録の共通仕様を置く場所です。

## 1. 作業前に必ず読む順番

1. `README.md`
2. `docs/chameleonjp-lab/11_ranking_integration_standard.md`
3. 作業内容に合う詳細文書
4. 対象ゲーム側の仕様書と`ranking-manifest.json`

ランキング連携に関して既存文書や古いコード例が食い違う場合は、`11_ranking_integration_standard.md`を優先します。

| 作業 | 必読ファイル |
|---|---|
| ランキングに関係するすべての作業 | `docs/chameleonjp-lab/11_ranking_integration_standard.md` |
| 実験場トップ修正 | `docs/chameleonjp-lab/01_lab_top_index.md` |
| 詳細ランキング修正 | `docs/chameleonjp-lab/02_ranking_detail_page.md` |
| Supabaseランキング連携修正 | `docs/chameleonjp-lab/03_supabase_ranking_flow.md` |
| ゲーム本体へランキングを入れる | `docs/chameleonjp-lab/04_game_supabase_required.md` |
| 新規ゲーム登録 | `docs/chameleonjp-lab/05_new_game_registration_checklist.md` |
| SQL作成 | `docs/chameleonjp-lab/06_sql_templates.md` |
| 現在のゲーム一覧確認 | `docs/chameleonjp-lab/07_current_games_catalog.md` |
| ゲーム別の特殊表示 | `docs/chameleonjp-lab/07_game_specific_score_display.md` |

## 2. 作業対象を最初に固定する

変更前に、次を確認して作業記録へ残します。

- 対象リポジトリ
- 対象ブランチ
- 候補コミット
- 正式URL
- 公開版
- `game_id`
- 対象の`game_slug`
- `client_version`
- `submission_mode`
- 使用する開始記録RPC
- 使用するスコア送信RPC

不明な値をURLやリポジトリ名から推測しません。

## 3. ゲームの構成

- ゲームは`index.html`一つに限定しません。
- 必要に応じてHTML、CSS、JavaScript、画像、音声、3Dデータを分割できます。
- 既存の構成を、ランキング対応だけを理由に一ファイルへ戻しません。
- 正式な公開先は、ゲーム側の`ranking-manifest.json`へ一つだけ記録します。
- 新規ゲームは原則としてGitHub Pagesを使います。既存のCodeberg Pagesは、正式URLとして登録されている限り維持できます。
- 公開版をHTMLへ入れ、候補コミットと配備物を照合できるようにします。

## 4. マニフェスト

新規ゲーム、またはランキング処理を変更する既存ゲームには、`ranking-manifest.json`が必須です。

- JSON Schemaへ合格させる。
- 正式URL、`game_slug`、`client_version`、スコア設定を実装と一致させる。
- Supabase `public.games`と照合する。
- 秘密情報、`service_role`キー、アクセストークンを入れない。
- 一つのURLに複数モードがある場合は、`ranking_entries`へすべて列挙する。
- `game_slug`をURLから生成しない。

形式は次を使います。

- `docs/chameleonjp-lab/schemas/ranking-manifest-v1.schema.json`
- `docs/chameleonjp-lab/examples/ranking-manifest-v1.example.json`

## 5. Supabase

- ブラウザ側へ入れてよいのはPublishable keyだけです。
- `service_role`キーを公開HTML、JavaScript、ログ、マニフェストへ入れません。
- `public.scores`は使いません。
- 本番のゲーム登録値は`public.games`を使います。
- 保存先、RPCの引数、戻り値、権限は、実装前に現在のSupabaseで確認します。
- RPC名だけを見て共通処理と判断しません。
- 現行の`submit_score_once`はサイノメ専用です。
- 現行の`submit_score`は再送識別子を受け取らないため、新規ゲームの完成形として使いません。
- 現行の`record_game_play`は`play_id`を受け取らないため、新規ゲームの開始記録には使いません。

## 6. ランキング送信

- 名前は開始前に必須とします。
- 名前が確定し、開始処理が成立した時にプレイ回数を1回数えます。
- 一つのプレイに一つの`play_id`を使います。
- ランキング対象の終了条件が成立した時に自動送信します。
- 一つの結果に一つの`submission_id`を使います。
- 自動送信と再送で、同じ`submission_id`と同じ内容を使います。
- Supabase側で同じ`submission_id`を1件として扱います。
- 結果画面の任意の「ランキング登録」ボタンだけで送る作りにしません。
- 送信中フラグだけを二重登録対策として扱いません。
- 初回ランキングとベストランキングの両方を扱います。
- スコアの良い方向と表示倍率をSupabase登録値に合わせます。

## 7. 送信状態と再送

送信状態は、次の固定値で管理します。

- `idle`
- `submitting`
- `submitted`
- `retryable_failed`
- `permanent_failed`

表示中の日本語を読み取って、再送ボタンの状態を決めてはいけません。

再送ボタンは、`retryable_failed`だけで表示して有効にします。押した直後に状態を変え、成功後は非表示にします。iPhone Safariの本番URLで、実際に押せることを確認します。

## 8. URL、モジュール、キャッシュ

- Supabase、`<link rel="canonical">`、シェア文、実験場リンクで正式URLを完全一致させます。
- 正式URLへクエリやハッシュを入れません。
- 同じJavaScriptモジュールを、クエリ付きとクエリなしで同時に読み込みません。
- JavaScript内部の同じファイルへの`import`は、すべて同じ表記にします。
- 入口ファイルの公開版を更新し、本番URLで配備内容を確認します。
- ソースコードが正しいだけで、GitHub Pagesの配備物も正しいと判断しません。

## 9. ブラウザ通信

- Supabase JavaScriptクライアント、または検証済みの共通REST処理を使います。
- 取り出したネイティブ`fetch`を使う場合は、呼び出し先を`globalThis`へ固定します。
- 時間切れを設けます。
- HTTP成功だけで登録成功と判断せず、戻り値の件数、型、識別子、名前、スコアを確認します。
- ランキング通信が失敗しても、ゲーム結果、再戦、シェア、ホーム操作を残します。
- 利用者向け表示と、調査用の構造化情報を分けます。

## 10. 実験場トップと詳細ランキング

- 実験場トップの本番値はSupabase `public.games`です。
- 固定配列だけを正にしません。
- `is_active = true`だけを表示します。
- `display_order`で並べます。
- 複数モードは、マニフェストの代表`game_slug`を使います。
- 詳細ランキングは`ranking.html?game=game_slug`形式です。
- 同率順位はRPCの`rank_no`を使います。
- `index + 1`で順位を作りません。

## 11. 登録と公開

新規ゲームは、最初に`is_active = false`で登録します。

1. マニフェストを検査する。
2. ゲーム実装と照合する。
3. Supabase登録値とRPCを確認する。
4. 候補SHAと正式URLを固定する。
5. 対象行を有効化する。
6. iPhone Safariの本番URLで開始、終了、送信、再送、トップ、詳細を確認する。
7. 失敗した場合は`is_active = false`へ戻す。
8. すべて通った場合だけ有効状態を維持する。

空欄、未実施、推測を合格にしません。

## 12. よくある失敗を防ぐ禁止事項

- `game_slug`をURLや表示名から推測する。
- Supabaseだけを直してマニフェストを残さない。
- マニフェストだけを直して本番登録を放置する。
- 旧モードの`game_slug`を再送キューや固定配列へ残す。
- `submit_score`へ再送機能を追加し、重複登録を防いだつもりになる。
- サイノメ専用の`submit_score_once`を全ゲーム共通として呼ぶ。
- 表示文言を正規表現で見て、再送ボタンを有効にする。
- 同じ内部モジュールを異なるURLで読み込む。
- 試験用クエリ付きURLをSupabaseやシェアへ保存する。
- 自動テストだけでiPhone Safariの本番確認を省く。
- 原因を分けず、Edge Function、RPC、URL、キャッシュを同時に変更する。
- 失敗記録を先に削除して、調査証拠を失う。
- 修正対象外のゲーム仕様や機能を削除する。

## 13. 修正時の確認順

1. マニフェストとゲーム固有仕様を確認する。
2. 現在配備されている公開版を確認する。
3. 正式URL、`game_slug`、`client_version`を固定する。
4. ブラウザが要求を開始したか確認する。
5. Supabaseへ要求が到達したか確認する。
6. RPCの応答と保存先を確認する。
7. 実験場トップと詳細ランキングを確認する。
8. 一つの原因に対して一つの修正を行う。
9. 同じ候補SHAで受入試験を最初からやり直す。

## 14. コードを書く時の姿勢

予定外の機能削除を避けます。対応負荷を理由に既存仕様を切り捨てません。

大きな変更では、影響範囲を確認し、変更し、配備物を確認し、最後に本番端末で受け入れます。ソースコード、自動テスト、Supabase、本番表示の一部だけを見て完了としません。
