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

// Unique commemorative titles from docs/chameleol-hof-1-300-title-proposals.md.
// Ordinals are first-clear registration sequence numbers, never a score-based rank.
export const HOF_TITLES = Object.freeze(["夜明けを盗むカメレオン","月影の宝石怪盗","サイレンの裏を行く者","琥珀の逃走曲","ダイヤを抱く小さな影","宝石店の消える足音","夜風にまぎれた盗賊","ガラス越しの虹","足跡なき宝石泥棒","街灯をかわす名手","沈黙の展示室を渡る者","星屑を隠すしっぽ","真夜中の宝石便","ベルが鳴る前の影","鍵穴の向こうの虹","宝石より速い逃げ足","夜の展示室を抜ける者","月光に笑う怪盗","宝石箱のすきま風","翡翠をさらう影","逃走開始の一番星","ダイヤの行方を知る者","ショーウインドーの蜃気楼","深緑のすり抜け役","ひそやかな宝石使い","光る戦利品の守り手","宝石通りの通り雨","金庫番を出し抜く色","消えた宝石の余韻","月下のしっぽ泥棒","虹を着こなす逃亡者","色相を操る怪盗","紅に溶ける影","青空を借りるしっぽ","黄昏色の潜伏者","紫煙に紛れる擬態師","緑陰の変色名人","橙光をまといし者","白銀に消える足音","漆黒を縫うカメレオン","桃色のすり抜け術","紺碧の壁渡り","七色の逃走名人","色を盗む目利き","透けるふりした曲者","朱色に隠れた怪盗","金色の一瞬を捕える者","エメラルドの擬態屋","藍の薄闇に住む影","壁紙より静かな怪盗","明度を見抜く色職人","色差ゼロを狙う者","光の調律師","影色の仕立て屋","七変化の逃走屋","彩度の魔術師","夕焼けを映す肌","色の境界を超える者","壁と友だちの怪盗","虹色の忍び足","屋根から屋根への旅人","五十棟を渡る風","窓明かりを味方にする者","塔影の曲芸師","街角の身隠し達人","ビル風を読む怪盗","外壁になりすます者","ネオンの間を抜ける影","通り角に残る幻","ベランダ越しの残像","屋上を走るしっぽ","雨どいの逃走芸人","石壁の向こうの旅人","路地裏を知るカメレオン","看板の色を借りた影","百の窓を見送る者","夜景のすき間を泳ぐ者","街並みを塗り替える怪盗","角を曲がるたび消える影","屋根瓦の影法師","外灯の輪を飛び越す者","窓辺の気配消し","石畳を滑る虹","高層階の風来坊","通り雨の壁渡り","町じゅうを背景にする者","レンガ色の通行人","ビル群のかくれんぼ王","壁面の幻術師","最後の角を曲がる影","サイレンと踊る影","警戒線を越える色","パトライトの死角","赤青灯を欺く怪盗","追跡者の視界から消える者","検問を笑うカメレオン","警報より静かな逃亡者","追手の一歩先を読む者","サーチライトをすり抜ける影","赤い点滅の向こう側","見つかる寸前の奇跡","警戒ゲージを眠らせる者","追跡の裏をかく名手","光る警棒より速いしっぽ","無線の声を遠ざける影","一瞬だけ壁になる者","追手を惑わす虹の軌跡","パトカーの影を踏む者","視線の外で笑う怪盗","警報音に負けない静寂","消える瞬間の達人","曲がり角の逃走詩人","監視の網をほどく色","足音だけを追わせる者","追っ手の記憶に残る虹","発見寸前を越えた影","警戒の赤を青に変える者","サイレンを置き去る尾","夜警の目をすり抜ける者","追跡劇の幕を下ろす影","月夜の擬態貴族","星影をまとう怪盗","三日月のしっぽ使い","夜空に溶けるエメラルド","流れ星の逃走者","満月を背負う小さな影","星座をたどる壁渡り","夜明け前の色合わせ","天の川を隠す瞳","月光色の逃亡芸術家","星屑のかくれんぼ","雲間の七変化","宵闇に浮かぶ緑の尾","夜風と契約した怪盗","月の裏側を知る者","薄明かりのすり抜け師","星明かりを読む目","夜空の色を盗んだ者","北風をかわす擬態屋","月虹に選ばれた影","星を映す宝石の瞳","真夜中の色博士","新月の消失名人","夜霧のガラス細工師","天窓の向こうの怪盗","星降る屋根の住人","月明かりの境界線","宵星を運ぶカメレオン","夜の終わりを知る者","暁色をまとう逃走者","ダイヤを守る虹色の影","ルビー色の逃走者","サファイアの夜渡り","トパーズの擬態名人","オパールに映るしっぽ","アメジストの静かな怪盗","真珠のような足音","翡翠色の逃走案内人","水晶に隠れた虹","ガーネットのすり抜け師","金剛石の瞳を持つ者","宝石に愛された壁渡り","光の欠片を集める影","月長石の変装屋","宝石箱を閉じる風","ペリドットの隠密使い","石榴石をまとう夜行者","アクアマリンの幻影","閃光をポケットにしまう者","ダイヤの輝きを追い越す者","琥珀の中の七変化","エメラルドを抱く逃走者","宝石の色を知り尽くす目","煌めきを消せるカメレオン","青い結晶の夜歩き","紅玉の秘密を守る者","虹彩のダイヤ泥棒","輝石と歩く無音の影","宝石店の最後の光","百色に光る戦利品","足音を置き去る者","気配のないしっぽ","静寂を連れて走る影","ひと呼吸の消失術","壁一枚ぶんの奇跡","風より目立たぬ怪盗","音を立てない七変化","視線を折り返す名手","通り過ぎたあとの残像","しっぽを巻いた逃走師","影の速度を超える者","透明より巧みな変装","小石をよける忍び足","息を潜める街の旅人","緑の影を残さぬ者","夜道に溶ける達人","誰にも見えない通り道","尾の先まで隠す怪盗","足跡を色で消す者","一歩先の安全地帯","瞬きを利用する逃亡者","物音より先に消える影","隙間風の変装術","忍び足の小さな王","音もなく越える五十壁","追いつかれない色の旅","かくれんぼの先回り","背後に虹を残す者","視界のはしを泳ぐ影","逃げ切りの風を呼ぶ者","擬態の仕掛け人","壁色の奇術師","明るさを操る指先","色合わせの名演出家","濃淡を読み解く怪盗","一瞬で景色になる者","二つの色を重ねる影","光と闇の調色師","見つからない色の職人","色見本なき七変化","擬態に微笑むカメレオン","壁を鏡に変える者","色の迷路を抜ける影","わずかな明暗を見抜く目","影の濃さを盗む者","閃きで色を合わせる怪盗","空気まで染めるしっぽ","明度の境を歩く者","一滴の色で消える影","周囲の色を読む魔術師","塗らずに変わる怪盗","光量を味方につける者","壁の色に恋したカメレオン","虹の隠し場所を知る者","あわい色の潜伏芸人","擬態を完成させる瞳","静かな色替えの達人","光を避けずに溶ける影","最高の一色を探す者","色の魔法を解かない怪盗","五十棟の渡り鳥","五十の壁を越えた影","街の端まで消えない虹","最後の一棟を知る者","すべての壁色の友","長い逃走を彩るしっぽ","窓五十枚ぶんの奇跡","ゴールに溶けたカメレオン","街を一周する擬態師","五十棟先の月明かり","最終区画を抜ける者","最後まで音のない旅","一棟ごとに変わる色","五十回の変身を終えた者","終着点の宝石怪盗","街並みを見届ける影","五十棟目の風を読む者","ゴールの光をまとう尾","最後の警戒線を越える者","色をつないだ逃走路","長い夜を渡り切る影","五十の窓と友になる者","旅の終わりに消える虹","最後の色合わせ職人","逃走地図の完成者","街灯五十本の案内人","先の見えない道を抜ける者","背後のサイレンを遠ざけた尾","五十棟を数えた瞳","出口に残る虹の影","翠の夜行伝説","怪盗カメレオンの語り部","虹色の逃走譚","月光に刻まれた擬態","宝石街の名もなき英雄","静かな奇跡の生き証人","変色の伝説を継ぐ者","夜の街が覚えている影","逃走劇の一頁を飾る者","七色の物語を紡ぐ尾","星明かりの怪盗伝","壁と夜の親友","宝石を抱いて笑う影","虹をほどく伝説の指先","街の記憶に溶ける者","サイレンの彼方の旅人","最後まで色を変える怪盗","夜景の片隅の伝説","一夜を駆ける虹の語り手","擬態の物語を残す者","宝石の光を運ぶ影","五十棟の物語を持つ尾","色をまとった自由人","誰にも奪えない逃走の記憶","街が見送った小さな怪盗","夜明けに消える七色","宝石と月の秘密保持者","壁の向こうの名誉怪盗","伝説の余韻を残すしっぽ","カメレオるの永遠の逃走者"]);

