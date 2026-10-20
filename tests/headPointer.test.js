import { describe, it, expect } from 'vitest';
import {
  headPoseFromLandmarks,
  poseToScreen,
  rangeFromCalibration,
  rangeAroundCenter,
  averagePose,
  DEFAULT_RANGE,
  LM,
} from '../src/input/headPointer.js';

// Build a fake 478-point face. cx, cy = face centre (raw camera coords), w = face width.
function fakeFace({ cx = 0.5, cy = 0.5, w = 0.2, h = 0.28, noseDx = 0, noseDy = 0 } = {}) {
  const lms = Array.from({ length: 478 }, () => ({ x: cx, y: cy, z: 0 }));
  lms[LM.FACE_LEFT] = { x: cx + w / 2, y: cy, z: 0 }; // 234 is on the image right in raw camera coords
  lms[LM.FACE_RIGHT] = { x: cx - w / 2, y: cy, z: 0 };
  lms[LM.FOREHEAD] = { x: cx, y: cy - h / 2, z: 0 };
  lms[LM.CHIN] = { x: cx, y: cy + h / 2, z: 0 };
  lms[LM.NOSE_TIP] = { x: cx + noseDx, y: cy + noseDy, z: 0 };
  return lms;
}
const screen = { width: 1000, height: 800 };

describe('headPoseFromLandmarks', () => {
  it('is ~0 when looking straight ahead', () => {
    const p = headPoseFromLandmarks(fakeFace(), 1);
    expect(p.yaw).toBeCloseTo(0);
    expect(p.pitch).toBeCloseTo(0);
  });

  it('turning to my right (nose moves to image LEFT in the raw camera) gives yaw > 0', () => {
    const p = headPoseFromLandmarks(fakeFace({ noseDx: -0.03 }), 1);
    expect(p.yaw).toBeGreaterThan(0);
  });

  it('looking up (nose moves up) gives pitch > 0', () => {
    expect(headPoseFromLandmarks(fakeFace({ noseDy: -0.03 }), 1).pitch).toBeGreaterThan(0);
  });

  it('is scale-invariant: moving closer to the camera does not change the pose', () => {
    const far = headPoseFromLandmarks(fakeFace({ w: 0.15, h: 0.21, noseDx: -0.015, noseDy: -0.01 }), 16 / 9);
    const near = headPoseFromLandmarks(fakeFace({ w: 0.3, h: 0.42, noseDx: -0.03, noseDy: -0.02 }), 16 / 9);
    expect(near.yaw).toBeCloseTo(far.yaw, 6);
    expect(near.pitch).toBeCloseTo(far.pitch, 6);
  });

  it('returns null without enough landmarks', () => {
    expect(headPoseFromLandmarks([], 1)).toBeNull();
  });
});

describe('range mapping', () => {
  const range = { center: { yaw: 0, pitch: 0 }, left: -0.2, right: 0.2, up: 0.1, down: -0.1 };

  it('maps the centre pose to the screen centre', () => {
    expect(poseToScreen({ yaw: 0, pitch: 0 }, range, screen)).toEqual({ x: 500, y: 400 });
  });

  it('maps calibrated corners to screen corners, right turn -> right side', () => {
    expect(poseToScreen({ yaw: 0.2, pitch: 0.1 }, range, screen)).toEqual({ x: 1000, y: 0 });
    expect(poseToScreen({ yaw: -0.2, pitch: -0.1 }, range, screen)).toEqual({ x: 0, y: 800 });
  });

  it('clamps beyond the range', () => {
    expect(poseToScreen({ yaw: 0.9, pitch: -0.9 }, range, screen)).toEqual({ x: 1000, y: 800 });
  });

  it('handles an asymmetric comfortable range', () => {
    const r = { ...range, left: -0.1 }; // the user can turn left less
    expect(poseToScreen({ yaw: -0.05, pitch: 0 }, r, screen).x).toBeCloseTo(250);
  });

  it('builds a range from 5 calibration points', () => {
    const r = rangeFromCalibration({
      center: { yaw: 0.01, pitch: 0.02 },
      topLeft: { yaw: -0.2, pitch: 0.12 },
      topRight: { yaw: 0.22, pitch: 0.1 },
      bottomLeft: { yaw: -0.18, pitch: -0.08 },
      bottomRight: { yaw: 0.2, pitch: -0.1 },
    });
    expect(r.left).toBeCloseTo(-0.19);
    expect(r.right).toBeCloseTo(0.21);
    expect(r.up).toBeCloseTo(0.11);
    expect(r.down).toBeCloseTo(-0.09);
  });

  it('rejects a calibration where the user did not move', () => {
    const still = { yaw: 0, pitch: 0 };
    expect(rangeFromCalibration({ center: still, topLeft: still, topRight: still, bottomLeft: still, bottomRight: still })).toBeNull();
  });

  it('recentres the default range and averages poses', () => {
    const c = averagePose([{ yaw: 0.1, pitch: 0 }, { yaw: 0.3, pitch: 0.2 }]);
    expect(c).toEqual({ yaw: 0.2, pitch: 0.1 });
    const r = rangeAroundCenter(c);
    expect(r.right - r.center.yaw).toBeCloseTo(DEFAULT_RANGE.right);
  });
});

import { scaleRange } from '../src/input/headPointer.js';
describe('cursor speed', () => {
  it('lower speed needs a bigger head turn for the same movement', () => {
    const r = { center: { yaw: 0, pitch: 0 }, left: -0.2, right: 0.2, up: 0.1, down: -0.1 };
    const slow = scaleRange(r, 0.5);
    expect(slow.right).toBeCloseTo(0.4);
    expect(poseToScreen({ yaw: 0.2, pitch: 0 }, slow, { width: 1000, height: 800 }).x).toBeCloseTo(750);
    expect(scaleRange(r, 1)).toEqual(r);
  });
});
