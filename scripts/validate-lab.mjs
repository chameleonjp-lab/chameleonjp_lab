#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const failures = [];

function fail(message) {
  failures.push(message);
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function extractJsonArray(source, marker) {
  const start = source.indexOf(marker);
  const open = source.indexOf("[", start);
  if (start < 0 || open < 0) {
    throw new Error(`配列が見つかりません: ${marker}`);
  }

  let depth = 0;
  let quote = null;
  let escaped = false;

  for (let i = open; i < source.length; i += 1) {
    const character = source[i];

    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (character === "\\") {
        escaped = true;
        continue;
      }
      if (character === quote) {
        quote = null;
      }
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === "[") {
      depth += 1;
      continue;
    }
    if (character === "]") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(open, i + 1);
      }
    }
  }

  throw new Error(`配列の終端が見つかりません: ${marker}`);
}

function parseFallback(relativePath, marker) {
  try {
    return JSON.parse(extractJsonArray(read(relativePath), marker));
  } catch (error) {
    fail(`${relativePath}: ${error.message}`);
    return [];
  }
}

function uniqueValues(values, label) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) {
      fail(`${label}が重複しています: ${value}`);
    }
    seen.add(value);
  }
}

function requireText(source, text, label) {
  if (!source.includes(text)) {
    fail(`${label}が見つかりません: ${text}`);
  }
}

function validateTermsAndFooter() {
  const terms = read("terms.html");

  requireText(terms, "<title>利用規約｜カメレオンJPの実験場</title>", "terms.htmlのtitle");
  requireText(terms, "制定・最終更新日：2026年8月31日", "terms.htmlの更新日");
  requireText(terms, "<h2>1. 本規約の適用</h2>", "terms.htmlの適用条項");
  requireText(terms, "<h2>3. 表示名とランキング情報</h2>", "terms.htmlのランキング情報条項");
  requireText(terms, "<h2>10. 免責と損害</h2>", "terms.htmlの免責条項");
  requireText(terms, "本名、メールアドレス、電話番号、住所", "terms.htmlの表示名注意");
  requireText(terms, "© 2026 カメレオンJP", "terms.htmlのコピーライト");

  for (const relativePath of ["index.html", "ranking.html"]) {
    const source = read(relativePath);
    requireText(source, 'href="terms.html"', `${relativePath}の利用規約リンク`);
    requireText(source, "© 2026 カメレオンJP", `${relativePath}のコピーライト`);
  }

  if (/一切(?:の)?責任を負いません/.test(terms)) {
    fail("terms.htmlに全面免責と受け取られる文言があります");
  }
  if (/個人情報を一切(?:収集|取得|保存)しません/.test(terms)) {
    fail("terms.htmlに個人情報の取扱いを断定する危険な文言があります");
  }
}

function compare(actual, expected, label) {
  if (String(actual ?? "") !== String(expected ?? "")) {
    fail(`${label}が不一致です: fallback=${actual ?? ""}, catalog=${expected ?? ""}`);
  }
}

function validateUrl(value, label) {
  try {
    const url = new URL(value);
    const allowed =
      url.protocol === "https:" &&
      (url.hostname === "chameleonjp.codeberg.page" ||
        url.hostname === "chameleonjp-lab.github.io") &&
      url.pathname.endsWith("/") &&
      !url.search &&
      !url.hash;
    if (!allowed) {
      fail(`${label}が許可されたHTTPS URLではありません: ${value}`);
    }
  } catch {
    fail(`${label}がURLとして解釈できません: ${value}`);
  }
}

function validateInlineScripts(relativePath) {
  const source = read(relativePath);
  if (/service_role/i.test(source)) {
    fail(`${relativePath}にservice_roleの文字列があります`);
  }

  const scripts = [];
  const pattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  for (const match of source.matchAll(pattern)) {
    if (!/\\bsrc\\s*=/.test(match[1])) {
      scripts.push(match[2]);
    }
  }

  if (!scripts.length) {
    fail(`${relativePath}のインラインJavaScriptが見つかりません`);
    return;
  }

  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "chameleonjp-lab-"));
  try {
    scripts.forEach((script, index) => {
      const filePath = path.join(tempDirectory, `${path.basename(relativePath)}-${index}.js`);
      fs.writeFileSync(filePath, script);
      const result = spawnSync(process.execPath, ["--check", filePath], {
        encoding: "utf8"
      });
      if (result.status !== 0) {
        fail(`${relativePath}のJavaScript構文検査に失敗しました (#${index + 1}): ${result.stderr.trim()}`);
      }
    });
  } finally {
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
}

const catalog = JSON.parse(read("catalog/games.json"));
if (catalog.schema_version !== "chameleonjp-games-catalog-v1") {
  fail("catalogのschema_versionが不正です");
}
if (!Array.isArray(catalog.games) || catalog.games.length === 0) {
  fail("catalog.gamesが空です");
}

