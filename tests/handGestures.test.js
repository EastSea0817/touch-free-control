import { describe, it, expect } from 'vitest';
import { handOpenness, classifyHand, palmSize } from '../src/input/handGestures.js';

// fake 21-point hand: wrist at (cx, cy), palm length p, fingers extended by `ext` palms
function fakeHand({ cx = 0.5, cy = 0.7, p = 0.1, ext = 2 } = {}) {
  const lms = Array.from({ length: 21 }, () => ({ x: cx, y: cy, z: 0 }));
  lms[9] = { x: cx, y: cy - p, z: 0 };
  for (const i of [8, 12, 16, 20]) lms[i] = { x: cx, y: cy - p * ext, z: 0 };
  return lms;
}

describe('hand gestures', () => {
  it('openness is measured in palms and does not depend on distance', () => {
    expect(handOpenness(fakeHand({ p: 0.05, ext: 2 }), 1)).toBeCloseTo(2);
    expect(handOpenness(fakeHand({ p: 0.2, ext: 2 }), 1)).toBeCloseTo(2);
    expect(palmSize(fakeHand({ p: 0.2 }), 1)).toBeCloseTo(0.2);
  });

  it('needs the recognizer AND my openness check to agree', () => {
    const fist = fakeHand({ ext: 1 });
    const open = fakeHand({ ext: 2 });
    expect(classifyHand({ gestureName: 'Closed_Fist', gestureScore: 0.9, landmarks: fist, aspect: 1 })).toBe('fist');
    expect(classifyHand({ gestureName: 'Closed_Fist', gestureScore: 0.9, landmarks: open, aspect: 1 })).toBe('none');
    expect(classifyHand({ gestureName: 'Open_Palm', gestureScore: 0.9, landmarks: open, aspect: 1 })).toBe('palm');
    expect(classifyHand({ gestureName: 'Open_Palm', gestureScore: 0.3, landmarks: open, aspect: 1 })).toBe('none');
    expect(classifyHand({ gestureName: 'Open_Palm', gestureScore: 0.9, landmarks: null, aspect: 1 })).toBeNull();
  });
});
