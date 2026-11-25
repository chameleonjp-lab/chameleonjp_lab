const modes = [
  { key: 'fishing', label: '釣り', heading: '釣りランキング' },
  { key: 'butcher', label: '解体', heading: '解体ランキング' },
  { key: 'cooking', label: '料理', heading: '料理ランキング' }
];
const pageSize = 500;
const fetchTimeout = 8000;
const catchLabel = '全長 {length} m ／ 重さ {weight} kg ／ 時間 {time}秒';

function parseBoard(data, offset, modeKey) {
  if (!Array.isArray(data) || data.length > pageSize) throw new Error('Invalid Ikagetto board');
  const maxScore = modeKey === 'fishing' ? 80000 : 50000;
  const hasMore = data[0]?.has_more ?? false;
  let previousRank = 0;
  for (const [index, row] of data.entries()) {
    if (!Number.isSafeInteger(row?.rank) || row.rank < 1 || row.rank < previousRank || row.rank > offset + index + 1 ||
        typeof row.display_name !== 'string' || !row.display_name.trim() ||
        !Number.isSafeInteger(row.score) || row.score < 0 || row.score > maxScore ||
        typeof row.has_more !== 'boolean' || row.has_more !== hasMore) {
      throw new Error('Invalid Ikagetto ranking row');
    }
    previousRank = row.rank;
  }
  if (hasMore && data.length !== pageSize) throw new Error('Incomplete Ikagetto page');
  return { offset, rows: data, hasMore };
}

