// Shared browser counter. One call at the point a new ordinary play begins.
const prefix = 'chameleonjp-lab:play-start:v1:';
const api = 'https://mlpnjgezrnhdxsxolyzj.supabase.co/rest/v1/rpc/lab_record_play_start_v1';
const publishableKey = 'sb_publishable_drzcy0v97knU6FgjqSgBHw_0A9XPdFM';
const officialOrigin = 'https://chameleonjp-lab.github.io';
const maxStored = 60;
const expiresAfter = 7 * 24 * 60 * 60_000;
const pending = new Map();
const inFlight = new Set();

function remember(play) {
  pending.set(play.id, play);
  try { localStorage.setItem(prefix + play.id, JSON.stringify(play)); } catch {}
}

function forget(id) {
  pending.delete(id);
  try { localStorage.removeItem(prefix + id); } catch {}
}

async function send(play) {
  if (inFlight.has(play.id) || !pending.has(play.id)) return;
  inFlight.add(play.id);
  try {
    const response = await fetch(api, {
      method: 'POST',
      headers: { apikey: publishableKey, 'content-type': 'application/json' },
      body: JSON.stringify({ p_play_id: play.id, p_game_slug: play.slug }),
      credentials: 'omit',
      redirect: 'error',
      keepalive: true,
      signal: typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(8000) : undefined,
    });
    if (response.ok && await response.json() === true) forget(play.id);
  } catch {
    // Gameplay continues. Keep the same ID for the next retry.
  } finally {
    inFlight.delete(play.id);
  }
}

function recover() {
  try {
    const keys = Object.keys(localStorage).filter(key => key.startsWith(prefix));
    for (const key of keys) {
      const play = JSON.parse(localStorage.getItem(key));
      if (play?.id === key.slice(prefix.length) && typeof play.slug === 'string'
        && Number.isFinite(play.time)) {
        pending.set(play.id, play);
      }
    }
  } catch {}
}

function trim() {
  const oldest = [...pending.values()].sort((a, b) => a.time - b.time);
  for (const [index, play] of oldest.entries()) {
    if (Date.now() - play.time > expiresAfter || index < oldest.length - maxStored) {
      forget(play.id);
    }
  }
}

function flush() {
  recover();
  trim();
  for (const play of [...pending.values()].slice(0, 6)) void send(play);
}

export function recordPlayStart(slug) {
  if (globalThis.location?.origin !== officialOrigin) return;
  try {
    if (typeof slug !== 'string' || !/^[a-z0-9_]{1,80}$/.test(slug)) return;
    const play = { id: crypto.randomUUID(), slug, time: Date.now() };
    remember(play);
    trim();
    void send(play);
    setTimeout(() => void send(play), 3500);
  } catch {
    // Older or restricted browsers can still play normally.
  }
}

if (typeof window !== 'undefined' && window.location.origin === officialOrigin) {
  window.addEventListener('online', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') flush();
  });
  flush();
}
