#!/usr/bin/env node
// Read-only check of the public ranking endpoints; creates no play/score records.
import fs from "node:fs";
import assert from "node:assert/strict";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const apiUrl = html.match(/const SUPABASE_URL = "([^"]+)"/)?.[1];
const key = html.match(/const SUPABASE_PUBLISHABLE_KEY = "([^"]+)"/)?.[1];
assert.ok(apiUrl && key, "Public API settings are missing");

async function request(path, body) {
  const response = await fetch(apiUrl + "/rest/v1/" + path, {
    method: body ? "POST" : "GET",
    headers: { apikey: key, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error(path + ": HTTP " + response.status + " " + await response.text());
  const data = await response.json();
  assert.ok(Array.isArray(data), path + ": expected an array");
  return data;
}

function checkRanks(rows, scoreKey, order, label) {
  let previousScore;
  let previousRank;
  rows.forEach((row, i) => {
    const score = Number(row[scoreKey]);
    assert.ok(Number.isSafeInteger(score), label + ": non-integer score/count");
    assert.ok(typeof row.display_name === "string" && row.display_name.length > 0, label + ": missing display name");
    const expectedRank = i > 0 && score === previousScore ? previousRank : i + 1;
    assert.equal(Number(row.rank_no), expectedRank, label + ": incorrect tie rank");
    if (i > 0) assert.ok(order === "asc" ? score >= previousScore : score <= previousScore, label + ": incorrect order");
    previousScore = score;
    previousRank = Number(row.rank_no);
  });
}

const games = await request("games?select=game_slug,score_order&is_active=eq.true&order=display_order.asc");
const summaries = [];
let next = 0;
await Promise.all(Array.from({ length: Math.min(4, games.length) }, async () => {
  while (next < games.length) {
    const game = games[next++];
    const body = { p_game_slug: game.game_slug, p_limit: 100 };
    // Sequential requests within each worker keep the total concurrency at four.
    const first = await request("rpc/get_first_try_ranking", body);
    const best = await request("rpc/get_best_score_ranking", body);
    const plays = await request("rpc/get_play_count_ranking", body);
    const statsRpc = game.game_slug.startsWith("faitofuraito_") ? "get_faitofuraito_play_stats_v1" : "get_game_play_stats";
    const stats = await request("rpc/" + statsRpc, { p_game_slug: game.game_slug });
    assert.equal(stats.length, 1, game.game_slug + ": expected one stats row");
    checkRanks(first, "first_score", game.score_order, game.game_slug + " first");
    checkRanks(best, "best_score", game.score_order, game.game_slug + " best");
    checkRanks(plays, "play_count", "desc", game.game_slug + " plays");
    assert.equal(first.length, best.length, game.game_slug + ": first/best player sets differ");
    const playerCount = Number(stats[0].player_count);
    const totalPlayCount = Number(stats[0].total_play_count);
    assert.ok(Number.isSafeInteger(playerCount) && playerCount >= 0, game.game_slug + ": invalid player count");
    assert.ok(Number.isSafeInteger(totalPlayCount) && totalPlayCount >= 0, game.game_slug + ": invalid total count");
    assert.equal(plays.length, Math.min(playerCount, 100), game.game_slug + ": stats/ranking player count differs");
    const rankedPlays = plays.reduce((sum, row) => sum + Number(row.play_count), 0);
    assert.ok(totalPlayCount >= rankedPlays, game.game_slug + ": stats total is less than ranked plays");
    const namedPlayCount = Number(stats[0].registered_play_count ?? totalPlayCount);
    // Dedicated anonymous-start counters contribute to total, but never create a named ranking row.
    // Exact anonymous + named aggregation is covered by the isolated guest-counter database test.
    const anonymousStarts = ["takkeu", "ironarabe"].includes(game.game_slug);
    if (playerCount <= 100 && !anonymousStarts) assert.equal(namedPlayCount, rankedPlays, game.game_slug + ": stats/ranking play totals differ");
    if (playerCount <= 100 && anonymousStarts) assert.ok(totalPlayCount >= rankedPlays, game.game_slug + ": total must retain every named play plus anonymous starts");
    const playsByName = new Map(plays.map(row => [row.display_name, Number(row.play_count)]));
    for (const row of best) {
      if (playsByName.has(row.display_name)) assert.equal(Number(row.play_count), playsByName.get(row.display_name), game.game_slug + ": best/play count differs");
    }
    summaries.push({
      game_slug: game.game_slug, first_rows: first.length, best_rows: best.length, play_rows: plays.length,
      total_play_count: totalPlayCount, player_count: playerCount,
      unregistered_play_count: Number(stats[0].unregistered_play_count ?? 0)
    });
  }
}));
summaries.sort((a,b) => a.game_slug.localeCompare(b.game_slug));
const report = {
  checked_at: new Date().toISOString(), read_only: true,
  games: games.length, nonempty_play_rankings: summaries.filter(row => row.play_rows > 0).length,
  checks: "public access, shapes, score directions, tie ranks, play-count/total consistency",
  summaries
};
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ games: report.games, nonempty_play_rankings: report.nonempty_play_rankings, result: "pass" }));

