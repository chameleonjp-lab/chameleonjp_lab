# 現在のゲーム一覧・実験場再現仕様

最終更新: 2026-06-21
対象: `chameleonjp_lab/index.html` / `chameleonjp_lab/ranking.html` / Supabaseランキング連携

## 1. この文書の役割

この文書は、カメレオンJPの実験場と詳細ランキングを、あとから同じ内容で再現するための実務用メモである。

既存の `00_project_overview.md` から `06_sql_templates.md` までは、共通仕様を説明する文書である。こちらの `07_current_games_catalog.md` では、現行コードに残っている固定配列、難易度別ランキング、トップページでどのランキングを出すか、詳細ページでどのランキングを出すか、画面の色指定まで含めて、復元に必要な情報をまとめる。

この更新では、GitHubリポジトリ内の現行 `index.html` と `ranking.html` から確認できる内容を正として整理した。Supabaseの本番 `public.games` の最新行を直接照会したわけではないため、Supabase側だけに後から登録したゲームは、別途 `public.games` を確認して追記すること。

## 2. 最重要の前提

最新方針としては、実験場トップと詳細ランキングは Supabase `public.games` を正に寄せる。しかし、2026-06-21時点でこのGitHubリポジトリ内の現行 `index.html` と `ranking.html` には、まだ固定配列がある。

そのため、現行ページを完全に再現する場合は、次の3つをそろえる必要がある。

| 対象 | 役割 | 再現時の扱い |
|---|---|---|
| `index.html` の `GAMES` | 実験場トップのカード一覧、トップ表示ランキング、集計対象を決める | 必ず復元する |
| `ranking.html` の `GAME_PAGES` | 詳細ランキングページ、難易度別タブ、詳細表示対象を決める | 必ず復元する |
| Supabase `public.games` / RPC | スコア表示設定の補完、ランキング取得、集計取得、スコア保存 | 必ず接続する |

`public.games` だけを更新しても、現行の固定配列が残る実装では、実験場トップや詳細ランキングに出ない可能性がある。逆に、固定配列だけを更新して Supabase を更新しない場合、カードは出てもランキングや集計が正しく動かない。

## 3. Supabase接続値

ブラウザ側で使う値は次の通り。

```js
const SUPABASE_URL = "https://mlpnjgezrnhdxsxolyzj.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_drzcy0v97knU6FgjqSgBHw_0A9XPdFM";
```

このキーは公開HTMLに入れてよいPublishable keyである。`service_role` キーは絶対に入れない。

## 4. 共通カラーコード

`index.html` と `ranking.html` は、深緑の画面を基準にしている。再現時は、次のCSS変数を維持する。

| 変数 | 値 | 主な用途 |
|---|---|---|
| `--page-bg` | `#0b241b` | ページ全体の背景、濃い緑 |
| `--card-bg` | `#14382b` | 通常カードの背景 |
| `--card-bg-2` | `#1b4a39` | 集計枠、ランキング枠、強調カード |
| `--card-bg-3` | `#102d23` | ランキングなし、控えめカード |
| `--text-main` | `#f6fff9` | メイン文字 |
| `--text-sub` | `#d8eee3` | 説明文、サブ文字 |
| `--text-muted` | `#b7d4c5` | 補助文字 |
| `--button-bg` | `#e6ff9f` | 主ボタン、強調色 |
| `--button-text` | `#0b241b` | 主ボタン文字 |
| `--sub-button-bg` | `#245b45` | 副ボタン背景 |
| `--sub-button-border` | `#6fbf93` | 副ボタン枠線、緑の明るい線 |
| `--disabled-bg` | `#2b463a` | 無効ボタン背景 |
| `--disabled-text` | `#94b7a6` | 無効ボタン文字 |
| `--error-text` | `#ffd1d1` | エラー文字 |
| `--line` | `rgba(246, 255, 249, 0.18)` | カード枠線、区切り線 |
| `--shadow` | `rgba(0, 0, 0, 0.28)` | カード影 |
| `--coming-bg` | `rgba(230, 255, 159, 0.11)` | coming soon枠背景 |
| `--coming-border` | `rgba(230, 255, 159, 0.34)` | coming soon枠線 |

`ranking.html` には、詳細ランキング用の追加色がある。

