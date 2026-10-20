import { describe, it, expect } from 'vitest';
import { createTrigger, createHoldDetector, eyesClosedValue, blendshapeValue } from '../src/input/faceClick.js';

const FRAME = 33;
// values: array of numbers or null (tracking lost), one per frame
function feed(trigger, values, t0 = 0) {
  let fired = 0;
  values.forEach((v, i) => {
    if (trigger.update(v, t0 + i * FRAME).fired) fired += 1;
  });
  return fired;
}
const repeat = (v, n) => Array(n).fill(v);
const cfg = { on: 0.5, off: 0.25, confirmFrames: 4, releaseFrames: 10, minHoldMs: 120, refractoryMs: 600, graceMs: 600 };

describe('face click trigger', () => {
  it('fires once for one deliberate gesture', () => {
    const t = createTrigger(cfg);
    expect(feed(t, [...repeat(0.05, 10), ...repeat(0.8, 20), ...repeat(0.05, 15)])).toBe(1);
  });

  it('debounce: short spikes (< confirmFrames) do not click', () => {
    const t = createTrigger(cfg);
    expect(feed(t, [0.1, 0.7, 0.7, 0.1, 0.1, 0.7, 0.1, 0.6, 0.6, 0.6, 0.1])).toBe(0);
  });

  it('min hold time is required even with enough frames', () => {
    // 4 frames at 10 ms spacing = 30 ms < 120 ms
    const t = createTrigger(cfg);
    let fired = 0;
    [0.8, 0.8, 0.8, 0.8].forEach((v, i) => (fired += t.update(v, i * 10).fired ? 1 : 0));
    expect(fired).toBe(0);
  });

  it('hysteresis: wobbling between off and on thresholds does not click twice', () => {
    const t = createTrigger(cfg);
    const wobble = [];
    for (let i = 0; i < 40; i++) wobble.push(i % 6 < 3 ? 0.8 : 0.35); // dips stay above off=0.25
    expect(feed(t, [...repeat(0.05, 5), ...repeat(0.8, 6), ...wobble])).toBe(1);
  });

  it('needs releaseFrames below off before the next click', () => {
    const t = createTrigger(cfg);
    const seq = [...repeat(0.8, 10), ...repeat(0.1, 5), ...repeat(0.8, 10)]; // only 5 low frames
    expect(feed(t, seq)).toBe(1);
    const t2 = createTrigger(cfg);
    const seq2 = [...repeat(0.8, 10), ...repeat(0.1, 12), ...repeat(0.8, 10)];
    expect(feed(t2, seq2)).toBe(2);
  });

  it('refractory: two clicks closer than refractoryMs are not allowed', () => {
    const t = createTrigger({ ...cfg, releaseFrames: 1, refractoryMs: 2000 });
    const seq = [...repeat(0.8, 6), 0.1, ...repeat(0.8, 6), 0.1, ...repeat(0.8, 6)];
    expect(feed(t, seq)).toBe(1);
  });

  it('tracking drops for 300 ms AFTER the click: still one click (no double click)', () => {
    const t = createTrigger(cfg);
    const seq = [...repeat(0.8, 8), ...repeat(null, 9), ...repeat(0.8, 8), ...repeat(0.05, 15)];
    expect(feed(t, seq)).toBe(1);
  });

  it('tracking drops for 300 ms mid-confirmation: progress is kept, one click', () => {
    const t = createTrigger(cfg);
    const seq = [...repeat(0.8, 2), ...repeat(null, 9), ...repeat(0.8, 3), ...repeat(0.05, 15)];
    expect(feed(t, seq)).toBe(1);
  });

  it('long tracking loss mid-confirmation cancels it', () => {
    const t = createTrigger(cfg);
    const seq = [...repeat(0.8, 3), ...repeat(null, 30), 0.1];
    expect(feed(t, seq)).toBe(0);
    expect(t.state).toBe('idle');
  });

  it('a long loss after a click is not a release: still no second click', () => {
    const t = createTrigger(cfg);
    const seq = [...repeat(0.8, 8), ...repeat(null, 60), ...repeat(0.8, 10)];
    expect(feed(t, seq)).toBe(1);
  });
});

describe('hold detector (eyes closed / open palm = pause)', () => {
  it('fires once after holding for holdMs', () => {
    const h = createHoldDetector({ holdMs: 2000 });
    let fired = 0;
    for (let i = 0; i < 90; i++) fired += h.update(true, i * FRAME).fired ? 1 : 0;
    expect(fired).toBe(1);
  });

  it('normal blinks never fire', () => {
    const h = createHoldDetector({ holdMs: 2000 });
    let fired = 0;
    for (let i = 0; i < 300; i++) fired += h.update(i % 60 < 5, i * FRAME).fired ? 1 : 0;
    expect(fired).toBe(0);
  });

  it('short tracking loss does not reset the hold', () => {
    const h = createHoldDetector({ holdMs: 1000, graceMs: 300 });
    let fired = 0;
    const seq = [...repeat(true, 15), ...repeat(null, 5), ...repeat(true, 20)];
    seq.forEach((v, i) => (fired += h.update(v, i * FRAME).fired ? 1 : 0));
    expect(fired).toBe(1);
  });

  it('must release before firing again', () => {
    const h = createHoldDetector({ holdMs: 500, releaseFrames: 5 });
    let fired = 0;
    const seq = [...repeat(true, 60), ...repeat(false, 6), ...repeat(true, 20)];
    seq.forEach((v, i) => (fired += h.update(v, i * FRAME).fired ? 1 : 0));
    expect(fired).toBe(2);
  });
});

describe('blendshape helpers', () => {
  it('reads values and uses the smaller blink score', () => {
    expect(blendshapeValue({ jawOpen: 0.4 }, 'jawOpen')).toBe(0.4);
    expect(blendshapeValue({}, 'jawOpen')).toBeNull();
    expect(eyesClosedValue({ eyeBlinkLeft: 0.9, eyeBlinkRight: 0.3 })).toBe(0.3);
    expect(eyesClosedValue(null)).toBeNull();
  });
});

describe('trigger progress', () => {
  it('fills with the hold time, not just the frame count', () => {
    const t = createTrigger({ ...cfg, minHoldMs: 1000 });
    t.update(0.8, 0);
    t.update(0.8, 33);
    t.update(0.8, 66);
    const r = t.update(0.8, 500);
    expect(r.progress).toBeCloseTo(0.5);
    expect(r.fired).toBe(false);
  });
});
