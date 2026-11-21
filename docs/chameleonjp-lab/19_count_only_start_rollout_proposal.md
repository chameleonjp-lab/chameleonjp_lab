# 通常プレー開始回数の計測：ローカル PostgreSQL 提案

**状態:** 隔離レビュー用の提案、SQLフィクスチャ、テストの3ファイル。製品・本番・既存集計を変更せず、既存DBに適用する移行ファイルではない。

## 要件

公開・登録済み対象の既存モードで、受理済み通常プレーの開始を名前あり／なしとも一度だけ数える。練習、開始失敗、重複タップ、再送、再読込、途中再開、結果の表示・確定・再送から加算しない。別の再戦が実際に受理されたときだけ新ID。名前付きランキングは独立し、開始時に有効な名前がある確定結果だけを既存通り処理する。旧記録、参加人数、識別値、ゲームルール、旧公開の集計経路を上書きしない。

## 隔離フィクスチャの契約

- 入力は v4 UUID、既存mode、クライアントversion、`normal-start` のみ。ゲートの mode/version が許可されたときだけ、データベース側で決めたコホートに分類する。ゲートは既定無効でキー／コホートの変更不可、既に受理された行は変更・削除不可。
- 台帳の列は開始ID、mode、version、コホート。名前、スコア、結果、端末ID、参加者ID、既存ユーザー行・設定を持ち込まない。同じ開始の再送は受理済みIDの再利用。同じIDの別mode/versionは拒否。承認・拒否・再送待ちの判定はACK内容で照合し、応答断だけで別IDを作らない。
- READ COMMITTED の短いトランザクションで、同じIDの直列化、一意制約、外部キー、受理時のゲート行ロックを組み合わせる。障害時は未確定／既存ACKと区別する。インメモリ完了通知だけで受理確定扱いしない。実DBの並行性は後述のソケットテストで証明する。
- `SECURITY INVOKER`、空の search_path、必要なオブジェクト名の明示、既定公開権限の剥奪、RLSは隔離fixtureだけ。誰にも本番権限を付けない。定義用ガードは誤用防止であり本番認可や攻撃対策ではない。ブラウザ入力と受理マークだけでは本当に遊んだ事実・個人を証明しない。負荷・濫用・容量・保持の条件は別レビューし、秘密や詳細ログを外へ出さない。
- フロントが通信失敗で開始を妨げたり結果を消したりしない。オフラインでタブを閉じたまま戻らない場合などを全件計測とは呼ばない。

## 旧合計へ統合できない条件

