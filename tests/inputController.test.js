import { describe, it, expect } from 'vitest';
import { createInputController, STATE } from '../src/core/inputController.js';

const types = (actions) => actions.map((a) => a.type);

describe('inputController state machine', () => {
  it('ACTIVE: a normal click goes through', () => {
    const c = createInputController();
    const a = c.handle({ type: 'click', source: 'face', targetId: 'b1', t: 0 });
    expect(types(a)).toEqual(['click']);
    expect(a[0].targetId).toBe('b1');
  });

  it('PAUSED: no click fires, from any source', () => {
    const c = createInputController();
    c.handle({ type: 'togglePause', source: 'eyes', t: 0 });
    expect(c.state).toBe(STATE.PAUSED);
    for (const source of ['face', 'dwell', 'hand', 'keyboard']) {
      const a = c.handle({ type: 'click', source, targetId: 'b1', t: 10 });
      expect(types(a)).toEqual(['blocked']);
    }
    const hr = c.handle({ type: 'click', source: 'face', risk: 'high', targetId: 'del', t: 20 });
    expect(types(hr)).toEqual(['blocked']);
    expect(c.state).toBe(STATE.PAUSED);
  });

  it('pause toggles back to ACTIVE', () => {
    const c = createInputController();
    c.handle({ type: 'togglePause', source: 'eyes', t: 0 });
    const a = c.handle({ type: 'togglePause', source: 'eyes', t: 100 });
    expect(c.state).toBe(STATE.ACTIVE);
    expect(types(a)).toContain('resumed');
  });

  it('high-risk click enters CONFIRMING and does not click yet', () => {
    const c = createInputController({ confirmTimeoutMs: 5000 });
    const a = c.handle({ type: 'click', source: 'face', risk: 'high', targetId: 'del', t: 0 });
    expect(types(a)).toEqual(['state', 'confirmStart']);
    expect(c.state).toBe(STATE.CONFIRMING);
  });

  it('CONFIRMING: the SAME signal is rejected, a different one confirms', () => {
    const c = createInputController();
    c.handle({ type: 'click', source: 'face', risk: 'high', targetId: 'del', t: 0 });
    expect(types(c.handle({ type: 'confirm', source: 'face', t: 100 }))).toEqual(['confirmRejected']);
    expect(c.state).toBe(STATE.CONFIRMING);
    const a = c.handle({ type: 'confirm', source: 'dwell', t: 200 });
    expect(types(a)).toEqual(['confirmed', 'click', 'state']);
    expect(a[1].targetId).toBe('del');
    expect(c.state).toBe(STATE.ACTIVE);
  });

  it('CONFIRMING: other clicks are blocked', () => {
    const c = createInputController();
    c.handle({ type: 'click', source: 'face', risk: 'high', targetId: 'del', t: 0 });
    expect(types(c.handle({ type: 'click', source: 'dwell', targetId: 'x', t: 10 }))).toEqual(['blocked']);
  });

  it('CONFIRMING: timeout cancels', () => {
    const c = createInputController({ confirmTimeoutMs: 1000 });
    c.handle({ type: 'click', source: 'face', risk: 'high', targetId: 'del', t: 0 });
    expect(c.handle({ type: 'tick', t: 900 })).toEqual([]);
    const a = c.handle({ type: 'tick', t: 1001 });
    expect(types(a)).toEqual(['confirmCancelled', 'state']);
    expect(a[0].reason).toBe('timeout');
    expect(c.state).toBe(STATE.ACTIVE);
  });

  it('CONFIRMING: a late confirm after the deadline is cancelled, not clicked', () => {
    const c = createInputController({ confirmTimeoutMs: 1000 });
    c.handle({ type: 'click', source: 'face', risk: 'high', targetId: 'del', t: 0 });
    const a = c.handle({ type: 'confirm', source: 'dwell', t: 1500 });
    expect(types(a)).not.toContain('click');
  });

  it('CONFIRMING: cancel and pause both cancel the pending action', () => {
    const c = createInputController();
    c.handle({ type: 'click', source: 'face', risk: 'high', targetId: 'del', t: 0 });
    expect(types(c.handle({ type: 'cancel', source: 'dwell', t: 10 }))).toEqual(['confirmCancelled', 'state']);
    c.handle({ type: 'click', source: 'face', risk: 'high', targetId: 'del', t: 20 });
    const a = c.handle({ type: 'togglePause', source: 'eyes', t: 30 });
    expect(types(a)).toEqual(['confirmCancelled', 'state', 'paused']);
    expect(c.state).toBe(STATE.PAUSED);
  });
});
