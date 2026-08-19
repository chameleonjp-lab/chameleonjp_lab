# ゲーム側ランキング実装の必須要件

最終更新: 2026-08-19  
対象: 新規ゲーム、既存ゲームのランキング追加・修正

> ランキング連携の最上位規約は`11_ranking_integration_standard.md`です。  
> この文書は、ゲーム側へ実装する内容を説明します。

## 1. ゲームのファイル構成

ゲームを`index.html`一つにまとめる必要はありません。

- 小規模ゲームは一ファイルでもよい。
- JavaScript、CSS、画像、音声、3Dデータを分割してよい。
- 既存の分割構成を、ランキング対応だけを理由に一ファイルへ戻さない。
- どの構成でも、正式URL、`game_slug`、`client_version`、送信状態を一か所で確認できるようにする。

## 2. 最初に作るファイル

ランキング実装を始める前に、ゲーム側のリポジトリへ`ranking-manifest.json`を作ります。

形式:

- `docs/chameleonjp-lab/schemas/ranking-manifest-v1.schema.json`
- `docs/chameleonjp-lab/examples/ranking-manifest-v1.example.json`

マニフェストには、次を入れます。

- 正式URL
- `game_id`
- `client_version`
- `submission_mode`
- 代表`game_slug`
- すべてのモードと`game_slug`
- スコアの順序、単位、倍率、小数桁
- 送信対象となる終了結果
- プレイ開始記録RPC
- スコア送信RPC
- 名前保存キー

公開用キーや秘密情報は入れません。

## 3. 実装値を一か所へまとめる

ゲーム側では、少なくとも次を一つの設定オブジェクトまたは設定モジュールへまとめます。

```js
export const RANKING_CONFIG = Object.freeze({
  gameId: "sample_game",
  canonicalUrl: "https://chameleonjp-lab.github.io/sample_game/",
  clientVersion: "sample-game-web-1",
  submissionMode: "shared",
  representativeSlug: "sample_game_300_seconds",
  playerNameStorageKey: "chameleonjp_sample_game_player_name"
});
```

各モードの`game_slug`も、一つの対応表にします。

```js
export const RANKING_SLUGS = Object.freeze({
  "300-seconds": "sample_game_300_seconds"
});
```

画面、送信処理、ランキング取得処理で別々の文字列を手書きしません。

## 4. 正式URL

正式URLは、マニフェストと同じ値を使います。

```js
export const CANONICAL_GAME_URL =
  "https://chameleonjp-lab.github.io/sample_game/";
```

次で同じ値を使います。

- `<link rel="canonical">`
- ホーム画面のシェア
- 結果画面のシェア
- 実験場へ登録する`game_url`
- ゲーム内の「URLをコピー」
- 受入記録

`location.href`をそのままシェアすると、試験用クエリやハッシュが入るため、正式URLを使います。

## 5. 公開版

HTMLへ公開版を入れます。

```html
<meta
  name="chameleonjp-release"
  content="sample_game-20260819-01"
>
```

入口のCSSやJavaScriptには、公開版を表すクエリを付けてもかまいません。

```html
<link rel="stylesheet" href="./css/style.css?v=sample_game-20260819-01">
<script
  type="module"
  src="./js/main.js?v=sample_game-20260819-01"
></script>
```

同じ内部モジュールを、クエリ付きとクエリなしで混在させません。

```js
// 正しい: 同じファイルは同じ表記だけで読む
import { RankingClient } from "./ranking-client.js";
```

```js
// 禁止: 同じ画面内で別URLとして読む
import { RankingClient } from "./ranking-client.js";
import { RankingClient as OtherClient }
  from "./ranking-client.js?v=sample_game-20260819-01";
```

## 6. プレイヤー名

名前は、ランキング対象プレイの開始前に必須です。

最低条件:

- 前後の空白を除く。
- 1文字以上20文字以下。
- 空白だけを拒否する。
- 入力値を無言で短く切らない。
- 画面に表示した名前と送信する名前を同じにする。
- 保存できなくても今回のプレイには使えるようにする。
- 保存失敗は、名前不正とは分けて表示する。