| 変数 | 値 | 主な用途 |
|---|---|---|
| `--active-tab-bg` | `#e6ff9f` | 選択中タブ背景 |
| `--active-tab-text` | `#0b241b` | 選択中タブ文字 |
| `--inactive-tab-bg` | `#1b4a39` | 未選択タブ背景 |
| `--inactive-tab-border` | `#6fbf93` | 未選択タブ枠線 |
| `--first-score-bg` | `rgba(230, 255, 159, 0.16)` | 初回スコア枠 |
| `--best-score-bg` | `rgba(111, 191, 147, 0.20)` | ベストスコア枠 |
| `--neutral-box-bg` | `rgba(11, 36, 27, 0.48)` | 補助情報枠 |

固定値として、トーストは背景 `#f6fff9`、文字 `#0b241b` を使う。エラー通知は枠線 `rgba(255, 209, 209, 0.45)`、背景 `rgba(90, 30, 30, 0.35)` を使う。フォーカス枠は `--button-bg` を使う。

## 5. 実験場トップ `index.html` の画面仕様

実験場トップの公開URLは次。

```text
https://chameleonjp.codeberg.page/chameleonjp_lab/
```

ページの主な構成は次の通り。

| 場所 | 内容 |
|---|---|
| ヘッダー | アイコン、`カメレオンJPの実験場`、説明文 |
| Publishable key注意 | キー未設定時だけ表示 |
| ライブラリ注意 | Supabase JSライブラリ読み込み失敗時だけ表示 |
| 公開中ゲーム | `GAMES` 固定配列からカードを作る |
| 並び替え | 追加順、プレイ回数の多い順、プレイ回数の少ない順、プレイ人数の多い順、プレイ人数の少ない順 |
| ゲームカード | アコーディオン式。開くと説明、集計、ランキング、ボタンを表示 |
| スポンサー | カメレオン診断バナー、λアルク教λ |
| トースト | シェア文コピーなどの結果表示 |

トップページは、初回表示で全ゲームのランキングを一括取得しない。カードを開いた時に、そのゲームの集計とランキングを読み込む。

## 6. `index.html` の `GAMES` 配列で使う項目

`GAMES` の1件は、次の項目を持つ。

| 項目 | 意味 |
|---|---|
| `displayOrder` | 追加順の並びに使う番号 |
| `slug` | 実験場トップ上のカードID。DOM ID、シェアボタン、並び替えに使う |
| `title` | カードに表示するゲーム名 |
| `url` | 遊ぶボタンの遷移先 |
| `description` | カード内の説明 |
| `isActive` | 現行コードでは一覧生成の主条件にはなっていないが、公開状態の意味で持つ |
| `topRanking` | トップカード内に出すランキング。`first` なら初回、`best` ならベスト |
| `scoreOrder` | `desc` は大きいほど良い、`asc` は小さいほど良い |
| `scoreUnit` | `点`、`秒`、`ゲーム`、`pt` など |
| `scoreScale` | 内部整数を表示値へ変換する割り算の値 |
| `scoreDecimals` | 表示小数桁 |
| `scoreLabel` | 通常スコア名。未設定なら画面側で補う |
| `firstScoreLabel` | 初回ランキングの表示名 |
| `bestScoreLabel` | ベストランキングの表示名 |
| `releaseDate` | 公開日 |
| `detailSlug` | 詳細ランキングURLの `game` パラメータに使う |
| `rankingSlug` | トップランキング取得RPCへ渡すslug |
| `statsSlugs` | 集計取得対象。複数ある場合は合算する |
| `difficultySummary` | 難易度別があるゲームの補足表示 |
| `shareText` | シェア文の先頭に使う文章 |

補完ルールは次。

```js
rankingSlug がなければ slug を使う。
statsSlugs がなければ [rankingSlug] を使う。
detailSlug がなければ slug を使う。
```

## 7. 実験場トップのランキング連携ロジック

ゲームカードを開くと `ensureGameDataLoaded(game)` が動く。内部の流れは次。

1. `loadGameMetadata(game)` で Supabase `public.games` からスコア表示メタ情報を取得する。
2. `loadStats(game)` で合計プレイ回数と参加人数を取得する。
3. `loadTopRanking(game)` でトップ表示用の上位3件を取得する。
4. 集計とランキングの両方が取れたら、そのカードを読み込み済みにする。

`loadGameMetadata(game)` は、ゲーム一覧そのものを `public.games` から作る処理ではない。取得するのは、次のメタ情報だけである。

```text
game_slug
score_order
score_unit
score_scale
score_decimals
score_label
first_score_label
best_score_label
```

`loadTopRanking(game)` は、`topRanking` によって呼ぶRPCを切り替える。

```js
const isFirstRanking = game.topRanking === "first";
const functionName = isFirstRanking
  ? "get_first_try_ranking"
  : "get_best_score_ranking";

await supabaseClient.rpc(functionName, {
  p_game_slug: getRankingSlug(game),
  p_limit: 3
});
```

