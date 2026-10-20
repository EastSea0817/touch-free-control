import { describe, it, expect } from 'vitest';
import { createCursorGate } from '../src/desktop/cursorGate.js';
import { checkEnvironment, faceBox, averageBrightness } from '../src/desktop/envCheck.js';
import { gestureMeters, stepSensitivity, clickIntent } from '../src/desktop/meters.js';
import { DEFAULT_SETTINGS } from '../src/core/settings.js';

describe('cursor gate (click lock)', () => {
  it('moves the real cursor while no click gesture is held', () => {
    const g = createCursorGate();
    expect(g.update({ x: 100, y: 100 }, 0, false).move).toEqual({ x: 100, y: 100 });
    expect(g.update({ x: 120, y: 90 }, 0, false).move).toEqual({ x: 120, y: 90 });
  });

  it('locks the cursor as soon as a click gesture starts and clicks at the locked point', () => {
    const g = createCursorGate();
    g.update({ x: 200, y: 300 }, 0, false);
    const a = g.update({ x: 215, y: 330 }, 1, false); // face moves while opening the mouth
    expect(a.move).toBeNull();
    expect(a.clickAt).toEqual({ x: 200, y: 300 });
    const b = g.update({ x: 240, y: 360 }, 1, false);
    expect(b.move).toBeNull();
    expect(b.clickAt).toEqual({ x: 200, y: 300 });
  });

  it('follows the head again after the gesture ends', () => {
    const g = createCursorGate();
    g.update({ x: 10, y: 10 }, 0, false);
    g.update({ x: 50, y: 50 }, 1, false);
    expect(g.update({ x: 60, y: 60 }, 0, false).move).toEqual({ x: 60, y: 60 });
  });

  it('keeps the cursor still while paused', () => {
    const g = createCursorGate();
    g.update({ x: 10, y: 10 }, 0, false);
    expect(g.update({ x: 500, y: 500 }, 0, true).move).toBeNull();
    expect(g.update({ x: 500, y: 500 }, 1, true).clickAt).toEqual({ x: 10, y: 10 });
  });

  it('does not resend the same position', () => {
    const g = createCursorGate();
    g.update({ x: 10, y: 10 }, 0, false);
    expect(g.update({ x: 10.2, y: 10.1 }, 0, false).move).toBeNull();
  });
});

describe('environment check', () => {
  const good = { brightness: 120, face: { cx: 0.5, cy: 0.5, width: 0.3 } };
  it('passes a well-lit, centred face at a normal distance', () => {
    expect(checkEnvironment(good)).toEqual({ ok: true, hints: [] });
  });
  it.each([
    [{ ...good, brightness: 30 }, 'dark'],
    [{ ...good, brightness: 240 }, 'bright'],
    [{ ...good, face: null }, 'noFace'],
    [{ ...good, face: { cx: 0.5, cy: 0.5, width: 0.1 } }, 'far'],
    [{ ...good, face: { cx: 0.5, cy: 0.5, width: 0.7 } }, 'near'],
    [{ ...good, face: { cx: 0.85, cy: 0.5, width: 0.3 } }, 'offCenter'],
  ])('gives a hint (%#)', (m, code) => {
    const r = checkEnvironment(m);
    expect(r.ok).toBe(false);
    expect(r.hints.map((h) => h.code)).toContain(code);
  });
  it('mirrors the face box to match the preview', () => {
    const b = faceBox([{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.6 }]);
    expect(b.cx).toBeCloseTo(0.8);
    expect(b.cy).toBeCloseTo(0.4);
    expect(b.width).toBeCloseTo(0.2);
  });
  it('averages pixel brightness', () => {
    expect(averageBrightness(new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]), 1)).toBeCloseTo(127.5);
  });
});

describe('gesture meters and sensitivity', () => {
  const s = { ...DEFAULT_SETTINGS };
  it('shows one meter per eye for winks, honouring the eye swap', () => {
    const m = gestureMeters({ eyeBlinkLeft: 0.9, eyeBlinkRight: 0.1 }, { ...s, winkSwapEyes: true });
    expect(m.map((x) => x.value)).toEqual([0.1, 0.9]);
    expect(m[0].threshold).toBe(s.winkClosed);
  });
  it('shows one meter for mouth/eyebrows', () => {
    const m = gestureMeters({ jawOpen: 0.4 }, { ...s, faceClickGesture: 'jawOpen' });
    expect(m).toEqual([{ id: 'face', label: 'Mouth open (click)', value: 0.4, threshold: s.faceClickOn }]);
  });
  it('+ makes clicking harder and keeps the hysteresis / open-eye limits consistent', () => {
    const a = stepSensitivity(s, 'face', 1);
    expect(a.faceClickOn).toBeCloseTo(s.faceClickOn + 0.05);
    expect(a.faceClickOff).toBeCloseTo(a.faceClickOn / 2);
    const w = stepSensitivity({ ...s, winkClosed: 0.4 }, 'winkLeft', -1);
    expect(w.winkClosed).toBeCloseTo(0.35);
    expect(w.winkOpen).toBeLessThan(w.winkClosed);
  });
  it('stays within limits', () => {
    expect(stepSensitivity({ ...s, faceClickOn: 0.85 }, 'face', 1).faceClickOn).toBe(0.85);
    expect(stepSensitivity({ ...s, winkClosed: 0.3 }, 'winkRight', -1).winkClosed).toBe(0.3);
  });
  it('detects the start of a wink but not a normal blink', () => {
    expect(clickIntent({ eyeBlinkLeft: 0.35, eyeBlinkRight: 0.05 }, s)).toBe(true);
    expect(clickIntent({ eyeBlinkLeft: 0.9, eyeBlinkRight: 0.9 }, s)).toBe(false);
    expect(clickIntent({ eyeBlinkLeft: 0.05, eyeBlinkRight: 0.05 }, s)).toBe(false);
  });
  it('detects the start of a mouth click before it fires', () => {
    const m = { ...s, faceClickGesture: 'jawOpen' };
    expect(clickIntent({ jawOpen: 0.35 }, m)).toBe(true);
    expect(clickIntent({ jawOpen: 0.1 }, m)).toBe(false);
    expect(clickIntent(null, m, 0.5)).toBe(true);
  });
});
