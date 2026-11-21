const api = 'https://mlpnjgezrnhdxsxolyzj.supabase.co/rest/v1/rpc/';
const key = 'sb_publishable_drzcy0v97knU6FgjqSgBHw_0A9XPdFM';
const course = { p_course_id: 'park', p_course_version: 'park-5', p_rules_version: 'rules-freestyle-3' };

async function request(name, body, signal) {
  const response = await fetch(api + name, {
    method: 'POST',
    headers: { apikey: key, 'content-type': 'application/json' },
    credentials: 'omit',
    redirect: 'error',
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) throw new Error('Inubo data unavailable');
  return response.json();
}

export async function inuboBoard(metric, limit, signal = AbortSignal.timeout(8000)) {
  const rows = await request('inubo_ranking_board', { ...course, p_metric: metric, p_limit: limit }, signal);
  if (!Array.isArray(rows) || rows.length > limit || rows.some(row => !row ||
    !Number.isInteger(row.rank) || row.rank < 1 || row.rank > limit ||
    typeof row.display_name !== 'string' || !row.display_name.trim() ||
    !Number.isSafeInteger(row.value) || row.value < (metric === 'time' ? 1 : 0))) {
    throw new Error('Invalid Inubo ranking');
  }
  return rows;
}

export async function inuboStats() {
  const rows = await request('get_inubo_play_stats_v1', {}, AbortSignal.timeout(8000));
  const row = Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
  if (!row || !Number.isSafeInteger(row.total_play_count) || !Number.isSafeInteger(row.player_count) ||
    row.player_count < 0 || row.total_play_count < row.player_count) {
    throw new Error('Invalid Inubo play statistics');
  }
  return row;
}
