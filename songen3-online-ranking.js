const PAGE_SIZE = 50;
const tabs = [
  { id: 'best', label: 'ベストスコア', value: 'best_score', metric: '最高スコア' },
  { id: 'record', label: '戦績', value: 'record_points', metric: '戦績点' },
  { id: 'points', label: 'ソンカケpt', value: 'songen_points', metric: 'ソンカケpt' }
];

function createTextElement(tag, text, className) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = text;
  return element;
}

function metric(label, value) {
  const cell = document.createElement('div');
  cell.append(createTextElement('dt', label), createTextElement('dd', value));
  return cell;
}

function validRow(row, tab) {
  if (!row || !Number.isSafeInteger(row.rank) || row.rank < 1 ||
      typeof row.display_name !== 'string' || !row.display_name.trim() ||
      !Number.isSafeInteger(row[tab.value])) return false;
  if (tab.id === 'best') return true;
  if (!Number.isSafeInteger(row.record_points) || row.record_points < 0 || row.record_points >= 10000) return false;
  if (tab.id === 'points') return row.songen_points >= 0 && Number.isSafeInteger(row.total_score);
  return [row.match_count, row.wins, row.losses, row.draws].every(value => Number.isSafeInteger(value) && value >= 0) &&
    row.match_count > 0 && row.match_count === row.wins + row.losses + row.draws;
}

function renderRow(tab, row, number, percentage) {
  const item = document.createElement('li');
  item.className = 'detail-row';
  const name = createTextElement('bdi', row.display_name, 'player-name');
  const main = document.createElement('div');
  main.className = 'detail-main songen3-row-main';
  const score = document.createElement('dl');
  score.className = 'songen3-score';
  score.append(metric(tab.metric, number.format(row[tab.value])));
  main.append(createTextElement('span', `${number.format(row.rank)}位`, 'rank-no'), name, score);
  item.append(main);
  if (tab.id === 'best') return item;

  const details = document.createElement('dl');
  details.className = 'songen3-metrics';
  if (tab.id === 'record') {
    details.append(metric('試合数', number.format(row.match_count)), metric('勝', number.format(row.wins)),
      metric('負', number.format(row.losses)), metric('分', number.format(row.draws)),
      metric('勝率', percentage.format(row.wins / row.match_count)));
  } else {
    details.append(metric('通算スコア', number.format(row.total_score)), metric('戦績点', number.format(row.record_points)));
  }
  item.append(details);
  return item;
}

