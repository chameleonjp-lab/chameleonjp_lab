export const timeAttackMode = 'chameleol_time_attack';
export const timeAttackRows = Array.from({length: 205}, (_, index) => {
  const position = index + 1;
  const rank = position === 2 || position === 101 ? position - 1 : position;
  return {
    position,
    rank,
    name: position === 1 ? '<img src=x>' : '完走者' + position,
    elapsedCs: position === 205 ? 60001 : 2500 + rank,
    family: ['red', 'blue', 'green'][index % 3],
    titleId: position === 205 ? null : 'ta.title.01',
    officialAt: '2026-11-21T10:00:00Z',
  };
});

export function timeAttackPageResponse(rows, searchParams, version = 3) {
  const cursor = searchParams.get('after');
  const restarted = Boolean(cursor) && searchParams.get('version') !== String(version);
  const after = restarted ? 0 : Number(cursor);
  const limit = Number(searchParams.get('limit'));
  const next = after + limit;
  return {
    ok: true,
    modeId: timeAttackMode,
    version,
    rows: rows.slice(after, next),
    nameCount: rows.length,
    nextAfter: next < rows.length ? next : null,
    restarted,
  };
}
