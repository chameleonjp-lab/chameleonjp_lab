# 各ゲーム `index.html` に入れるSupabase必須対応

最終更新: 2026-06-12
対象: 新規ゲーム / 既存ゲームのランキング対応

## 1. この文書の役割

この文書は、カメレオンJPで作る各ゲームの `index.html` に、ランキング送信を入れる時の必須仕様をまとめる。

このプロジェクトでは、ゲームは原則としてHTML、CSS、JavaScriptを1つにまとめた `index.html` で作る。

## 2. 絶対に必要な動き

ランキング対応ゲームでは、次の動きを必ず入れる。

| 必須項目 | 内容 |
|---|---|
| プレイヤー名 | 初回プレイ前に必須入力 |
| 名前保存 | ブラウザの `localStorage` に保存 |
| 自動送信 | ゲーム終了時に自動でSupabaseへ送信 |
| 二重送信防止 | 送信中・送信済みフラグを持つ |
| 結果表示 | 送信中、成功、失敗を結果画面に出す |
| シェア | 結果文とゲームURLを共有またはコピー |
| 実験場リンク | カメレオンJPの実験場へ戻れるようにする |

結果画面に「ランキング登録」ボタンを置いて、プレイヤーが押した時だけ送信する作りにしてはいけない。

## 3. 共通定数

ゲーム側には、最低限次の定数を置く。

```js
const GAME_SLUG = "ここに_game_slug";
const CLIENT_VERSION = "ゲーム名_vYYYYMMDD_01";
const SUPABASE_URL = "https://mlpnjgezrnhdxsxolyzj.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_drzcy0v97knU6FgjqSgBHw_0A9XPdFM";
const LAB_URL = "https://chameleonjp.codeberg.page/chameleonjp_lab/";
```

`GAME_SLUG` はSupabase `public.games.game_slug` と完全一致させる。

## 4. Supabaseクライアントの読み込み

HTML内でSupabase JavaScriptクライアントを読み込む。

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
```

JavaScript側では次のように作る。

```js
const supabaseClient = window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
  : null;
```

読み込み失敗時でも、ゲーム本体は遊べるようにする。ランキング送信だけ失敗表示にする。

## 5. 名前入力

プレイヤー名は必須にする。

保存キーは、ゲームごとに分ける。

```js
const NAME_STORAGE_KEY = `chameleonjp_${GAME_SLUG}_player_name`;
```

名前は長すぎるとランキング表示が壊れるため、10文字程度を上限にする。空白だけの名前は不可にする。

```js
function normalizeDisplayName(value) {
  return String(value || "").trim().slice(0, 10);
}
```

## 6. スコアの作り方

Supabaseへ送る `score` は内部整数にする。

| 種別 | 表示 | 内部整数 |
|---|---:|---:|
| 点数 | `12345点` | `12345` |
| 秒、小数2桁 | `34.15秒` | `3415` |
| 秒、小数3桁 | `1.234秒` | `1234` |
| パーセント | `87%` | `87` |

ゲーム側と `public.games.score_scale` は必ず合わせる。

例として、秒を3桁で表示するゲームなら、ゲーム側ではミリ秒をそのまま送る。

```js
const finalTimeMs = 1234;
const score = finalTimeMs;
```

Supabase `games` 側は次にする。

```text
score_unit = '秒'
score_scale = 1000
score_decimals = 3
score_order = 'asc'
```

## 7. スコア送信関数

ゲーム終了時に、次の形で送信する。

```js
let scoreSubmitStarted = false;
let scoreSubmitFinished = false;

