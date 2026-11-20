// Saves usage insights in localStorage, separate from the profile so the user
// can delete them on their own. Opt-in: nothing is recorded until the user
// turns it on. Only numbers and coarse labels, never images or face data.

const KEY = 'nohands.stats.v1';

function safeStorage(storage) {
  if (storage) return storage;
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function loadStats(storage) {
  const s = safeStorage(storage);
  let raw = null;
  try {
    raw = s ? JSON.parse(s.getItem(KEY) || 'null') : null;
  } catch {
    raw = null;
  }
  const sessions = Array.isArray(raw?.sessions) ? raw.sessions.filter(isSession) : [];
  return { optIn: raw?.optIn === true, sessions };
}

export function saveStats(stats, storage) {
  const s = safeStorage(storage);
  if (!s) return false;
  try {
    s.setItem(KEY, JSON.stringify({ optIn: !!stats.optIn, sessions: stats.sessions ?? [] }));
    return true;
  } catch {
    return false;
  }
}

export function clearStats(storage) {
  const s = safeStorage(storage);
  try {
    s?.removeItem(KEY);
  } catch {
    /* storage blocked */
  }
}

function isSession(x) {
  const n = (v) => typeof v === 'number' && Number.isFinite(v);
  return x && n(x.start) && n(x.end) && Array.isArray(x.clicks) && x.light && x.distance && n(x.lost);
}
