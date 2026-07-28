# 現在のゲーム一覧・実験場再現仕様

最終更新: 2026-06-21
対象: `chameleonjp_lab/index.html` / `chameleonjp_lab/ranking.html` / Supabaseランキング連携

## 1. この文書の役割

この文書は、カメレオンJPの実験場、詳細ランキング、ランキング連携を、あとから同じ内容で再現するための正本メモである。

ここでは、次の情報をまとめる。

- Supabase `public.games` の現行一覧
- 実験場トップで表示するゲームカード
- 実験場トップで各ゲームに表示するランキング名と取得対象
- 詳細ランキングページで表示するランキング
- 難易度別ゲームの扱い
- 画面のカラーコード
- 固定配列が残っている現行コードを直す時の注意点

## 2. 今回の正とする情報

2026-06-21時点で、ユーザーから共有された Supabase `public.games` の取得結果を、この文書のゲーム台帳の正とする。

ただし、実験場トップでどのランキングをカード内に出すかは、最新の `index.html` の設定も必ず確認する。現行実装に `GAMES` 固定配列が残っている場合、`index.html` 側の `topRanking`、`rankingSlug`、`firstScoreLabel`、`bestScoreLabel` が実表示を決めているためである。

基本ルールは次である。

```text
特に指定がなければ、実験場トップではベストランキングを表示する。
指定があるものだけ、初回ランキングなどに切り替える。
```

ここでいうベストランキングは、点数ゲームでは最高スコア、タイム・誤差・ゲーム数のように小さいほど良いゲームでは最短・最小の記録を意味する。単に数値が大きい記録だけを指すわけではない。

## 3. 難易度別ゲームの基本方針

難易度別ランキングは、詳細ページ内でのみ分けて表示する。

実験場トップでは、難易度別のカードを複数枚には分けない。1つのゲームとして1枚のカードにまとめ、ランキング表示では難易度の高い方のスコアを代表として出す。

| ゲーム | 実験場トップで表示するカード | 実験場トップで出す代表ランキング | 詳細ページで分けるランキング |
|---|---|---|---|
| 目押しを制す | `目押しを制す` 1枚 | `meoshi_wo_seisu_hard` | ノーマル / ハード |
| 間違いみっけ | `間違いみっけ` 1枚 | `machigai_mikke_super_hard` | イージー / ハード / 超ハード |

この方針により、実験場トップはゲーム一覧として見やすく保ち、細かい難易度別ランキングは詳細ページで確認できる。

## 4. Supabase接続値

ブラウザ側で使う値は次の通り。

```js
const SUPABASE_URL = "https://mlpnjgezrnhdxsxolyzj.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_drzcy0v97knU6FgjqSgBHw_0A9XPdFM";
```

このキーは公開HTMLに入れてよいPublishable keyである。`service_role` キーは絶対に公開HTMLへ入れない。

使うテーブルと関数は次である。

| 用途 | 名前 |
|---|---|
| ゲーム台帳 | `public.games` |
| スコア保存 | `public.game_scores` |
| スコア送信 | `submit_score` |
| 初回ランキング取得 | `get_first_try_ranking` |
| ベストランキング取得 | `get_best_score_ranking` |
| プレイ回数・参加人数取得 | `get_game_play_stats` |

`public.scores` は使わない。

## 5. 共通カラーコード

`index.html` と `ranking.html` は、深緑の画面を基準にする。再現時は、次のCSS変数を維持する。

| 変数 | 値 | 主な用途 |
|---|---|---|
| `--page-bg` | `#0b241b` | ページ全体の背景 |
| `--card-bg` | `#14382b` | 通常カード背景 |
| `--card-bg-2` | `#1b4a39` | 集計枠、ランキング枠、強調カード |
| `--card-bg-3` | `#102d23` | 控えめカード背景 |
| `--text-main` | `#f6fff9` | メイン文字 |
| `--text-sub` | `#d8eee3` | 説明文、サブ文字 |
| `--text-muted` | `#b7d4c5` | 補助文字 |
| `--button-bg` | `#e6ff9f` | 主ボタン、強調色 |
| `--button-text` | `#0b241b` | 主ボタン文字 |
| `--sub-button-bg` | `#245b45` | 副ボタン背景 |
| `--sub-button-border` | `#6fbf93` | 副ボタン枠線 |
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

