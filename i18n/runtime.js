// Lightweight, local-only language switcher for the lab and its ranking pages.
// It changes presentation text, never scores, identities, ranking queries or saved results.
(function () {
  'use strict';
  const locales = [
    ['ja','日本語'], ['en','English'], ['es','Español'], ['pt-BR','Português (Brasil)'],
    ['zh-Hans','简体中文'], ['fr','Français'], ['de','Deutsch'], ['ko','한국어'],
    ['ru','Русский'], ['it','Italiano'], ['zh-Hant','繁體中文'], ['id','Bahasa Indonesia'],
    ['tr','Türkçe'], ['vi','Tiếng Việt'], ['th','ไทย']
  ];
  const codes = locales.map(function (pair) { return pair[0]; });
  const table = new Map();
  for (const row of (window.LabI18nRows || [])) {
    if (!Array.isArray(row) || row.length !== codes.length) {
      console.error('Invalid language row', row && row[0]);
      continue;
    }
    const key = normalize(row[0]);
    if (table.has(key)) console.warn('Duplicate language entry:', key);
    table.set(key, row);
  }

  function normalize(value) {
    return String(value == null ? '' : value).normalize('NFC').replace(/\s+/g, ' ').trim();
  }
  function canonicalLocale(locale) {
    if (codes.includes(locale)) return locale;
    const value = String(locale || '').toLowerCase();
    if (value.startsWith('zh')) {
      return /tw|hk|mo|hant/.test(value) ? 'zh-Hant' : 'zh-Hans';
    }
    if (value.startsWith('pt')) return 'pt-BR';
    const base = value.split('-')[0];
    return codes.includes(base) ? base : null;
  }
  function savedLocale() {
    try { return localStorage.getItem('chameleonjp_lab_language'); }
    catch { return null; }
  }
  function firstLocale() {
    const urlLang = new URLSearchParams(location.search).get('lang');
    const explicitlyChosen = canonicalLocale(urlLang) || canonicalLocale(savedLocale());
    if (explicitlyChosen) return explicitlyChosen;
    // Japanese remains the default; visitors choose their language explicitly.
    return 'ja';
  }
  let locale = firstLocale();
  const textSource = new WeakMap();
  const attrSource = new WeakMap();
  const linkSource = new WeakMap();
  let select = null;
  let label = null;
  let observer = null;
  let queued = false;

  function exact(value) {
    const row = table.get(normalize(value));
    return row ? row[codes.indexOf(locale)] : null;
  }
  function templatePart(text) {
    return translate(text) || text;
  }
  function translate(value) {
    const source = normalize(value);
    if (!source || locale === 'ja') return source;
    const found = exact(source);
    if (found !== null) return found;
    if (source.includes('｜')) return source.split('｜').map(templatePart).join(' | ');
    let m;
    if ((m = source.match(/^(.+?) 詳細ランキング$/))) {
      return templatePart(m[1]) + ' · ' + templatePart('詳細ランキング');
    }
    if ((m = source.match(/^(.+?)の集計$/))) {
      return templatePart(m[1]) + ' · ' + templatePart('集計');
    }
    if ((m = source.match(/^(.+?)のランキング$/))) {
      return templatePart(m[1]) + ' · ' + templatePart('ランキング');
    }
    if ((m = source.match(/^(.+?)ランキングを読み込み中です$/))) {
      return templatePart('ランキングを読み込み中です。') + ' (' + templatePart(m[1]) + ')';
    }
    if ((m = source.match(/^(.+?)ランキング$/))) {
      return templatePart(m[1]) + ' · ' + templatePart('ランキング');
    }
    if ((m = source.match(/^(.+?)で表示しています。$/))) {
      return templatePart(m[1]) + ' · ' + templatePart('表示中');
    }
    if ((m = source.match(/^名前未登録のプレイ回数：([\d,.]+)回（ランキング対象外）$/))) {
      return templatePart('名前未登録のプレイ回数') + ': ' + m[1] + ' ' + templatePart('回') +
        ' (' + templatePart('ランキング対象外') + ')';
    }
    if ((m = source.match(/^開始記録は([\d,.]+)回ありますが、完了スコア記録はまだありません$/))) {
      return templatePart('開始記録は') + m[1] + ' ' + templatePart('回') +
        ' · ' + templatePart('完了スコア記録はまだありません');
    }
    if ((m = source.match(/^第([\d,.]+)号 殿堂入り$/))) {
      return templatePart('殿堂入り') + ' #' + m[1];
    }
    if ((m = source.match(/^(最高一致率|一致率)\s*([\d,.]+%)$/))) {
      return templatePart(m[1]) + ' ' + m[2];
    }
    if ((m = source.match(/^([\d,.]+)棟\s*·\s*([\d,.]+%)$/))) {
      return m[1] + ' ' + templatePart('棟') + ' · ' + m[2];
    }
    if ((m = source.match(/^宝石の光：(.+)$/))) {
      return templatePart('宝石の光') + ': ' + templatePart(m[1]);
    }
    if ((m = source.match(/^([\d,.]+)位$/))) {
      return ['ja','zh-Hans','zh-Hant','ko'].includes(locale)
        ? m[1] + templatePart('位') : templatePart('順位') + ' ' + m[1];
    }
    if ((m = source.match(/^([\d,.]+)人目$/))) {
      return locale === 'ko' ? m[1] + templatePart('人目') : '#' + m[1] + ' ' + templatePart('人目');
    }
    if ((m = source.match(/^([\d,.]+)(回|人|棟|点|秒|波|階|ゲーム)$/))) {
      return m[1] + (['zh-Hans','zh-Hant','ja','ko'].includes(locale) ? '' : ' ') + templatePart(m[2]);
    }
    // Compound values used by the wave-based scoring games.
    if ((m = source.match(/^([\d,.]+)波突破\s*\/\s*([\d,.]+)点$/))) {
      return m[1] + ' ' + templatePart('波') + ' ' + templatePart('突破') + ' / ' + m[2] + ' ' + templatePart('点');
    }
    if ((m = source.match(/^([\d,.]+)波(到達|クリア)\s*\/\s*([\d,.]+)点$/))) {
      return m[1] + ' ' + templatePart('波') + ' ' + templatePart(m[2]) + ' / ' + m[3] + ' ' + templatePart('点');
    }
    // Never guess a translation for unknown Supabase content or player-authored text.
    return source;
  }
  function excluded(element) {
    return !!(element && element.closest &&
      element.closest('.player-name, .rank-name, bdi, [data-lab-no-translate], [translate="no"], .lab-language-bar'));
  }
  function updateText(node) {
    if (!node || node.nodeType !== Node.TEXT_NODE || !node.parentElement || excluded(node.parentElement)) return;
    const tag = node.parentElement.tagName;
    if (['SCRIPT','STYLE','NOSCRIPT','TEXTAREA','SVG'].includes(tag)) return;
    const value = node.nodeValue || '';
    let record = textSource.get(node);
    if (!record || (value !== record.original && value !== record.rendered)) {
      record = { original: value, rendered: value };
      textSource.set(node, record);
    }
    const original = record.original;
    const match = original.match(/^(\s*)([\s\S]*?)(\s*)$/);
    if (!match || !match[2]) return;
    const converted = locale === 'ja' ? original :
      match[1] + translate(match[2]) + match[3];
    if (converted !== value) node.nodeValue = converted;
    record.rendered = converted;
  }
  function updateAttributes(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE || excluded(element)) return;
    let records = attrSource.get(element);
    if (!records) { records = new Map(); attrSource.set(element, records); }
    for (const name of ['aria-label','title','alt','placeholder']) {
      if (!element.hasAttribute(name)) continue;
      const value = element.getAttribute(name);
      let record = records.get(name);
      if (!record || (value !== record.original && value !== record.rendered)) {
        record = { original: value, rendered: value };
        records.set(name, record);
      }
      const converted = locale === 'ja' ? record.original : translate(record.original);
      if (converted !== value) element.setAttribute(name, converted);
      record.rendered = converted;
    }
    if (element.tagName === 'A' && element.hasAttribute('href')) {
      // Preserve the selected language on this site's links when storage is disabled.
      const rawHref = element.getAttribute('href');
      const previous = linkSource.get(element);
      const originalHref = !previous || (rawHref !== previous.original && rawHref !== previous.rendered)
        ? rawHref : previous.original;
      try {
        const target = new URL(originalHref, location.href);
        if (target.origin === location.origin && target.pathname.startsWith('/chameleonjp_lab/')) {
          if (locale === 'ja') target.searchParams.delete('lang');
          else target.searchParams.set('lang', locale);
          const rendered = locale === 'ja' ? originalHref : target.pathname + target.search + target.hash;
          if (rawHref !== rendered) element.setAttribute('href', rendered);
          linkSource.set(element, { original: originalHref, rendered: rendered });
        }
      } catch { /* Ignore malformed or external links. */ }
    }
  }
  function walk(root) {
    if (!root) return;
    if (root.nodeType === Node.TEXT_NODE) { updateText(root); return; }
    if (root.nodeType !== Node.ELEMENT_NODE || excluded(root)) return;
    updateAttributes(root);
    for (const child of Array.from(root.childNodes)) walk(child);
  }
  function apply() {
    document.documentElement.lang = locale;
    const titleRecord = document.documentElement.dataset.labSourceTitle ||
      (document.documentElement.dataset.labSourceTitle = document.title);
    document.title = locale === 'ja' ? titleRecord : translate(titleRecord);
    const meta = document.querySelector('meta[name="description"]');
    if (meta) {
      const original = meta.dataset.labSourceContent || (meta.dataset.labSourceContent = meta.content);
      meta.content = locale === 'ja' ? original : translate(original);
    }
    walk(document.body);
    if (select) select.value = locale;
    if (label) { const nextLabel = locale === 'ja' ? '言語' : translate('言語'); if (label.textContent !== nextLabel) label.textContent = nextLabel; }
  }
  function scheduleApply() {
    if (queued) return;
    queued = true;
    // One pass per frame, even when dozens of ranking rows arrive together.
    requestAnimationFrame(function () { queued = false; apply(); });
  }
  function setLocale(next) {
    const selected = canonicalLocale(next);
    if (!selected || selected === locale) return;
    locale = selected;
    try { localStorage.setItem('chameleonjp_lab_language', locale); }
    catch { /* Reading and switching do not depend on storage. */ }
    const url = new URL(location.href);
    if (locale === 'ja') url.searchParams.delete('lang');
    else url.searchParams.set('lang', locale);
    history.replaceState(history.state, '', url.pathname + url.search + url.hash);
    apply();
    document.dispatchEvent(new CustomEvent('lab-language-change', { detail: { language: locale } }));
  }
  function initialize() {
    const main = document.querySelector('main.page') || document.body;
    const bar = document.createElement('div');
    bar.className = 'lab-language-bar';
    label = document.createElement('label');
    label.className = 'lab-language-label';
    label.htmlFor = 'labLanguageSelect';
    select = document.createElement('select');
    select.className = 'lab-language-select';
    select.id = 'labLanguageSelect';
    select.setAttribute('aria-label', 'Language / 言語');
    select.setAttribute('autocomplete', 'off');
    for (const pair of locales) {
      const option = document.createElement('option');
      option.value = pair[0];
      option.textContent = pair[1];
      select.appendChild(option);
    }
    bar.append(label, select);
    main.prepend(bar);
    select.addEventListener('change', function () { setLocale(select.value); });
    apply();
    observer = new MutationObserver(scheduleApply);
    observer.observe(document.body, {
      childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ['aria-label','title','alt','placeholder','href']
    });
  }
  window.LabI18n = Object.freeze({
    t: translate,
    getLanguage: function () { return locale; },
    setLanguage: setLocale,
    supportedLanguages: codes.slice()
  });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else initialize();
})();
