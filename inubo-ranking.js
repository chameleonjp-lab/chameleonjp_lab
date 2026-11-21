const languages = ['ja', 'en', 'es', 'pt-BR', 'zh-Hans', 'fr', 'de', 'ko', 'ru', 'it', 'zh-Hant', 'id', 'tr', 'vi', 'th'];
const translations = `
イヌボー|Inubo|Inubo|Inubo|犬滑板|Inubo|Inubo|이누보|Инубо|Inubo|犬滑板|Inubo|Inubo|Inubo|อินุโบ
詳細ランキング|Detailed leaderboard|Clasificación detallada|Classificação detalhada|详细排行榜|Classement détaillé|Ausführliche Bestenliste|상세 순위표|Подробный рейтинг|Classifica dettagliata|詳細排行榜|Peringkat lengkap|Ayrıntılı sıralama|Bảng xếp hạng chi tiết|อันดับแบบละเอียด
総合|Total score|Puntuación total|Pontuação total|总分|Score total|Gesamtpunkte|총점|Общий счёт|Punteggio totale|總分|Skor total|Toplam puan|Tổng điểm|คะแนนรวม
タイム|Time|Tiempo|Tempo|用时|Temps|Zeit|기록|Время|Tempo|用時|Waktu|Süre|Thời gian|เวลา
読み込み中…|Loading…|Cargando…|Carregando…|加载中…|Chargement…|Wird geladen…|불러오는 중…|Загрузка…|Caricamento…|載入中…|Memuat…|Yükleniyor…|Đang tải…|กำลังโหลด…
まだ記録がありません。|No records yet.|Aún no hay marcas.|Ainda não há recordes.|暂无记录。|Aucun résultat pour le moment.|Noch keine Ergebnisse.|아직 기록이 없습니다.|Записей пока нет.|Nessun record per ora.|尚無紀錄。|Belum ada catatan.|Henüz kayıt yok.|Chưa có kỷ lục.|ยังไม่มีสถิติ
読み込めませんでした。|Could not load the leaderboard.|No se pudo cargar la clasificación.|Não foi possível carregar a classificação.|无法加载排行榜。|Impossible de charger le classement.|Bestenliste konnte nicht geladen werden.|순위표를 불러오지 못했습니다.|Не удалось загрузить рейтинг.|Impossibile caricare la classifica.|無法載入排行榜。|Papan peringkat gagal dimuat.|Sıralama yüklenemedi.|Không tải được bảng xếp hạng.|โหลดกระดานอันดับไม่ได้
再試行|Retry|Reintentar|Tentar novamente|重试|Réessayer|Erneut versuchen|다시 시도|Повторить|Riprova|重試|Coba lagi|Tekrar dene|Thử lại|ลองอีกครั้ง
点|pts|pts|pts|分|pts|Pkt.|점|очк.|pt|分|poin|puan|điểm|คะแนน
秒|s|s|s|秒|s|s|초|с|s|秒|d|sn|giây|วิ
{n}位|#{n}|#{n}|#{n}|第{n}名|nº {n}|Platz {n}|{n}위|№ {n}|n. {n}|第{n}名|#{n}|#{n}|Hạng {n}|อันดับ {n}
`.trim().split('\n').map(row => row.split('|'));
const requested = new URLSearchParams(location.search).get('lang');
const language = languages.includes(requested) ? requested : 'ja';
const column = languages.indexOf(language);
const t = key => translations.find(row => row[0] === key)?.[column] ?? key;
const element = id => document.getElementById(id);
const game = element('game');
const status = element('status');
const rows = element('rows');
const retry = element('retry');
document.documentElement.lang = language;
document.title = t('イヌボー') + '｜' + t('詳細ランキング');
game.href += '?lang=' + language;
game.textContent = element('title').textContent = t('イヌボー');
element('heading').textContent = t('詳細ランキング');
element('total').textContent = t('総合');
element('time').textContent = t('タイム');
retry.textContent = t('再試行');

let metric = 'total';
let pending;
async function load(next) {
  pending?.abort();
  const request = new AbortController();
  pending = request;
  metric = next;
  for (const key of ['total', 'time']) element(key).setAttribute('aria-pressed', String(key === metric));
  rows.replaceChildren();
  status.textContent = t('読み込み中…');
  retry.hidden = true;
  const timeout = setTimeout(() => request.abort(), 8000);
  try {
    const response = await fetch('https://mlpnjgezrnhdxsxolyzj.supabase.co/rest/v1/rpc/inubo_ranking_board', {
      method: 'POST',
      headers: { apikey: 'sb_publishable_drzcy0v97knU6FgjqSgBHw_0A9XPdFM', 'content-type': 'application/json' },
      credentials: 'omit',
      redirect: 'error',
      body: JSON.stringify({ p_course_id: 'park', p_course_version: 'park-5', p_rules_version: 'rules-freestyle-3', p_metric: next, p_limit: 100 }),
      signal: request.signal,
    });
    if (!response.ok) throw Error('Leaderboard unavailable');
    const data = await response.json();
    if (!Array.isArray(data) || data.length > 100) throw Error('Invalid leaderboard');
    if (pending !== request) return;
    const number = new Intl.NumberFormat(language);
    const seconds = new Intl.NumberFormat(language, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    for (const row of data) {
      if (!Number.isInteger(row.rank) || row.rank < 1 || row.rank > 100 || typeof row.display_name !== 'string'
        || !Number.isSafeInteger(row.value) || row.value < 0) throw Error('Invalid ranking row');
      const item = document.createElement('li');
      const rank = document.createElement('span');
      rank.textContent = t('{n}位').replace('{n}', number.format(row.rank));
      const name = document.createElement('bdi');
      name.textContent = row.display_name;
      const score = document.createElement('strong');
      score.textContent = next === 'time' ? seconds.format(row.value / 100) + ' ' + t('秒')
        : number.format(row.value) + ' ' + t('点');
      item.append(rank, name, score);
      rows.append(item);
    }
    status.textContent = data.length ? '' : t('まだ記録がありません。');
  } catch {
    if (pending !== request) return;
    rows.replaceChildren();
    status.textContent = t('読み込めませんでした。');
    retry.hidden = false;
  } finally {
    clearTimeout(timeout);
  }
}

element('total').addEventListener('click', () => void load('total'));
element('time').addEventListener('click', () => void load('time'));
retry.addEventListener('click', () => void load(metric));
void load(metric);
