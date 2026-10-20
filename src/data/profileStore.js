// Saves settings and the head-range calibration in localStorage.
// Only numbers are stored, never images. `storage` is injectable for tests.

import { mergeSettings } from '../core/settings.js';
import { validateRange } from '../input/headPointer.js';

const KEY = 'tfc.profile.v1';

function safeStorage(storage) {
  if (storage) return storage;
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function loadProfile(storage) {
  const s = safeStorage(storage);
  let raw = null;
  try {
    raw = s ? JSON.parse(s.getItem(KEY) || 'null') : null;
  } catch {
    raw = null;
  }
  const range = raw && raw.range && isRange(raw.range) && validateRange(raw.range) ? raw.range : null;
  return { settings: mergeSettings(raw?.settings), range, onboarded: raw?.onboarded === true };
}

export function saveProfile(profile, storage) {
  const s = safeStorage(storage);
  if (!s) return false;
  try {
    s.setItem(KEY, JSON.stringify({ settings: profile.settings, range: profile.range ?? null, onboarded: !!profile.onboarded }));
    return true;
  } catch {
    return false;
  }
}

export function clearProfile(storage) {
  const s = safeStorage(storage);
  try {
    s?.removeItem(KEY);
  } catch {
    /* storage blocked: nothing to clear */
  }
}

function isRange(r) {
  const n = (v) => typeof v === 'number' && Number.isFinite(v);
  return r.center && n(r.center.yaw) && n(r.center.pitch) && n(r.left) && n(r.right) && n(r.up) && n(r.down);
}
