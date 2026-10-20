// Dwell click: hold the cursor still over a clickable target for `dwellMs`.
//
// `armed` is decided by the caller (true only when the cursor is over
// something clickable), so resting the head on empty space never clicks.
// After ANY click (dwell or another signal), the cursor must first move out
// of the radius before the next dwell can start. This matters when a click
// changes the screen: a new button that appears under a resting cursor must
// not be clicked by accident.

export function createDwell({ dwellMs = 1200, radiusPx = 40 } = {}) {
  let anchor = null; // {x, y, t, key}
  let leaveFrom = null; // {x, y} while waiting for the cursor to move away

  return {
    /**
     * @param p {x, y} cursor position in px
     * @param t time in ms
     * @param armed whether the cursor is over a clickable target
     * @param key identity of the target (e.g. element id), optional
     * @returns {{progress:number, fired:boolean}}
     */
    update(p, t, armed, key = null) {
      if (!p) {
        anchor = null;
        return { progress: 0, fired: false };
      }
      if (leaveFrom) {
        if (Math.hypot(p.x - leaveFrom.x, p.y - leaveFrom.y) <= radiusPx) {
          anchor = null;
          return { progress: 0, fired: false };
        }
        leaveFrom = null;
      }
      if (!armed) {
        anchor = null;
        return { progress: 0, fired: false };
      }
      const moved = anchor && Math.hypot(p.x - anchor.x, p.y - anchor.y) > radiusPx;
      const changed = anchor && anchor.key !== key;
      if (!anchor || moved || changed) {
        anchor = { x: p.x, y: p.y, t, key };
        return { progress: 0, fired: false };
      }
      const progress = Math.min(1, (t - anchor.t) / dwellMs);
      if (progress >= 1) {
        leaveFrom = { x: p.x, y: p.y };
        anchor = null;
        return { progress: 1, fired: true };
      }
      return { progress, fired: false };
    },
    /** Call after a click from any source: dwell waits until the cursor moves away. */
    requireLeave(p) {
      if (p) leaveFrom = { x: p.x, y: p.y };
      anchor = null;
    },
    reset() {
      anchor = null;
      leaveFrom = null;
    },
    configure(opts) {
      if (opts.dwellMs) dwellMs = opts.dwellMs;
      if (opts.radiusPx) radiusPx = opts.radiusPx;
    },
  };
}