const catalogGames = Array.isArray(catalog.games) ? catalog.games : [];
const catalogSlugs = catalogGames.map((game) => game.game_slug);
const catalogOrders = catalogGames
  .filter((game) => game.is_active === true)
  .map((game) => game.display_order);

uniqueValues(catalogSlugs, "catalogのgame_slug");
uniqueValues(catalogOrders, "公開中catalogのdisplay_order");

for (const game of catalogGames) {
  if (game.is_active !== true) {
    fail(`catalogに非公開ゲームが混ざっています: ${game.game_slug}`);
  }
  if (!/^[a-z0-9][a-z0-9_]{0,79}$/.test(game.game_slug)) {
    fail(`game_slugの形式が不正です: ${game.game_slug}`);
  }
  if (!Number.isInteger(game.display_order) || game.display_order < 1) {
    fail(`display_orderが不正です: ${game.game_slug}`);
  }
  validateUrl(game.game_url, `${game.game_slug}.game_url`);
  if (!["asc", "desc"].includes(game.score_order)) {
    fail(`score_orderが不正です: ${game.game_slug}`);
  }
  if (!Number.isInteger(game.score_scale) || game.score_scale < 1) {
    fail(`score_scaleが不正です: ${game.game_slug}`);
  }
  if (!Number.isInteger(game.score_decimals) || game.score_decimals < 0 || game.score_decimals > 3) {
    fail(`score_decimalsが不正です: ${game.game_slug}`);
  }
  if (!Number.isInteger(game.score_min) || !Number.isInteger(game.score_max) || game.score_min > game.score_max) {
    fail(`score範囲が不正です: ${game.game_slug}`);
  }
}

const indexGames = parseFallback("index.html", "let GAMES =");
const rankingPages = parseFallback("ranking.html", "const GAME_PAGES =");
const rankingEntries = rankingPages.flatMap((page) => page.difficulties || []);
const rankingSlugs = rankingEntries.map((entry) => entry.slug);

uniqueValues(indexGames.map((game) => game.slug), "トップ予備カタログのslug");
uniqueValues(indexGames.map((game) => game.displayOrder), "トップ予備カタログのdisplayOrder");
uniqueValues(rankingPages.map((page) => page.pageSlug), "詳細予備カタログのpageSlug");
uniqueValues(rankingSlugs, "詳細予備カタログのgame slug");
uniqueValues(rankingEntries.map((entry) => entry.displayOrder), "詳細予備カタログのdisplayOrder");

const catalogBySlug = new Map(catalogGames.map((game) => [game.game_slug, game]));
const rankingBySlug = new Map(rankingEntries.map((entry) => [entry.slug, entry]));

for (const game of catalogGames) {
  const ranking = rankingBySlug.get(game.game_slug);
  if (!ranking) {
    fail(`詳細予備カタログに不足しています: ${game.game_slug}`);
    continue;
  }

  const expected = {
    displayOrder: game.display_order,
    title: game.title,
    url: game.game_url,
    description: game.description,
    releaseDate: game.release_date,
    topRanking: game.top_ranking_type,
    scoreOrder: game.score_order,
    scoreUnit: game.score_unit,
    scoreScale: game.score_scale,
    scoreDecimals: game.score_decimals,
    scoreLabel: game.score_label,
    firstScoreLabel: game.first_score_label,
    bestScoreLabel: game.best_score_label
  };

  for (const [key, value] of Object.entries(expected)) {
    compare(ranking[key], value, `${game.game_slug}の詳細予備値.${key}`);
  }

  const top = indexGames.find((candidate) => (candidate.statsSlugs || []).includes(game.game_slug));
  if (!top) {
    fail(`トップ予備カタログに不足しています: ${game.game_slug}`);
  }
}

for (const game of indexGames) {
  for (const slug of game.statsSlugs || []) {
    if (!catalogBySlug.has(slug)) {
      fail(`トップ予備カタログに未知のstats slugがあります: ${slug}`);
    }
  }
  if (game.rankingSlug && !catalogBySlug.has(game.rankingSlug)) {
    fail(`トップ予備カタログに未知のranking slugがあります: ${game.rankingSlug}`);
  }
}

for (const page of rankingPages) {
  if (!Array.isArray(page.difficulties) || page.difficulties.length === 0) {
    fail(`詳細ページのdifficultyが空です: ${page.pageSlug}`);
  }
}

validateInlineScripts("index.html");
validateInlineScripts("ranking.html");
validateTermsAndFooter();

if (failures.length) {
  console.error("検査失敗:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log(`検査成功: ${catalogGames.length} games, ${rankingEntries.length} ranking entries`);
}