例:

```js
export function validatePlayerName(value) {
  const name = String(value ?? "").trim();

  if (name.length === 0) {
    return { ok: false, name: "", message: "名前を入力してください。" };
  }

  if ([...name].length > 20) {
    return {
      ok: false,
      name: "",
      message: "名前は20文字以内で入力してください。"
    };
  }

  return { ok: true, name, message: "" };
}
```

JavaScriptの`length`だけでは、一部の絵文字を複数文字として数えます。上の例では`[...name].length`を使います。サーバー側の数え方と異なる場合は、同じ規則へそろえます。

## 7. 一つのプレイに一つの`play_id`

開始ボタンが受け付けられたら、重複しない`play_id`を作ります。

```js
function createId() {
  if (typeof crypto?.randomUUID === "function") {
    return crypto.randomUUID();
  }

  throw new Error("このブラウザでは安全な送信IDを作れません。");
}
```

開始処理の流れ:

1. 名前を確定する。
2. `play_id`を作る。
3. マニフェストで指定した開始記録RPCへ送る。
4. 受付が確認できたら、カウントダウンまたはゲームを始める。
5. 通信が一時的に失敗した場合は、同じ`play_id`で再送する。
6. 同じ開始操作の連打では、新しい`play_id`を作らない。

ページを開いた時やチュートリアルを開いた時には数えません。

開始記録が必須のゲームで受付を確認できない場合は、ランキング対象外として始めるのか、開始を止めるのかをゲーム固有仕様へ書きます。黙ってプレイ回数だけ欠落させません。

## 8. 一つの結果に一つの`submission_id`

ランキング対象の結果が確定した瞬間に、一つの`submission_id`を作ります。

同じ結果の自動送信、通信後の再送、ページ再読み込み後の再送では、次を変えません。

- `submission_id`
- `play_id`
- プレイヤー名
- `game_slug`
- スコア
- `client_version`
- 契約版がある場合は契約版

再送時に新しい`submission_id`を作ると、Supabase側では別の結果として見えるため禁止します。

## 9. 送信待ちデータの保存

結果を確定したら、送信前に次のデータをブラウザへ保存します。

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

保存先はIndexedDBを推奨します。小規模ゲームで`localStorage`を使う場合も、次を守ります。

- 保存できなくても自動送信は試す。
- 保存失敗を、送信禁止の条件にしない。
- 成功応答を検査した後だけ待ちデータを削除する。
- 失敗中のデータを上書きせず、同じ内容で残す。
- 保存値を読み込む時に型、範囲、`game_slug`、`client_version`を検査する。
- 破損した値をそのまま送らない。
- 別モードや旧`game_slug`の待ちデータを混ぜない。

## 10. 送信状態

送信状態は、次の固定値だけを使います。

```js
export const RANKING_STATES = Object.freeze({
  IDLE: "idle",
  SUBMITTING: "submitting",
  SUBMITTED: "submitted",
  RETRYABLE_FAILED: "retryable_failed",
  PERMANENT_FAILED: "permanent_failed"
});
```

表示文言から状態を推測しません。

例:

```js
function renderRankingState(state, detail = null) {
  switch (state) {
    case RANKING_STATES.SUBMITTING:
      status.textContent = "ランキングへ送信しています…";
      retryButton.hidden = false;
      retryButton.disabled = true;
      retryButton.textContent = "送信中…";
      break;

    case RANKING_STATES.SUBMITTED:
      status.textContent = "ランキングへ登録しました。";
      retryButton.hidden = true;
      retryButton.disabled = true;
      break;

    case RANKING_STATES.RETRYABLE_FAILED:
      status.textContent =
        "記録を送信できませんでした。通信状態を確認して再送してください。";
      retryButton.hidden = false;
      retryButton.disabled = false;
      retryButton.textContent = "記録を再送する";
      break;

    case RANKING_STATES.PERMANENT_FAILED:
      status.textContent =
        "記録を受け付けられませんでした。設定を確認してください。";
      retryButton.hidden = true;
      retryButton.disabled = true;
      break;

    default:
      status.textContent = "";
      retryButton.hidden = true;
      retryButton.disabled = true;
  }

  diagnosticOutput.textContent = detail?.diagnostic ?? "";
}
```