トップのランキング行では、RPCが返す `rank_no`、`display_name`、`first_score` または `best_score` を使う。順位は `index + 1` で作らない。

データが0件、または取得に失敗した場合は、カードを壊さず `coming soon` と出す。

## 8. 実験場トップの集計ロジック

集計は `get_game_play_stats` を使う。

単一slugのゲームでは、1つのslugだけ取得する。難易度別のゲームでは、`statsSlugs` に複数のslugを入れ、取得結果を合算する。

```js
await supabaseClient.rpc("get_game_play_stats", {
  p_game_slug: normalizedSlug
});
```

集計結果は、次の値として扱う。

```js
const totalPlayCount = Number(stats?.total_play_count ?? stats?.totalPlayCount ?? 0);
const playerCount = Number(stats?.player_count ?? stats?.playerCount ?? 0);
```

合算時は、各slugの `totalPlayCount` と `playerCount` を足す。現行コードでは、複数難易度で同じ人が遊んだ場合も、参加人数は単純合算になる。厳密なユニーク人数合算ではない。

## 9. 詳細ランキング `ranking.html` の画面仕様

詳細ランキングのURLは次。

```text
https://chameleonjp.codeberg.page/chameleonjp_lab/ranking.html?game=<pageSlug>
```

難易度別ゲームでは、表示中の難易度をURLに残す。

```text
https://chameleonjp.codeberg.page/chameleonjp_lab/ranking.html?game=meoshi_wo_seisu&difficulty=hard
https://chameleonjp.codeberg.page/chameleonjp_lab/ranking.html?game=machigai_mikke&difficulty=super_hard
```

詳細ページの主な構成は次。

| 場所 | 内容 |
|---|---|
| 戻るリンク | `← 実験場トップへ戻る` |
| ヘッダー | アイコン、詳細ランキングタイトル、説明文 |
| サマリーカード | ゲーム名、説明、公開済みバッジ、集計、遊ぶ、シェア |
| 難易度タブ | 難易度別ゲームだけ表示 |
| ランキングタブ | 初回ランキング、ベストランキング |
| 初回ランキング | `get_first_try_ranking` の結果 |
| ベストランキング | `get_best_score_ranking` の結果 |
| 下部ボタン | トップページへ戻る |

現行コードでは、詳細ページの初期表示は初回ランキングタブである。既存の古い仕様書には `top_ranking_type` に合わせて初期タブを変える説明が残っているが、現行 `ranking.html` の再現では、初回タブを初期表示として扱う。

## 10. `ranking.html` の `GAME_PAGES` 配列で使う項目

`GAME_PAGES` は、詳細ページ用の固定配列である。1ページの中に、複数の難易度を持てる。

| 項目 | 意味 |
|---|---|
| `pageSlug` | 詳細ページの基本slug。URLの `game` に使う |
| `title` | 詳細ページのゲーム名 |
| `url` | ゲームで遊ぶボタンの遷移先 |
| `description` | 詳細ページの説明 |
| `shareText` | 詳細ページのシェア文 |
| `defaultDifficultyKey` | 複数難易度がある場合の初期難易度 |
| `difficulties` | 実際にランキング取得する難易度ごとの設定配列 |

`difficulties` の各行は、次の項目を持つ。

| 項目 | 意味 |
|---|---|
| `slug` | ランキングRPCへ渡す実際の `game_slug` |
| `key` | URLの `difficulty` に使う短い値 |
| `difficultyLabel` | タブに出す難易度名 |
| `scoreOrder` / `scoreUnit` / `scoreScale` / `scoreDecimals` | スコア表示設定 |
| `firstScoreLabel` / `bestScoreLabel` | タブ名とスコア枠ラベル |

## 11. 詳細ランキングのURL解決ロジック

`ranking.html` は、URLの `game` パラメータを読む。

```js
const params = new URLSearchParams(window.location.search);
const requestedSlug = normalizeGameSlug(params.get("game"));
const requestedDifficulty = params.get("difficulty");
```

`normalizeGameSlug` には、古いslugや表記ゆれを吸収する別名がある。

| 入力 | 変換後 |
|---|---|
| `anatano_1byo` | `anatano_1byou` |
| `songen_o_kakeyouka` | `songen_wo_kakeyouka` |
| `hito_o_yurusuna` | `hito_wo_yurusuna` |
| `meoshi_wo_seisu_easy` | `meoshi_wo_seisu_normal` |

