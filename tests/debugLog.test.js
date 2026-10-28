import { describe, it, expect } from 'vitest';
import { createDebugLog, buildDebugReport } from '../src/core/debugLog.js';
import { DEFAULT_SETTINGS } from '../src/core/settings.js';

describe('debug log', () => {
  it('keeps only the newest events', () => {
    let t = 0;
    const log = createDebugLog({ max: 3, now: () => t++ });
    for (const n of [1, 2, 3, 4, 5]) log.add('click', `#${n}`);
    expect(log.events.map((e) => e.detail)).toEqual(['#3', '#4', '#5']);
  });

  it('cuts long details and can be cleared', () => {
    const log = createDebugLog();
    log.add('error', 'x'.repeat(500));
    expect(log.events[0].detail).toHaveLength(200);
    log.clear();
    expect(log.events).toEqual([]);
  });

  it('returns a copy, so callers cannot change the log', () => {
    const log = createDebugLog();
    log.add('paused');
    log.events.push({ t: 0, type: 'fake' });
    expect(log.events).toHaveLength(1);
  });
});

describe('debug report', () => {
  const base = {
    version: '0.3.0',
    settings: DEFAULT_SETTINGS,
    status: { state: 'ACTIVE', camera: 'on' },
    env: { userAgent: 'TestBrowser', screen: '1920x1080' },
    events: [{ t: 9000, type: 'click', detail: 'wink' }],
    now: 10000,
  };

  it('lists version, status, settings and events with their age', () => {
    const r = buildDebugReport(base);
    expect(r).toContain('Version: 0.3.0 (web)');
    expect(r).toContain('state: ACTIVE');
    expect(r).toContain(`faceClickGesture: ${DEFAULT_SETTINGS.faceClickGesture}`);
    expect(r).toContain('-1.0s  click  wink');
  });

  it('never includes face data, even if it is passed by mistake', () => {
    const r = buildDebugReport({
      ...base,
      settings: { ...DEFAULT_SETTINGS, landmarks: [{ x: 0.1 }], blendshapes: { jawOpen: 0.9 } },
    });
    expect(r).not.toContain('landmarks');
    expect(r).not.toContain('jawOpen: 0.9');
    expect(r).toContain('No camera images or face data are included.');
  });
});
