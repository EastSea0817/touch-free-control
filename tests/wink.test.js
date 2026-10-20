import { describe, it, expect } from 'vitest';
import { winkValues } from '../src/input/faceClick.js';
import { createInputEngine } from '../src/core/inputEngine.js';
import { createInputController } from '../src/core/inputController.js';
import { DEFAULT_SETTINGS } from '../src/core/settings.js';

const screen = { width: 1000, height: 800 };
const hitTest = () => ({ clickable: true, key: 'btn', risk: 'normal' });
const eyes = (l, r) => ({ pose: { yaw: 0, pitch: 0 }, blendshapes: { eyeBlinkLeft: l, eyeBlinkRight: r, jawOpen: 0.02 } });

function run(frames, settings = {}, hit = hitTest) {
  const engine = createInputEngine({ settings: { ...DEFAULT_SETTINGS, faceClickGesture: 'wink', dwellEnabled: false, ...settings }, screen, hitTest: hit });
  return frames.flatMap((face, i) => engine.process({ t: i * 33, face, hand: null }).actions);
}
const repeat = (v, n) => Array(n).fill(v);
const clicks = (actions, button) => actions.filter((a) => a.type === 'click' && (a.button ?? 'left') === button).length;

describe('wink signals', () => {
  it('one eye closed + the other open = wink', () => {
    expect(winkValues({ eyeBlinkLeft: 0.8, eyeBlinkRight: 0.1 })).toEqual({ left: 1, right: 0 });
    expect(winkValues({ eyeBlinkLeft: 0.1, eyeBlinkRight: 0.8 })).toEqual({ left: 0, right: 1 });
  });
  it('both eyes closed (a blink) is not a wink', () => {
    expect(winkValues({ eyeBlinkLeft: 0.9, eyeBlinkRight: 0.85 })).toEqual({ left: 0, right: 0 });
  });
  it('swap flips the eyes; no face = null', () => {
    expect(winkValues({ eyeBlinkLeft: 0.8, eyeBlinkRight: 0.1 }, { swap: true })).toEqual({ left: 0, right: 1 });
    expect(winkValues(null)).toEqual({ left: null, right: null });
  });
});

describe('wink clicks in the engine', () => {
  it('left wink held 1.5 s+ = one left click, right wink = one right click', () => {
    const a = run([...repeat(eyes(0.05, 0.05), 10), ...repeat(eyes(0.8, 0.1), 50), ...repeat(eyes(0.05, 0.05), 30), ...repeat(eyes(0.1, 0.8), 50), ...repeat(eyes(0.05, 0.05), 10)]);
    expect(clicks(a, 'left')).toBe(1);
    expect(clicks(a, 'right')).toBe(1);
  });

  it('a short wink (< 1.5 s) does not click', () => {
    const a = run([...repeat(eyes(0.05, 0.05), 10), ...repeat(eyes(0.8, 0.1), 40), ...repeat(eyes(0.05, 0.05), 10)]);
    expect(clicks(a, 'left') + clicks(a, 'right')).toBe(0);
  });

  it('normal blinks (both eyes, short) never click', () => {
    const frames = [];
    for (let i = 0; i < 300; i++) frames.push(i % 90 < 6 ? eyes(0.9, 0.88) : eyes(0.05, 0.06));
    const a = run(frames);
    expect(clicks(a, 'left') + clicks(a, 'right')).toBe(0);
  });

  it('closing both eyes for 2 s pauses and does not click', () => {
    const a = run([...repeat(eyes(0.05, 0.05), 5), ...repeat(eyes(0.9, 0.9), 70)]);
    expect(a.filter((x) => x.type === 'paused')).toHaveLength(1);
    expect(clicks(a, 'left') + clicks(a, 'right')).toBe(0);
  });

  it('right click on a high-risk target does not start confirmation or run it', () => {
    const a = run([...repeat(eyes(0.05, 0.05), 5), ...repeat(eyes(0.1, 0.8), 50)], {}, () => ({ clickable: true, key: 'del', risk: 'high' }));
    expect(a.map((x) => x.type)).not.toContain('confirmStart');
    expect(clicks(a, 'right')).toBe(1);
  });
});

describe('controller and right clicks', () => {
  it('right clicks are blocked while paused', () => {
    const c = createInputController();
    c.handle({ type: 'togglePause', source: 'eyes', t: 0 });
    expect(c.handle({ type: 'click', source: 'wink', button: 'right', targetId: 'x', t: 1 }).map((a) => a.type)).toEqual(['blocked']);
  });
});