## 6. Supabase `public.games` 現行一覧

次のCSVを、2026-06-21時点のゲーム台帳として扱う。

```csv
display_order,game_slug,title,game_url,description,is_active,release_date,top_ranking_type,score_order,score_unit,score_scale,score_decimals,score_label,first_score_label,best_score_label
1,torani_yasashiku,虎に優しく,https://chameleonjp.codeberg.page/torani_yasashiku/,虎を優しく受け止める60秒ミニゲーム,true,2026-05-25,best,desc,点,1,0,スコア,初回スコア,最高スコア
2,nayuta_no_himatsubushi,暇つぶし,https://chameleonjp.codeberg.page/nayuta_no_himatsubushi/,スマホ向けブロック崩しゲーム,true,2026-05-25,best,desc,点,1,0,スコア,初回スコア,最高スコア
3,iroate,イロアテ,https://chameleonjp.codeberg.page/iroate/,文字の意味と文字の色を見分けて、20問の最終タイムを競うゲームです。,true,2026-05-25,best,asc,秒,100,2,タイム,初回タイム,ベストタイム
4,yume_wo_mitandakedosa,夢を見たんだけどさ,https://chameleonjp.codeberg.page/yume_wo_mitandakedosa/,夜空から降ってくる流星を避けながら、赤い流星を壊し、🍶を拾って生きのびる60秒ゲームです。,true,2026-05-26,best,desc,点,1,0,スコア,初回スコア,最高スコア
5,suiteki_catch,水滴キャッチ,https://chameleonjp.codeberg.page/suiteki_catch/,水滴がコップに完全に入ったと思ったら操作するゲーム,true,2026-05-24,first,desc,点,1,0,スコア,初回スコア,最高スコア
6,jouzuni_kakerukana,上手に描けるかな？,https://chameleonjp.codeberg.page/jouzuni_kakerukana/,お題の形をなぞって、どれだけ上手に描けたかを競うスマホ向けゲームです。,true,2026-05-29,best,desc,pt,1,0,スコア,初回スコア,最高スコア
7,juden_ga,充電ｶﾞｯ,https://chameleonjp.codeberg.page/juden_ga/,タイミングよく充電して、スコアを狙うミニゲームです。,true,2026-05-29,best,desc,点,1,0,スコア,初回スコア,最高スコア
8,anatano_1byou,あなたの1秒って,https://chameleonjp.codeberg.page/anatano_1byou/,体感で1秒を測り、合計誤差の少なさを競うゲームです。,true,2026-05-29,best,asc,秒,100,2,合計誤差,初回誤差,ベスト誤差
9,bekutoru,ベク取る,https://chameleonjp.codeberg.page/bekutoru/,可愛い🐼を逃がしてあげよう！,true,2026-06-09,best,asc,秒,1000,3,クリアタイム,初回タイム,ベストタイム
10,songen_wo_kakeyouka,尊厳を賭けようか,https://chameleonjp.codeberg.page/songen_wo_kakeyouka/,相手の頭を！心臓を！拳で殴って尊厳破壊！,true,2026-06-06,best,desc,点,1,0,スコア,初回スコア,最高スコア
11,hito_wo_yurusuna,ヒトを許すな！,https://chameleonjp.codeberg.page/hito_wo_yurusuna/,ヒトを許さない動物たちが攻めてくる。武器を置いて、👨‍🌾を守れ。,true,2026-06-08,best,desc,点,1,0,スコア,初回スコア,最高スコア
12,maketara_omae_no_sei_dakara,負けたらお前のせいだから,https://chameleonjp.codeberg.page/maketara_omae_no_sei_dakara/,夏の甲子園決勝、9回裏1点リード。理不尽に送り出された控え投手として、負けたら全部お前のせいやでと言われながら3アウトを取りにいくルーレット投球ゲームです。,true,2026-06-10,best,desc,点,1,0,最終スコア,初回スコア,ベストスコア
13,kodomo_demo_tokechau,子供デモ解けちゃう,https://chameleonjp.codeberg.page/kodomo_demo_tokechau/,計算の答えを、数字カードで入力する早押しミニゲームです。,true,2026-06-10,best,desc,点,1,0,スコア,初回スコア,最高スコア
14,meoshi_wo_seisu_normal,目押しを制す ノーマル,https://chameleonjp.codeberg.page/meoshi_wo_seisu/,回転するリールを目押しで止めて、少ないゲーム数でクリアを目指すゲームです。,true,2026-06-10,best,asc,ゲーム,1,0,ゲーム数,初回ゲーム数,ベストゲーム数
15,meoshi_wo_seisu_hard,目押しを制す ハード,https://chameleonjp.codeberg.page/meoshi_wo_seisu/,回転するリールを目押しで止めて、少ないゲーム数でクリアを目指す高難度モードです。,true,2026-06-10,best,asc,ゲーム,1,0,ゲーム数,初回ゲーム数,ベストゲーム数
16,maron_hikou,マロン飛行,https://chameleonjp.codeberg.page/maron_hikou/,敵を倒して戦利品を集め、機体を強化しながら30波突破を目指す縦スクロール飛行機シューティングです。,true,2026-06-12,best,desc,点,1,0,到達スコア,初回到達,最高到達
17,toreba_iinoyo,取ればいいのよ,https://chameleonjp.codeberg.page/toreba_iinoyo/,落ちてくる棒を、手のラインで受け取る反射ゲームです。,true,2026-06-10,best,desc,点,1,0,スコア,初回スコア,最高スコア
18,shiwakezaru,仕分けざる,https://chameleonjp.codeberg.page/shiwakezaru/,流れてくる猿を、同じ猿の場所へ仕分けるスマホ向けゲームです。,true,2026-06-10,best,desc,点,1,0,スコア,初回スコア,最高スコア
19,emojihiroi,絵文字拾い,https://chameleonjp.codeberg.page/emojihiroi/,8×8の中から、お題の絵文字を探して全部消すタイムアタックゲームです。,true,2026-06-10,best,asc,秒,100,2,最終タイム,初回タイム,ベストタイム
20,machigai_mikke_easy,間違いみっけ イージー,https://chameleonjp.codeberg.page/machigai_mikke/,上の見本と手元の見本を見比べて、違う場所を9個見つけるゲームです。,true,2026-06-10,best,asc,秒,100,2,最終タイム,初回タイム,ベストタイム
21,machigai_mikke_hard,間違いみっけ ハード,https://chameleonjp.codeberg.page/machigai_mikke/,上下反転した手元の見本から、違う場所を9個見つけるゲームです。,true,2026-06-10,best,asc,秒,100,2,最終タイム,初回タイム,ベストタイム
22,machigai_mikke_super_hard,間違いみっけ 超ハード,https://chameleonjp.codeberg.page/machigai_mikke/,上下反転かつ左右反転した時計絵文字の見本から、違う場所を見つけるゲームです。,true,2026-06-10,best,asc,秒,100,2,最終タイム,初回タイム,ベストタイム
23,kuma_no_fpsagashi,熊のFP探し,https://chameleonjp.codeberg.page/kuma_no_fpsagashi/,熊がFPを探して底なしのダンジョンへ潜る、ターン制ローグライクです。最深到達階を競います。,true,2026-06-18,best,desc,階,1,0,最深到達階,初回到達階,最高到達階
24,johba,ジョーバ,https://chameleonjp.codeberg.page/johba/,騎手視点で12頭立ての芝レースに挑む3D競馬ゲームです。,true,2026-06-13,best,desc,点,1,0,スコア,初回スコア,最高スコア
25,sandoicchi,3度一致,https://chameleonjp.codeberg.page/sandoicchi/,サンドイッチを作ろう,true,2026-06-17,best,desc,点,1,0,サンドスコア,初回スコア,最高スコア
26,kanijan,カニジャン,https://chameleonjp.codeberg.page/kanijan/,横・斜め方向から🦀本体へ飛んでくる🍣🍤を、直前ジャンプで乗りこなすタップゲームです。50段から🍥も登場します。,true,2026-06-19,best,desc,点,1,0,ジャン点,初回ジャン点,最高ジャン点
27,toremeshi,トレメシ,https://chameleonjp.codeberg.page/toremeshi/,筋トレ後の相談に合わせて食事・プロテインを選ぶ15問ゲームです。,true,2026-06-19,best,desc,点,1,0,スコア,初回スコア,最高スコア
```

