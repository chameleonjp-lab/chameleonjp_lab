# ゲーム側ランキング実装の必須要件

最終更新: 2026-08-29  
対象: 新規ゲーム、既存ゲームのランキング追加・修正

> 最上位規約は`11_ranking_integration_standard.md`です。  
> この文書は、ゲーム側へ実装する内容を説明します。

## 1. 実装前に連携値を固定する

ゲームのファイル構成は自由です。`index.html`一つに限定しません。

実装前に、ゲーム側のリポジトリへ`ranking-manifest.json`を作ります。形式は次を使います。

- `docs/chameleonjp-lab/schemas/ranking-manifest-v1.schema.json`
- `docs/chameleonjp-lab/examples/ranking-manifest-v1.example.json`

正式URL、`game_id`、`client_version`、`submission_mode`、すべての`game_slug`、スコア表示、送信対象結果、開始記録RPC、スコア送信RPC、名前保存キーを記録します。公開用キーや秘密情報は入れません。

ゲーム側の値は、一つの設定モジュールへまとめます。

```js
export const RANKING_CONFIG = Object.freeze({
  gameId: "sample_game",
  canonicalUrl: "https://chameleonjp-lab.github.io/sample_game/",
  releaseId: "sample_game-20260819-01",
  clientVersion: "sample-game-web-1",
  submissionMode: "shared",
  representativeSlug: "sample_game_300_seconds",
  playerNameStorageKey: "chameleonjp_sample_game_player_name",
  startRpc: "replace_with_approved_start_rpc",
  scoreRpc: "replace_with_approved_score_rpc"
});

export const RANKING_SLUGS = Object.freeze({
  "300-seconds": "sample_game_300_seconds"
});
```

画面、送信、ランキング取得で同じ文字列を別々に手書きしません。`game_slug`をURLから作りません。

## 2. 正式URL、公開版、モジュール

Supabase、`<link rel="canonical">`、ホームと結果のシェア、実験場のリンクで、クエリなしの正式URLを完全一致させます。`location.href`をそのままシェアしません。

HTMLには公開版を入れます。

```html
<meta
  name="chameleonjp-release"
  content="sample_game-20260819-01"
>
<link
  rel="canonical"
  href="https://chameleonjp-lab.github.io/sample_game/"
>
<script
  type="module"
  src="./js/main.js?v=sample_game-20260819-01"
></script>
```

同じ内部モジュールを、クエリ付きとクエリなしで読み込んではいけません。

```js
// 同じファイルは、画面内で常に同じ表記を使う
import { RankingClient } from "./ranking-client.js";
```

入口ファイルだけを更新して安心せず、本番URLに配備された公開版とJavaScriptを確認します。

## 3. プレイヤー名

名前はランキング対象プレイの開始前に必須です。

- 前後の空白を除く。
- 1文字以上20文字以下。
- 空白だけを拒否する。
- 入力値を無言で短くしない。
- 画面表示、保存、開始記録、スコア送信、再送で同じ値を使う。
- 保存できなくても、今回入力した名前は利用できるようにする。

```js
export function validatePlayerName(value) {
  const name = String(value ?? "").trim();
  const length = [...name].length;

  if (length === 0) {
    return { ok: false, message: "名前を入力してください。" };
  }

  if (length > 20) {
    return {
      ok: false,
      message: "名前は20文字以内で入力してください。"
    };
  }

  return { ok: true, name };
}
```

サーバー側の文字数の数え方が違う場合は、ブラウザとSupabaseを同じ規則へそろえます。

## 4. 一つのプレイに一つの`play_id`

開始要求の再送を同じプレイとして扱うため、ゲーム側で開始再送用の`start_id`を1つ作り、保存します。`play_id`はゲーム側で作らず、Supabaseの`start_game_play_v1`から受け取ります。

```js
const startId = crypto.randomUUID();
const { data: start, error } = await supabase.rpc("start_game_play_v1", {
  p_start_id: startId,
  p_display_name: playerName,
  p_game_slug: GAME_SLUG,
  p_client_version: CLIENT_VERSION
});

if (error || start?.accepted !== true || typeof start?.play_id !== "string") {
  throw new Error("ゲーム開始を受け付けられませんでした。");
}

const playId = start.play_id;
```