ページの探し方は次。

1. `pageSlug` が一致するページを探す。
2. 見つからない場合は、`difficulties` 内の `slug` が一致するページを探す。
3. 難易度は、`difficulty` の `key` または `slug`、次に `game` の実slug、最後に `defaultDifficultyKey` で決める。
4. 見つからない場合は、エラー画面を出してトップへ戻す。

難易度別ゲームを表示した後は、URLを次の形へ整える。

```text
ranking.html?game=<pageSlug>&difficulty=<difficultyKey>
```

## 12. 詳細ランキングの取得ロジック

詳細ページでは、選択中の難易度1つに対して集計とランキングを取得する。実験場トップのように複数難易度を合算しない。

集計は次。

```js
await supabaseClient.rpc("get_game_play_stats", {
  p_game_slug: game.slug
});
```

ランキングは、初回とベストの両方を最大100件取得する。

```js
await supabaseClient.rpc("get_first_try_ranking", {
  p_game_slug: game.slug,
  p_limit: 100
});

await supabaseClient.rpc("get_best_score_ranking", {
  p_game_slug: game.slug,
  p_limit: 100
});
```

どちらも0件の場合は、詳細ランキング全体を `coming soon` として扱う。片方だけ0件の場合は、空のタブに `まだ記録がありません` と出す。

## 13. スコア表示ロジック

スコア表示は、内部整数を `scoreScale` で割り、`scoreDecimals` の小数桁で表示し、最後に `scoreUnit` を付ける。

```js
const displayValue = numericScore / scale;
return `${formatted}${unit}`;
```

例は次。

| 内部スコア | 設定 | 表示 |
|---:|---|---|
| `12345` | `scoreScale=1`, `scoreDecimals=0`, `scoreUnit=点` | `12,345点` |
| `3415` | `scoreScale=100`, `scoreDecimals=2`, `scoreUnit=秒` | `34.15秒` |
| `1234` | `scoreScale=1000`, `scoreDecimals=3`, `scoreUnit=秒` | `1.234秒` |
| `7` | `scoreScale=1`, `scoreDecimals=0`, `scoreUnit=ゲーム` | `7ゲーム` |

スコアが `null`、`undefined`、空文字、数値化できない値の場合は `—` を出す。

順位はRPCが返す `rank_no` をそのまま使う。フロント側で `index + 1` を順位にしてはいけない。

## 14. 実験場トップの現行カード一覧

この表は、現行 `index.html` の `GAMES` から復元した実験場トップのカード一覧である。

