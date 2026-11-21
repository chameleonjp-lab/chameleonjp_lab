// The production game's release file selects the same API used by its own screens.
const releaseUrl = 'https://chameleonjp-lab.github.io/chameleol/release.json';
const integer = (value, min, max = Number.MAX_SAFE_INTEGER) =>
  Number.isSafeInteger(value) && value >= min && value <= max;
const timeAttackMode = 'chameleol_time_attack';
const timeAttackFamilies = { red: '赤系', green: '緑系', blue: '青系' };
const detailPageSize = 100;
let titleCatalog;
let titleLoadAttempt = 0;

function timeAttackTitles() {
  if (!titleCatalog) {
    const url = new URL('./i18n/chameleol-time-attack.js?v=20261121-ta-v1', import.meta.url);
    // A failed dynamic import is cached by the browser for that URL.
    if (titleLoadAttempt) url.searchParams.set('retry', String(titleLoadAttempt));
    titleLoadAttempt++;
    titleCatalog = import(url.href)
      .then(({titles}) => new Map(titles.map(title => [title.id, title])))
      .catch(error => {
        titleCatalog = undefined;
        throw error;
      });
  }
  return titleCatalog;
}

export function createReader(fetchImpl = (...args) => fetch(...args)) {
  let resolving;
  async function json(url) {
    const response = await fetchImpl(url, {
      cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error('ランキング通信に失敗しました');
    return response.json();
  }

  async function resolveRelease() {
    const release = await json(releaseUrl);
    if (release.env !== 'production' || !release.rankingApi) throw new Error('正式な集計元を確認できません');
    const url = new URL(release.rankingApi);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
      throw new Error('集計元のURLが無効です');
    }
    return { base: url.href.replace(/\/$/, ''), timeAttackAvailable: release.timeAttack?.available === true,
      allColorsAvailable: release.timeAttack?.rulesVersion === 'kamereoru-time-attack-rules-v3' };
  }

  function currentRelease() {
    // Coalesce simultaneous requests. Each new read checks the current release.
    return resolving ??= resolveRelease().finally(() => { resolving = undefined; });
  }

  async function currentBase() {
    return (await currentRelease()).base;
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

  // The public ranking nameCount excludes Hall of Fame names. The Hall total
  // comes from the verified stats endpoint, so no participant is counted twice.
  async function rankingParticipantCount(clearerCount) {
    if (!integer(clearerCount, 0)) throw new Error('殿堂入り人数が無効です');
    const {nameCount} = await read(await currentBase(), 'ranking?limit=1');
    if (!integer(nameCount, 0) || !integer(nameCount + clearerCount, 0)) {
      throw new Error('ランキング参加者数が無効です');
    }
    return nameCount + clearerCount;
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
  // The game preview stays at top 30; the experiment lab detail reads 100 at a time.
  // Retain the same API source and ranking version while reading the next page.
  async function rankingPage(previous = null) {
    if (previous && (!integer(previous.version, 0) ||
        !integer(previous.nextAfter, 1) || typeof previous.base !== 'string')) {
      throw new Error('順位表の続き位置が無効です');
    }
    const base = previous ? previous.base : await currentBase();
    const query = new URLSearchParams({limit: String(detailPageSize)});
    if (previous) {
      query.set('version', String(previous.version));
      query.set('after', String(previous.nextAfter));
    }
    const page = await read(base, 'ranking?' + query);
    const {version, rows, nextAfter, restarted} = page;
    if (!integer(version, 0) || !Array.isArray(rows) || rows.length > detailPageSize ||
        typeof restarted !== 'boolean' ||
        (previous && restarted !== (version !== previous.version))) {
      throw new Error('順位表の形式が無効です');
    }
    const from = previous && !restarted ? previous.nextAfter : 0;
    if (rows.some((row, i) => !integer(row?.position, 1) || row.position !== from + i + 1 ||
        !integer(row.rank, 1, row.position) || typeof row.name !== 'string' ||
        !integer(row.buildings, 0, 50) || !integer(row.average, 0, 10000)) ||
        (nextAfter !== null && (!rows.length || nextAfter !== rows.at(-1).position))) {
      throw new Error('順位表の値または続き位置が無効です');
    }
    return {version, rows, nextAfter, restarted: !!previous && restarted, base};
  }

  async function hallOfFame(previous = null) {
    const query = new URLSearchParams();
    if (previous?.nextAfter != null) {
      query.set('version', previous.version);
      query.set('after', String(previous.nextAfter));
    }
    const page = await read(await currentBase(), 'hall-of-fame' + (query.size ? '?' + query : ''));
    const {version, rows, nextAfter, restarted} = page;
    const from = previous && !restarted ? previous.nextAfter : 0;
    if (!/^[0-9a-f]{32}$/.test(version) || typeof restarted !== 'boolean' ||
        (previous && restarted !== (version !== previous.version)) ||
        !Array.isArray(rows) || rows.length > 50 ||
        rows.some((row, i) => !integer(row?.ordinal, 1) || row.ordinal !== from + i + 1 ||
          typeof row.name !== 'string' || !integer(row.average, 0, 10000)) ||
        (nextAfter !== null && (!rows.length || nextAfter !== rows.at(-1).ordinal))) {
      throw new Error('殿堂入り一覧の形式が無効です');
    }
    return {version, rows, nextAfter, restarted};
  }

  async function timeAttackAvailable() {
    return (await currentRelease()).timeAttackAvailable;
  }

  async function timeAttackSettings() {
    const {timeAttackAvailable, allColorsAvailable} = await currentRelease();
    return {timeAttackAvailable, allColorsAvailable};
  }

  async function timeAttackBase(course) {
    const {base, timeAttackAvailable, allColorsAvailable} = await currentRelease();
    if (!timeAttackAvailable) throw new Error('タイムアタックの集計は準備中です');
    if (course !== 'legacy' && (course !== 'all' || !allColorsAvailable)) {
      throw new Error('このコースの集計は準備中です');
    }
    return base;
  }

  async function timeAttackStats(course = 'legacy') {
    const query = course === 'all' ? '?course=all' : '';
    const response = await json(await timeAttackBase(course) + '/time-attack-stats' + query);
    if (response?.modeId !== timeAttackMode || (response.ok !== undefined && response.ok !== true) ||
        !integer(response.totalPlays, 0) || !integer(response.participantCount, 0, response.totalPlays)) {
      throw new Error('タイムアタックの集計値が無効です');
    }
    const {totalPlays, participantCount} = response;
    return {modeId: timeAttackMode, totalPlays, participantCount};
  }

  async function timeAttackPage(previous = null, course = 'legacy') {
    if (previous && (!integer(previous.version, 0) || !integer(previous.nextAfter, 1) ||
        !integer(previous.nameCount, previous.nextAfter + 1) || typeof previous.base !== 'string' ||
        !Array.isArray(previous.rows) || previous.rows.at(-1)?.position !== previous.nextAfter)) {
      throw new Error('タイムアタックの続き位置が無効です');
    }
    const base = await timeAttackBase(course);
    const cursor = previous?.base === base && previous.course === course ? previous : null;
    const query = new URLSearchParams({limit: String(detailPageSize)});
    if (course === 'all') query.set('course', course);
    if (cursor) {
      query.set('version', String(cursor.version));
      query.set('after', String(cursor.nextAfter));
    }
    const [page, titles] = await Promise.all([
      read(base, 'time-attack-ranking?' + query),
      timeAttackTitles(),
    ]);
    const {modeId, version, rows, nameCount, nextAfter, restarted} = page;
    const continuation = cursor && !restarted;
    const from = continuation ? cursor.nextAfter : 0;
    if (modeId !== timeAttackMode || (course === 'all' && page.course !== course) ||
        (page.course != null && page.course !== course) || !integer(version, 0) || !integer(nameCount, from) ||
        typeof restarted !== 'boolean' || restarted !== Boolean(cursor && cursor.version !== version) ||
        (continuation && nameCount !== cursor.nameCount) || !Array.isArray(rows) ||
        rows.length !== Math.min(detailPageSize, nameCount - from)) {
      throw new Error('タイムアタックの順位表の形式が無効です');
    }
    if (nextAfter !== (from + rows.length < nameCount ? from + rows.length : null)) {
      throw new Error('タイムアタックの続き位置が無効です');
    }
    for (const [index, row] of rows.entries()) {
      if (row?.position !== from + index + 1 || !integer(row.rank, 1, row.position) ||
          typeof row.name !== 'string' || !row.name.trim() ||
          !integer(row.elapsedCs, course === 'all' ? 1000 : 1500, 900719925468300) ||
          (course === 'all' ? row.family !== 'all' : !Object.hasOwn(timeAttackFamilies, row.family)) ||
          typeof row.officialAt !== 'string' || !Number.isFinite(Date.parse(row.officialAt))) {
        throw new Error('タイムアタックの順位表の値が無効です');
      }
      const title = titles.get(row.titleId);
      const titleMinimum = course === 'all' && row.titleId === 'ta.title.01' ? 1000 : title?.minCs;
      if (row.elapsedCs > 60000 ? row.titleId !== null :
        !title || row.elapsedCs < titleMinimum || row.elapsedCs > title.maxCs) {
        throw new Error('タイムアタックの称号が無効です');
      }
      const earlier = index === 0 ? (continuation ? cursor.rows.at(-1) : null) : rows[index - 1];
      if ((earlier && row.elapsedCs < earlier.elapsedCs) ||
          row.rank !== (earlier?.elapsedCs === row.elapsedCs ? earlier.rank : row.position)) {
        throw new Error('タイムアタックの順位または並びが無効です');
      }
    }
    return {modeId, version, rows, nameCount, nextAfter, restarted: Boolean(previous && (!cursor || restarted)), base, course};
  }

  return {stats, rankingParticipantCount, ranking, rankingPage, hallOfFame,
    timeAttackAvailable, timeAttackSettings, timeAttackStats, timeAttackPage};
}

export const reader = createReader();

export function renderRanking(container, table, append = false) {
  if (!append || table.restarted) container.replaceChildren();
  container.dataset.version = String(table.version);
  if (!table.rows.length) {
    if (!container.childElementCount) container.textContent = 'まだ記録がありません';
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

function formatTimeAttack(elapsedCs) {
  const minutes = String(Math.floor(elapsedCs / 6000)).padStart(2, '0');
  const seconds = String(Math.floor(elapsedCs / 100) % 60).padStart(2, '0');
  const centiseconds = String(elapsedCs % 100).padStart(2, '0');
  return `${minutes}:${seconds}.${centiseconds}`;
}

function timeAttackCell(tag, className, text) {
  const cell = document.createElement(tag);
  cell.className = className;
  cell.textContent = text;
  return cell;
}

export function createTimeAttackView({panel, reader, course = 'legacy'}) {
  const stats = panel.querySelector('.time-attack-stats');
  const total = panel.querySelector('#timeAttackPlays');
  const players = panel.querySelector('#timeAttackPlayers');
  const statsError = panel.querySelector('#timeAttackStatsError');
  const container = panel.querySelector('#timeAttackRanking');
  const more = panel.querySelector('#timeAttackMore');
  const status = panel.querySelector('#timeAttackPageStatus');
  const controller = new AbortController();
  const {signal} = controller;
  let firstLoad = true;
  let currentPage = null;
  let catalog;

  function refreshTitles() {
    const locale = globalThis.LabI18n?.getLanguage() ?? 'ja';
    for (const title of container.querySelectorAll('[data-time-attack-title]')) {
      const data = catalog.get(title.dataset.timeAttackTitle);
      title.textContent = data.labels[locale] ?? data.labels.ja;
    }
  }

  async function loadStats() {
    stats.hidden = false;
    statsError.replaceChildren();
    total.textContent = players.textContent = '読み込み中';
    try {
      const {totalPlays, participantCount} = await reader.timeAttackStats(course);
      if (signal.aborted) return;
      total.textContent = totalPlays.toLocaleString('ja-JP') + '回';
      players.textContent = participantCount.toLocaleString('ja-JP') + '人';
    } catch {
      if (signal.aborted) return;
      stats.hidden = true;
      showRetry(statsError, loadStats);
    }
  }

  async function loadRows() {
    if (more.disabled) return;
    more.disabled = true;
    if (!currentPage) container.textContent = '読み込み中';
    else status.textContent = '読み込み中';
    try {
      const [page, titles] = await Promise.all([reader.timeAttackPage(currentPage, course), timeAttackTitles()]);
      if (signal.aborted) return;
      catalog = titles;
      if (!currentPage || page.restarted) container.replaceChildren();
      if (currentPage && page.base !== currentPage.base) void loadStats();
      currentPage = page;
      container.dataset.version = String(page.version);
      if (page.nameCount === 0) container.textContent = 'まだ記録がありません';
      const fragment = document.createDocumentFragment();
      for (const {rank, name, elapsedCs, family, titleId} of page.rows) {
        const line = timeAttackCell('div', 'time-attack-row', '');
        const title = timeAttackCell('span', 'time-attack-title', course === 'all' ? '20棟完走' : '30棟完走');
        if (titleId) {
          title.dataset.timeAttackTitle = titleId;
          title.dataset.labNoTranslate = '';
        }
        line.append(
          timeAttackCell('span', 'rank-no', rank.toLocaleString('ja-JP') + '位'),
          timeAttackCell('bdi', 'rank-name', name),
          timeAttackCell('span', 'rank-score time-attack-time', formatTimeAttack(elapsedCs)),
          title,
        );
        if (course === 'legacy') line.append(timeAttackCell('span', 'time-attack-family', timeAttackFamilies[family]));
        fragment.append(line);
      }
      container.append(fragment);
      refreshTitles();
      status.textContent = page.restarted ? '最新の順位表を表示しました。' : '';
      more.hidden = page.nextAfter === null;
      more.textContent = '次の100名を表示';
    } catch {
      if (signal.aborted) return;
      status.textContent = '';
      if (currentPage) showRetry(status, loadRows);
      else showRetry(container, loadRows);
    } finally {
      more.disabled = false;
    }
  }

  document.addEventListener('lab-language-change', refreshTitles, {signal});
  more.addEventListener('click', loadRows, {signal});
  return {
    onTabChange(selected) {
      if (!selected || !firstLoad) return;
      firstLoad = false;
      void loadStats();
      void loadRows();
    },
    dispose() { controller.abort(); },
  };
}

export function renderHallOfFame(container, page, append = false) {
  if (!append || page.restarted) container.replaceChildren();
  if (!page.rows.length && !container.childElementCount) {
    container.textContent = 'まだ殿堂入りした方はいません';
    return;
  }
  for (const {ordinal, name, average} of page.rows) {
    const line = document.createElement('div');
    line.className = 'rank-row';
    const number = document.createElement('span');
    number.className = 'rank-no';
    number.textContent = ordinal.toLocaleString('ja-JP') + '人目';
    const player = document.createElement('bdi');
    player.className = 'rank-name';
    player.textContent = name;
    const percent = document.createElement('span');
    percent.className = 'rank-score';
    percent.textContent = '一致率 ' + (average / 100).toFixed(2) + '%';
    line.append(number, player, percent);
    container.append(line);
  }
}
