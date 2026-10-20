// Head pose -> screen position.
//
// Choice: I use the nose tip's position relative to the face box, not the
// facial transformation matrix. Why: it needs only 5 landmarks, is easy to
// explain, and is scale-invariant because the offset is divided by face size.
// When the head turns, the nose tip (the most forward point of the face)
// moves further than the face edges, so the offset grows with the turn.

import { mirrorX, aspectDistance } from './screenMapping.js';

export const LM = Object.freeze({
  NOSE_TIP: 1,
  FOREHEAD: 10,
  CHIN: 152,
  FACE_LEFT: 234,
  FACE_RIGHT: 454,
});

/**
 * @param landmarks array of {x,y,z} normalized landmarks (raw camera image)
 * @param aspect videoWidth / videoHeight
 * @returns {{yaw:number, pitch:number, faceWidth:number}|null}
 *   yaw > 0 when the user turns to THEIR right (cursor should move right),
 *   pitch > 0 when the user looks up.
 */
export function headPoseFromLandmarks(landmarks, aspect) {
  if (!landmarks || landmarks.length < 455) return null;
  const m = (i) => ({ x: mirrorX(landmarks[i].x) * aspect, y: landmarks[i].y });
  const nose = m(LM.NOSE_TIP);
  const left = m(LM.FACE_LEFT);
  const right = m(LM.FACE_RIGHT);
  const top = m(LM.FOREHEAD);
  const chin = m(LM.CHIN);

  const faceWidth = Math.hypot(right.x - left.x, right.y - left.y);
  const faceHeight = Math.hypot(chin.x - top.x, chin.y - top.y);
  if (faceWidth < 1e-6 || faceHeight < 1e-6) return null;

  const cx = (left.x + right.x) / 2;
  const cy = (top.y + chin.y) / 2;
  return {
    yaw: (nose.x - cx) / faceWidth,
    pitch: (cy - nose.y) / faceHeight,
    faceWidth: aspectDistance(landmarks[LM.FACE_LEFT], landmarks[LM.FACE_RIGHT], aspect),
  };
}

// Used until the user does the 5-point calibration. `center` is filled in
// automatically from the first second of tracking.
export const DEFAULT_RANGE = Object.freeze({
  center: { yaw: 0, pitch: 0 },
  left: -0.18,
  right: 0.18,
  up: 0.12,
  down: -0.12,
});

/**
 * Build a range from 5 calibration samples (each {yaw, pitch}).
 * Corners are averaged per side, so a slightly crooked corner still works.
 */
export function rangeFromCalibration({ center, topLeft, topRight, bottomLeft, bottomRight }) {
  const range = {
    center: { yaw: center.yaw, pitch: center.pitch },
    left: (topLeft.yaw + bottomLeft.yaw) / 2,
    right: (topRight.yaw + bottomRight.yaw) / 2,
    up: (topLeft.pitch + topRight.pitch) / 2,
    down: (bottomLeft.pitch + bottomRight.pitch) / 2,
  };
  return validateRange(range) ? range : null;
}

const MIN_SPAN = 0.02; // a side smaller than this means the user barely moved

export function validateRange(r) {
  return (
    r.right - r.center.yaw > MIN_SPAN &&
    r.center.yaw - r.left > MIN_SPAN &&
    r.up - r.center.pitch > MIN_SPAN &&
    r.center.pitch - r.down > MIN_SPAN
  );
}

function side(value, center, lo, hi) {
  // returns 0..1 where center -> 0.5, lo -> 0, hi -> 1 (clamped)
  const t = value >= center ? 0.5 + (0.5 * (value - center)) / (hi - center) : 0.5 - (0.5 * (center - value)) / (center - lo);
  return Math.min(1, Math.max(0, t));
}

/** Map a pose to screen pixels using the user's comfortable range. */
export function poseToScreen(pose, range, screen) {
  const nx = side(pose.yaw, range.center.yaw, range.left, range.right);
  // pitch: up is positive, but screen y grows downward
  const ny = 1 - side(pose.pitch, range.center.pitch, range.down, range.up);
  return { x: nx * screen.width, y: ny * screen.height };
}

/**
 * Cursor speed: 1 = the range reaches the screen edges; 0.5 = I must turn my
 * head twice as far for the same cursor movement (less sensitive).
 */
export function scaleRange(r, speed = 1) {
  const k = 1 / Math.max(0.1, speed);
  const c = r.center;
  return { center: c, left: c.yaw - (c.yaw - r.left) * k, right: c.yaw + (r.right - c.yaw) * k, up: c.pitch + (r.up - c.pitch) * k, down: c.pitch - (c.pitch - r.down) * k };
}

/** Recenter the default range around the user's resting pose. */
export function rangeAroundCenter(center, base = DEFAULT_RANGE) {
  const dx = center.yaw - base.center.yaw;
  const dy = center.pitch - base.center.pitch;
  return {
    center: { ...center },
    left: base.left + dx,
    right: base.right + dx,
    up: base.up + dy,
    down: base.down + dy,
  };
}

/** Average a list of poses (used to collect a calibration point). */
export function averagePose(poses) {
  if (!poses.length) return null;
  const s = poses.reduce((a, p) => ({ yaw: a.yaw + p.yaw, pitch: a.pitch + p.pitch }), { yaw: 0, pitch: 0 });
  return { yaw: s.yaw / poses.length, pitch: s.pitch / poses.length };
}