このCSVには `share_text` が含まれていない。`share_text` が未設定の場合は、フロント側で次の形にする。

```text
<title>
<description>
<game_url>
```

## 7. 実験場トップで表示するゲームカード

実験場トップは、原則として `public.games where is_active = true order by display_order asc` を読む。

ただし、難易度別ゲームは、実験場では1枚のカードにまとめる。詳細ページ内だけで難易度を分ける。

| 表示カード | まとめるSupabase行 | 実験場で出す代表ランキング | 詳細ページ |
|---|---|---|---|
| 目押しを制す | `meoshi_wo_seisu_normal`, `meoshi_wo_seisu_hard` | `meoshi_wo_seisu_hard` | ノーマル / ハード |
| 間違いみっけ | `machigai_mikke_easy`, `machigai_mikke_hard`, `machigai_mikke_super_hard` | `machigai_mikke_super_hard` | イージー / ハード / 超ハード |

このグループ表示を使う場合、トップページのカード順は次になる。

| 表示順 | カードslug | 表示名 | 補足 |
|---:|---|---|---|
| 1 | `torani_yasashiku` | 虎に優しく | 単独 |
| 2 | `nayuta_no_himatsubushi` | 暇つぶし | 単独 |
| 3 | `iroate` | イロアテ | 単独 |
| 4 | `yume_wo_mitandakedosa` | 夢を見たんだけどさ | 単独 |
| 5 | `suiteki_catch` | 水滴キャッチ | 単独。トップは初回ランキング |
| 6 | `jouzuni_kakerukana` | 上手に描けるかな？ | 単独 |
| 7 | `juden_ga` | 充電ｶﾞｯ | 単独 |
| 8 | `anatano_1byou` | あなたの1秒って | 単独 |
| 9 | `bekutoru` | ベク取る | 単独 |
| 10 | `songen_wo_kakeyouka` | 尊厳を賭けようか | 単独 |
| 11 | `hito_wo_yurusuna` | ヒトを許すな！ | 単独 |
| 12 | `maketara_omae_no_sei_dakara` | 負けたらお前のせいだから | 単独 |
| 13 | `kodomo_demo_tokechau` | 子供デモ解けちゃう | 単独 |
| 14 | `meoshi_wo_seisu` | 目押しを制す | 実験場ではハードのランキングを表示 |
| 16 | `maron_hikou` | マロン飛行 | 単独 |
| 17 | `toreba_iinoyo` | 取ればいいのよ | 単独 |
| 18 | `shiwakezaru` | 仕分けざる | 単独 |
| 19 | `emojihiroi` | 絵文字拾い | 単独 |
| 20 | `machigai_mikke` | 間違いみっけ | 実験場では超ハードのランキングを表示 |
| 23 | `kuma_no_fpsagashi` | 熊のFP探し | 単独 |
| 24 | `johba` | ジョーバ | 単独 |
| 25 | `sandoicchi` | 3度一致 | 単独 |
| 26 | `kanijan` | カニジャン | 単独 |
| 27 | `toremeshi` | トレメシ | 単独 |

