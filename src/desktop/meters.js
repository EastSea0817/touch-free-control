// Live gesture meters and per-gesture sensitivity (desktop app). Pure.
// Idea from Google Project Gameface's "Gesture size" slider with a live dot,
// rebuilt here for my own gestures (winks, mouth, eyebrows) and thresholds.

export const GESTURE_HELP = Object.freeze({
  wink: 'Close ONE eye and hold it: left eye = left click, right eye = right click. Normal blinks close both eyes and never click.',
  jawOpen: 'Open your mouth wide and hold it briefly. Talking should stay below the line.',
  browInnerUp: 'Raise your eyebrows and hold them briefly.',
});

const LIMITS = Object.freeze({
  winkClosed: { min: 0.3, max: 0.9, step: 0.05 },
  faceClickOn: { min: 0.3, max: 0.85, step: 0.05 },
});

const round2 = (v) => Math.round(v * 100) / 100;
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * @returns Array<{id, label, value: number|null, threshold}>
 *   id 'winkLeft' / 'winkRight' / 'face'
 */
export function gestureMeters(blendshapes, settings) {
  const b = blendshapes ?? {};
  if (settings.faceClickGesture === 'wink') {
    let l = num(b.eyeBlinkLeft);
    let r = num(b.eyeBlinkRight);
    if (settings.winkSwapEyes) [l, r] = [r, l];
    return [
      { id: 'winkLeft', label: 'Left eye (left click)', value: l, threshold: settings.winkClosed },
      { id: 'winkRight', label: 'Right eye (right click)', value: r, threshold: settings.winkClosed },
    ];
  }
  const label = settings.faceClickGesture === 'jawOpen' ? 'Mouth open (click)' : 'Eyebrows up (click)';
  return [{ id: 'face', label, value: num(b[settings.faceClickGesture]), threshold: settings.faceClickOn }];
}

/** dir +1 = harder to click (higher line), -1 = easier. Returns a NEW settings object. */
export function stepSensitivity(settings, meterId, dir) {
  const key = meterId === 'face' ? 'faceClickOn' : 'winkClosed';
  const lim = LIMITS[key];
  const v = round2(Math.min(lim.max, Math.max(lim.min, settings[key] + Math.sign(dir) * lim.step)));
  const next = { ...settings, [key]: v };
  if (key === 'faceClickOn') next.faceClickOff = Math.round((v / 2) * 1e4) / 1e4; // keep hysteresis
  // the "other eye open" limit must stay well below the "closed" line
  if (key === 'winkClosed') next.winkOpen = round2(Math.min(0.3, v - 0.15));
  return next;
}

/**
 * True as soon as the user STARTS a click gesture (before it fires), so the
 * cursor can be locked before the face moves. A normal blink (both eyes) is
 * not a click intent.
 */
export function clickIntent(blendshapes, settings, progress = 0, early = 0.6) {
  if (progress > 0) return true;
  const meters = gestureMeters(blendshapes, settings);
  if (settings.faceClickGesture === 'wink') {
    const [l, r] = meters.map((m) => m.value ?? 0);
    const start = settings.winkClosed * early;
    const open = settings.winkOpen;
    return (l >= start && r <= open) || (r >= start && l <= open);
  }
  const m = meters[0];
  return m.value !== null && m.value >= m.threshold * early;
}