// All entrants share the same visual rank and capabilities. No milestone hierarchy.
export function getHofRankMeta(ordinal) {
  const title = Number.isSafeInteger(ordinal) && ordinal >= 1 && ordinal <= HOF_TITLES.length
    ? HOF_TITLES[ordinal - 1] : '50棟完全踏破・殿堂入り怪盗';
  return { title, gem: 'emerald', tier: 'standard', badge: '' };
}

// 祝賀Canvasは一つだけ。画面非表示・設定変更・破棄で描画を停止する。
class CelebrationCanvas {
  constructor() {
    this.canvas = node('canvas', 'hof-particles');
    this.canvas.setAttribute('aria-hidden', 'true');
    // On some browsers Canvas may be unavailable under memory pressure.
    // Keep the card-level CSS salute usable even when no 2D context is supplied.
    try { this.ctx = this.canvas.getContext('2d', { alpha: true }); }
    catch { this.ctx = null; }
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
    if (!this.ctx || this.destroyed || reducedMotion() || document.hidden) return false;
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
    return this.frame !== null;
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
  copy.dataset.labCue = 'share';
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
  let celebrationTimer = null;
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

  // Use the real displayed player plates, not the potentially thousands-of-pixels
  // tall ranking container. The visual viewport accounts for Safari's moving bars.
  // Both observation and scroll/resize checks are kept for iPhone compatibility.
  function checkCenter() {
    if (!active || disposed || celebrated || document.hidden || reducedMotion() || panel.hidden) return;
    const viewport = window.visualViewport;
    const middle = viewport ? viewport.offsetTop + viewport.height / 2 : window.innerHeight / 2;
    const tolerance = Math.min(66, (viewport?.height ?? window.innerHeight) * .14);
    let selected = null;
    for (const plate of container.querySelectorAll('.hof-plate')) {
      const bounds = plate.getBoundingClientRect();
      if (bounds.width > 0 && bounds.height > 0 &&
          bounds.top <= middle + tolerance && bounds.bottom >= middle - tolerance) {
        selected = plate;
        break;
      }
    }
    if (!selected) return;

    // Begin only after a player card actually becomes visible in the screen centre.
    // The plate glow is a low-cost fallback if Safari cannot allocate a canvas.
    celebrated = true;
    panel.dataset.hofCelebrated = 'true';
    panel.classList.add('hof-celebrating');
    selected.classList.add('hof-salute');
    const bounds = selected.getBoundingClientRect();
    const launchY = Math.min(window.innerHeight - 35, Math.max(middle + 55, bounds.bottom + 22));
    const canvas = getCanvas();
    const first = canvas?.burst({ x: window.innerWidth * .23, y: launchY, count: 32 });
    const second = canvas?.burst({ x: window.innerWidth * .77, y: launchY, count: 32 });
    panel.dataset.hofParticles = first || second ? 'playing' : 'css-only';
    celebrationTimer = setTimeout(() => {
      panel.classList.remove('hof-celebrating');
      selected.classList.remove('hof-salute');
    }, 2700);
    centerObserver?.disconnect();
    window.removeEventListener('scroll', queueCenterCheck);
    window.removeEventListener('resize', queueCenterCheck);
    window.visualViewport?.removeEventListener('resize', queueCenterCheck);
    window.visualViewport?.removeEventListener('scroll', queueCenterCheck);
  }

  function queueCenterCheck() {
    if (!active || disposed || celebrated || document.hidden || reducedMotion() || centerFrame !== null) return;
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
    dialogBadge.textContent = meta.title;
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
      '号として殿堂入りしました。称号「' + getHofRankMeta(entry.ordinal).title + '」。最高一致率 ' + percent(entry.average) +
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
      centerObserver?.disconnect();
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
        ' 称号 ' + meta.title + ' 最高一致率' + percent(entry.average) + 'の認定証を見る');
      const index = node('span', 'rank-no hof-ordinal', entry.ordinal.toLocaleString('ja-JP') + '人目');
      const body = node('span', 'hof-card-body');
      const player = node('bdi', 'rank-name', entry.name);
      const score = node('span', 'rank-score', '一致率 ' + percent(entry.average));
      const caption = node('span', 'hof-title-tag', meta.title);
      body.append(player, caption, score);
      plate.append(index, body);
      plate.addEventListener('click', () => openCertificate(entry));
      tracked.set(entry.ordinal, { entry, element: plate });
      container.append(plate);
      markVisible(plate);
      if (active && !celebrated) centerObserver?.observe(plate);
    }
    if (!celebrated && tracked.size) queueCenterCheck();
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

  // Observe the individual player plates near the centre band. A scroll check
  // remains as fallback if IntersectionObserver is delayed on iOS Safari.
  if ('IntersectionObserver' in window) {
    centerObserver = new IntersectionObserver(entries => {
      if (entries.some(item => item.isIntersecting)) queueCenterCheck();
    }, { rootMargin: '-37% 0px -37% 0px', threshold: 0 });
  }
  window.addEventListener('scroll', queueCenterCheck, { passive: true });
  window.addEventListener('resize', queueCenterCheck, { passive: true });
  window.visualViewport?.addEventListener('resize', queueCenterCheck, { passive: true });
  window.visualViewport?.addEventListener('scroll', queueCenterCheck, { passive: true });

  function onTabChange(selected) {
    if (disposed) return;
    active = selected;
    if (!selected) {
      closeCertificate();
      centerObserver?.disconnect();
      celebration?.stop();
      return;
    }
    if (!celebrated) {
      for (const plate of container.querySelectorAll('.hof-plate')) centerObserver?.observe(plate);
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
    window.visualViewport?.removeEventListener('resize', queueCenterCheck);
    window.visualViewport?.removeEventListener('scroll', queueCenterCheck);
    clearTimeout(celebrationTimer);
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
