# ファイトフライトの実験場表示

通常 `faitofuraito_normal`、イージー `faitofuraito_easy` を一作品として表示する。トップは通常モードのベストを代表順位に使い、開始回数は2モードを足す。登録名数は各モードの値を合算するため、同じ名前が両方を遊んだ場合は2として数える。ラベルも「登録名（モード別合計）」とし、人物数とは扱わない。

詳細ページのタブはモードごとに切り替える。名前なし開始は `get_faitofuraito_play_stats_v1` の `unregistered_play_count` で数え、「名前未登録」「順位対象外」としてプレイ回数欄の末尾に表示する。初回・ベストやプレイ回数順位へは入れず、既存の「不正ユーザー」欄へも入れない。名前あり開始は既存のランキング表を使う。ゲーム結果画面の上位30件はゲーム側の取得条件である。

本番の新規2行は移行 `20260929035730_faitofuraito_ranking_guest_v1` で登録済みだが、現在どちらも `is_active=false`。このブランチの `catalog/games.json` は有効化後の期待値を示す。静的トップ・詳細予備データは非公開扱いとし、本番DB行が有効化されたときだけライブ一覧から表示する。ゲームの候補版、実験場、DBを照合してから有効化する。

検査（2026-09-29）: `node scripts/validate-lab.mjs` は38 catalog game / 38 ranking entryで合格。Chromiumの393×852模擬画面を全RPCモックで確認した。トップは1カード、通常3回＋イージー2回＝合計5回、登録名はモード別合計2。詳細は2タブ、通常の名前未登録2回が順位対象外に表示され、名前ありの1位と別行、不正欄は非表示。カタログ取得失敗時は静的トップ・詳細で本作を表示しない。JS例外はなし。記録は [`evidence/faitofuraito-lab-smoke.json`](../evidence/faitofuraito-lab-smoke.json)、画像は [`evidence/faitofuraito-lab-ranking-393x852.png`](../evidence/faitofuraito-lab-ranking-393x852.png)。模擬ブラウザでありiPhone Safariの本番確認とは別である。

## この作品に限るマニフェスト拡張

ユーザー指定の名前任意プレーに合わせ、v1スキーマは `game_id=faitofuraito` のときだけ `player_name.required_before_start=false` と `required_for_ranking=true` を要求する。`play_count.rpc` は名前あり開始の `start_game_play_v1`、追加した `unregistered_rpc` は `start_faitofuraito_guest_play_v1` に固定する。他作品は従来の名前必須条件を維持し、この追加項目を許可しない。RPC名の欄に説明文を入れたり、実装と異なる名前必須フラグで検査を通したりしない。

`jsonschema 4.25.1` の `Draft202012Validator` で更新スキーマとゲーム側マニフェスト、従来のexampleを検証して合格。名前必須への逆戻り・ランキング用条件欠落・ゲストRPC欠落/誤記・他作品での名前任意化/ゲスト項目使用の6負例はすべて拒否した。