| 表示順 | card slug | 表示名 | URL | 説明 |
|---:|---|---|---|---|
| 1 | `torani_yasashiku` | 虎に優しく | `https://chameleonjp.codeberg.page/torani_yasashiku/` | 虎を優しく受け止める60秒ミニゲーム |
| 2 | `nayuta_no_himatsubushi` | 暇つぶし | `https://chameleonjp.codeberg.page/nayuta_no_himatsubushi/` | スマホ向けブロック崩しゲーム |
| 3 | `iroate` | イロアテ | `https://chameleonjp.codeberg.page/iroate/` | 文字の意味と文字の色を見分けて、20問の最終タイムを競うゲームです。 |
| 4 | `yume_wo_mitandakedosa` | 夢を見たんだけどさ | `https://chameleonjp.codeberg.page/yume_wo_mitandakedosa/` | 夜空から降ってくる流星を避けながら、赤い流星を壊し、🍶を拾って生きのびる60秒ゲームです。 |
| 5 | `suiteki_catch` | 水滴キャッチ | `https://chameleonjp.codeberg.page/suiteki_catch/` | 水滴がコップに完全に入ったと思ったら操作するゲーム |
| 6 | `jouzuni_kakerukana` | 上手に描けるかな？ | `https://chameleonjp.codeberg.page/jouzuni_kakerukana/` | 表示された点を見ながら、指で線や図形を一筆で描くゲームです。 |
| 7 | `juden_ga` | 充電ｶﾞｯ | `https://chameleonjp.codeberg.page/juden_ga/` | バッテリーカードで読み合う、1人用カードゲームです。 |
| 8 | `anatano_1byou` | あなたの1秒って | `https://chameleonjp.codeberg.page/anatano_1byou/` | 最初の3秒だけ時計を見て、あとは体感で秒数を当てるゲームです。 |
| 9 | `bekutoru` | ベク取る | `https://chameleonjp.codeberg.page/bekutoru/` | 可愛い🐼を逃がしてあげよう！ |
| 10 | `songen_wo_kakeyouka` | 尊厳を賭けようか | `https://chameleonjp.codeberg.page/songen_wo_kakeyouka/` | 相手の頭を！心臓を！拳で殴って尊厳破壊！ |
| 11 | `hito_wo_yurusuna` | ヒトを許すな！ | `https://chameleonjp.codeberg.page/hito_wo_yurusuna/` | ヒトを許さない動物たちが攻めてくる。武器を置いて、👨‍🌾を守れ。 |
| 12 | `maketara_omae_no_sei_dakara` | 負けたらお前のせいだから | `https://chameleonjp.codeberg.page/maketara_omae_no_sei_dakara/` | 夏の甲子園決勝、9回裏1点リード。理不尽に送り出された控え投手として、負けたら全部お前のせいやでと言われながら3アウトを取りにいくルーレット投球ゲームです。 |
| 13 | `kodomo_demo_tokechau` | 子供デモ解けちゃう | `https://chameleonjp.codeberg.page/kodomo_demo_tokechau/` | 計算の答えを、数字カードで入力する早押しミニゲームです。 |
| 14 | `meoshi_wo_seisu` | 目押しを制す | `https://chameleonjp.codeberg.page/meoshi_wo_seisu/` | 絵柄を目押しで止めて、クリアまでのゲーム数を競うゲームです。詳細ページではノーマルとハードを切り替えて確認できます。 |
| 16 | `toreba_iinoyo` | 取ればいいのよ | `https://chameleonjp.codeberg.page/toreba_iinoyo/` | 落ちてくる棒を、手のラインで受け取る反射ゲームです。 |
| 17 | `shiwakezaru` | 仕分けざる | `https://chameleonjp.codeberg.page/shiwakezaru/` | 流れてくる猿を、同じ猿の場所へ仕分けるスマホ向けゲームです。 |
| 18 | `emojihiroi` | 絵文字拾い | `https://chameleonjp.codeberg.page/emojihiroi/` | 8×8の中から、お題の絵文字を探して全部消すタイムアタックゲームです。 |
| 19 | `machigai_mikke` | 間違いみっけ | `https://chameleonjp.codeberg.page/machigai_mikke/` | 見本と手元の見本を見比べて、違う場所を9個見つけるゲームです。詳細ページではイージー、ハード、超ハードを切り替えて確認できます。 |

表示順15は、実験場トップの独立カードでは使われていない。詳細ランキング側では `meoshi_wo_seisu_hard` が表示順15として扱われる。

## 15. 実験場トップで表示するランキング設定

この表は、各カードを開いた時にトップページ内で表示するランキングを示す。

