// Cursor smoothing to reduce small involuntary movement (tremor).
//
// Trade-off:
// - EMA (exponential moving average) is simple: new = a*raw + (1-a)*old.
//   A small `a` hides tremor but makes the cursor lag behind big moves.
// - One Euro filter changes `a` with speed: when the head is still (tremor,
//   aiming at a target) it smooths strongly; when the head moves fast it
//   follows quickly. That is why I use One Euro as the default.

export function createEma(alpha = 0.45) {
  let value = null;
  return {
    filter(x) {
      value = value === null ? x : alpha * x + (1 - alpha) * value;
      return value;
    },
    reset() {
      value = null;
    },
  };
}

function smoothingFactor(dtSec, cutoffHz) {
  const r = 2 * Math.PI * cutoffHz * dtSec;
  return r / (r + 1);
}

/** One Euro filter for one number. t is in milliseconds. */
export function createOneEuro({ minCutoff = 1.0, beta = 0.005, dCutoff = 1.0 } = {}) {
  let prevX = null;
  let prevDx = 0;
  let prevT = null;
  return {
    filter(x, t) {
      if (prevX === null || prevT === null || t <= prevT) {
        prevX = x;
        prevT = t;
        prevDx = 0;
        return x;
      }
      const dt = (t - prevT) / 1000;
      const dx = (x - prevX) / dt;
      const aD = smoothingFactor(dt, dCutoff);
      const dxHat = aD * dx + (1 - aD) * prevDx;
      const cutoff = minCutoff + beta * Math.abs(dxHat);
      const a = smoothingFactor(dt, cutoff);
      const xHat = a * x + (1 - a) * prevX;
      prevX = xHat;
      prevDx = dxHat;
      prevT = t;
      return xHat;
    },
    reset() {
      prevX = null;
      prevT = null;
      prevDx = 0;
    },
  };
}

/** strength 0..1 (user setting) -> One Euro min cutoff in Hz. */
export function strengthToMinCutoff(strength) {
  const s = Math.min(1, Math.max(0, strength));
  // 0 -> 4 Hz (light smoothing), 1 -> 0.2 Hz (heavy smoothing)
  return 4 * Math.pow(0.05, s);
}

/** 2D point smoother built from two One Euro filters. */
export function createPointSmoother(strength = 0.5) {
  const opts = { minCutoff: strengthToMinCutoff(strength), beta: 0.005 };
  let fx = createOneEuro(opts);
  let fy = createOneEuro(opts);
  return {
    filter(p, t) {
      return { x: fx.filter(p.x, t), y: fy.filter(p.y, t) };
    },
    setStrength(s) {
      const o = { minCutoff: strengthToMinCutoff(s), beta: 0.005 };
      fx = createOneEuro(o);
      fy = createOneEuro(o);
    },
    reset() {
      fx.reset();
      fy.reset();
    },
  };
}
