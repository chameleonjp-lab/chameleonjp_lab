import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

const schema = JSON.parse(readFileSync(new URL('../docs/chameleonjp-lab/schemas/ranking-manifest-v1.schema.json', import.meta.url)));
const ajv = new Ajv2020({ allErrors: true, strictRequired: false, strictTypes: false });
const validate = ajv.compile(schema);

export function validateRankingManifest(manifest) {
  if (!validate(manifest)) throw new Error(ajv.errorsText(validate.errors));

  const modes = new Set();
  const routes = new Set([manifest.play_count.rpc, manifest.submission.rpc]);
  for (const entry of manifest.ranking_entries) {
    if (modes.has(entry.mode_id)) throw new Error('Duplicate ranking mode: ' + entry.mode_id);
    modes.add(entry.mode_id);
    if (!entry.play_count) continue;
    for (const route of [entry.play_count.rpc, entry.submission.rpc, entry.ranking_rpc, entry.stats_rpc]) {
      if (routes.has(route)) throw new Error('Ranking modes must use distinct routes: ' + route);
      routes.add(route);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.argv[2]) throw new Error('Usage: node scripts/validate-ranking-manifest.mjs <manifest path>');
  validateRankingManifest(JSON.parse(readFileSync(process.argv[2], 'utf8')));
}