## 11. ゲーム終了時の自動送信

ゲームの終了処理は、結果確定を一度だけ行います。

```js
async function finishGame(result) {
  if (gameState.finished) return;
  gameState.finished = true;

  const finalScore = calculateFinalScore(result);
  const pending = createPendingSubmission({
    result,
    score: finalScore
  });

  showResultScreen(result, finalScore);
  await savePendingSubmission(pending);
  void submitPendingSubmission(pending);
}
```

`submitPendingSubmission`は、マニフェストで指定された同一送信対策付きRPCを使います。

結果画面の表示を、通信完了まで待たせません。

## 12. 送信処理の最低条件

送信処理は、次を必ず検査します。

送信前:

- 名前が有効。
- `game_slug`が対応表に存在する。
- スコアが安全な整数。
- スコアがマニフェストの最小値と最大値の範囲内。
- `submission_id`と`play_id`が有効。
- `client_version`が有効。
- 同じ結果の送信処理が既に動いていない。

応答後:

- 受付済みである。
- 返された`submission_id`が一致する。
- 返された`game_slug`が一致する。
- 返された名前が一致する。
- 返された送信スコアが一致する。
- ベストスコアとプレイ回数が整数。
- 重複再送かどうかが分かる。

HTTP 200だけを見て成功にしません。

## 13. 通信の呼び方

### 13.1 Supabase JavaScriptクライアント

検証済みのSupabase JavaScriptクライアントを使える場合は、共通ラッパーから呼びます。

ゲームの描画コードや終了処理へ、RPC呼び出しを直接散らしません。

### 13.2 REST

RESTを使う場合は、共通の通信クラスへまとめます。

ネイティブ`fetch`を受け取る時は、次のように呼び出し先を固定します。

```js
export class RankingTransport {
  constructor({
    fetchImpl = globalThis.fetch.bind(globalThis),
    timeoutMs = 8000
  } = {}) {
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
  }
}
```

または、呼び出す時に次を使います。

```js
await this.fetchImpl.call(globalThis, url, options);
```

`this.fetchImpl(url, options)`の形で、ネイティブ`fetch`へ別の`this`を渡さないようにします。

## 14. 時間切れ

通信には時間切れを設けます。

```js
const controller = new AbortController();
const timeoutId = window.setTimeout(
  () => controller.abort(),
  8000
);

try {
  const response = await fetchImpl(url, {
    method: "POST",
    signal: controller.signal
  });
} finally {
  window.clearTimeout(timeoutId);
}
```

時間切れは`retryable_failed`として扱います。

## 15. 失敗の分類

次は原則として再送可能です。

- 通信切断
- 時間切れ
- HTTP 408
- HTTP 425
- HTTP 429
- HTTP 500番台

次は原則として再送だけでは直りません。

- 名前不正
- `game_slug`未登録
- `is_active = false`
- スコア範囲外
- `client_version`不一致
- 契約版不一致
- `submission_id`と内容の競合
- 権限設定不一致

HTTP番号だけでなく、RPC名、サーバーコード、応答内容を使って分けます。

## 16. 診断情報

利用者向けの文と、調査用情報を分けます。

調査用情報:

```js
{
  code,
  retryable,
  rpcName,
  httpStatus,
  serverCode,
  serverMessage,
  gameSlug,
  clientVersion,
  releaseId,
  submissionId,
  playId,
  occurredAt
}
```

次は出しません。

- Publishable key
- 認証トークン
- `service_role`キー
- 不要な個人情報
- 保存データの全文

`console.error`だけに頼らず、結果画面の折りたたみ表示や診断イベントから確認できるようにします。

## 17. 再送ボタン

HTML例:

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

CSS例:

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

JavaScript例:

```js
retryButton.addEventListener("click", async () => {
  if (rankingState !== RANKING_STATES.RETRYABLE_FAILED) return;

  const pending = await loadCurrentPendingSubmission();
  if (!pending) {
    setRankingState(
      RANKING_STATES.PERMANENT_FAILED,
      { diagnostic: "pending submission not found" }
    );
    return;
  }

  await submitPendingSubmission(pending);
});
```