`display_order` 15、21、22 は、実験場トップでは独立カードにしない。詳細ページ内の難易度タブで使う。

## 8. 実験場トップで表示するランキング内容

実験場トップのカード内ランキングは、次のルールで決める。

| 条件 | 表示するランキング | 呼ぶRPC | 表示に使う値 | 見出しに使うラベル |
|---|---|---|---|---|
| `top_ranking_type = first` | 初回ランキング | `get_first_try_ranking` | `first_score` | `first_score_label` |
| `top_ranking_type = best` | ベストランキング | `get_best_score_ranking` | `best_score` | `best_score_label` |
| `top_ranking_type` 未設定 | ベストランキング | `get_best_score_ranking` | `best_score` | `best_score_label`。なければ `最高スコア` |

特に指定がなければ、実験場トップはベストランキングを出す。指定があるゲームだけ、初回ランキングなどを出す。

各ゲームの実験場トップ表示は次である。

| 表示順 | 表示名 | RPCへ渡すslug | 実験場で出すランキング見出し | top指定 | RPC | 表示値 | 単位・小数 |
|---:|---|---|---|---|---|---|---|
| 1 | 虎に優しく | `torani_yasashiku` | 最高スコア | `best` | `get_best_score_ranking` | `best_score` | 点・0桁 |
| 2 | 暇つぶし | `nayuta_no_himatsubushi` | 最高スコア | `best` | `get_best_score_ranking` | `best_score` | 点・0桁 |
| 3 | イロアテ | `iroate` | ベストタイム | `best` | `get_best_score_ranking` | `best_score` | 秒・2桁 |
| 4 | 夢を見たんだけどさ | `yume_wo_mitandakedosa` | 最高スコア | `best` | `get_best_score_ranking` | `best_score` | 点・0桁 |
| 5 | 水滴キャッチ | `suiteki_catch` | 初回スコア | `first` | `get_first_try_ranking` | `first_score` | 点・0桁 |
| 6 | 上手に描けるかな？ | `jouzuni_kakerukana` | 最高スコア | `best` | `get_best_score_ranking` | `best_score` | pt・0桁 |
| 7 | 充電ｶﾞｯ | `juden_ga` | 最高スコア | `best` | `get_best_score_ranking` | `best_score` | 点・0桁 |
| 8 | あなたの1秒って | `anatano_1byou` | ベスト誤差 | `best` | `get_best_score_ranking` | `best_score` | 秒・2桁 |
| 9 | ベク取る | `bekutoru` | ベストタイム | `best` | `get_best_score_ranking` | `best_score` | 秒・3桁 |
| 10 | 尊厳を賭けようか | `songen_wo_kakeyouka` | 最高スコア | `best` | `get_best_score_ranking` | `best_score` | 点・0桁 |
| 11 | ヒトを許すな！ | `hito_wo_yurusuna` | 最高スコア | `best` | `get_best_score_ranking` | `best_score` | 点・0桁 |
| 12 | 負けたらお前のせいだから | `maketara_omae_no_sei_dakara` | ベストスコア | `best` | `get_best_score_ranking` | `best_score` | 点・0桁 |
| 13 | 子供デモ解けちゃう | `kodomo_demo_tokechau` | 最高スコア | `best` | `get_best_score_ranking` | `best_score` | 点・0桁 |
| 14 | 目押しを制す | `meoshi_wo_seisu_hard` | ベストゲーム数 | `best` | `get_best_score_ranking` | `best_score` | ゲーム・0桁 |
| 16 | マロン飛行 | `maron_hikou` | 最高到達 | `best` | `get_best_score_ranking` | `best_score` | 点・0桁 |
| 17 | 取ればいいのよ | `toreba_iinoyo` | 最高スコア | `best` | `get_best_score_ranking` | `best_score` | 点・0桁 |
| 18 | 仕分けざる | `shiwakezaru` | 最高スコア | `best` | `get_best_score_ranking` | `best_score` | 点・0桁 |
| 19 | 絵文字拾い | `emojihiroi` | ベストタイム | `best` | `get_best_score_ranking` | `best_score` | 秒・2桁 |
| 20 | 間違いみっけ | `machigai_mikke_super_hard` | ベストタイム | `best` | `get_best_score_ranking` | `best_score` | 秒・2桁 |
| 23 | 熊のFP探し | `kuma_no_fpsagashi` | 最高到達階 | `best` | `get_best_score_ranking` | `best_score` | 階・0桁 |
| 24 | ジョーバ | `johba` | 最高スコア | `best` | `get_best_score_ranking` | `best_score` | 点・0桁 |
| 25 | 3度一致 | `sandoicchi` | 最高スコア | `best` | `get_best_score_ranking` | `best_score` | 点・0桁 |
| 26 | カニジャン | `kanijan` | 最高ジャン点 | `best` | `get_best_score_ranking` | `best_score` | 点・0桁 |
| 27 | トレメシ | `toremeshi` | 最高スコア | `best` | `get_best_score_ranking` | `best_score` | 点・0桁 |

