// Turning a noisy per-frame signal (e.g. the jawOpen blendshape, 0..1) into
// clean, single clicks.
//
// The rules (all from real webcam demos):
// - Debounce: the signal must be above `on` for `confirmFrames` frames in a
//   row AND for at least `minHoldMs` before a click fires.
// - Hysteresis: after a click, the signal must fall below the lower `off`
//   threshold for `releaseFrames` frames before another click can start.
// - Refractory: at least `refractoryMs` between two clicks.
// - Tracking-loss grace: `null` means the face was not found this frame.
//   A short loss (< graceMs) while confirming keeps the progress; a longer
//   loss cancels it. A loss after a click is NEVER treated as a release:
//   only real low frames release. This is stricter than strictly needed,
//   but it is what stops the "tracking blinked -> double click" bug.

export const TRIGGER_STATE = Object.freeze({ IDLE: 'idle', CONFIRMING: 'confirming', LATCHED: 'latched' });

export function createTrigger(opts = {}) {
  const cfg = {
    on: 0.5,
    off: 0.25,
    confirmFrames: 4,
    releaseFrames: 10,
    minHoldMs: 120,
    refractoryMs: 600,
    graceMs: 600,
    ...opts,
  };
  let state = TRIGGER_STATE.IDLE;
  let highCount = 0;
  let highSince = 0;
  let lowCount = 0;
  let lostSince = null;
  let lastFire = -Infinity;
  let lastT = 0;

  function toIdle() {
    state = TRIGGER_STATE.IDLE;
    highCount = 0;
    lowCount = 0;
  }

  return {
    /**
     * @param value number 0..1, or null when tracking is lost
     * @param t timestamp in ms
     * @returns {{state:string, fired:boolean, progress:number}}
     */
    update(value, t) {
      let fired = false;
      lastT = t;

      if (value === null || value === undefined || Number.isNaN(value)) {
        if (lostSince === null) lostSince = t;
        if (state === TRIGGER_STATE.CONFIRMING && t - lostSince > cfg.graceMs) toIdle();
        return { state, fired, progress: progressOf() };
      }
      lostSince = null;

      if (state === TRIGGER_STATE.LATCHED) {
        if (value < cfg.off) {
          lowCount += 1;
          if (lowCount >= cfg.releaseFrames) toIdle();
        } else {
          lowCount = 0;
        }
        return { state, fired, progress: progressOf() };
      }

      if (value >= cfg.on) {
        if (state === TRIGGER_STATE.IDLE) {
          state = TRIGGER_STATE.CONFIRMING;
          highCount = 0;
          highSince = t;
        }
        highCount += 1;
        const longEnough = highCount >= cfg.confirmFrames && t - highSince >= cfg.minHoldMs;
        if (longEnough && t - lastFire >= cfg.refractoryMs) {
          fired = true;
          lastFire = t;
          state = TRIGGER_STATE.LATCHED;
          lowCount = 0;
        }
      } else if (state === TRIGGER_STATE.CONFIRMING) {
        toIdle();
      }
      return { state, fired, progress: progressOf() };
    },
    reset() {
      toIdle();
      lostSince = null;
    },
    configure(next) {
      Object.assign(cfg, next);
    },
    get state() {
      return state;
    },
  };

  function progressOf() {
    if (state === TRIGGER_STATE.LATCHED) return 1;
    if (state === TRIGGER_STATE.CONFIRMING) {
      // both the frame count and the hold time must be reached
      const byFrames = highCount / cfg.confirmFrames;
      const byTime = cfg.minHoldMs > 0 ? (lastT - highSince) / cfg.minHoldMs : 1;
      return Math.min(1, byFrames, byTime);
    }
    return 0;
  }
}

/** Read one blendshape score from a {name: score} map. */
export function blendshapeValue(blendshapes, name) {
  if (!blendshapes) return null;
  const v = blendshapes[name];
  return typeof v === 'number' ? v : null;
}

/** Both eyes closed score: the smaller of the two blink scores. */
export function eyesClosedValue(blendshapes) {
  if (!blendshapes) return null;
  const l = blendshapes.eyeBlinkLeft;
  const r = blendshapes.eyeBlinkRight;
  if (typeof l !== 'number' || typeof r !== 'number') return null;
  return Math.min(l, r);
}

/**
 * One-eye wink signals for the user's left and right eye.
 * A wink = one eye clearly closed while the other stays open. A normal blink
 * closes both eyes, so it never counts as a wink.
 * MediaPipe names the blendshapes from the face's point of view; `swap`
 * flips them if a camera reports them the other way round.
 * @returns {{left: 0|1|null, right: 0|1|null}} null when the face is not tracked
 */
export function winkValues(blendshapes, { closed = 0.5, open = 0.3, swap = false } = {}) {
  if (!blendshapes) return { left: null, right: null };
  let l = blendshapes.eyeBlinkLeft;
  let r = blendshapes.eyeBlinkRight;
  if (typeof l !== 'number' || typeof r !== 'number') return { left: null, right: null };
  if (swap) [l, r] = [r, l];
  return {
    left: l >= closed && r <= open ? 1 : 0,
    right: r >= closed && l <= open ? 1 : 0,
  };
}

/**
 * Fires once when `active` stays true for `holdMs` (with tracking-loss grace).
 * Used for "eyes closed 2 s = pause" and "open palm 1.5 s = pause".
 * Must become inactive for `releaseFrames` frames before it can fire again.
 */
export function createHoldDetector({ holdMs = 2000, graceMs = 300, releaseFrames = 5 } = {}) {
  let since = null;
  let lostSince = null;
  let latched = false;
  let lowCount = 0;
  return {
    update(active, t) {
      if (active === null || active === undefined) {
        if (lostSince === null) lostSince = t;
        if (since !== null && t - lostSince > graceMs) since = null;
        return { fired: false, progress: since === null || latched ? 0 : Math.min(1, (t - since) / holdMs) };
      }
      lostSince = null;
      if (latched) {
        lowCount = active ? 0 : lowCount + 1;
        if (lowCount >= releaseFrames) {
          latched = false;
          since = null;
        }
        return { fired: false, progress: 0 };
      }
      if (!active) {
        since = null;
        return { fired: false, progress: 0 };
      }
      if (since === null) since = t;
      const progress = Math.min(1, (t - since) / holdMs);
      if (progress >= 1) {
        latched = true;
        lowCount = 0;
        return { fired: true, progress: 1 };
      }
      return { fired: false, progress };
    },
    reset() {
      since = null;
      lostSince = null;
      latched = false;
      lowCount = 0;
    },
    configure(next) {
      if (next.holdMs) holdMs = next.holdMs;
    },
  };
}
