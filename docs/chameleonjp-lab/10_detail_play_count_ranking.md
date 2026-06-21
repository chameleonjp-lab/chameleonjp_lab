# 詳細ページ プレイ回数ランキング追加仕様

最終更新: 2026-06-21
対象: `chameleonjp_lab/ranking.html` / Supabase RPC / 詳細ランキングページ

## 1. この文書の目的

詳細ランキングページに、既存の「初回ランキング」「ベストランキング」に加えて、「プレイ回数ランキング」を追加する。

プレイ回数ランキングは、同じゲームを多く遊んだプレイヤーを上位に表示するランキングである。

このランキングでは、スコアの大小ではなく、プレイヤーごとの `play_count` が多いほど上位になる。

## 2. 追加後の詳細ページ構成

詳細ランキングページのタブは、次の3つにする。

| タブ | 内容 | 並び順 |
|---|---|---|
| 初回ランキング | そのプレイヤーが最初に登録した記録 | ゲームごとの `score_order` に従う |
| ベストランキング | そのプレイヤーの一番良い記録 | ゲームごとの `score_order` に従う |
| プレイ回数ランキング | そのプレイヤーの累計プレイ回数 | `play_count` が多い順 |

プレイ回数ランキングは、全ゲーム共通で降順にする。

```text
play_count desc
```

## 3. 重要な考え方

プレイ回数ランキングは、スコアランキングとは別物である。

たとえば、タイム系ゲームではベストランキングは `score_order=asc` になる。しかし、プレイ回数ランキングはタイム系でも点数系でも、必ず `play_count` が多い人を上位にする。

つまり、プレイ回数ランキングでは `score_order` を使わない。

## 4. 取得件数

詳細ページでは、既存の初回・ベストランキングと同じく、最大100件を取得する。

```js
const DETAIL_LIMIT = 100;
```

## 5. 追加するSupabase RPC

正しく実装するには、新しいRPCを追加する。

推奨名は次。

```text
get_play_count_ranking
```

理由は、既存の `get_best_score_ranking` の戻り値に `play_count` が含まれていても、それはベストスコア順で取得された行であるためである。

ベストランキングの取得結果をフロント側で `play_count` 順に並べ替えるだけでは、ベストスコア上位100人の中のプレイ回数ランキングになってしまう。全体のプレイ回数上位100人にならない。

そのため、Supabase側で `play_count desc` のランキングを返す専用RPCを作る。

## 6. RPCの期待引数

既存RPCと同じ形にする。

```js
await supabase.rpc("get_play_count_ranking", {
  p_game_slug: gameSlug,
  p_limit: 100
});
```

| 引数 | 内容 |
|---|---|
| `p_game_slug` | 対象ゲームの `game_slug` |
| `p_limit` | 取得件数。詳細ページでは100 |

## 7. RPCの期待戻り値

戻り値は、最低限次を返す。

| 列 | 内容 |
|---|---|
| `rank_no` | 順位。同率対応済み |
| `display_name` | プレイヤー名 |
| `play_count` | 累計プレイ回数 |
| `best_score` | 参考表示用。あれば使う |
| `first_score` | 参考表示用。あれば使う |
| `updated_at` | あれば補助表示に使う |

必須は `rank_no`、`display_name`、`play_count` の3つである。

## 8. 順位の扱い

順位はSupabase側で作る。

同じプレイ回数の人は同じ順位にする。

例:

```text
1位 Aさん 20回
1位 Bさん 20回
3位 Cさん 18回
```

フロント側で `index + 1` を順位にしてはいけない。

## 9. SQLテンプレート

実際の `game_scores` テーブル構造が、現在の想定どおり「1プレイヤー1行、play_count列あり」であれば、RPCは次の形で作る。

```sql
create or replace function public.get_play_count_ranking(
  p_game_slug text,
  p_limit integer default 100
)
returns table (
  rank_no bigint,
  display_name text,
  play_count integer,
  first_score integer,
  best_score integer,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    rank() over (
      order by gs.play_count desc, gs.updated_at asc, gs.display_name asc
    ) as rank_no,
    gs.display_name,
    gs.play_count,
    gs.first_score,
    gs.best_score,
    gs.updated_at
  from public.game_scores gs
  where gs.game_slug = p_game_slug
    and coalesce(gs.play_count, 0) > 0
  order by
    gs.play_count desc,
    gs.updated_at asc,
    gs.display_name asc
  limit least(greatest(coalesce(p_limit, 100), 1), 100);
$$;
```

注意: 実テーブルの列名が違う場合は、先に列一覧を確認する。

```sql
select
  column_name,
  data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'game_scores'
order by ordinal_position;
```

## 10. RLSと権限

既存RPCと同じく、ブラウザ側のPublishable keyから呼べるようにする。

必要なら、次を付ける。

```sql
grant execute on function public.get_play_count_ranking(text, integer) to anon;
grant execute on function public.get_play_count_ranking(text, integer) to authenticated;
```

既存のRPCの権限設定に合わせる。

## 11. ranking.html の画面追加

詳細ページのランキング切り替えに、3つ目のタブを追加する。

```text
初回スコア / 最高スコア / プレイ回数
```

ゲームごとのラベルは、初回とベストは既存通り `first_score_label` と `best_score_label` を使う。プレイ回数ランキングは全ゲーム共通で `プレイ回数` とする。

タブの表示例:

```html
<button data-ranking-tab="first">初回スコア</button>
<button data-ranking-tab="best">最高スコア</button>
<button data-ranking-tab="plays">プレイ回数</button>
```

