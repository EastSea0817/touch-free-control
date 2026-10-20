import { describe, it, expect } from 'vitest';
import { loadProfile, saveProfile, clearProfile } from '../src/data/profileStore.js';
import { DEFAULT_SETTINGS } from '../src/core/settings.js';

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

describe('profileStore', () => {
  it('returns defaults when nothing is saved', () => {
    const p = loadProfile(memoryStorage());
    expect(p.settings).toEqual(DEFAULT_SETTINGS);
    expect(p.range).toBeNull();
  });

  it('saves and loads settings and range', () => {
    const s = memoryStorage();
    const range = { center: { yaw: 0, pitch: 0 }, left: -0.2, right: 0.2, up: 0.1, down: -0.1 };
    saveProfile({ settings: { ...DEFAULT_SETTINGS, dwellMs: 900 }, range }, s);
    const p = loadProfile(s);
    expect(p.settings.dwellMs).toBe(900);
    expect(p.range).toEqual(range);
  });

  it('ignores corrupted or wrongly typed data', () => {
    const s = memoryStorage();
    s.setItem('tfc.profile.v1', '{not json');
    expect(loadProfile(s).settings).toEqual(DEFAULT_SETTINGS);
    s.setItem('tfc.profile.v1', JSON.stringify({ settings: { dwellMs: 'fast' }, range: { left: 1 } }));
    const p = loadProfile(s);
    expect(p.settings.dwellMs).toBe(DEFAULT_SETTINGS.dwellMs);
    expect(p.range).toBeNull();
  });

  it('clears the profile', () => {
    const s = memoryStorage();
    saveProfile({ settings: DEFAULT_SETTINGS, range: null }, s);
    clearProfile(s);
    expect(s.getItem('tfc.profile.v1')).toBeNull();
  });
});