開始処理を再送する時は、最初に保存した同じ`start_id`を使います。同じ`start_id`、名前、ゲーム、版であれば、同じ`play_id`が返り、新しいプレイは増えません。開始処理が受け付けられるまでゲーム本体を始めません。

1. 名前を確定する。
2. 開始要求用の`start_id`を1つ作り、保存する。
3. `start_game_play_v1`へ送る。
4. 返された`play_id`を結果画面まで保持する。
5. 応答が失われた時は、同じ`start_id`で再送する。
6. 開始ボタンの連打で新しい`start_id`を作らない。

ページを開いた時、名前を入力した時、チュートリアルを見た時には数えません。再戦で新しいゲームを始めた時は、新しい`start_id`を作ります。

## 5. 一つの結果に一つの`submission_id`

ランキング対象の終了結果を確定したら、一つの`submission_id`を作ります。

自動送信、再送、ページ再読込後の再送で、次を変えません。

- `submission_id`
- `play_id`
- 名前
- `game_slug`
- スコア
- `client_version`
- 契約版がある場合は契約版

再送時に新しい`submission_id`を作ることを禁止します。

終了結果は一度だけ確定し、結果画面を先に表示します。利用者が「ランキング登録」を押した時だけ送る作りにしません。

## 6. 送信待ちデータ

結果を確定したら、送信前に次を保存します。

```js
{
  submissionId,
  playId,
  displayName,
  gameSlug,
  score,
  clientVersion,
  createdAt,
  attemptCount
}
```

IndexedDBを推奨します。`localStorage`を使う場合も、型、範囲、`game_slug`、`client_version`を読み込み時に検査します。

保存失敗で自動送信を止めてはいけません。

```js
async function finishGame(result) {
  if (gameState.finished) return;
  gameState.finished = true;

  const score = calculateFinalScore(result);
  const pending = createPendingSubmission({ result, score });

  showResultScreen(result, score);

  try {
    await savePendingSubmission(pending);
  } catch (error) {
    recordRankingDiagnostic({
      code: "pending-save-failed",
      error
    });
  }

  void submitPendingSubmission(pending);
}
```

成功応答を検査した後だけ待ちデータを削除します。失敗中のデータを別の内容で上書きしません。旧モードの待ちデータを現行モードへ送らないようにします。

## 7. 送信状態

画面文言ではなく、次の固定値で管理します。

```js
export const RANKING_STATES = Object.freeze({
  IDLE: "idle",
  SUBMITTING: "submitting",
  SUBMITTED: "submitted",
  RETRYABLE_FAILED: "retryable_failed",
  PERMANENT_FAILED: "permanent_failed"
});
```

文言、色、診断表示、再送ボタンを、この状態から作ります。表示中の日本語を正規表現で読み取り、ボタン状態を決めてはいけません。

| 状態 | 表示 | 再送 |
|---|---|---|
| `idle` | なし | 非表示 |
| `submitting` | 送信中 | 無効 |
| `submitted` | 登録済み | 非表示 |
| `retryable_failed` | 通信確認と再送案内 | 有効 |
| `permanent_failed` | 設定確認の案内 | 非表示 |

ランキング通信が失敗しても、結果、スコア、再戦、シェア、ホームへ戻る操作を残します。

## 8. 通信処理

Supabase JavaScriptクライアント、または検証済みの共通REST処理を使います。ゲームの描画や終了処理へRPC呼び出しを散らしません。

ネイティブ`fetch`を別の変数やクラスへ渡す時は、呼び出し先を固定します。

```js
const fetchImpl = globalThis.fetch.bind(globalThis);
```

または次の形で呼びます。

```js
await fetchImpl.call(globalThis, url, options);
```

時間切れを設けます。

```js
const controller = new AbortController();
const timeoutId = globalThis.setTimeout(
  () => controller.abort(),
  8000
);

try {
  return await fetchImpl(url, {
    method: "POST",
    signal: controller.signal
  });
} finally {
  globalThis.clearTimeout(timeoutId);
}
```

RESTを使う場合は、`apikey`、必要な`Authorization`、`Content-Type`を共通処理で付けます。公開用キーを診断表示へ出しません。

