import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const html = readFileSync(new URL('../ranking.html', import.meta.url), 'utf8');
const start = html.indexOf('function buildTakkeuAbnormalRows(rows, game) {');
const end = html.indexOf('function buildDisqualifiedRows(rows, game) {', start);
assert.ok(start >= 0 && end > start, 'タッケウの異常記録表示処理が必要');
assert.ok(html.includes('isTakkeu ? "get_takkeu_abnormal_entries_v1" : "get_disqualified_score_entries"'), '他ゲームとのRPC分離が必要');
assert.ok(html.includes('.detail-row.abnormal-row--confirmed'), '確定BOT表示の背景設定が必要');
assert.ok(html.includes('.detail-row.abnormal-row {'), '暫定BOT表示の背景設定が必要');

const slice = html.slice(start, end);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);
const context = {
  cleanText: value => String(value ?? '').trim(),
  escapeHtml,
  firstScoreLabel: () => '初回ラリー数',
  bestScoreLabel: () => '最高ラリー数',
  scoreText: score => `${score}ラリー`,
  formatNumber: number => Number(number).toLocaleString('ja-JP'),
};
const render = runInNewContext(slice + '\n buildTakkeuAbnormalRows;', context);
const unsafe = '<img src=x onerror=alert(1)>';
const htmlRows = String(render([
  { ranking_status: 'provisional_bot', display_name: unsafe, ranking_note: unsafe, first_score: 1, best_score: 7927, play_count: 5 },
  { ranking_status: 'bot', display_name: 'confirmed', ranking_note: '不正操作の検証済み', first_score: 1, best_score: 6000, play_count: 2 }
], {}));
assert.match(htmlRows, /暫定BOT/);
assert.match(htmlRows, /abnormal-row--confirmed/);
assert.match(htmlRows, /<div class="rank-no">BOT<\/div>/);
assert.ok(htmlRows.includes('&lt;img src=x onerror=alert(1)&gt;'), '登録名と説明文の無害化が必要');
assert.ok(!htmlRows.includes(unsafe), '登録名と説明文に未加工のHTMLを残さない');
assert.ok(!htmlRows.includes('<script'), '実行可能な文字列を描画しない');
console.log('Takkeu異常記録表示の回帰テスト成功');
