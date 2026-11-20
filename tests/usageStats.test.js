import { describe, it, expect } from 'vitest';
import { createSessionRecorder, addSession, describeSessions, diagnose, predictRisk, prescribe, sessionsCsv, clicksCsv, LIMITS } from '../src/core/usageStats.js';
import { loadStats, saveStats, clearStats } from '../src/data/statsStore.js';
import { DEFAULT_SETTINGS } from '../src/core/settings.js';

function clock(start = 1_700_000_000_000) {
  let t = start;
  return { now: () => t, advance: (ms) => (t += ms) };
}

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

/** A finished session with the given clicks: [{ m, light, wrong }]. */
function session({ minutes = 10, gesture = 'jawOpen', clicks = [], lost = 0 } = {}) {
  return { start: 0, end: minutes * 60000, gesture, settings: {}, clicks, lost, pauses: 0, light: { dark: 0, ok: 1, bright: 0 }, distance: { far: 0, ok: 1, near: 0 }, jitterSum: 0, jitterN: 0, early: null };
}
const many = (n, c) => Array.from({ length: n }, () => ({ m: 1, light: 'ok', wrong: false, ...c }));

describe('session recorder', () => {
  it('counts clicks with the light at that moment, and lets the user mark the last one wrong', () => {
    const c = clock();
    const r = createSessionRecorder({ now: c.now, gesture: 'jawOpen', settings: DEFAULT_SETTINGS });
    r.env({ light: 'dark', distance: 'ok' });
    c.advance(60000);
    r.click();
    c.advance(5000);
    expect(r.markWrong()).toBe(true);
    expect(r.markWrong()).toBe(false); // already marked
    const s = r.finish();
    expect(s.clicks).toEqual([{ m: 1, light: 'dark', wrong: true }]);
    expect(s.settings.faceClickOn).toBe(DEFAULT_SETTINGS.faceClickOn);
  });

  it('does not mark a click as wrong long after it happened', () => {
    const c = clock();
    const r = createSessionRecorder({ now: c.now });
    r.click();
    c.advance(LIMITS.wrongWindowMs + 1);
    expect(r.markWrong()).toBe(false);
  });

  it('counts tracking lost once per gap, only after the face is missing for a moment', () => {
    const c = clock();
    const r = createSessionRecorder({ now: c.now });
    r.frame({ face: true, cursor: { x: 0, y: 0 } });
    for (let i = 0; i < 30; i++) {
      c.advance(33);
      r.frame({ face: false });
    }
    c.advance(33);
    r.frame({ face: true, cursor: { x: 0, y: 0 } });
    c.advance(33);
    r.frame({ face: false }); // a one-frame blink of tracking is not counted
    c.advance(33);
    r.frame({ face: true, cursor: { x: 0, y: 0 } });
    expect(r.session.lost).toBe(1);
  });

  it('measures shake from small steps only and snapshots the first 2 minutes', () => {
    const c = clock();
    const r = createSessionRecorder({ now: c.now });
    r.frame({ face: true, cursor: { x: 0, y: 0 } });
    r.frame({ face: true, cursor: { x: 4, y: 3 } }); // 5 px shake
    r.frame({ face: true, cursor: { x: 400, y: 3 } }); // a real head turn, ignored
    expect(r.session.jitterSum / r.session.jitterN).toBe(5);
    expect(r.session.early).toBeNull();
    c.advance(LIMITS.predictAfterMs);
    r.frame({ face: true, cursor: { x: 400, y: 3 } });
    expect(r.session.early).toEqual({ lost: 0, wrong: 0, jitter: 2.5, dark: 0 });
  });

  it('keeps only the newest sessions and drops very short ones', () => {
    let list = [];
    for (let i = 0; i < LIMITS.maxSessions + 5; i++) list = addSession(list, { ...session(), start: i });
    expect(list).toHaveLength(LIMITS.maxSessions);
    expect(list[0].start).toBe(5);
    expect(addSession([], { ...session(), end: 1000 })).toEqual([]);
  });
});

describe('descriptive: what happened', () => {
  it('summarises clicks, wrong clicks and time', () => {
    const d = describeSessions([session({ minutes: 10, clicks: [...many(8), ...many(2, { wrong: true })] })]);
    expect(d).toMatchObject({ sessions: 1, minutes: 10, clicks: 10, wrong: 2, successRate: 80, wrongPer10: 2 });
    expect(d.recent).toHaveLength(1);
  });

  it('has no success rate before any click', () => {
    expect(describeSessions([]).successRate).toBeNull();
  });
});

