import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS, SETTING_SPECS, stepSetting, formatSetting, mergeSettings } from '../src/core/settings.js';

describe('settings steps (used by the − / + buttons)', () => {
  it('every spec points at a real setting', () => {
    for (const s of SETTING_SPECS) expect(DEFAULT_SETTINGS).toHaveProperty(s.key);
  });

  it('steps numbers and clamps to the range', () => {
    let s = { ...DEFAULT_SETTINGS, dwellMs: 2800 };
    s = stepSetting(s, 'dwellMs', 1);
    expect(s.dwellMs).toBe(3000);
    s = stepSetting(s, 'dwellMs', 1);
    expect(s.dwellMs).toBe(3000);
    s = stepSetting({ ...DEFAULT_SETTINGS, smoothing: 0.1 }, 'smoothing', -1);
    expect(s.smoothing).toBe(0);
    expect(stepSetting(s, 'smoothing', -1).smoothing).toBe(0);
  });

  it('avoids floating point noise', () => {
    const s = stepSetting({ ...DEFAULT_SETTINGS, faceClickOn: 0.5 }, 'faceClickOn', 1);
    expect(s.faceClickOn).toBe(0.55);
  });

  it('keeps the release threshold below the click threshold', () => {
    const s = stepSetting({ ...DEFAULT_SETTINGS, faceClickOn: 0.3 }, 'faceClickOn', -1);
    expect(s.faceClickOff).toBeLessThan(s.faceClickOn);
  });

  it('toggles booleans and cycles choices', () => {
    expect(stepSetting(DEFAULT_SETTINGS, 'sound').sound).toBe(!DEFAULT_SETTINGS.sound);
    const a = stepSetting({ ...DEFAULT_SETTINGS, faceClickGesture: 'browInnerUp' }, 'faceClickGesture', 1);
    expect(a.faceClickGesture).toBe('wink');
    const b = stepSetting({ ...DEFAULT_SETTINGS, faceClickGesture: 'wink' }, 'faceClickGesture', -1);
    expect(b.faceClickGesture).toBe('browInnerUp');
  });

  it('does not change the original object and ignores unknown keys', () => {
    const before = { ...DEFAULT_SETTINGS };
    stepSetting(before, 'dwellMs', 1);
    expect(before).toEqual(DEFAULT_SETTINGS);
    expect(stepSetting(before, 'nope', 1)).toBe(before);
  });

  it('formats values for the screen', () => {
    const spec = (k) => SETTING_SPECS.find((s) => s.key === k);
    expect(formatSetting(spec('winkHoldMs'), 1500)).toBe('1.50 s');
    expect(formatSetting(spec('sound'), true)).toBe('On');
    expect(formatSetting(spec('faceClickGesture'), 'jawOpen')).toBe('Mouth');
  });

  it('mergeSettings keeps defaults for missing or wrongly typed values', () => {
    expect(mergeSettings({ dwellMs: 900, sound: 'yes' })).toEqual({ ...DEFAULT_SETTINGS, dwellMs: 900 });
  });
});