function element(tag, className, text = '') {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

export function mountIkagettoRanking(root, { gameUrl, apiUrl, apiKey, share }) {
  const i18n = window.LabI18n;
  const requestedMode = new URLSearchParams(location.search).get('mode');
  let mode = modes.find(option => option.key === requestedMode) ?? modes[0];
  let shown = { offset: 0, rows: [], hasMore: false };
  let pending = null;
  let stats = null;

  const pagination = `
    <nav class="ikagetto-pages" aria-label="ページ切り替え" hidden>
      <button class="button secondary" type="button" data-previous>前のページ</button>
      <span data-page-number data-lab-no-translate></span>
      <button class="button secondary" type="button" data-next>次のページ</button>
    </nav>`;
  root.innerHTML = `
    <section class="summary-card">
      <div class="stats ikagetto-stats" aria-live="polite">
        <div class="stat-box"><span class="stat-label">釣りのプレイ回数</span><span class="stat-value" id="ikagetto-plays">読み込み中</span></div>
        <div class="stat-box"><span class="stat-label">漁師登録</span><span class="stat-value" id="ikagetto-players">読み込み中</span></div>
      </div>
      <button class="button secondary ikagetto-retry" type="button" id="ikagetto-retry-stats" hidden>再試行</button>
      <div class="actions">
        <a class="button link-callout" id="ikagetto-play">ゲームで遊ぶ</a>
        <button class="button secondary" type="button" id="ikagetto-share">シェア</button>
      </div>
      <div class="ranking-switch ikagetto-switch" role="tablist" aria-label="ランキング切り替え">
        ${modes.map(option => `<button class="ranking-tab" id="ikagetto-tab-${option.key}" type="button" role="tab"
          aria-controls="ikagetto-panel">${option.label}</button>`).join('')}
      </div>
    </section>
    <section class="ranking-area">
      <section class="ranking-card" id="ikagetto-panel" role="tabpanel">
        <h2 class="ranking-title" id="ikagetto-heading" tabindex="-1"></h2>
        <p class="loading" id="ikagetto-status" role="status"></p>
        <button class="button secondary ikagetto-retry" type="button" id="ikagetto-retry" hidden>再試行</button>
        ${pagination}
        <div class="ranking-list" id="ikagetto-rows" data-lab-no-translate></div>
        ${pagination}
      </section>
    </section>`;
  const get = name => root.querySelector(`#ikagetto-${name}`);
  const panel = get('panel');
  const heading = get('heading');
  const status = get('status');
  const list = get('rows');
  const pageControls = [...root.querySelectorAll('.ikagetto-pages')].map(nav => ({
    nav, previous: nav.querySelector('[data-previous]'), next: nav.querySelector('[data-next]'),
    number: nav.querySelector('[data-page-number]')
  }));
  const retry = get('retry');
  const retryStats = get('retry-stats');

  async function request(name, args, signal = AbortSignal.timeout(fetchTimeout)) {
    const response = await fetch(`${apiUrl}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { apikey: apiKey, 'content-type': 'application/json' },
      credentials: 'omit',
      redirect: 'error',
      body: JSON.stringify(args),
      signal
    });
    if (!response.ok) throw new Error(`Ikagetto request failed: HTTP ${response.status}`);
    return response.json();
  }

  function numberWithUnit(value, unit, number) {
    const language = i18n.getLanguage();
    const space = ['ja', 'zh-Hans', 'zh-Hant', 'ko'].includes(language) ? '' : ' ';
    return `${number.format(value)}${space}${i18n.t(unit)}`;
  }

  function renderRows() {
    const language = i18n.getLanguage();
    const number = new Intl.NumberFormat(language, { maximumFractionDigits: 1 });
    const fragment = document.createDocumentFragment();
    for (const row of shown.rows) {
      const rank = ['ja', 'zh-Hans', 'zh-Hant', 'ko'].includes(language)
        ? `${number.format(row.rank)}${i18n.t('位')}`
        : `${i18n.t('順位')} ${number.format(row.rank)}`;
      const item = element('div', 'detail-row');
      const line = element('div', 'detail-main ikagetto-entry');
      line.append(element('span', 'rank-no', rank), element('bdi', 'player-name', row.display_name),
        element('strong', 'ikagetto-score', numberWithUnit(row.score, '点', number)));
      item.append(line);
      const { length_meters: length, weight_kg: weight, elapsed_ms: elapsed } = row;
      if (mode.key === 'fishing' && [length, weight].every(value => Number.isSafeInteger(value) && value > 0) &&
          Number.isSafeInteger(elapsed) && elapsed >= 0) {
        const values = { length, weight, time: elapsed / 1000 };
        const caption = i18n.t(catchLabel).replace(/\{(length|weight|time)\}/g, (_, key) => number.format(values[key]));
        item.append(element('p', 'ikagetto-catch', caption));
      }
      fragment.append(item);
    }
    list.replaceChildren(fragment);
    const pageNumber = i18n.t('{page}ページ').replace('{page}', number.format(shown.offset / pageSize + 1));
    for (const control of pageControls) control.number.textContent = pageNumber;
  }

  function renderStats() {
    if (!stats) return;
    const number = new Intl.NumberFormat(i18n.getLanguage());
    get('plays').textContent = number.format(stats.total_play_count);
    get('players').textContent = number.format(stats.player_count);
  }

  async function loadStats() {
    retryStats.hidden = true;
    get('plays').textContent = get('players').textContent = '読み込み中';
    try {
      const data = await request('ikagetto_stats_v1', {});
      const row = Array.isArray(data) ? data[0] : data;
      if (![row?.total_play_count, row?.player_count].every(value => Number.isSafeInteger(value) && value >= 0)) {
        throw new Error('Invalid Ikagetto statistics');
      }
      stats = row;
      renderStats();
    } catch {
      get('plays').textContent = get('players').textContent = '取得できませんでした';
      retryStats.hidden = false;
    }
  }

  function renderNavigation() {
    for (const { nav, previous, next } of pageControls) {
      nav.hidden = shown.offset === 0 && !shown.hasMore;
      previous.disabled = Boolean(pending) || shown.offset === 0;
      next.disabled = Boolean(pending) || !shown.hasMore;
    }
  }

  async function loadPage(offset, focusHeading = false) {
    pending?.abort();
    const modeKey = mode.key;
    const controller = new AbortController();
    pending = controller;
    const timer = setTimeout(() => controller.abort(), fetchTimeout);
    retry.hidden = true;
    status.hidden = false;
    status.textContent = '読み込み中';
    list.setAttribute('aria-busy', 'true');
    renderNavigation();
    try {
      const data = await request('ikagetto_board_page_v3', { p_mode: modeKey, p_offset: offset, p_limit: pageSize }, controller.signal);
      if (pending !== controller) return;
      shown = parseBoard(data, offset, modeKey);
      renderRows();
      status.hidden = Boolean(shown.rows.length);
      status.textContent = shown.rows.length ? '' : 'まだ記録がありません';
    } catch {
      if (pending !== controller) return;
      status.textContent = '取得できませんでした';
      retry.onclick = () => void loadPage(offset, focusHeading);
      retry.hidden = false;
    } finally {
      clearTimeout(timer);
      if (pending === controller) {
        pending = null;
        list.setAttribute('aria-busy', 'false');
        renderNavigation();
        if (focusHeading) {
          heading.focus({ preventScroll: true });
          panel.scrollIntoView({ block: 'start' });
        }
      }
    }
  }

  function activate(option) {
    mode = option;
    const url = new URL(location.href);
    url.searchParams.set('mode', mode.key);
    history.replaceState(history.state, '', url);
    for (const tab of modes) {
      const button = get(`tab-${tab.key}`);
      const selected = tab === mode;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
    }
    panel.setAttribute('aria-labelledby', `ikagetto-tab-${mode.key}`);
    heading.textContent = mode.heading;
    shown = { offset: 0, rows: [], hasMore: false };
    list.replaceChildren();
    void loadPage(0);
  }

  function renderLanguage() {
    const language = i18n.getLanguage();
    const url = new URL(gameUrl);
    url.searchParams.set('lang', language);
    get('play').href = url.href;
    renderStats();
    renderRows();
  }

  for (const [index, option] of modes.entries()) {
    const tab = get(`tab-${option.key}`);
    tab.addEventListener('click', () => { if (mode !== option) activate(option); });
    tab.addEventListener('keydown', event => {
      const targets = { ArrowLeft: (index + modes.length - 1) % modes.length, ArrowRight: (index + 1) % modes.length, Home: 0, End: modes.length - 1 };
      if (!Object.hasOwn(targets, event.key)) return;
      event.preventDefault();
      const selected = modes[targets[event.key]];
      get(`tab-${selected.key}`).focus();
      if (mode !== selected) activate(selected);
    });
  }
  for (const { previous, next } of pageControls) {
    previous.addEventListener('click', () => void loadPage(shown.offset - pageSize, true));
    next.addEventListener('click', () => void loadPage(shown.offset + pageSize, true));
  }
  retryStats.addEventListener('click', () => void loadStats());
  get('share').addEventListener('click', share);
  document.addEventListener('lab-language-change', renderLanguage);
  renderLanguage();
  activate(mode);
  void loadStats();
}
