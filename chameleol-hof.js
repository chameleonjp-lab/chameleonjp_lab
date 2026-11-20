// カメレオるの殿堂入りだけに適用する、装飾と操作の小さな部品。
// 通信、順位付け、保存、ページ送りの状態は既存の実装を利用する。
export const HOF_DETAIL_URL = 'https://chameleonjp-lab.github.io/chameleonjp_lab/ranking.html?game=chameleol';

const COLORS = ['#fff3b0', '#e5b84b', '#dff6ff', '#e0315a', '#2fd17a', '#3b9eff'];
const TINTS = [
  ['ゴールド', 'rgba(229,184,75,.18)'],
  ['ルビー', 'rgba(224,49,90,.22)'],
  ['サファイア', 'rgba(59,158,255,.22)'],
  ['エメラルド', 'rgba(47,209,122,.20)'],
  ['プリズム', 'rgba(229,184,75,.18)'],
];

const percent = average => (average / 100).toFixed(2) + '%';
const reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

// 1〜3人目も例外なし。番号は到達順であり、名誉の上下は付けない。
// 記念番号の小さな宝石バッジだけ表示する。
export function getHofRankMeta(ordinal) {
  const special = ordinal === 10 || ordinal === 25 || ordinal === 50 ||
    (ordinal >= 100 && ordinal % 100 === 0);
  return {
    title: '50棟完全踏破・殿堂入り怪盗',
    gem: special ? 'sapphire' : 'emerald',
    tier: 'standard',
    badge: special ? '記念キリ番' : '',
  };
}

// 祝賀Canvasは一つだけ。画面非表示・設定変更・破棄で描画を停止する。
class CelebrationCanvas {
  constructor() {
    this.canvas = node('canvas', 'hof-particles');
    this.canvas.setAttribute('aria-hidden', 'true');
    this.ctx = this.canvas.getContext('2d', { alpha: true });
    this.particles = [];
    this.maxParticles = 120;
    this.frame = null;
    this.lastTime = 0;
    this.width = 0;
    this.height = 0;
    this.destroyed = false;
    this.resize = this.resize.bind(this);
    this.tick = this.tick.bind(this);
    document.body.append(this.canvas);
    window.addEventListener('resize', this.resize, { passive: true });
    this.resize();
  }

  resize() {
    if (!this.ctx || this.destroyed) return;
    this.width = Math.max(1, window.innerWidth);
    this.height = Math.max(1, window.innerHeight);
    const scale = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(this.width * scale);
    this.canvas.height = Math.round(this.height * scale);
    this.ctx.setTransform(scale, 0, 0, scale, 0, 0);
  }

  burst({ x = this.width / 2, y = this.height * .72, count = 30 } = {}) {
    if (!this.ctx || this.destroyed || reducedMotion() || document.hidden) return;
    const actual = Math.max(0, Math.min(40, count));
    for (let i = 0; i < actual; i++) {
      const angle = -Math.PI / 2 + (Math.random() - .5) * Math.PI * 1.35;
      const speed = 3 + Math.random() * 4;
      const life = 105 + Math.random() * 65;
      const p = {
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        rotation: Math.random() * Math.PI * 2,
        spin: (Math.random() - .5) * .15,
        size: 3 + Math.random() * 4,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        diamond: Math.random() > .45,
        age: 0,
        life,
      };
      if (this.particles.length >= this.maxParticles) this.particles.shift();
      this.particles.push(p);
    }
    if (this.frame === null && this.particles.length) {
      this.lastTime = 0;
      this.frame = requestAnimationFrame(this.tick);
    }
  }

  tick(now) {
    if (this.destroyed || document.hidden || reducedMotion() || !this.ctx) {
      this.stop();
      return;
    }
    const step = this.lastTime ? Math.min(2, (now - this.lastTime) / 16.667) : 1;
    this.lastTime = now;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.age += step;
      p.x += p.vx * step;
      p.y += p.vy * step;
      p.vy += .10 * step;
      p.vx *= Math.pow(.99, step);
      p.rotation += p.spin * step;
      if (p.age >= p.life || p.y > this.height + 25) {
        this.particles.splice(i, 1);
        continue;
      }
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - p.age / p.life);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.fillStyle = p.color;
      if (p.diamond) {
        ctx.beginPath();
        ctx.moveTo(0, -p.size);
        ctx.lineTo(p.size * .7, 0);
        ctx.lineTo(0, p.size);
        ctx.lineTo(-p.size * .7, 0);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * .66);
      }
      ctx.restore();
    }
    this.frame = this.particles.length ? requestAnimationFrame(this.tick) : null;
  }

  stop() {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.particles.length = 0;
    this.lastTime = 0;
    this.ctx?.clearRect(0, 0, this.width, this.height);
  }

  dispose() {
    this.stop();
    this.destroyed = true;
    window.removeEventListener('resize', this.resize);
    this.canvas.remove();
  }
}

