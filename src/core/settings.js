// All tunable numbers live here, not as scattered literals.
// Values are starting points from webcam demos; the Settings screen (Phase 3)
// will let the user change them, and profileStore saves them.

export const MEDIAPIPE_VERSION = '1.1.1'; // keep in sync with package.json

export const DEFAULT_SETTINGS = Object.freeze({
  // Cursor
  cursorSpeed: 0.8, // 1 = full speed; lower = turn the head more for the same movement
  smoothing: 0.5, // 0 = raw/fast, 1 = very smooth/slow (maps to One Euro min cutoff)
  // Dwell click (fallback)
  dwellEnabled: true,
  dwellMs: 1200,
  dwellRadiusPx: 40,
  // Face click (primary)
  faceClickEnabled: true,
  faceClickGesture: 'wink', // 'wink' | 'jawOpen' | 'browInnerUp'
  // Wink mode: left eye = left click, right eye = right click
  winkClosed: 0.5, // the closed eye must be at least this
  winkOpen: 0.3, // the other eye must stay below this (a normal blink closes both)
  winkHoldMs: 1500, // held this long so it is never mistaken for a blink (my choice; adjustable later)
  winkSwapEyes: false, // in case the camera reports the eyes the other way round
  faceClickOn: 0.5, // fire threshold
  faceClickOff: 0.25, // must fall below this (hysteresis) before the next click
  confirmFrames: 4,
  releaseFrames: 10,
  minHoldMs: 120,
  refractoryMs: 600,
  trackingGraceMs: 600,
  // Pause by closing both eyes
  eyesPauseEnabled: true,
  eyesClosedThreshold: 0.55,
  eyesPauseHoldMs: 2000,
  // Hand gestures (optional, off by default)
  handEnabled: false,
  handPauseHoldMs: 1500,
  // High-risk confirmation
  confirmTimeoutMs: 6000,
  // Audio
  sound: true,
});

export function mergeSettings(saved) {
  const out = { ...DEFAULT_SETTINGS };
  if (saved && typeof saved === 'object') {
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      if (typeof saved[key] === typeof DEFAULT_SETTINGS[key]) out[key] = saved[key];
    }
  }
  return out;
}

// What the Settings screen can change. Every value is changed with big
// − / + or toggle buttons, because sliders cannot be dragged with the
// virtual cursor.
export const SETTING_SPECS = Object.freeze([
  { key: 'faceClickGesture', label: 'Click with', type: 'choice', options: [['wink', 'Winks'], ['jawOpen', 'Mouth'], ['browInnerUp', 'Eyebrows']] },
  { key: 'winkHoldMs', label: 'Wink hold time', type: 'number', min: 500, max: 3000, step: 250, unit: 's', scale: 1000, digits: 2 },
  { key: 'winkSwapEyes', label: 'Swap left/right eye', type: 'bool' },
  { key: 'faceClickOn', label: 'Mouth/eyebrow click threshold (higher = harder to click)', type: 'number', min: 0.3, max: 0.85, step: 0.05, digits: 2 },
  { key: 'dwellEnabled', label: 'Hold-still (dwell) click', type: 'bool' },
  { key: 'dwellMs', label: 'Dwell time', type: 'number', min: 600, max: 3000, step: 200, unit: 's', scale: 1000, digits: 1 },
  { key: 'cursorSpeed', label: 'Cursor speed (lower = less sensitive)', type: 'number', min: 0.4, max: 1.6, step: 0.1, digits: 1 },
  { key: 'smoothing', label: 'Cursor smoothing (higher = steadier, slower)', type: 'number', min: 0, max: 1, step: 0.1, digits: 1 },
  { key: 'eyesPauseHoldMs', label: 'Close both eyes to pause for', type: 'number', min: 1000, max: 4000, step: 500, unit: 's', scale: 1000, digits: 1 },
  { key: 'handEnabled', label: 'Hand gestures (fist = click, open palm = pause)', type: 'bool' },
  { key: 'sound', label: 'Click sounds', type: 'bool' },
]);

const round = (v, digits = 4) => Math.round(v * 10 ** digits) / 10 ** digits;

/**
 * Change one setting by one step. dir = +1 / -1 (numbers and choices) or
 * anything for booleans (toggle). Returns a NEW settings object.
 */
export function stepSetting(settings, key, dir = 1) {
  const spec = SETTING_SPECS.find((s) => s.key === key);
  if (!spec) return settings;
  const next = { ...settings };
  if (spec.type === 'bool') {
    next[key] = !settings[key];
  } else if (spec.type === 'choice') {
    const ids = spec.options.map(([id]) => id);
    const i = Math.max(0, ids.indexOf(settings[key]));
    next[key] = ids[(i + (dir >= 0 ? 1 : -1) + ids.length) % ids.length];
  } else {
    const v = settings[key] + (dir >= 0 ? spec.step : -spec.step);
    next[key] = round(Math.min(spec.max, Math.max(spec.min, v)));
  }
  if (key === 'faceClickOn') next.faceClickOff = round(next.faceClickOn / 2); // keep hysteresis
  return next;
}

export function formatSetting(spec, value) {
  if (spec.type === 'bool') return value ? 'On' : 'Off';
  if (spec.type === 'choice') return spec.options.find(([id]) => id === value)?.[1] ?? String(value);
  const v = spec.scale ? value / spec.scale : value;
  return `${v.toFixed(spec.digits ?? 2)}${spec.unit ? ' ' + spec.unit : ''}`;
}
