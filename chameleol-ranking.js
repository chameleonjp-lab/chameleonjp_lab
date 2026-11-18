// The production game's release file selects the same API used by its own screens.
const releaseUrl = 'https://chameleonjp-lab.github.io/chameleol/release.json';
const integer = (value, min, max = Number.MAX_SAFE_INTEGER) =>
  Number.isSafeInteger(value) && value >= min && value <= max;

export function createReader(fetchImpl = (...args) => fetch(...args)) {
  let resolving;
  async function json(url) {
    const response = await fetchImpl(url, {
      cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error('ランキング通信に失敗しました');
    return response.json();
  }

  async function resolveBase() {
    const release = await json(releaseUrl);
    if (release.env !== 'production' || !release.rankingApi) throw new Error('正式な集計元を確認できません');
    const url = new URL(release.rankingApi);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
      throw new Error('集計元のURLが無効です');
    }
    return url.href.replace(/\/$/, '');
  }

  function currentBase() {
    // Coalesce simultaneous requests. Each new read checks the current release.
    return resolving ??= resolveBase().finally(() => { resolving = undefined; });
  }

  async function read(base, path) {
    const result = await json(base + '/' + path);
    if (result.ok !== true) throw new Error('集計元から応答がありません');
    return result;
  }

  async function stats() {
    const {totalPlays, clearerCount} = await read(await currentBase(), 'stats');
    if (!integer(totalPlays, 0) || !integer(clearerCount, 0)) throw new Error('集計値が無効です');
    return {totalPlayCount: totalPlays, clearerCount};
  }

  async function ranking(maxRank = 30) {
    const base = await currentBase();
    let version;
    let after = 0;
    const rows = new Map();
    let restarted = false;
    do {
      const query = new URLSearchParams({limit: '30'});
      if (after) {
        query.set('version', String(version));
        query.set('after', String(after));
      }
      const page = await read(base, 'ranking?' + query);
      if (!integer(page.version, 0) || !Array.isArray(page.rows)) throw new Error('順位表の形式が無効です');
      if (after && (page.restarted || version !== page.version)) {
        if (restarted || !page.restarted || page.version === version) throw new Error('順位表が更新されています');
        restarted = true;
        rows.clear();
        after = 0;
      }
      version = page.version;
      let finished = false;
      for (const row of page.rows) {
        if (!integer(row.position, 1) || !integer(row.rank, 1) || typeof row.name !== 'string' ||
            !integer(row.buildings, 0, 50) || !integer(row.average, 0, 10000)) {
          throw new Error('順位表の値が無効です');
        }
        if (row.rank <= maxRank) rows.set(row.position, row);
        else finished = true;
      }
      if (finished || page.nextAfter === null) break;
      if (!page.rows.length || !integer(page.nextAfter, after + 1)) throw new Error('順位表の続き位置が無効です');
      after = page.nextAfter;
    } while (true);
    return {version, rows: [...rows.values()]};
  }
  return {stats, ranking};
}

export const reader = createReader();

export function renderRanking(container, table) {
  container.replaceChildren();
  container.dataset.version = String(table.version);
  if (!table.rows.length) {
    container.textContent = 'まだ記録がありません';
    return;
  }
  for (const row of table.rows) {
    const line = document.createElement('div');
    line.className = 'rank-row';
    const fields = [
      ['rank-no', row.rank+'位'], ['rank-name',row.name],
      ['rank-score',row.buildings+'棟 · '+(row.average/100).toFixed(2)+'%'],
    ];
    for (const [className, text] of fields) {
      const cell = document.createElement('span');
      cell.className = className;
      cell.textContent = text;
      if (className === 'rank-name') cell.dir = 'auto';
      line.append(cell);
    }
    container.append(line);
  }
}

export function showRetry(container, retry) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = '再試行';
  button.addEventListener('click', retry, {once:true});
  container.replaceChildren('取得できませんでした。', button);
}
