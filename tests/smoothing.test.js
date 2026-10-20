import { describe, it, expect } from 'vitest';
import { createEma, createOneEuro, createPointSmoother, strengthToMinCutoff } from '../src/input/smoothing.js';

describe('EMA', () => {
  it('moves part of the way toward the new value', () => {
    const f = createEma(0.5);
    expect(f.filter(0)).toBe(0);
    expect(f.filter(10)).toBe(5);
    expect(f.filter(10)).toBe(7.5);
  });
});

describe('One Euro', () => {
  it('reduces small tremor around a still point', () => {
    const f = createOneEuro({ minCutoff: 1, beta: 0.005 });
    let maxDev = 0;
    for (let i = 0; i < 120; i++) {
      const raw = 500 + (i % 2 === 0 ? 6 : -6); // +-6 px tremor at 30 fps
      const out = f.filter(raw, i * 33);
      if (i > 10) maxDev = Math.max(maxDev, Math.abs(out - 500));
    }
    expect(maxDev).toBeLessThan(3);
  });

  it('follows a big fast move quickly', () => {
    const f = createOneEuro({ minCutoff: 1, beta: 0.005 });
    for (let i = 0; i < 30; i++) f.filter(0, i * 33);
    let out = 0;
    for (let i = 30; i < 45; i++) out = f.filter(800, i * 33); // 0.5 s after the jump
    expect(out).toBeGreaterThan(700);
  });

  it('stronger smoothing = lower cutoff', () => {
    expect(strengthToMinCutoff(1)).toBeLessThan(strengthToMinCutoff(0));
  });

  it('point smoother filters x and y', () => {
    const s = createPointSmoother(0.5);
    expect(s.filter({ x: 1, y: 2 }, 0)).toEqual({ x: 1, y: 2 });
    const p = s.filter({ x: 101, y: 2 }, 33);
    expect(p.x).toBeGreaterThan(1);
    expect(p.x).toBeLessThan(101);
  });
});