| card slug | トップに出すランキング | 呼ぶRPC | RPCへ渡すslug | 集計対象slug | スコア表示 | 詳細ページ |
|---|---|---|---|---|---|---|
| `torani_yasashiku` | 最高スコア | `get_best_score_ranking` | `torani_yasashiku` | `torani_yasashiku` | `desc` / `点` / scale `1` / decimals `0` | `ranking.html?game=torani_yasashiku` |
| `nayuta_no_himatsubushi` | 最高スコア | `get_best_score_ranking` | `nayuta_no_himatsubushi` | `nayuta_no_himatsubushi` | `desc` / `点` / scale `1` / decimals `0` | `ranking.html?game=nayuta_no_himatsubushi` |
| `iroate` | ベストタイム | `get_best_score_ranking` | `iroate` | `iroate` | `asc` / `秒` / scale `100` / decimals `2` | `ranking.html?game=iroate` |
| `yume_wo_mitandakedosa` | 最高スコア | `get_best_score_ranking` | `yume_wo_mitandakedosa` | `yume_wo_mitandakedosa` | `desc` / `点` / scale `1` / decimals `0` | `ranking.html?game=yume_wo_mitandakedosa` |
| `suiteki_catch` | 初回スコア | `get_first_try_ranking` | `suiteki_catch` | `suiteki_catch` | `desc` / `点` / scale `1` / decimals `0` | `ranking.html?game=suiteki_catch` |
| `jouzuni_kakerukana` | 最高スコア | `get_best_score_ranking` | `jouzuni_kakerukana` | `jouzuni_kakerukana` | `desc` / `pt` / scale `1` / decimals `0` | `ranking.html?game=jouzuni_kakerukana` |
| `juden_ga` | 最高スコア | `get_best_score_ranking` | `juden_ga` | `juden_ga` | `desc` / `点` / scale `1` / decimals `0` | `ranking.html?game=juden_ga` |
| `anatano_1byou` | ベスト誤差 | `get_best_score_ranking` | `anatano_1byou` | `anatano_1byou` | `asc` / `秒` / scale `100` / decimals `2` | `ranking.html?game=anatano_1byou` |
| `bekutoru` | ベストタイム | `get_best_score_ranking` | `bekutoru` | `bekutoru` | `asc` / `秒` / scale `1000` / decimals `3` | `ranking.html?game=bekutoru` |
| `songen_wo_kakeyouka` | 最高スコア | `get_best_score_ranking` | `songen_wo_kakeyouka` | `songen_wo_kakeyouka` | `desc` / `点` / scale `1` / decimals `0` | `ranking.html?game=songen_wo_kakeyouka` |
| `hito_wo_yurusuna` | 最高スコア | `get_best_score_ranking` | `hito_wo_yurusuna` | `hito_wo_yurusuna` | `desc` / `点` / scale `1` / decimals `0` | `ranking.html?game=hito_wo_yurusuna` |
| `maketara_omae_no_sei_dakara` | ベストスコア | `get_best_score_ranking` | `maketara_omae_no_sei_dakara` | `maketara_omae_no_sei_dakara` | `desc` / `点` / scale `1` / decimals `0` | `ranking.html?game=maketara_omae_no_sei_dakara` |
| `kodomo_demo_tokechau` | 最高スコア | `get_best_score_ranking` | `kodomo_demo_tokechau` | `kodomo_demo_tokechau` | `desc` / `点` / scale `1` / decimals `0` | `ranking.html?game=kodomo_demo_tokechau` |
| `meoshi_wo_seisu` | ベストゲーム数 | `get_best_score_ranking` | `meoshi_wo_seisu_hard` | `meoshi_wo_seisu_normal`, `meoshi_wo_seisu_hard` | `asc` / `ゲーム` / scale `1` / decimals `0` | `ranking.html?game=meoshi_wo_seisu` |
| `toreba_iinoyo` | 最高スコア | `get_best_score_ranking` | `toreba_iinoyo` | `toreba_iinoyo` | `desc` / `点` / scale `1` / decimals `0` | `ranking.html?game=toreba_iinoyo` |
| `shiwakezaru` | 最高スコア | `get_best_score_ranking` | `shiwakezaru` | `shiwakezaru` | `desc` / `点` / scale `1` / decimals `0` | `ranking.html?game=shiwakezaru` |
| `emojihiroi` | ベストタイム | `get_best_score_ranking` | `emojihiroi` | `emojihiroi` | `asc` / `秒` / scale `100` / decimals `2` | `ranking.html?game=emojihiroi` |
| `machigai_mikke` | ベストタイム | `get_best_score_ranking` | `machigai_mikke_super_hard` | `machigai_mikke_easy`, `machigai_mikke_hard`, `machigai_mikke_super_hard` | `asc` / `秒` / scale `100` / decimals `2` | `ranking.html?game=machigai_mikke` |

## 16. 詳細ページで表示するランキング対象

この表は、現行 `ranking.html` の `GAME_PAGES` から復元した詳細ランキング対象である。

