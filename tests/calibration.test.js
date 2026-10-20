import { describe, it, expect } from 'vitest';
import { createCalibration, CALIBRATION_STEPS } from '../src/input/calibration.js';

const corner = {
  center: { yaw: 0, pitch: 0 },
  topLeft: { yaw: -0.2, pitch: 0.1 },
  topRight: { yaw: 0.2, pitch: 0.1 },
  bottomRight: { yaw: 0.2, pitch: -0.1 },
  bottomLeft: { yaw: -0.2, pitch: -0.1 },
};

function hold(cal, pose, fromT, ms) {
  let r;
  for (let t = fromT; t <= fromT + ms; t += 33) r = cal.feed(pose, t);
  return r;
}

describe('5-point calibration', () => {
  it('records all five points and builds a range', () => {
    const cal = createCalibration({ holdMs: 1000 });
    let t = 0;
    let r;
    for (const s of CALIBRATION_STEPS) {
      r = hold(cal, corner[s.id], t, 1100);
      t += 1200;
    }
    expect(r.done).toBe(true);
    expect(r.failed).toBe(false);
    expect(r.range.left).toBeCloseTo(-0.2);
    expect(r.range.up).toBeCloseTo(0.1);
  });

  it('does not record a corner while the head is still at the centre', () => {
    const cal = createCalibration({ holdMs: 1000 });
    hold(cal, corner.center, 0, 1100);
    const r = hold(cal, corner.center, 1200, 3000);
    expect(r.waitingForMove).toBe(true);
    expect(cal.step.id).toBe('topLeft');
  });

  it('restarts the hold timer when the head moves', () => {
    const cal = createCalibration({ holdMs: 1000 });
    hold(cal, corner.center, 0, 600);
    const r = cal.feed({ yaw: 0.05, pitch: 0 }, 700);
    expect(r.progress).toBe(0);
  });

  it('losing the face resets the current point', () => {
    const cal = createCalibration({ holdMs: 1000 });
    hold(cal, corner.center, 0, 600);
    expect(cal.feed(null, 700).progress).toBe(0);
  });
});
