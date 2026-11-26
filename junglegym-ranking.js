const MODES = ['normal', 'hard', 'oni_hard'];
const PAGE_SIZE = 500;

export function mountJungleGymRanking(host, { gameUrl, request, share }) {
  const labels = ['ふつう', 'むずかしい', '鬼むず'];
  const requested = new URL(location.href).searchParams.get('difficulty');
  let mode = MODES.includes(requested) ? requested : 'normal';
  let page = 0;
  let token = 0;

  host.innerHTML = `
    <section class="summary-card">
      <div class="stats"><div class="stat-box"><span class="stat-label">プレイ回数</span>
        <strong class="stat-value" id="jungle-plays">–</strong></div></div>
      <div class="actions">
        <a class="button link-callout" id="jungle-play">ゲームで遊ぶ</a>
        <button class="button secondary" type="button" id="jungle-share">シェア</button>
      </div>
    </section>
    <section class="summary-card">
      <div class="actions" role="group" aria-label="難易度" id="jungle-modes"></div>
      <p id="jungle-status" role="status"></p>
      <ol class="ranking-list" id="jungle-board"></ol>
      <div class="actions">
        <button class="button secondary" type="button" id="jungle-prev" hidden>前へ</button>
        <button class="button secondary" type="button" id="jungle-next" hidden>次へ</button>
        <button class="button secondary" type="button" id="jungle-retry" hidden>再試行</button>
      </div>
    </section>`;
  const by = id => host.querySelector('#jungle-' + id);
  const play = new URL(gameUrl);
  function updatePlayLink() {
    const locale = document.documentElement.lang;
    if (locale === 'ja') play.searchParams.delete('lang');
    else play.searchParams.set('lang', locale);
    by('play').href = play.href;
  }
  updatePlayLink();
  document.addEventListener('lab-language-change', updatePlayLink);
  by('share').addEventListener('click', share);
  for (let index = 0; index < MODES.length; index++) {
    const key = MODES[index];
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button secondary';
    button.textContent = labels[index];
    button.dataset.difficulty = key;
    button.addEventListener('click', () => {
      mode = key;
      page = 0;
      loadBoard();
    });
    by('modes').append(button);
  }

  async function loadStats() {
    try {
      const [stats] = await request('junglegym_stats_v1');
      if (!Number.isSafeInteger(stats.total_play_count) || stats.total_play_count < 0) throw new Error('Invalid play count');
      by('plays').textContent = stats.total_play_count.toLocaleString();
    } catch {
      by('plays').textContent = '–';
    }
  }

  async function loadBoard() {
    const current = ++token;
    const url = new URL(location.href);
    url.searchParams.set('difficulty', mode);
    history.replaceState(null, '', url);
    for (const button of by('modes').children) {
      const selected = button.dataset.difficulty === mode;
      button.setAttribute('aria-pressed', String(selected));
      button.classList.toggle('secondary', !selected);
    }
    by('board').replaceChildren();
    by('status').textContent = '読み込み中';
    by('prev').hidden = by('next').hidden = by('retry').hidden = true;
    try {
      const rows = await request('junglegym_board_v1', { p_mode: mode, p_offset: page * PAGE_SIZE, p_limit: PAGE_SIZE + 1 });
      if (current !== token) return;
      if (!Array.isArray(rows) || rows.length > PAGE_SIZE + 1 || rows.some(row =>
        !Number.isSafeInteger(row.rank) || row.rank < 1 || typeof row.display_name !== 'string' ||
        !Number.isInteger(row.score) || row.score < 1 || row.score > 1000)) {
        throw new Error('Invalid ranking');
      }
      const fragment = document.createDocumentFragment();
      for (const row of rows.slice(0, PAGE_SIZE)) {
        const item = document.createElement('li');
        item.className = 'detail-row';
        for (const [className, value] of [['rank-no', row.rank], ['player-name', row.display_name], ['rank-score', row.score + 'pt']]) {
          const cell = document.createElement('span');
          cell.className = className;
          cell.textContent = value;
          item.append(cell);
        }
        fragment.append(item);
      }
      by('board').append(fragment);
      const from = page * PAGE_SIZE + 1;
      by('status').textContent = rows.length
        ? `${from.toLocaleString()} – ${(from + Math.min(rows.length, PAGE_SIZE) - 1).toLocaleString()}`
        : '記録はまだありません';
      by('next').hidden = rows.length <= PAGE_SIZE;
    } catch (error) {
      if (current !== token) return;
      by('status').textContent = '取得できませんでした';
      by('retry').hidden = false;
    }
    by('prev').hidden = page === 0;
  }

  by('prev').addEventListener('click', () => { page -= 1; loadBoard(); });
  by('next').addEventListener('click', () => { page += 1; loadBoard(); });
  by('retry').addEventListener('click', () => { loadBoard(); loadStats(); });
  loadStats();
  loadBoard();
}