注意点は次である。

- `score_order = desc` のベストは、数値が大きい記録である。
- `score_order = asc` のベストは、数値が小さい記録である。
- そのため、`ベストタイム`、`ベスト誤差`、`ベストゲーム数` は小さいほど良い。
- 表示順位はRPCが返す `rank_no` をそのまま使う。
- トップページで0件のランキングは、エラーではなく `coming soon` または `まだ記録がありません` と表示する。

## 9. 詳細ランキングで表示するランキング

詳細ランキングでは、1つのランキング対象ごとに、初回ランキングとベストランキングを最大100件表示する。

基本URLは次である。

```text
https://chameleonjp.codeberg.page/chameleonjp_lab/ranking.html?game=<game_slug>
```

難易度別ゲームは、詳細ページ内でだけ難易度を分ける。

| 詳細ページ | 難易度 | RPCへ渡すslug | URL例 |
|---|---|---|---|
| 目押しを制す | ノーマル | `meoshi_wo_seisu_normal` | `ranking.html?game=meoshi_wo_seisu&difficulty=normal` |
| 目押しを制す | ハード | `meoshi_wo_seisu_hard` | `ranking.html?game=meoshi_wo_seisu&difficulty=hard` |
| 間違いみっけ | イージー | `machigai_mikke_easy` | `ranking.html?game=machigai_mikke&difficulty=easy` |
| 間違いみっけ | ハード | `machigai_mikke_hard` | `ranking.html?game=machigai_mikke&difficulty=hard` |
| 間違いみっけ | 超ハード | `machigai_mikke_super_hard` | `ranking.html?game=machigai_mikke&difficulty=super_hard` |

