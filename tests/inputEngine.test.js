import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createInputEngine } from '../src/core/inputEngine.js';
import { DEFAULT_SETTINGS } from '../src/core/settings.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/synthetic-session.json', import.meta.url)));
const screen = { width: 1000, height: 800 };

function runFixture(frames, { hitTest = () => ({ clickable: false, key: null, risk: 'normal' }), settings = {} } = {}) {
  const engine = createInputEngine({ settings: { ...DEFAULT_SETTINGS, faceClickGesture: 'jawOpen', ...settings }, screen, hitTest });
  const actions = [];
  let last = null;
  for (const f of frames) {
    last = engine.process(f);
    for (const a of last.actions) actions.push({ ...a, t: f.t });
  }
  return { actions, last, engine };
}

describe('input engine on the synthetic replay fixture', () => {
  it('gives the expected clicks, blocked clicks and pause toggles', () => {
    const { actions } = runFixture(fixture.frames);
    const count = (type) => actions.filter((a) => a.type === type).length;
    expect(count('click')).toBe(fixture.expected.clicks);
    expect(count('blocked')).toBe(fixture.expected.blocked);
    expect(count('paused') + count('resumed')).toBe(fixture.expected.pauseToggles);
  });

  it('talking (look-alike) produces no click', () => {
    const talking = fixture.frames.filter((f) => f.t < 4000);
    const { actions } = runFixture(talking);
    expect(actions.filter((a) => a.type === 'click')).toHaveLength(0);
  });

  it('the click during the 300 ms tracking drop happens exactly once', () => {
    const part = fixture.frames.filter((f) => f.t >= 4000 && f.t < 6000);
    const { actions } = runFixture(part);
    expect(actions.filter((a) => a.type === 'click')).toHaveLength(1);
  });

  it('turning the head right moves the cursor right', () => {
    const { last } = runFixture(fixture.frames);
    expect(last.cursor.x).toBeGreaterThan(screen.width * 0.8);
  });

  it('dwell clicks a clickable target but never while paused', () => {
    const still = Array.from({ length: 90 }, (_, i) => ({
      t: i * 33,
      face: { pose: { yaw: 0, pitch: 0 }, blendshapes: { jawOpen: 0.02, eyeBlinkLeft: 0.05, eyeBlinkRight: 0.05 } },
      hand: null,
    }));
    const hitTest = () => ({ clickable: true, key: 'btn', risk: 'normal' });
    const { actions } = runFixture(still, { hitTest });
    expect(actions.filter((a) => a.type === 'click')).toHaveLength(1);

    const engine = createInputEngine({ settings: DEFAULT_SETTINGS, screen, hitTest });
    engine.signal('togglePause', 0);
    const all = still.flatMap((f) => engine.process(f).actions);
    expect(all.filter((a) => a.type === 'click')).toHaveLength(0);
  });

  it('a click on a high-risk target asks for confirmation instead of clicking', () => {
    const hitTest = () => ({ clickable: true, key: 'delete', risk: 'high' });
    const part = fixture.frames.filter((f) => f.t >= 4000 && f.t < 6000);
    const { actions } = runFixture(part, { hitTest, settings: { dwellEnabled: false } });
    expect(actions.map((a) => a.type)).toContain('confirmStart');
    expect(actions.filter((a) => a.type === 'click')).toHaveLength(0);
  });

  it('hand: closed fist clicks, open palm held toggles pause', () => {
    const mk = (t, kind) => ({ t, face: null, hand: { kind } });
    const frames = [];
    let t = 0;
    for (let i = 0; i < 10; i++) frames.push(mk((t += 33), 'none'));
    for (let i = 0; i < 12; i++) frames.push(mk((t += 33), 'fist'));
    for (let i = 0; i < 15; i++) frames.push(mk((t += 33), 'none'));
    for (let i = 0; i < 60; i++) frames.push(mk((t += 33), 'palm'));
    const { actions } = runFixture(frames, { settings: { handEnabled: true } });
    expect(actions.filter((a) => a.type === 'click')).toHaveLength(1);
    expect(actions.filter((a) => a.type === 'paused')).toHaveLength(1);
  });
});

describe('input engine safety', () => {
  it('a frozen cursor (no face tracked) never dwell-clicks', () => {
    const hitTest = () => ({ clickable: true, key: 'btn', risk: 'normal' });
    const engine = createInputEngine({ settings: DEFAULT_SETTINGS, screen, hitTest });
    const all = [];
    for (let i = 0; i < 120; i++) all.push(...engine.process({ t: i * 33, face: null, hand: null }).actions);
    expect(all.filter((a) => a.type === 'click')).toHaveLength(0);
  });
});

describe('recenter', () => {
  it('uses the next resting pose as the new centre', () => {
    const e = createInputEngine({ settings: { ...DEFAULT_SETTINGS, dwellEnabled: false, smoothing: 0 }, screen: { width: 1000, height: 800 }, hitTest: () => null });
    const face = (yaw, pitch) => ({ pose: { yaw, pitch }, blendshapes: {} });
    let t = 0;
    for (let i = 0; i < 20; i++) e.process({ t: (t += 33), face: face(0, 0) });
    e.recenter();
    for (let i = 0; i < 20; i++) e.process({ t: (t += 33), face: face(0.1, 0.05) });
    expect(e.range.center.yaw).toBeCloseTo(0.1);
    expect(e.range.center.pitch).toBeCloseTo(0.05);
  });
});
