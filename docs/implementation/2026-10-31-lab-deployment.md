# 実験場の検証後配信

対象: chameleonjp-lab/chameleonjp_lab。基点 `4602e17985b7e572dcbcec94471f769cc62b8e30`。作業ブランチ `codex/common-browser-spec`。開始時open PR 0件。

## 確認した公開設定

2026-10-31 GitHub Pages API: `build_type: legacy`, `source.branch: main`, `source.path: /`, `status: built`。
公開URL: https://chameleonjp-lab.github.io/chameleonjp_lab/ 。`github-pages` environmentは存在しbranch policyあり。branch protection APIは403で読取不可、保護は変更しない。
既存 `.github/workflows/validate-lab.yml` はPR/manual検証のみ。別のdynamic/pages/pages-build-deploymentがmainルートから自動公開していた。

## 今回の動作

- PR作成・更新は既存検証、DB fixture、ブラウザ試験、ビルドのみ。Pages権限・upload/deployは付与しない。
- main pushは同じ検証とビルドを通過した成果物をuploadする。deployはneedsで検証成功に依存し、同じworkflow artifactのみ使う。
- 同一event/refの古い実行をcancel。manual検証やPRがproductionをcancelしない。deploy直前にmain HEADとGITHUB_SHAが一致しなければ停止。
- `dist`は毎回消去し、HTML3枚と既存画像2点だけをコピー。release.jsonに40桁SHAを記録する。SQL/docs/tests/node_modules/.git/.env等を含めない。
- データ・表示・ゲームURL・登録・音・端末ストレージはこの実験場PRで変更しない。

## マージ前の必須設定

Settings → Pages → Build and deployment → Source を **GitHub Actions** (`build_type: workflow`) にする。これをしないままマージすると既存branch配信が検証より先に公開する可能性がある。PRの完成後に設定操作を試行し、結果をPRへ追記する。設定変更自体は公開をdispatchしない。

Settings → Environments → github-pages の既存承認/branch policyを維持し、mainが許可されていることを確認する。権限不足なら管理者が設定する。保護解除で解決しない。

## マージ後

1. merge commitに対応するValidate experiment labが成功し、deployまで緑になったことを確認。
2. 公開URLとranking.html、terms.html、画像を確認。`release.json`のcommitがmerge SHAと一致することを読む。
3. 実験場がDBから登録をロードし、ゲーム/詳細リンクが保持されることを確認（試験スコア不要）。
4. iPhone Safariで縦横・リンク・戻る・長い名前のランキングを確認。ローカルWebKitは実機確認ではない。

検証失敗なら配備ジョブは実行されず現行ページが残る。過去SHAを手動配備せず、修正PRまたはrevert PRをmainへマージする。rollbackも検証後に新しいHEADとして配信する。名前/設定/スコアを消す操作はない。

## 対応表

| 項目 | 状態 | 根拠・残作業 |
|---|---|---|
| 現在登録/公開の対象判定 | 今回確認した | 実DOM41カード・DB45 active/17 inactive・40公開URL200。ゲーム本編動作確認とは別 |
| 共通仕様記録 | 今回実装した | 17_browser_game_common_spec.md、古い名前必須指示への追補 |
| PR検証/配備の分離 | 今回実装した | push main専用upload/deploy条件、PRはread権限のみ |
| 成功したSHAの配信/競合防止 | 今回実装した | needs・同一artifact・concurrency・HEAD照合 |
| 出力制限・古い成果物除去 | 今回実装した | build-pagesとfixtureテスト |
| Pages Source設定 | 設定や権限が必要 | PR #43作成後のPUT build_type=workflowはHTTP403。Source: GitHub Actionsを管理者がマージ前に設定 |
| 実本番で新workflow配信 | 未確認・未完了 | 利用者のマージ後。今回公開はしない |
| ゲームの言語/任意名/音/共有/30名 | このPRでは未完了 | ゲーム別PR・Codebergパッチへ分担。実験場PRだけで適用済みにしない |
| 同名別人/改名と過去記録 | 未確認・未完了 | 名前をキーとする現行DB、本人確認方針と追加契約が必要 |

## 実施した検証

- `npm ci --cache /workspace/scratch/npm-cache` 成功。
- `npm test` 成功。既存カタログ/特殊表示/URL/31個のDB fixture試験と、新しい公開成果物試験。
- `npm run build` 成功。公開5ファイル＋.nojekyll＋release.json。
- `npm run test:browser` ChromiumとWebKitでcatalog/fallback双方が成功。外部APIは全てmockし本番へ送信していない。
- ローカルWebKitは不足するDebian標準ライブラリを作業ディレクトリのbrowser sys/libに展開して実行。システムの管理者権限は使っていない。インストール済みシステムライブラリだけを見る事前検査をローカルではskipし、実際のWebKit試験が通ることを確認。CIは公式の`--with-deps`を利用する。
- 別担当レビューで「manual検証がproductionをcancelし得る」指摘を修正しevent/ref単位へ分離。
- github-pagesの既存branch policyでmain許可をAPI確認。実機Safari・本番新版配備は未実施。

2026-10-31: PR #43のGitHub Actions validate成功、deployはPR条件によりskipを確認。Source更新APIは `Resource not accessible by integration` (HTTP403) で失敗し設定未変更。マージ前に管理者による上記設定が必要。自動承認審査の拒否ではなくGitHub連携の権限制限。