それ以外のゲームは、`ranking.html?game=<game_slug>` で開く。

| display_order | title | 詳細ランキングURL |
|---:|---|---|
| 1 | 虎に優しく | `ranking.html?game=torani_yasashiku` |
| 2 | 暇つぶし | `ranking.html?game=nayuta_no_himatsubushi` |
| 3 | イロアテ | `ranking.html?game=iroate` |
| 4 | 夢を見たんだけどさ | `ranking.html?game=yume_wo_mitandakedosa` |
| 5 | 水滴キャッチ | `ranking.html?game=suiteki_catch` |
| 6 | 上手に描けるかな？ | `ranking.html?game=jouzuni_kakerukana` |
| 7 | 充電ｶﾞｯ | `ranking.html?game=juden_ga` |
| 8 | あなたの1秒って | `ranking.html?game=anatano_1byou` |
| 9 | ベク取る | `ranking.html?game=bekutoru` |
| 10 | 尊厳を賭けようか | `ranking.html?game=songen_wo_kakeyouka` |
| 11 | ヒトを許すな！ | `ranking.html?game=hito_wo_yurusuna` |
| 12 | 負けたらお前のせいだから | `ranking.html?game=maketara_omae_no_sei_dakara` |
| 13 | 子供デモ解けちゃう | `ranking.html?game=kodomo_demo_tokechau` |
| 14/15 | 目押しを制す | `ranking.html?game=meoshi_wo_seisu` |
| 16 | マロン飛行 | `ranking.html?game=maron_hikou` |
| 17 | 取ればいいのよ | `ranking.html?game=toreba_iinoyo` |
| 18 | 仕分けざる | `ranking.html?game=shiwakezaru` |
| 19 | 絵文字拾い | `ranking.html?game=emojihiroi` |
| 20/21/22 | 間違いみっけ | `ranking.html?game=machigai_mikke` |
| 23 | 熊のFP探し | `ranking.html?game=kuma_no_fpsagashi` |
| 24 | ジョーバ | `ranking.html?game=johba` |
| 25 | 3度一致 | `ranking.html?game=sandoicchi` |
| 26 | カニジャン | `ranking.html?game=kanijan` |
| 27 | トレメシ | `ranking.html?game=toremeshi` |

