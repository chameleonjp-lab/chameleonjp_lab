const MODES = ['normal', 'hard', 'oni_hard'];
const PAGE_SIZE = 500;

export function mountJungleGymRanking(host, { gameUrl, request, share }) {
  mountPagedRanking(host, {
    gameUrl, share, modes: MODES, labels: ['ふつう', 'むずかしい', '鬼むず'], unit: 'pt', minScore: 1, maxScore: 1000,
    stats: () => request('junglegym_stats_v1'),
    board: (mode, offset, limit) => request('junglegym_board_v1', { p_mode: mode, p_offset: offset, p_limit: limit }),
  });
}

export function mountMedjedRanking(host, { gameUrl, request, share }) {
  mountPagedRanking(host, {
    gameUrl, share, unit: '点', minScore: 0, maxScore: 2147483647, showWave: true,
    stats: () => request('medjed_stats_v1'),
    board: (_, offset, limit) => request('medjed_board_v1', { p_offset: offset, p_limit: limit }),
  });
}

function mountPagedRanking(host, { gameUrl, share, stats, board, modes = [], labels = [], unit, minScore, maxScore, showWave = false }) {
  const requested = new URL(location.href).searchParams.get('difficulty');
  let mode = modes.includes(requested) ? requested : modes[0];
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
      <div class="actions" role="group" aria-label="難易度" id="jungle-modes" ${modes.length ? '' : 'hidden'}></div>
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
  for (let index = 0; index < modes.length; index++) {
    const key = modes[index];
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
      const [value] = await stats();
      if (!Number.isSafeInteger(value.total_play_count) || value.total_play_count < 0) throw new Error('Invalid play count');
      by('plays').textContent = value.total_play_count.toLocaleString();
    } catch {
      by('plays').textContent = '–';
    }
  }

  async function loadBoard() {
    const current = ++token;
    if (mode) {
      const url = new URL(location.href);
      url.searchParams.set('difficulty', mode);
      history.replaceState(null, '', url);
    }
    for (const button of by('modes').children) {
      const selected = button.dataset.difficulty === mode;
      button.setAttribute('aria-pressed', String(selected));
      button.classList.toggle('secondary', !selected);
    }
    by('board').replaceChildren();
    by('status').textContent = '読み込み中';
    by('prev').hidden = by('next').hidden = by('retry').hidden = true;
    try {
      const rows = await board(mode, page * PAGE_SIZE, PAGE_SIZE + 1);
      if (current !== token) return;
      if (!Array.isArray(rows) || rows.length > PAGE_SIZE + 1 || rows.some(row =>
        !Number.isSafeInteger(row.rank) || row.rank < 1 || typeof row.display_name !== 'string' ||
        !Number.isInteger(row.score) || row.score < minScore || row.score > maxScore ||
        (showWave && (!Number.isInteger(row.wave) || row.wave < 1 || row.wave > 40)))) {
        throw new Error('Invalid ranking');
      }
      const fragment = document.createDocumentFragment();
      for (const row of rows.slice(0, PAGE_SIZE)) {
        const item = document.createElement('li');
        item.className = 'detail-row';
        const name = document.createElement('span');
        name.className = 'player-name';
        name.textContent = row.display_name;
        if (showWave) {
          const wave = document.createElement('small');
          wave.style.display = 'block';
          wave.textContent = `到達ウェーブ ${row.wave} / 40`;
          name.append(wave);
        }
        for (const [className, value] of [
          ['rank-no', row.rank], ['rank-score', (showWave ? row.score.toLocaleString() : row.score) + unit],
        ]) {
          const cell = document.createElement('span');
          cell.className = className;
          cell.textContent = value;
          item.append(cell);
        }
        item.insertBefore(name, item.lastChild);
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
