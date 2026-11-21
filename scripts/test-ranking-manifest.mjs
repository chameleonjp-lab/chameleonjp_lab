import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { validateRankingManifest } from './validate-ranking-manifest.mjs';

const legacy = JSON.parse(readFileSync(new URL('../docs/chameleonjp-lab/examples/ranking-manifest-v1.example.json', import.meta.url)));
const main = {
  ...legacy,
  game_id: 'chameleol',
  submission_mode: 'verified',
  lab: { representative_slug: 'chameleol' },
  player_name: { ...legacy.player_name, required_before_start: false, required_for_ranking: true },
  play_count: { count_at: 'start', rpc: 'kamereoru/launch', idempotency: true },
  submission: { ...legacy.submission, rpc: 'kamereoru/complete' },
  ranking_entries: [{
    ...legacy.ranking_entries[0],
    mode_id: 'main',
    game_slug: 'chameleol',
    score_order: 'desc',
    score_unit: '棟',
  }],
};
const timeAttack = {
  ...main.ranking_entries[0],
  mode_id: 'chameleol_time_attack',
  title: 'タイムアタック',
  score_order: 'asc',
  score_unit: '秒',
  score_scale: 100,
  score_decimals: 2,
  score_min: 1500,
  score_max: 900719925468300,
  ranked_results: ['cleared'],
  play_count: { ...main.play_count, rpc: 'kamereoru/time-attack-launch' },
  submission: { ...main.submission, rpc: 'kamereoru/time-attack-complete', timeout_ms: 8000 },
  ranking_rpc: 'kamereoru/time-attack-ranking',
  stats_rpc: 'kamereoru/time-attack-stats',
};
const withMode = (base, entry) => ({ ...base, ranking_entries: [...base.ranking_entries, entry] });

test('legacy root routes and two verified modes sharing a representative game both validate', () => {
  validateRankingManifest(legacy);
  validateRankingManifest(main);
  validateRankingManifest(withMode(main, timeAttack));
});

test('per-mode routes require verified mode and a complete dedicated contract', () => {
  const { stats_rpc: _stats, ...incomplete } = timeAttack;
  assert.throws(() => validateRankingManifest(withMode(main, incomplete)), /stats_rpc/);
  assert.throws(() => validateRankingManifest(withMode(legacy, { ...timeAttack, mode_id: 'secondary' })));
  assert.throws(() => validateRankingManifest(withMode(main, { ...timeAttack, game_slug: 'chameleol_time_attack' })));
});

test('duplicate mode IDs and overrides that reuse ordinary routes are rejected', () => {
  assert.throws(() => validateRankingManifest(withMode(main, { ...main.ranking_entries[0] })), /Duplicate ranking mode/);
  for (const entry of [
    { ...timeAttack, play_count: main.play_count },
    { ...timeAttack, submission: main.submission },
    { ...timeAttack, ranking_rpc: 'kamereoru/ranking' },
    { ...timeAttack, stats_rpc: 'kamereoru/stats' },
  ]) {
    assert.throws(() => validateRankingManifest(withMode(main, entry)));
  }
  const otherMode = { ...timeAttack, mode_id: 'another_verified_mode' };
  assert.throws(() => validateRankingManifest(withMode(main, { ...otherMode, play_count: main.play_count })), /distinct routes/);
  assert.throws(() => validateRankingManifest(withMode(main, { ...otherMode, ranking_rpc: otherMode.stats_rpc })), /distinct routes/);
});