## 10. スコア表示ルール

Supabaseには整数スコアを保存する。表示時は、`score_scale` で割り、`score_decimals` の小数桁にして、`score_unit` を付ける。

```js
function formatScore(score, game) {
  const scale = Number(game.score_scale || game.scoreScale || 1);
  const decimals = Number(game.score_decimals ?? game.scoreDecimals ?? 0);
  const unit = game.score_unit || game.scoreUnit || "点";
  const value = Number(score || 0) / scale;
  return `${value.toFixed(decimals)}${unit}`;
}
```

例は次。

| 内部スコア | 設定 | 表示 |
|---:|---|---|
| `12345` | `score_scale=1`, `score_decimals=0`, `score_unit=点` | `12345点` |
| `3415` | `score_scale=100`, `score_decimals=2`, `score_unit=秒` | `34.15秒` |
| `1234` | `score_scale=1000`, `score_decimals=3`, `score_unit=秒` | `1.234秒` |
| `19` | `score_scale=1`, `score_decimals=0`, `score_unit=階` | `19階` |
| `7` | `score_scale=1`, `score_decimals=0`, `score_unit=ゲーム` | `7ゲーム` |

順位はRPCが返す `rank_no` をそのまま使う。フロント側で `index + 1` を順位にしてはいけない。

## 11. 実験場トップの取得ロジック

実験場トップでは、次の順で動かす。

1. Supabase接続を作る。
2. `public.games` から `is_active = true` を取得する。
3. `display_order` 昇順で並べる。
4. 難易度別ゲームを1枚のカードにまとめる。
5. カードを描画する。
6. カードを開いた時に、集計とトップランキングを読む。

ランキング取得は次の形にする。

```js
const rpcName = topRankingType === "first"
  ? "get_first_try_ranking"
  : "get_best_score_ranking";

await supabase.rpc(rpcName, {
  p_game_slug: rankingSlug,
  p_limit: 3
});
```

難易度別ゲームでは、`rankingSlug` に高難易度側のslugを入れる。

```text
目押しを制す: meoshi_wo_seisu_hard
間違いみっけ: machigai_mikke_super_hard
```

## 12. 詳細ランキングの取得ロジック

詳細ページでは、選択中のゲームまたは難易度1つに対して、初回とベストを両方読む。

```js
await supabase.rpc("get_first_try_ranking", {
  p_game_slug: gameSlug,
  p_limit: 100
});

await supabase.rpc("get_best_score_ranking", {
  p_game_slug: gameSlug,
  p_limit: 100
});
```

詳細ページ内の難易度タブを切り替えた場合は、RPCへ渡す `gameSlug` を切り替える。

実験場トップでは難易度を分けて見せない。詳細ページだけで分けて見せる。

## 13. 固定配列が残っている場合の対応

将来の理想は、Supabase `public.games` を正にして固定配列を減らすことである。

