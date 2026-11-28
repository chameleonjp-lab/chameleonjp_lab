(() => {
  'use strict';

  const preferenceKey = 'chameleonjp_lab_sound';
  const trackUrl = new URL('midnight-carousel.mp3', document.currentScript.src);
  const AudioEngine = window.AudioContext || window.webkitAudioContext;
  const soundNames = {
    ja: '音', en: 'Sound', es: 'Sonido', 'pt-BR': 'Som', 'zh-Hans': '声音',
    fr: 'Son', de: 'Ton', ko: '소리', ru: 'Звук', it: 'Audio', 'zh-Hant': '聲音',
    id: 'Suara', tr: 'Ses', vi: 'Âm thanh', th: 'เสียง'
  };

  // Notes in MIDI pitch, spacing in seconds. A slight pitch drop gives the
  // wooden latch and ticket punch a different attack from the pitched bells.
  const cues = {
    action:   { wave: 'triangle', notes: [55, 62, 74], step: .037, tail: .11 },
    puzzle:   { wave: 'sine', notes: [83, 90, 95], step: .062, tail: .19 },
    timing:   { wave: 'triangle', notes: [79, 67, 79], step: .082, tail: .048 },
    open:     { wave: 'triangle', notes: [62, 69, 77], step: .052, tail: .13 },
    close:    { wave: 'triangle', notes: [62, 50], step: .046, tail: .075, drop: 5 },
    play:     { wave: 'triangle', notes: [74, 77, 81], step: .055, tail: .17 },
    ranking:  { wave: 'sine', notes: [81, 86], step: .075, tail: .18 },
    hall:     { wave: 'sine', notes: [86, 93, 98, 101], step: .074, tail: .28 },
    share:    { wave: 'sine', notes: [79, 91, 86], step: .044, tail: .13 },
    tab:      { wave: 'triangle', notes: [69, 74], step: .032, tail: .067 },
    setting:  { wave: 'sine', notes: [76, 79], step: .039, tail: .09 },
    page:     { wave: 'triangle', notes: [67, 71], step: .055, tail: .09, drop: 2 },
    navigate: { wave: 'sine', notes: [72, 67], step: .04, tail: .10 },
    press:    { wave: 'triangle', notes: [62], step: 0, tail: .095, drop: 8 }
  };

  // Match the action in the capture phase, before a card is redrawn or a tab
  // changes state. These hooks also apply to game-specific ranking renderers.
  const actions = [
    ['#hallTab, #ikagetto-tab-hall, .hof-plate, .hof-emblem', 'hall'],
    ['[data-share], #shareButton, [id$="-share"]', 'share'],
    ['[data-difficulty], [role="tab"], .tabs button', 'tab'],
    ['.detail-link-wrap a', 'ranking'],
    ['.game-thumbnail, .game-card .actions a.button, a.button.link-callout, #game', 'play'],
    ['[data-rank-prev], [data-rank-next], [data-prev], [data-previous], [data-next], #jungle-prev, #jungle-next, #bestMore, #timeAttackMore, #hallMore', 'page'],
    ['a', 'navigate']
  ];
  function cueFor(control) {
    if (control.hasAttribute('data-accordion')) {
      return control.getAttribute('aria-expanded') === 'true' ? 'close' : 'open';
    }
    return control.dataset.labCue || actions.find(([selector]) => control.matches(selector))?.[1] || 'press';
  }

  let enabled = true;
  let context, output, music;
  let loading = false;
  let retryAfter = 0;
  const voices = new Set();
  const toggle = document.getElementById('labSound');
  if (!AudioEngine || !toggle) return;

  function readPreference() {
    try { enabled = localStorage.getItem(preferenceKey) !== 'off'; }
    catch { /* Keep the in-page setting when storage is unavailable. */ }
  }
  function renderToggle() {
    const label = soundNames[document.documentElement.lang] || soundNames.ja;
    toggle.querySelector('.sound-label').textContent = label;
    toggle.setAttribute('aria-pressed', String(enabled));
    toggle.querySelector('[aria-hidden]').textContent = enabled ? '🔊' : '🔇';
  }

  async function loadMusic() {
    if (music || loading || Date.now() < retryAfter) return;
    loading = true;
    try {
      const response = await fetch(trackUrl);
      if (!response.ok) throw new Error('Music unavailable');
      const buffer = await context.decodeAudioData(await response.arrayBuffer());
      const backing = context.createGain();
      backing.gain.value = .32;
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(backing).connect(output);
      source.start();
      music = source;
    } catch {
      retryAfter = Date.now() + 10000;
    } finally {
      loading = false;
    }
  }

  function playCue(name) {
    const cue = cues[name];
    const start = context.currentTime;
    cue.notes.forEach((pitch, index) => {
      const at = start + index * cue.step;
      const hz = 440 * 2 ** ((pitch - 69) / 12);
      const oscillator = context.createOscillator();
      const volume = context.createGain();
      oscillator.type = cue.wave;
      oscillator.frequency.setValueAtTime(hz, at);
      if (cue.drop) oscillator.frequency.exponentialRampToValueAtTime(hz * 2 ** (-cue.drop / 12), at + cue.tail);
      volume.gain.setValueAtTime(.0001, at);
      volume.gain.exponentialRampToValueAtTime(.16, at + .005);
      volume.gain.exponentialRampToValueAtTime(.0001, at + cue.tail);
      oscillator.connect(volume).connect(output);
      oscillator.onended = () => {
        voices.delete(oscillator);
        oscillator.disconnect();
        volume.disconnect();
      };
      voices.add(oscillator);
      oscillator.start(at);
      oscillator.stop(at + cue.tail);
    });
  }

  function activate(cue) {
    if (!enabled || document.hidden) return;
    if (!context) {
      try { context = new AudioEngine(); } catch { return; }
      output = context.createGain();
      output.connect(context.destination);
    }
    output.gain.value = 1;
    // Calling resume even during a pending suspend keeps rapid OFF/ON ordered.
    context.resume().catch(() => {});
    if (cue) playCue(cue);
    void loadMusic();
  }

  function pause() {
    if (!context) return;
    output.gain.value = 0;
    for (const voice of voices) voice.stop();
    context.suspend().catch(() => {});
  }

  function sync() {
    readPreference();
    renderToggle();
    if (!enabled || document.hidden) pause();
    else if (context) activate();
  }

  // i18n creates its toolbar at DOMContentLoaded. Inubo has its own compact nav.
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelector('.lab-language-bar')?.prepend(toggle);
    readPreference();
    renderToggle();
    toggle.hidden = false;
  }, { once: true });
  document.addEventListener('lab-language-change', renderToggle);

  let tappedLink;
  document.addEventListener('pointerup', event => {
    if (!event.isTrusted || !event.isPrimary || event.button !== 0) return;
    tappedLink = event.target.closest?.('a[href]:not([aria-disabled="true"])');
    if (tappedLink) activate(cueFor(tappedLink));
  }, true);
  document.addEventListener('click', event => {
    if (!event.isTrusted) return;
    const control = event.target.closest?.('button, a[href], select');
    const soundedOnRelease = event.detail > 0 && control && control === tappedLink;
    tappedLink = null;
    if (control?.matches(':disabled, [aria-disabled="true"]') || soundedOnRelease) return;
    if (control === toggle) {
      enabled = !enabled;
      try { localStorage.setItem(preferenceKey, enabled ? 'on' : 'off'); } catch { /* In-page only. */ }
      renderToggle();
      if (enabled) activate('setting');
      else pause();
      return;
    }
    activate(control && control.tagName !== 'SELECT' ? cueFor(control) : null);
  }, true);
  document.addEventListener('change', event => {
    if (event.isTrusted && event.target.matches('select:not(:disabled)')) activate('setting');
  }, true);
  document.addEventListener('keydown', event => {
    const selected = document.activeElement;
    if (event.isTrusted && event.defaultPrevented && selected !== event.target &&
        event.target.matches('[role="tab"]') && selected?.matches('[role="tab"][aria-selected="true"]')) {
      activate(cueFor(selected));
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause();
    else sync();
  });
  window.addEventListener('pagehide', pause);
  window.addEventListener('pageshow', sync);
  window.addEventListener('storage', event => {
    if (event.key === preferenceKey || event.key === null) sync();
  });
})();