ボタンを表示するだけでなく、次を試験します。

- `hidden`が外れる。
- `disabled`が外れる。
- タップ直後に表示が変わる。
- 連打しても一つの処理だけ動く。
- 成功後に消える。
- iPhone Safariで押せる。

## 18. シェア

ホームのシェア:

- ゲーム名
- 紹介文
- 正式URL

結果のシェア:

- ゲーム名
- スコアまたは結果
- 正式URL

`location.href`ではなく、設定された正式URLを使います。

Web Share APIが使えない場合は、クリップボードへ同じ文をコピーします。シェアの失敗をランキングの失敗として扱いません。

## 19. 実験場リンク

ホームと結果画面から、カメレオンJPの実験場へ戻れるようにします。

実験場URLは共通設定から使い、ゲームごとに古いCodeberg URLを残しません。正式な実験場URLを変更する場合は、共通文書と対象ゲームを同じ計画で更新します。

## 20. スマホ操作

最低限、次を確認します。

```html
<meta
  name="viewport"
  content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
>
```

```css
html,
body {
  margin: 0;
  width: 100%;
  min-height: 100%;
  overflow-x: hidden;
  -webkit-text-size-adjust: 100%;
  overscroll-behavior: none;
}

button,
a {
  touch-action: manipulation;
}
```

ランキング結果、診断表示、再送ボタンを追加したために横スクロールが発生しないようにします。

## 21. 自動試験

最低限、次を自動確認します。

- 名前未入力では開始できない。
- 20文字の名前を受け付ける。
- 21文字の名前を拒否する。
- モードから正しい`game_slug`を選ぶ。
- スコアを整数として検査する。
- 終了処理を2回呼んでも結果を一つだけ作る。
- 自動送信と再送で同じ`submission_id`を使う。
- 送信中の連打で処理を増やさない。
- 再送可能な失敗でボタンが有効になる。
- 恒久的失敗でボタンが出ない。
- 成功後に待ちデータを削除する。
- 応答の`game_slug`またはスコアが違う時に成功扱いしない。
- 同じ内部モジュールを複数URLで読み込まない。
- 配備物に公開版と正式URLが含まれる。

## 22. 本番受入

同じ候補SHAと正式URLで、iPhone Safariから確認します。

- 名前入力
- 開始記録
- プレイ
- 通常終了
- 自動送信
- Supabase保存
- 実験場トップ
- 詳細ランキング
- 通信切断
- 再送ボタン
- 通信復帰後の成功
- 重複なし
- シェアの正式URL
- 通常再読み込み後の公開版

ソースコードと自動試験が正しくても、本番URLの確認を省きません。

## 23. 禁止事項

- `submit_score`へ再送ボタンだけを付けて完成とする。
- 再送時に新しい`submission_id`を作る。
- 送信中フラグだけで重複登録を防ぐ。
- 表示文言を読み取ってボタン状態を決める。
- `game_slug`をURLから推測する。
- 旧モードの待ちデータを現行モードへ送る。
- `location.href`を正式URLとして保存・共有する。
- 同じモジュールを異なるURLで読む。
- ネイティブ`fetch`を誤った呼び出し先で実行する。
- ランキング失敗時に結果画面を消す。
- Publishable keyを診断表示へ出す。
- `service_role`キーをブラウザへ入れる。
- 本番確認前に完了と記録する。

## 24. 完了条件

ゲーム側のランキング実装は、次がすべて通った時に完了です。

1. `ranking-manifest.json`が検査に合格する。
2. 実装値がマニフェストと一致する。
3. 一つの開始が一回だけ数えられる。
4. 一つの結果が一回だけ登録される。
5. 自動送信が動く。
6. 通信失敗後に同じ内容を再送できる。
7. 再送しても件数が増えない。
8. 結果画面が残る。
9. 実験場トップと詳細ランキングへ表示される。
10. iPhone Safariの正式URLで確認済みである。