| 詳細ページ | 難易度 | RPCへ渡すgame_slug | URL上のdifficulty | score_order | 単位 | scale | decimals | 初回ラベル | ベストラベル |
|---|---|---|---|---|---|---:|---:|---|---|
| `torani_yasashiku` | 通常 | `torani_yasashiku` | なし | `desc` | 点 | 1 | 0 | 初回スコア | 最高スコア |
| `nayuta_no_himatsubushi` | 通常 | `nayuta_no_himatsubushi` | なし | `desc` | 点 | 1 | 0 | 初回スコア | 最高スコア |
| `iroate` | 通常 | `iroate` | なし | `asc` | 秒 | 100 | 2 | 初回タイム | ベストタイム |
| `yume_wo_mitandakedosa` | 通常 | `yume_wo_mitandakedosa` | なし | `desc` | 点 | 1 | 0 | 初回スコア | 最高スコア |
| `suiteki_catch` | 通常 | `suiteki_catch` | なし | `desc` | 点 | 1 | 0 | 初回スコア | 最高スコア |
| `jouzuni_kakerukana` | 通常 | `jouzuni_kakerukana` | なし | `desc` | pt | 1 | 0 | 初回スコア | 最高スコア |
| `juden_ga` | 通常 | `juden_ga` | なし | `desc` | 点 | 1 | 0 | 初回スコア | 最高スコア |
| `anatano_1byou` | 通常 | `anatano_1byou` | なし | `asc` | 秒 | 100 | 2 | 初回誤差 | ベスト誤差 |
| `bekutoru` | 通常 | `bekutoru` | なし | `asc` | 秒 | 1000 | 3 | 初回タイム | ベストタイム |
| `songen_wo_kakeyouka` | 通常 | `songen_wo_kakeyouka` | なし | `desc` | 点 | 1 | 0 | 初回スコア | 最高スコア |
| `hito_wo_yurusuna` | 通常 | `hito_wo_yurusuna` | なし | `desc` | 点 | 1 | 0 | 初回スコア | 最高スコア |
| `maketara_omae_no_sei_dakara` | 通常 | `maketara_omae_no_sei_dakara` | なし | `desc` | 点 | 1 | 0 | 初回スコア | ベストスコア |
| `kodomo_demo_tokechau` | 通常 | `kodomo_demo_tokechau` | なし | `desc` | 点 | 1 | 0 | 初回スコア | 最高スコア |
| `meoshi_wo_seisu` | ノーマル | `meoshi_wo_seisu_normal` | `normal` | `asc` | ゲーム | 1 | 0 | 初回ゲーム数 | ベストゲーム数 |
| `meoshi_wo_seisu` | ハード | `meoshi_wo_seisu_hard` | `hard` | `asc` | ゲーム | 1 | 0 | 初回ゲーム数 | ベストゲーム数 |
| `toreba_iinoyo` | 通常 | `toreba_iinoyo` | なし | `desc` | 点 | 1 | 0 | 初回スコア | 最高スコア |
| `shiwakezaru` | 通常 | `shiwakezaru` | なし | `desc` | 点 | 1 | 0 | 初回スコア | 最高スコア |
| `emojihiroi` | 通常 | `emojihiroi` | なし | `asc` | 秒 | 100 | 2 | 初回タイム | ベストタイム |
| `machigai_mikke` | イージー | `machigai_mikke_easy` | `easy` | `asc` | 秒 | 100 | 2 | 初回タイム | ベストタイム |
| `machigai_mikke` | ハード | `machigai_mikke_hard` | `hard` | `asc` | 秒 | 100 | 2 | 初回タイム | ベストタイム |
| `machigai_mikke` | 超ハード | `machigai_mikke_super_hard` | `super_hard` | `asc` | 秒 | 100 | 2 | 初回タイム | ベストタイム |

`meoshi_wo_seisu` の初期難易度は `hard`。`machigai_mikke` の初期難易度は `super_hard`。

## 17. 難易度別ゲームの扱い

難易度別ゲームは、実験場トップでは1枚のカードとして見せ、詳細ページでは難易度タブを出す。

### 目押しを制す

トップページでは、1枚のカードとして表示する。

```text
card slug: meoshi_wo_seisu
トップランキング: meoshi_wo_seisu_hard
集計: meoshi_wo_seisu_normal + meoshi_wo_seisu_hard の合算
詳細ページ: ranking.html?game=meoshi_wo_seisu
詳細ページ初期難易度: hard
```

詳細ページでは、ノーマルとハードをタブで切り替える。各タブは別slugのランキングを読む。

### 間違いみっけ

トップページでは、1枚のカードとして表示する。

```text
card slug: machigai_mikke
トップランキング: machigai_mikke_super_hard
集計: machigai_mikke_easy + machigai_mikke_hard + machigai_mikke_super_hard の合算
詳細ページ: ranking.html?game=machigai_mikke
詳細ページ初期難易度: super_hard
```

詳細ページでは、イージー、ハード、超ハードをタブで切り替える。各タブは別slugのランキングを読む。

## 18. Supabase `public.games` へ登録する時の対応

固定配列と Supabase の列名は、次のように対応させる。

| 固定配列側 | Supabase `public.games` 側 |
|---|---|
| `slug` または `rankingSlug` | `game_slug` |
| `title` | `title` |
| `url` | `game_url` |
| `description` | `description` |
| `shareText` | `share_text` |
| `isActive` | `is_active` |
| `displayOrder` | `display_order` |
| `topRanking` | `top_ranking_type` |
| `scoreOrder` | `score_order` |
| `scoreUnit` | `score_unit` |
| `scoreScale` | `score_scale` |
| `scoreDecimals` | `score_decimals` |
| `scoreLabel` | `score_label` |
| `firstScoreLabel` | `first_score_label` |
| `bestScoreLabel` | `best_score_label` |
| `releaseDate` | `release_date` |

難易度別ゲームでは、トップページのカードslugではなく、実際にスコアを保存する難易度slugを `public.games.game_slug` として登録する。