## 12. プレイ回数ランキングの表示内容

プレイ回数ランキングの1行は、最低限次を表示する。

```text
1位　カメレオンJP　23回
```

あわせて参考値として、ベスト記録を小さく表示してもよい。

```text
1位　カメレオンJP　23回
ベスト: 310,312,000点
```

ただし、主役はプレイ回数である。スコアを主表示にしてはいけない。

## 13. 既存コードへの追加方針

既存の詳細ページには、次の処理がある。

```text
fetchFirstRanking(game)
fetchBestRanking(game)
buildFirstRankingRows(firstRows, game)
buildBestRankingRows(bestRows, game)
loadRankings(game, token)
switchRankingTab(tabName)
```

ここへ次を追加する。

```text
fetchPlayCountRanking(game)
buildPlayCountRankingRows(playRows, game)
```

`loadRankings` では、初回、ベスト、プレイ回数をまとめて取得する。

```js
const [firstRows, bestRows, playRows] = await Promise.all([
  fetchFirstRanking(game),
  fetchBestRanking(game),
  fetchPlayCountRanking(game)
]);
```

ただし、RPCがまだ作られていない環境では、ページ全体を壊さない。プレイ回数タブだけ「プレイ回数ランキングを取得できませんでした」と出す。

## 14. エラー時の扱い

プレイ回数ランキングだけ取得に失敗しても、初回ランキングとベストランキングは表示する。

避けるべきことは次である。

- プレイ回数RPCの失敗で、詳細ページ全体を `coming soon` にする。
- 初回・ベストまで消す。
- 空配列と通信失敗を同じ扱いにする。

表示文言例:

```text
プレイ回数ランキングを取得できませんでした。
```

0件の時は、エラーではなく次を出す。

```text
まだ記録がありません
```

## 15. 難易度別ゲームでの扱い

難易度別ゲームでは、選択中の難易度ごとにプレイ回数ランキングを出す。

| 詳細ページ | 難易度 | RPCへ渡すslug |
|---|---|---|
| 目押しを制す | ノーマル | `meoshi_wo_seisu_normal` |
| 目押しを制す | ハード | `meoshi_wo_seisu_hard` |
| 間違いみっけ | イージー | `machigai_mikke_easy` |
| 間違いみっけ | ハード | `machigai_mikke_hard` |
| 間違いみっけ | 超ハード | `machigai_mikke_super_hard` |

実験場トップでは、難易度別のプレイ回数ランキングは出さない。今回追加するのは詳細ページのみである。

## 16. 表示単位

プレイ回数ランキングでは、スコア単位ではなく `回` を使う。

```text
23回
```

`score_unit` は使わない。

## 17. 追加後の確認項目

実装後は、最低限次を確認する。

- 詳細ページに3つ目のタブ「プレイ回数」が出る。
- 初回ランキングとベストランキングは従来通り表示される。
- プレイ回数ランキングは `play_count` の多い順に並ぶ。
- 同じプレイ回数の人は同じ順位になる。
- 順位は `rank_no` を使う。
- 表示単位は `回` になる。
- タイム系ゲームでも、プレイ回数ランキングは `play_count desc` になる。
- 難易度別ゲームでは、選択中の難易度ごとにプレイ回数ランキングが出る。
- RPCがない、または失敗した場合でも、初回・ベストは壊れない。
- iPhone SE級の幅で、3タブが横にはみ出さない。

## 18. Codexへの実装依頼文

```text
このリポジトリの CLAUDE.md と docs/chameleonjp-lab/ を先に読んでください。

詳細ランキング ranking.html に、既存の初回ランキング・ベストランキングに加えて、プレイ回数ランキングを追加します。

目的:
- 詳細ページに3つ目のタブ「プレイ回数」を追加する。
- プレイ回数が多いプレイヤーほど上位にする。
- タイム系・点数系に関係なく、プレイ回数ランキングだけは play_count desc で並べる。

Supabase:
- 新しいRPC `get_play_count_ranking(p_game_slug text, p_limit integer default 100)` を使う前提にしてください。
- 戻り値は `rank_no`, `display_name`, `play_count`, `first_score`, `best_score`, `updated_at` を想定します。
- RPCがまだ存在しない環境でも、ページ全体を壊さず、プレイ回数タブだけ取得失敗表示にしてください。

ranking.html:
- 既存の初回・ベストタブを壊さないでください。
- 3つ目のタブとして「プレイ回数」を追加してください。
- プレイ回数ランキングの主表示は `play_count` とし、単位は `回` にしてください。
- 参考としてベスト記録を小さく表示してもよいですが、主表示をスコアにしないでください。
- 順位はRPCの `rank_no` をそのまま使ってください。index + 1で順位を作らないでください。
- 難易度別ゲームでは、選択中の難易度slugをRPCへ渡してください。
- RPC失敗時に初回ランキング・ベストランキングまで消さないでください。

SQL:
- docs/chameleonjp-lab/10_detail_play_count_ranking.md にあるSQLテンプレートを参考にしてください。
- 実テーブルの列名が違う可能性がある場合は、先に information_schema.columns で確認してください。

確認:
- ranking.html?game=bekutoru で3タブが出る。
- ranking.html?game=meoshi_wo_seisu&difficulty=hard でハードのプレイ回数ランキングが出る。
- ranking.html?game=machigai_mikke&difficulty=super_hard で超ハードのプレイ回数ランキングが出る。
- プレイ回数が多い順に並ぶ。
- 0件やRPC失敗でもページ全体が壊れない。
```
