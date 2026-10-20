import { describe, it, expect } from 'vitest';
import { createDwell } from '../src/input/dwell.js';

function run(dwell, points, armed = true, key = 'btn') {
  const out = [];
  for (const [x, y, t] of points) out.push(dwell.update({ x, y }, t, armed, key));
  return out;
}

describe('dwell', () => {
  it('fires once after holding still for dwellMs', () => {
    const d = createDwell({ dwellMs: 1000, radiusPx: 30 });
    const pts = Array.from({ length: 50 }, (_, i) => [100 + (i % 3), 100, i * 33]);
    const res = run(d, pts);
    expect(res.filter((r) => r.fired).length).toBe(1);
    const firedAt = res.findIndex((r) => r.fired);
    expect(pts[firedAt][2]).toBeGreaterThanOrEqual(1000);
  });

  it('does not fire when not over a clickable target', () => {
    const d = createDwell({ dwellMs: 500 });
    const res = run(d, Array.from({ length: 40 }, (_, i) => [10, 10, i * 33]), false);
    expect(res.some((r) => r.fired)).toBe(false);
  });

  it('restarts when the cursor leaves the radius', () => {
    const d = createDwell({ dwellMs: 1000, radiusPx: 30 });
    run(d, [[100, 100, 0], [100, 100, 800]]);
    const [r] = run(d, [[200, 100, 900]]);
    expect(r.progress).toBe(0);
    const [r2] = run(d, [[200, 100, 1500]]);
    expect(r2.progress).toBeCloseTo(0.6);
  });

  it('needs the cursor to move away before firing again', () => {
    const d = createDwell({ dwellMs: 500, radiusPx: 30 });
    const res = run(d, Array.from({ length: 100 }, (_, i) => [100, 100, i * 33]));
    expect(res.filter((r) => r.fired).length).toBe(1);
    run(d, [[300, 300, 3400]]); // leave
    const again = run(d, Array.from({ length: 20 }, (_, i) => [300, 300, 3500 + i * 33]));
    expect(again.filter((r) => r.fired).length).toBe(1);
  });

  it('restarts when the target changes', () => {
    const d = createDwell({ dwellMs: 1000 });
    run(d, [[100, 100, 0], [100, 100, 900]], true, 'a');
    const [r] = run(d, [[100, 100, 950]], true, 'b');
    expect(r.progress).toBe(0);
  });
});

describe('dwell after a click', () => {
  it('a new target appearing under a resting cursor is not clicked', () => {
    const d = createDwell({ dwellMs: 500, radiusPx: 30 });
    const first = run(d, Array.from({ length: 20 }, (_, i) => [100, 100, i * 33]), true, 'next');
    expect(first.filter((r) => r.fired)).toHaveLength(1);
    // the screen changes: a different button is now under the cursor
    const after = run(d, Array.from({ length: 60 }, (_, i) => [100 + (i % 3), 100, 700 + i * 33]), true, 'calibrate');
    expect(after.some((r) => r.fired)).toBe(false);
  });

  it('requireLeave (click from another signal) blocks dwell until the cursor moves away', () => {
    const d = createDwell({ dwellMs: 500, radiusPx: 30 });
    d.requireLeave({ x: 100, y: 100 });
    expect(run(d, Array.from({ length: 40 }, (_, i) => [100, 100, i * 33])).some((r) => r.fired)).toBe(false);
    const moved = run(d, Array.from({ length: 30 }, (_, i) => [200, 100, 2000 + i * 33]));
    expect(moved.filter((r) => r.fired)).toHaveLength(1);
  });
});