固定Lab版 `cfd45d42b8fbb01686f66261a89f127b0db3a28e` の [既存SQL](https://github.com/chameleonjp-lab/chameleonjp_lab/blob/cfd45d42b8fbb01686f66261a89f127b0db3a28e/docs/chameleonjp-lab/sql/20261013202016_restore_legacy_play_count_ranking.sql#L22-L48) は名前ごとの旧成績回数と名前付き開始回数の大きい方を採る。旧100／開始1が旧100／開始2になっても100。旧画面105と新コホート10だけでは、重複なしなら115、5重複なら110であり観測値が同じ。旧集計105自体が歴史上の一意開始の集合を全部実測したという意味でもない。

混在中の旧資産は遅延終了・旧ブラウザーからの書き込みがあり、終了時刻で切ったり既存合計に新版を加算しても厳密値にならない。[Inuboの既存SQL](https://github.com/chameleonjp-lab/chameleonjp_lab/blob/cfd45d42b8fbb01686f66261a89f127b0db3a28e/docs/chameleonjp-lab/sql/inubo-lab-integration.sql#L39-L47) のように同じrun IDで重複を除ける場合、または相互排他的な寄与を別途証明したモードだけ統合を検討する。ホームと詳細の通常／Flight／Inubo／Chameleolのreaderは異なり、過去SQLの差し戻し・全面置換で別モードを壊さない。既存人数、詳細の名前別回数ランキング、音や翻訳は今回のfixtureに含めない。

**判断が必要な場合:** 各modeのID等の証拠が得られず統合値が求められるとき。選択は旧表示を維持して新計測を別に検証するか、比較可能な時点以降に限定した新しい指標を別ラベルで表示するか。後者の表示範囲・旧ブラウザー対応・集計切替はここでは実装しない。

## 先行検証の参照例（まだ対象への接続はしない）

カメレオるの通常プレーは参照例。[固定版の実プレイ入場](https://github.com/chameleonjp-lab/chameleol/blob/e7c1c157484e66699c5cdc3d0f665eb78ba179b6/src/app.js#L807-L889)は予約と入場を分離し、名前の有無にかかわらず同じ開始ID体系を使う。[端末保存](https://github.com/chameleonjp-lab/chameleol/blob/e7c1c157484e66699c5cdc3d0f665eb78ba179b6/src/storage/store.js#L175-L192)と[再送](https://github.com/chameleonjp-lab/chameleol/blob/e7c1c157484e66699c5cdc3d0f665eb78ba179b6/src/net/start.js#L124-L167)を追跡でき、[保存と集計の既存SQL](https://github.com/chameleonjp-lab/chameleol/blob/e7c1c157484e66699c5cdc3d0f665eb78ba179b6/supabase/migrations/20261118100000_release_metrics.sql)と[実験場の専用読取](https://github.com/chameleonjp-lab/chameleonjp_lab/blob/cfd45d42b8fbb01686f66261a89f127b0db3a28e/chameleol-ranking.js#L63-L66)がある。この専門経路を他作品に使う設計ではない。タイムアタック・練習・従来のランキング送信は対象外。

固定版の通知コードを通信不能なVM、インメモリ保存、模擬受付に接続した3ケースで、開始前取消、応答喪失・再読込時の同じID再送、結果による重複なし、別の再戦と別の保存先を確認した。SQL／Edgeの実行、端末の実保存、公開上の動作、過去データの一致は未検証。先行検証を行う場合は、名前なしの初回開始と途中終了、名前ありの予約だけと実入場、旧／新版を跨ぐ再送、練習と初回ガイド、本番に接続しない切戻しをそれぞれ試す。旧readerと両立し、同じ開始の重複・順位や人数の差・既存記録の消失がない場合だけ次の設計へ進む。

## 提案の対象ファイル

このリポジトリの対象は次の3ファイルのみ:

1. `docs/chameleonjp-lab/19_count_only_start_rollout_proposal.md`
2. `scripts/fixtures/count-only-start-v2.sql`
3. `scripts/test-count-only-start-v2-postgres.mjs`

既存migration、reader、匿名RPC、fixture、Actions設定、ランキング契約への差分はゼロ。本番SQL・権限・リリース設定、アプリアダプタの接続、合計表示の変更と本番計測は本提案の対象外。

## 検証方法と今回の証拠

`node --test scripts/test-count-only-start-v2-postgres.mjs` は通常は静的ガード検査のみ。既存ローカルPGの使用が許可され、専用環境と分かっている場合だけ `LAB_RUN_ISOLATED_COUNT_V2_PG=1 node --test scripts/test-count-only-start-v2-postgres.mjs` を用いる。ハーネスは既存DSN・ソケット・環境変数指定を受け付けず、現在機で既存バイナリがそろう場合のみ新規ローカルクラスタを生成。TCPを無効化し私用ディレクトリのUNIXソケットのみ、専用DBと接続ローカルmarkerが一致したときだけ試験DDLを実行する。停止は自分のクラスタだけ、ファイルは自動再帰削除しない。

予定試験は別接続からの同時同ID・異mode、二重初期化の拒否、トランザクションabort後の同ID受理、非公開列・非公開ロール、非対応version・練習・結果、停止後新規の拒否と既存ACKの回収。同期モデルの12合格はDB試験とは別。次の公開・DB検討では混在と遅延終了・ロールバック時の二重計上なし、新規合計に旧成功値を誤加算しないことを隔離データで再現する。

**今回:** Nodeの構文検査と静的境界テストを実行。試験用サーバーとPostgreSQL SQLパーサーは環境にないため、SQL実パース・実行・トランザクション・ACL・ネットワーク検証は未実施。インストール・別サーバー・CI・本番を試していない。