## 9. 送信前と応答後の検査

送信前に確認します。

- 名前が有効。
- モードに対応する`game_slug`が存在する。
- スコアが安全な整数。
- スコアがマニフェストの最小値と最大値の範囲内。
- `play_id`と`submission_id`が有効。
- `client_version`が有効。
- 同じ結果の送信処理が既に動いていない。

応答後に確認します。

- 受付済みである。
- 返された`submission_id`が一致する。
- `game_slug`、名前、送信スコアが一致する。
- ベストスコアとプレイ回数が妥当な整数。
- 初回か、ベスト更新か、重複再送かを判断できる。

HTTP 200だけで成功にしません。

## 10. 失敗の分類と診断

原則として再送可能:

- 通信切断
- 時間切れ
- HTTP 408
- HTTP 425
- HTTP 429
- HTTP 500番台

原則として再送だけでは直らない:

- 名前不正
- `game_slug`未登録
- `is_active = false`
- スコア範囲外
- `client_version`または契約版の不一致
- 同じ`submission_id`で内容が違う
- 権限設定の不一致

HTTP番号だけでなく、RPC名、サーバーコード、応答内容で判断します。

調査用情報には、処理名、HTTP状態、サーバーコード、`game_slug`、`client_version`、公開版、`play_id`、`submission_id`、発生時刻を含めます。公開用キー、認証情報、不要な個人情報は含めません。

## 11. 再送ボタン

再送ボタンは`retryable_failed`だけで表示して有効にします。

```html
<button
  id="ranking-retry"
  type="button"
  hidden
  disabled
>
  記録を再送する
</button>
```

```css
#ranking-retry {
  min-height: 44px;
  padding: 12px 16px;
  touch-action: manipulation;
}

#ranking-retry:disabled {
  opacity: 0.5;
}
```

押した直後に`submitting`へ変えます。連打しても同じ待ちデータを一つだけ処理します。成功後は非表示にします。

自動試験だけでなく、iPhone Safariの本番URLで、表示、押下、送信中表示、通信復帰後の成功を確認します。

## 12. シェアと実験場リンク

ホームのシェアには、ゲーム名、紹介文、正式URLを入れます。

結果のシェアには、ゲーム名、結果またはスコア、正式URLを入れます。

Web Share APIが使えない場合は同じ文をコピーします。シェア失敗をランキング失敗として扱いません。

ホームと結果画面から、現在の正式な実験場URLへ戻れるようにします。ゲームごとに古い実験場URLを残しません。

## 13. 自動試験

最低限、次を確認します。

- 名前未入力では開始できない。
- 20文字を受け付け、21文字を拒否する。
- 正しいモードから正しい`game_slug`を選ぶ。
- 終了処理を2回呼んでも結果を一つだけ作る。
- 自動送信と再送で同じ`submission_id`を使う。
- 送信中の連打で処理を増やさない。
- 再送可能な失敗でボタンが有効になる。
- 恒久的失敗でボタンが出ない。
- 成功後に待ちデータを削除する。
- 応答の識別子またはスコアが違う時に成功扱いしない。
- 保存失敗後も即時送信を試す。
- 同じ内部モジュールを複数URLで読み込まない。
- 配備物に公開版と正式URLが含まれる。

## 14. 本番受入と完了条件

同じ候補SHAと正式URLで、iPhone Safariから次を確認します。

- 名前入力と開始記録
- 通常プレイと終了
- 自動送信
- Supabase保存
- 実験場トップ
- 詳細ランキング
- 通信切断時の結果画面
- 再送ボタン
- 通信復帰後の成功
- 同じ結果の重複なし
- シェアの正式URL
- 通常再読込後の公開版

次がすべて通った時だけ完了です。

1. マニフェストが検査に合格した。
2. 実装、配備物、Supabaseが同じ値を使う。
3. 一つの開始が一回だけ数えられる。
4. 一つの結果が一回だけ登録される。
5. 通信失敗後に同じ内容を再送できる。
6. 結果画面が残る。
7. 実験場トップと詳細ランキングへ表示される。
8. iPhone Safariの正式URLで確認済みである。