export function mountSongen3OnlineRanking(host, { gameUrl, request, share }) {
  host.innerHTML = `
    <section class="summary-card">
      <div class="stats">
        <div class="stat-box"><span class="stat-label">プレイ回数</span><strong class="stat-value" id="songen3-plays">–</strong></div>
        <div class="stat-box"><span class="stat-label">参加人数</span><strong class="stat-value" id="songen3-players">–</strong></div>
      </div>
      <div class="actions">
        <a class="button link-callout" id="songen3-play">ゲームで遊ぶ</a>
        <button class="button secondary" type="button" id="songen3-share">シェア</button>
        <button class="button secondary" type="button" id="songen3-stats-retry" hidden>再試行</button>
      </div>
    </section>
    <section class="summary-card">
      <div class="ranking-switch songen3-tabs" role="tablist" aria-label="ランキング切り替え">
        ${tabs.map(({ id, label }) => `<button type="button" class="ranking-tab" role="tab" id="songen3-tab-${id}"
          aria-controls="songen3-panel-${id}" aria-selected="false" tabindex="-1">${label}</button>`).join('')}
      </div>
      ${tabs.map(({ id }) => `<div role="tabpanel" tabindex="0" id="songen3-panel-${id}" aria-labelledby="songen3-tab-${id}" hidden>
        <p role="status"></p>
        <ol class="ranking-list songen3-board" role="list"></ol>
        <div class="actions" role="group" aria-label="ページ切り替え">
          <button type="button" class="button secondary" data-prev hidden>前のページ</button>
          <button type="button" class="button secondary" data-next hidden>次のページ</button>
          <button type="button" class="button secondary" data-retry hidden>再試行</button>
        </div>
      </div>`).join('')}
    </section>`;
  const byId = id => host.querySelector(`#songen3-${id}`);
  const play = new URL(gameUrl);
  const tabButtons = tabs.map(({ id }) => byId(`tab-${id}`));
  const panels = tabs.map(({ id }) => byId(`panel-${id}`));
  let active = 0;
  let page = 0;
  let requestToken = 0;
  let visibleRows = null;
  let visibleStats = null;

  function renderStats() {
    if (!visibleStats) return;
    const number = new Intl.NumberFormat(document.documentElement.lang);
    byId('plays').textContent = number.format(visibleStats.total_play_count);
    byId('players').textContent = number.format(visibleStats.player_count);
  }

  async function loadStats() {
    const retry = byId('stats-retry');
    retry.hidden = true;
    try {
      const [stats] = await request('songen3_online_stats_v1');
      if (![stats?.total_play_count, stats?.player_count].every(value => Number.isSafeInteger(value) && value >= 0)) {
        throw new Error('Invalid ranking totals');
      }
      visibleStats = stats;
      renderStats();
    } catch {
      byId('plays').textContent = byId('players').textContent = '取得できませんでした';
      retry.hidden = false;
    }
  }

  function renderRows() {
    if (!visibleRows) return;
    const panel = panels[active];
    const number = new Intl.NumberFormat(document.documentElement.lang);
    const percentage = new Intl.NumberFormat(document.documentElement.lang, { style: 'percent', maximumFractionDigits: 1 });
    const start = page * PAGE_SIZE + 1;
    const rows = visibleRows.slice(0, PAGE_SIZE);
    panel.querySelector('ol').replaceChildren(...rows.map(row => renderRow(tabs[active], row, number, percentage)));
    panel.querySelector('[role="status"]').textContent = rows.length
      ? `${number.format(start)} – ${number.format(start + rows.length - 1)}`
      : '記録はまだありません';
  }

  async function loadBoard() {
    const current = ++requestToken;
    const tab = tabs[active];
    const panel = panels[active];
    const status = panel.querySelector('[role="status"]');
    const prev = panel.querySelector('[data-prev]');
    const next = panel.querySelector('[data-next]');
    const retry = panel.querySelector('[data-retry]');
    visibleRows = null;
    panel.querySelector('ol').replaceChildren();
    status.textContent = '読み込み中';
    prev.hidden = next.hidden = retry.hidden = true;
    try {
      const rows = await request('songen3_online_board_v1', { p_tab: tab.id, p_offset: page * PAGE_SIZE, p_limit: PAGE_SIZE + 1 });
      if (current !== requestToken) return;
      if (!Array.isArray(rows) || rows.length > PAGE_SIZE + 1 || rows.some(row => !validRow(row, tab))) {
        throw new Error('Invalid ranking rows');
      }
      visibleRows = rows;
      renderRows();
      next.hidden = rows.length <= PAGE_SIZE;
    } catch {
      if (current !== requestToken) return;
      status.textContent = '取得できませんでした';
      retry.hidden = false;
    }
    prev.hidden = page === 0;
  }

  function selectTab(index) {
    active = index;
    page = 0;
    tabButtons.forEach((button, position) => {
      const selected = position === index;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
      panels[position].hidden = !selected;
    });
    loadBoard();
  }

  function updateLanguage() {
    const locale = document.documentElement.lang;
    if (locale === 'ja') play.searchParams.delete('lang');
    else play.searchParams.set('lang', locale);
    byId('play').href = play.href;
    renderRows();
    renderStats();
  }

  tabButtons.forEach((button, index) => {
    button.addEventListener('click', () => { if (index !== active) selectTab(index); });
    button.addEventListener('keydown', event => {
      const keyboardTabs = { ArrowLeft: (index + tabs.length - 1) % tabs.length,
        ArrowRight: (index + 1) % tabs.length, Home: 0, End: tabs.length - 1 };
      if (!Object.hasOwn(keyboardTabs, event.key)) return;
      event.preventDefault();
      const selected = keyboardTabs[event.key];
      tabButtons[selected].focus();
      if (selected !== active) selectTab(selected);
    });
    const panel = panels[index];
    panel.querySelector('[data-prev]').addEventListener('click', () => { page -= 1; loadBoard(); });
    panel.querySelector('[data-next]').addEventListener('click', () => { page += 1; loadBoard(); });
    panel.querySelector('[data-retry]').addEventListener('click', loadBoard);
  });
  byId('share').addEventListener('click', share);
  byId('stats-retry').addEventListener('click', loadStats);
  document.addEventListener('lab-language-change', updateLanguage);
  updateLanguage();
  selectTab(0);
  loadStats();
}