describe('diagnostic: why', () => {
  it('finds that dark rooms cause more wrong clicks', () => {
    const clicks = [...many(5, { light: 'dark', wrong: true }), ...many(5, { light: 'dark' }), ...many(10, { light: 'ok' })];
    const { findings } = diagnose([session({ clicks })]);
    expect(findings.map((f) => f.factor)).toContain('light');
    expect(findings.find((f) => f.factor === 'light')).toMatchObject({ wrongRate: 50, baseRate: 0 });
  });

  it('finds fatigue after 20 minutes', () => {
    const clicks = [...many(6, { m: 25, wrong: true }), ...many(6, { m: 5 })];
    expect(diagnose([session({ minutes: 30, clicks })]).findings.map((f) => f.factor)).toEqual(['fatigue']);
  });

  it('says nothing when the groups are too small to compare', () => {
    const d = diagnose([session({ clicks: many(3, { light: 'dark', wrong: true }) })]);
    expect(d.findings).toEqual([]);
    expect(d.enough).toBe(false);
  });
});

describe('predictive: risk from the first 2 minutes (decision tree)', () => {
  const at = (early) => ({ early });
  it('waits until there are 2 minutes of data', () => {
    expect(predictRisk({ early: null }).level).toBeNull();
    expect(predictRisk(null).level).toBeNull();
  });
  it('follows the tree from the most serious problem down', () => {
    expect(predictRisk(at({ lost: 5, wrong: 0, jitter: 0, dark: 0 })).level).toBe('high');
    expect(predictRisk(at({ lost: 0, wrong: 2, jitter: 0, dark: 0 })).level).toBe('high');
    expect(predictRisk(at({ lost: 0, wrong: 0, jitter: 0, dark: 0.8 })).level).toBe('medium');
    expect(predictRisk(at({ lost: 0, wrong: 0, jitter: 9, dark: 0 })).level).toBe('medium');
    expect(predictRisk(at({ lost: 0, wrong: 0, jitter: 1, dark: 0 })).level).toBe('low');
  });
});

describe('prescriptive: what to do (user approves)', () => {
  it('suggests a harder mouth click when wrong clicks are frequent, as a patch not an action', () => {
    const settings = { ...DEFAULT_SETTINGS, faceClickGesture: 'jawOpen', faceClickOn: 0.5 };
    const todo = prescribe({ summary: { wrongPer10: 2, lostPer10: 0 }, findings: [], settings });
    const t = todo.find((x) => x.id === 'threshold');
    expect(t.patch).toEqual({ faceClickOn: 0.55, faceClickOff: 0.275 });
    expect(settings.faceClickOn).toBe(0.5); // nothing changed by itself
  });

  it('suggests a longer wink hold for wink users, and light and breaks from the findings', () => {
    const settings = { ...DEFAULT_SETTINGS, faceClickGesture: 'wink', winkHoldMs: 1500 };
    const todo = prescribe({ summary: { wrongPer10: 1, lostPer10: 0 }, findings: [{ factor: 'light' }, { factor: 'fatigue' }], settings });
    expect(todo.map((t) => t.id)).toEqual(['light', 'break', 'hold']);
    expect(todo.find((t) => t.id === 'hold').patch).toEqual({ winkHoldMs: 1750 });
  });

  it('suggests nothing when all is well', () => {
    expect(prescribe({ summary: { wrongPer10: 0, lostPer10: 0 }, findings: [], settings: DEFAULT_SETTINGS })).toEqual([]);
  });
});

describe('export and storage', () => {
  it('exports numbers only as CSV for Pandas or Excel', () => {
    const s = session({ clicks: many(2, { light: 'dark', wrong: true }) });
    expect(sessionsCsv([s]).split('\n')[1]).toMatch(/^1,1970-01-01,10,jawOpen,,,,2,2,0,0,0,0$/);
    expect(clicksCsv([s])).toBe('session,gesture,minute,light,wrong\n1,jawOpen,1,dark,1\n1,jawOpen,1,dark,1');
  });

  it('is off by default, saves, loads and deletes', () => {
    const st = memoryStorage();
    expect(loadStats(st)).toEqual({ optIn: false, sessions: [] });
    saveStats({ optIn: true, sessions: [session()] }, st);
    expect(loadStats(st).sessions).toHaveLength(1);
    clearStats(st);
    expect(loadStats(st).optIn).toBe(false);
  });

  it('ignores broken saved data', () => {
    const st = memoryStorage();
    st.setItem('nohands.stats.v1', '{"optIn":true,"sessions":[{"start":"x"}]}');
    expect(loadStats(st)).toEqual({ optIn: true, sessions: [] });
  });
});