ただし、現行コードに `GAMES` や `GAME_PAGES` が残っている場合、Supabaseだけを更新しても画面に出ないことがある。その場合は、次の対応をする。

| 固定配列側 | Supabase側 |
|---|---|
| `slug` | `game_slug` |
| `title` | `title` |
| `url` | `game_url` |
| `description` | `description` |
| `topRanking` | `top_ranking_type` |
| `scoreOrder` | `score_order` |
| `scoreUnit` | `score_unit` |
| `scoreScale` | `score_scale` |
| `scoreDecimals` | `score_decimals` |
| `scoreLabel` | `score_label` |
| `firstScoreLabel` | `first_score_label` |
| `bestScoreLabel` | `best_score_label` |
| `releaseDate` | `release_date` |

新規ゲームを追加する時は、Supabase `public.games`、実験場トップ、詳細ランキングの3つを同時に確認する。

## 14. 新しいゲームを追加する時の手順

1. ゲーム本体を Codeberg Pages に公開する。
2. ゲーム本体の `GAME_SLUG` と Supabase `public.games.game_slug` を一致させる。
3. ゲーム終了時に `submit_score` で自動送信する。
4. Supabase `public.games` にゲーム情報を登録する。
5. 実験場トップでカードが出るか確認する。
6. 実験場トップで代表ランキングが3件まで出るか確認する。
7. 詳細ランキングで初回・ベストが最大100件出るか確認する。
8. 難易度別ゲームなら、実験場では高難易度側のランキングだけを出し、詳細ページ内で難易度タブを出す。

## 15. やってはいけないこと

- `public.scores` を使う。
- `created_at` が必ずある前提でSQLを書く。
- `rank_no` を無視して `index + 1` で順位を出す。
- 秒系ゲームなのに `score_scale = 1` にする。
- `score_order` を逆にする。
- 結果画面に「ランキング登録」ボタンを置き、任意送信にする。
- 難易度別ゲームを実験場トップで複数カードに分ける。
- 実験場トップで低難易度側のランキングを代表として出す。
- 実験場トップのランキング見出しを `score_label` だけで決める。
- `top_ranking_type = first` のゲームで `best_score` を表示する。
- `service_role` キーを公開HTMLへ入れる。

## 16. スマホ表示と操作抑制

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

## 17. 復元時の最短チェックリスト

実験場トップを復元したら、次を見る。

- 深緑背景 `#0b241b` になっている。
- `is_active = true` のゲームだけ出る。
- `display_order` 順に並ぶ。
- 実験場トップのランキングは、指定がなければベストランキングになる。
- 水滴キャッチは初回スコアを出す。
- 目押しを制すは1枚のカードで、ハードのベストゲーム数を出す。
- 間違いみっけは1枚のカードで、超ハードのベストタイムを出す。
- マロン飛行、熊のFP探し、ジョーバ、3度一致、カニジャン、トレメシが出る。
- ランキング見出しは `first_score_label` または `best_score_label` に従う。
- ランキング0件でもページが壊れない。
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

## 18. display_order 28〜33 追加分

| 表示順 | slug | タイトル | 代表ランキング | 順序 | 単位 |
|---:|---|---|---|---|---|
| 28 | `uchikaeru` | うちかえる | 最高記録 | desc | 点 |
| 29 | `binkarabin` | ビンカラビン | ベストタイム | asc | 秒（1000分の1秒） |
| 30 | `koroshine` | コロシャイン | 最高スコア | desc | 点 |
| 31 | `songen_wo_kakeyouka2` | 尊厳を賭けようか2 | 最高スコア | desc | 点 |
| 32 | `ironarabe` | イロナラベ | ベストタイム | asc | 秒（100分の1秒） |
| 33 | `goriragouu` | ゴリラ豪雨 | 最高スコア | desc | 点 |

`goriragouu` はPC・スマホでゲーム条件を共通にし、描画品質だけを端末に合わせて変える。
ゲーム終了時に名前と最終スコアを `submit_score` へ1回だけ自動送信する。
