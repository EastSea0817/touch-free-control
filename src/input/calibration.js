// 5-point head range calibration (centre + four corners), no clicks needed.
// For each point the user turns their head toward the dot and holds still.
// A corner is only recorded after the head has clearly moved in that
// direction, so resting at the centre can never be saved as a corner.

import { averagePose, rangeFromCalibration } from './headPointer.js';

export const CALIBRATION_STEPS = Object.freeze([
  { id: 'center', label: 'the centre', dir: { x: 0, y: 0 }, screen: { x: 0.5, y: 0.5 } },
  { id: 'topLeft', label: 'the top-left corner', dir: { x: -1, y: 1 }, screen: { x: 0.08, y: 0.1 } },
  { id: 'topRight', label: 'the top-right corner', dir: { x: 1, y: 1 }, screen: { x: 0.92, y: 0.1 } },
  { id: 'bottomRight', label: 'the bottom-right corner', dir: { x: 1, y: -1 }, screen: { x: 0.92, y: 0.9 } },
  { id: 'bottomLeft', label: 'the bottom-left corner', dir: { x: -1, y: -1 }, screen: { x: 0.08, y: 0.9 } },
]);

export function createCalibration({ holdMs = 1000, stillTolerance = 0.015, minMoveYaw = 0.03, minMovePitch = 0.02 } = {}) {
  let step = 0;
  let samples = []; // {pose, t}
  const result = {};
  let done = false;
  let failed = false;

  function movedEnough(pose, dir) {
    if (dir.x === 0 && dir.y === 0) return true;
    const c = result.center;
    const okX = dir.x < 0 ? pose.yaw < c.yaw - minMoveYaw : pose.yaw > c.yaw + minMoveYaw;
    const okY = dir.y > 0 ? pose.pitch > c.pitch + minMovePitch : pose.pitch < c.pitch - minMovePitch;
    return okX && okY;
  }

  return {
    get step() {
      return CALIBRATION_STEPS[step] ?? null;
    },
    get stepIndex() {
      return step;
    },
    /**
     * @param pose {yaw, pitch} or null (no face)
     * @returns {{done, failed, progress, step, range?, waitingForMove}}
     */
    feed(pose, t) {
      if (done) return { done, failed, progress: 1, step: null, range: result.range ?? null };
      const s = CALIBRATION_STEPS[step];
      if (!pose) {
        samples = [];
        return { done, failed, progress: 0, step: s, waitingForMove: false };
      }
      if (!movedEnough(pose, s.dir)) {
        samples = [];
        return { done, failed, progress: 0, step: s, waitingForMove: true };
      }
      // keep only samples close to the current pose (holding still)
      samples = samples.filter((x) => Math.abs(x.pose.yaw - pose.yaw) < stillTolerance && Math.abs(x.pose.pitch - pose.pitch) < stillTolerance);
      samples.push({ pose, t });
      const progress = Math.min(1, (t - samples[0].t) / holdMs);
      if (progress >= 1) {
        result[s.id] = averagePose(samples.map((x) => x.pose));
        samples = [];
        step += 1;
        if (step >= CALIBRATION_STEPS.length) {
          done = true;
          result.range = rangeFromCalibration(result);
          failed = !result.range;
          return { done, failed, progress: 1, step: null, range: result.range };
        }
        return { done, failed, progress: 0, step: CALIBRATION_STEPS[step], waitingForMove: true };
      }
      return { done, failed, progress, step: s, waitingForMove: false };
    },
  };
}
