// Decides where the REAL mouse goes on each frame (desktop app only). Pure.
//
// Click lock: while a click gesture is being held (wink, mouth, eyebrows), the
// face moves a little, which used to drag the cursor off the target
// (the main problem I found when testing Google Gameface). So as soon as a
// click gesture starts, the real cursor stays where it was until the gesture
// ends, and the click lands on that locked point.
// Paused: the cursor stays still so the user can rest their neck.

export function createCursorGate({ lockOn = 0.05, minMovePx = 1 } = {}) {
  let locked = null; // {x, y} while a gesture is held
  let last = null; // last position sent to the OS

  return {
    get locked() {
      return locked ? { ...locked } : null;
    },
    /**
     * @param cursor engine cursor {x, y}
     * @param clickProgress 0..1 progress of the click gesture (engine progress.face)
     * @param paused true while the controller is PAUSED
     * @returns {{move: {x,y}|null, clickAt: {x,y}}} move = null means "do not move the OS cursor"
     */
    update(cursor, clickProgress, paused) {
      const target = { x: Math.round(cursor.x), y: Math.round(cursor.y) };
      if (clickProgress >= lockOn && !paused) {
        if (!locked) locked = last ?? target;
      } else {
        locked = null;
      }
      const hold = locked || paused;
      const point = hold ? last ?? target : target;
      let move = null;
      if (!hold && (!last || Math.abs(point.x - last.x) >= minMovePx || Math.abs(point.y - last.y) >= minMovePx)) {
        move = point;
        last = point;
      }
      if (!last) last = point;
      return { move, clickAt: locked ? { ...locked } : { ...last } };
    },
    reset() {
      locked = null;
      last = null;
    },
  };
}