export function createHallOfFameView({ panel, container }) {
  if (!panel || !container) throw Error('missing Hall of Fame elements');
  const emblem = panel.querySelector('#hofEmblem');
  if (!emblem) throw Error('missing Hall of Fame emblem');
  const backdrop = node('div', 'hof-modal-backdrop');
  backdrop.hidden = true;
  const dialog = node('section', 'hof-dialog');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'hofDialogTitle');
  const symbol = node('span', 'hof-dialog-icon', '♛');
  symbol.setAttribute('aria-hidden', 'true');
  const dialogTitle = node('h3', 'hof-dialog-title', '祝・50棟完全踏破');
  dialogTitle.id = 'hofDialogTitle';
  const dialogNumber = node('p', 'hof-dialog-number');
  const dialogName = node('bdi', 'hof-dialog-name');
  const dialogBadge = node('p', 'hof-dialog-caption');
  const dialogPercent = node('p', 'hof-dialog-caption');
  const actions = node('div', 'hof-dialog-actions');
  const copy = node('button', '', 'SNSシェア文をコピー');
  copy.type = 'button';
  const close = node('button', '', '閉じる');
  close.type = 'button';
  actions.append(copy, close);
  dialog.append(symbol, dialogTitle, dialogNumber, dialogName, dialogBadge, dialogPercent, actions);
  backdrop.append(dialog);

  const toast = node('div', 'hof-toast');
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.hidden = true;
  document.body.append(backdrop, toast);

  let celebration = null;
  let observer = null;
  let centerObserver = null;
  let centerFrame = null;
  let celebrated = false;
  let toastTimer = null;
  let lastFocused = null;
  let currentEntry = null;
  let active = false;
  let tint = 0;
  let disposed = false;
  const tracked = new Map();

  function notice(message) {
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 2600);
  }

  function getCanvas() {
    if (!celebration && !reducedMotion()) celebration = new CelebrationCanvas();
    return celebration;
  }

  // Fire once per page visit, only after a verified Hall entry occupies the
  // vertical centre of the visible screen. No button or automatic tab-open burst.
  function checkCenter() {
    if (!active || disposed || celebrated || document.hidden || reducedMotion()) return;
    if (panel.hidden || !container.querySelector('.hof-plate')) return;
    const rect = container.getBoundingClientRect();
    const middle = window.innerHeight / 2;
    if (!(rect.top <= middle && rect.bottom >= middle)) return;
    celebrated = true;
    panel.dataset.hofCelebrated = 'true';
    centerObserver?.disconnect();
    window.removeEventListener('scroll', queueCenterCheck);
    window.removeEventListener('resize', queueCenterCheck);
    const canvas = getCanvas();
    canvas?.burst({ x: window.innerWidth * .3, y: window.innerHeight * .74, count: 24 });
    canvas?.burst({ x: window.innerWidth * .7, y: window.innerHeight * .74, count: 24 });
  }

  function queueCenterCheck() {
    if (disposed || celebrated || centerFrame !== null) return;
    centerFrame = requestAnimationFrame(() => {
      centerFrame = null;
      checkCenter();
    });
  }

  function closeCertificate() {
    if (backdrop.hidden) return;
    backdrop.hidden = true;
    document.body.classList.remove('hof-modal-open');
    currentEntry = null;
    const target = lastFocused;
    lastFocused = null;
    if (target?.isConnected) target.focus({ preventScroll: true });
  }

  function openCertificate(entry) {
    currentEntry = entry;
    lastFocused = document.activeElement;
    const meta = getHofRankMeta(entry.ordinal);
    dialogNumber.textContent = '第' + entry.ordinal.toLocaleString('ja-JP') + '号 殿堂入り';
    dialogName.textContent = entry.name;
    dialogBadge.textContent = meta.title + (meta.badge ? '・' + meta.badge : '');
    dialogPercent.textContent = '最高一致率 ' + percent(entry.average);
    backdrop.hidden = false;
    document.body.classList.add('hof-modal-open');
    close.focus({ preventScroll: true });
  }

  function onDialogKey(event) {
    if (backdrop.hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeCertificate();
    } else if (event.key === 'Tab') {
      // モーダル内の2ボタン以外へフォーカスを逃がさない。
      const target = event.shiftKey ? copy : close;
      if (document.activeElement === target) {
        event.preventDefault();
        (event.shiftKey ? close : copy).focus();
      }
    }
  }

  function onBackdrop(event) {
    if (event.target === backdrop) closeCertificate();
  }

  function onCopy() {
    if (!currentEntry) return;
    const entry = currentEntry;
    const content = '『カメレオる』50棟完全制覇！' +
      entry.name + ' が第' + entry.ordinal.toLocaleString('ja-JP') +
      '号として殿堂入りしました。最高一致率 ' + percent(entry.average) +
      '\n' + HOF_DETAIL_URL;
    if (!navigator.clipboard?.writeText) {
      notice('コピーを利用できませんでした');
      return;
    }
    void navigator.clipboard.writeText(content).then(
      () => notice('シェア文をコピーしました'),
      () => notice('コピーに失敗しました。ブラウザの権限をご確認ください')
    );
  }

  function markVisible(plate) {
    if (observer) {
      plate.classList.add('hof-pending');
      observer.observe(plate);
    } else {
      plate.classList.add('is-visible');
    }
  }

  function renderPage(page, append = false) {
    if (disposed) return;
    if (!append || page.restarted) {
      observer?.disconnect();
      tracked.clear();
      container.replaceChildren();
    }
    if (!page.rows.length && !tracked.size) {
      container.textContent = 'まだ殿堂入りした方はいません';
      return;
    }
    // 「読み込み中」と初回の再試行表示を成功時に取り除く。
    if (!tracked.size && !append) container.replaceChildren();
    for (const entry of page.rows) {
      if (tracked.has(entry.ordinal)) continue;
      const meta = getHofRankMeta(entry.ordinal);
      const plate = node('button', 'rank-row hof-plate');
      plate.type = 'button';
      plate.dataset.ordinal = String(entry.ordinal);
      plate.setAttribute('aria-label', '第' + entry.ordinal + '号 ' + entry.name +
        ' 最高一致率' + percent(entry.average) + 'の認定証を見る');
      const index = node('span', 'rank-no hof-ordinal', entry.ordinal.toLocaleString('ja-JP') + '人目');
      const body = node('span', 'hof-card-body');
      const player = node('bdi', 'rank-name', entry.name);
      const score = node('span', 'rank-score', '一致率 ' + percent(entry.average));
      const caption = node('span', 'hof-title-tag', meta.title);
      body.append(player, caption, score);
      if (meta.badge) body.append(node('span', 'hof-medal hof-milestone', '◆ ' + meta.badge));
      plate.append(index, body);
      plate.addEventListener('click', () => openCertificate(entry));
      tracked.set(entry.ordinal, { entry, element: plate });
      container.append(plate);
      markVisible(plate);
    }
    if (!celebrated && tracked.size) {
      if (centerObserver) centerObserver.observe(container);
      queueCenterCheck();
    }
  }

  function changeTint() {
    tint = (tint + 1) % TINTS.length;
    panel.style.setProperty('--spotlight-tint', TINTS[tint][1]);
    panel.classList.toggle('hof-prism', tint === TINTS.length - 1);
    notice('宝石の光：' + TINTS[tint][0]);
  }

  function visibilityChanged() {
    if (document.hidden) celebration?.stop();
    else queueCenterCheck();
  }

  emblem.addEventListener('click', changeTint);
  backdrop.addEventListener('click', onBackdrop);
  close.addEventListener('click', closeCertificate);
  copy.addEventListener('click', onCopy);
  document.addEventListener('keydown', onDialogKey);
  document.addEventListener('visibilitychange', visibilityChanged);
  if ('IntersectionObserver' in window && !reducedMotion()) {
    observer = new IntersectionObserver(entries => {
      for (const record of entries) {
        if (record.isIntersecting) {
          record.target.classList.add('is-visible');
          observer.unobserve(record.target);
        }
      }
    }, { threshold: .04, rootMargin: '0px 0px 30px 0px' });
  }

  // The observer watches the *list*, not the header or the whole tall page.
  // The central viewport band also handles the case where the list was already
  // centred before the asynchronous API response arrived.
  if ('IntersectionObserver' in window) {
    centerObserver = new IntersectionObserver(entries => {
      if (entries.some(item => item.isIntersecting)) queueCenterCheck();
    }, { rootMargin: '-45% 0px -45% 0px', threshold: 0 });
  }
  window.addEventListener('scroll', queueCenterCheck, { passive: true });
  window.addEventListener('resize', queueCenterCheck, { passive: true });

  function onTabChange(selected) {
    if (disposed) return;
    active = selected;
    if (!selected) {
      closeCertificate();
      celebration?.stop();
      return;
    }
    if (!celebrated && container.querySelector('.hof-plate')) {
      centerObserver?.observe(container);
      queueCenterCheck();
    }
  }

  function dispose() {
    if (disposed) return;
    onTabChange(false);
    disposed = true;
    observer?.disconnect();
    centerObserver?.disconnect();
    if (centerFrame !== null) cancelAnimationFrame(centerFrame);
    window.removeEventListener('scroll', queueCenterCheck);
    window.removeEventListener('resize', queueCenterCheck);
    clearTimeout(toastTimer);
    emblem.removeEventListener('click', changeTint);
    backdrop.removeEventListener('click', onBackdrop);
    close.removeEventListener('click', closeCertificate);
    copy.removeEventListener('click', onCopy);
    document.removeEventListener('keydown', onDialogKey);
    document.removeEventListener('visibilitychange', visibilityChanged);
    celebration?.dispose();
    backdrop.remove();
    toast.remove();
  }

  return { renderPage, onTabChange, dispose };
}