例として、`meoshi_wo_seisu` というカードだけを登録しても、`meoshi_wo_seisu_normal` と `meoshi_wo_seisu_hard` のランキングは取れない。必ず実スコア保存slugを登録する。

## 19. 新しいゲームを追加する時の必須手順

現行コードを壊さず追加する場合は、次の順で作業する。

1. ゲーム本体を Codeberg Pages に公開する。
2. ゲーム本体の `GAME_SLUG` と Supabase `public.games.game_slug` を一致させる。
3. ゲーム終了時に `submit_score` で自動送信する。
4. Supabase `public.games` にゲーム情報を登録する。
5. `index.html` の `GAMES` にカード情報を追加する。
6. `ranking.html` の `GAME_PAGES` に詳細ページ情報を追加する。
7. 難易度別なら、トップカード用の `rankingSlug`、`statsSlugs`、詳細ページの `difficulties` を分ける。
8. 実験場トップでカード、集計、トップランキング、詳細ページへの導線を確認する。
9. 詳細ページで初回・ベスト・難易度タブ・スコア単位を確認する。

## 20. 追加時にやってはいけないこと

- `public.scores` を使う。
- `created_at` が必ずある前提でSQLを書く。
- `rank_no` を無視して `index + 1` で順位を出す。
- 秒系ゲームなのに `scoreScale = 1` にする。
- `score_order` を逆にする。
- 結果画面に「ランキング登録」ボタンを置き、任意送信にする。
- Supabaseだけ登録して、`index.html` と `ranking.html` の固定配列を更新しない。
- `index.html` だけ更新して、`ranking.html` を更新しない。
- 難易度別ゲームで、カードslugと実スコア保存slugを混ぜる。
- `service_role` キーを公開HTMLへ入れる。

## 21. スマホ表示と操作抑制

実験場トップと詳細ランキングでは、次を維持する。

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
```

CSSでは、横スクロールを出さない。

```css
html,
body {
  width: 100%;
  min-width: 0;
  overflow-x: hidden;
  overscroll-behavior-x: none;
  touch-action: manipulation;
}
```

本文や画像は長押し選択を抑える。ただし、リンクは必要に応じて長押しできるように `a[href]` を例外にする。

JavaScriptでは、次を抑える。

- 非操作部分の短時間ダブルタップ拡大
- 2本指 `touchmove`
- iOS系の `gesturestart` / `gesturechange` / `gestureend`
- 通常部分の `contextmenu`

リンク長押しは例外として残す。

## 22. 復元時の最短チェックリスト

実験場トップを復元したら、次を見る。

- 深緑背景 `#0b241b` になっている。
- カードが `displayOrder` 順に並ぶ。
- 難易度別ゲームは1枚のカードになっている。
- `meoshi_wo_seisu` のトップランキングがハードを読む。
- `machigai_mikke` のトップランキングが超ハードを読む。
- 集計並び替えで、複数slugの集計が合算される。
- ランキング0件でもページが壊れず `coming soon` になる。
- シェア文にURLが入る。

詳細ランキングを復元したら、次を見る。

- `ranking.html?game=bekutoru` が開く。
- `ranking.html?game=meoshi_wo_seisu&difficulty=hard` が開く。
- `ranking.html?game=machigai_mikke&difficulty=super_hard` が開く。
- 難易度タブでRPC対象slugが変わる。
- 初回ランキングとベストランキングが両方出る。
- 順位は `rank_no` 通りに表示される。
- 秒系ゲームは小数桁が正しく出る。
- iPhone SE級の幅で横スクロールが出ない。

## 23. 将来の整理方針

最終的には、`index.html` と `ranking.html` の固定配列を減らし、Supabase `public.games` を正にする方がよい。

ただし、一気に固定配列を消すと、難易度別ゲーム、トップ表示ランキング、合算集計、詳細ページのURL解決が壊れやすい。移行する場合は、最低限次の列または同等の情報を `public.games` 側で扱えるようにする。

| 必要な情報 | 理由 |
|---|---|
| `detail_slug` 相当 | トップカードから詳細ページを開くため |
| `ranking_slug` 相当 | トップカードで代表ランキングを出すため |
| `stats_slugs` 相当 | 難易度別の集計を合算するため |
| `difficulty_group` 相当 | 詳細ページで1つのゲームに複数slugをまとめるため |
| `difficulty_key` / `difficulty_label` 相当 | 難易度タブを作るため |
| `default_difficulty_key` 相当 | 詳細ページの初期難易度を決めるため |

この情報を Supabase 側に持たせるまでは、現行の固定配列を削らないこと。