async function submitGameScore(finalScore) {
  if (scoreSubmitStarted || scoreSubmitFinished) return;

  scoreSubmitStarted = true;
  setRankingStatus("ランキング送信中...");

  const displayName = normalizeDisplayName(localStorage.getItem(NAME_STORAGE_KEY));
  if (!displayName) {
    setRankingStatus("名前が未入力のため、ランキング送信できませんでした。");
    scoreSubmitStarted = false;
    return;
  }

  if (!supabaseClient) {
    setRankingStatus("Supabaseを読み込めなかったため、ランキング送信できませんでした。");
    scoreSubmitStarted = false;
    return;
  }

  try {
    const { error } = await supabaseClient.rpc("submit_score", {
      p_display_name: displayName,
      p_game_slug: GAME_SLUG,
      p_score: Math.trunc(Number(finalScore || 0)),
      p_client_version: CLIENT_VERSION
    });

    if (error) throw error;

    scoreSubmitFinished = true;
    setRankingStatus("ランキングへ送信しました。");
  } catch (error) {
    console.error("submit_score failed", error);
    setRankingStatus("ランキング送信に失敗しました。通信状態を確認してください。");
  } finally {
    scoreSubmitStarted = false;
  }
}
```

`setRankingStatus` は、結果画面の表示を更新する関数として各ゲーム側で作る。

## 8. ゲーム終了時の呼び方

ゲームが終わった瞬間に、結果画面を表示し、その中で自動送信を始める。

```js
function finishGame(result) {
  if (gameState.finished) return;
  gameState.finished = true;

  const finalScore = calculateFinalScore(result);
  showResultScreen(result, finalScore);
  submitGameScore(finalScore);
}
```

重要なのは、結果画面でユーザーにボタンを押させてから送るのではなく、終了時に自動で送ること。

## 9. 結果画面の必須表示

結果画面には最低限次を置く。

| 要素 | 内容 |
|---|---|
| 結果 | 勝敗、スコア、タイム、クリア状況など |
| ランキング送信状態 | 送信中、成功、失敗 |
| もう一度 | 同じゲームを再開 |
| 結果をシェア | Web Share APIまたはコピー |
| ゲーム終了 | ホームへ戻る |
| 他のゲームで遊ぶ | 実験場トップへ移動 |

`ランキング登録` のような任意送信ボタンは置かない。

## 10. シェア文

シェア文には、ゲーム名、結果、ゲームURLを入れる。

例:

```js
function buildShareText(resultLabel, scoreText) {
  return `${document.title}\n結果: ${resultLabel}\nスコア: ${scoreText}\n${location.href}`;
}
```

使える場合は `navigator.share` を使い、使えない場合は `navigator.clipboard.writeText` を使う。

## 11. リタイア時の扱い

リタイアがあるゲームでは、仕様に合わせてリタイア結果も送る。

スコアを0にするか、到達波数や失敗タイムとして送るかはゲーム仕様で決める。ただし、送る場合も `submit_score` を使い、自動送信する。

## 12. スマホ操作対策

各ゲームはスマホ操作が前提なので、最低限次を入れる。

```html
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
```

CSSでは、次のような対策を入れる。

```css
html, body {
  margin: 0;
  width: 100%;
  min-height: 100%;
  overflow-x: hidden;
  -webkit-text-size-adjust: 100%;
  overscroll-behavior: none;
}

button, a {
  touch-action: manipulation;
}

.game-root {
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}
```

ゲーム操作に支障がある場合は、`touchmove` や複数指操作の抑制も入れる。

## 13. よくある失敗

- `GAME_SLUG` とSupabase `games.game_slug` がずれている。
- 結果画面に任意のランキング登録ボタンを置く。
- 送信中フラグがなく、二重送信される。
- 名前未入力でも開始できてしまう。
- 秒系ゲームで内部整数と表示小数がずれる。
- `service_role` キーを入れる。
- Supabase送信失敗でゲーム結果画面まで消える。

## 14. 修正後の確認項目

各ゲームにランキング対応を入れた後は、最低限次を確認する。

- 名前未入力では開始できない。
- 名前が保存される。
- ゲーム終了時に自動で送信される。
- 結果画面に送信状態が出る。
- 同じ結果が二重送信されない。
- Supabaseエラーでも結果画面が残る。
- 実験場トップと詳細ランキングで記録が表示される。
- iPhone SE級の横幅で操作できる。
