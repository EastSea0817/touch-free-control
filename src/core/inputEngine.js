// Glues the pure input pieces together: one frame of numbers in,
// cursor position + controller actions out. No DOM, no MediaPipe.
// The same engine runs on live camera frames and on recorded fixture frames,
// so the whole pipeline can be tested without a webcam.
//
// Frame format (also the recording/fixture format):
//   { t, face: null | { pose: {yaw, pitch}, blendshapes: {name: score} },
//        hand: null | { kind: 'fist' | 'palm' | 'none' } }

import { scaleRange, poseToScreen, rangeAroundCenter, averagePose, DEFAULT_RANGE } from '../input/headPointer.js';
import { createPointSmoother } from '../input/smoothing.js';
import { createDwell } from '../input/dwell.js';
import { createTrigger, createHoldDetector, blendshapeValue, eyesClosedValue, winkValues } from '../input/faceClick.js';
import { createInputController, STATE } from './inputController.js';

const AUTO_CENTER_FRAMES = 15;

export function createInputEngine({ settings, range = null, screen, hitTest }) {
  let cfg = { ...settings };
  let userRange = range; // from 5-point calibration
  let autoRange = null; // from the first second of tracking
  const centerSamples = [];

  const smoother = createPointSmoother(cfg.smoothing);
  const dwell = createDwell({ dwellMs: cfg.dwellMs, radiusPx: cfg.dwellRadiusPx });
  const faceTrigger = createTrigger(faceTriggerOpts(cfg));
  const winkLeft = createTrigger(winkTriggerOpts(cfg));
  const winkRight = createTrigger(winkTriggerOpts(cfg));
  const eyesHold = createHoldDetector({ holdMs: cfg.eyesPauseHoldMs });
  const fistTrigger = createTrigger({ on: 0.5, off: 0.5, confirmFrames: 4, releaseFrames: 8, minHoldMs: 150, refractoryMs: cfg.refractoryMs, graceMs: cfg.trackingGraceMs });
  const palmHold = createHoldDetector({ holdMs: cfg.handPauseHoldMs });
  const controller = createInputController({ confirmTimeoutMs: cfg.confirmTimeoutMs });

  let cursor = { x: screen.width / 2, y: screen.height / 2 };

  function currentRange() {
    return userRange || autoRange || DEFAULT_RANGE;
  }

  function signalToEvent(source, hit, t, button = 'left') {
    if (button === 'right') return { type: 'click', source, t, button, risk: 'normal', targetId: hit?.key ?? null };
    if (controller.state === STATE.CONFIRMING && hit?.role === 'confirm') return { type: 'confirm', source, t };
    if (controller.state === STATE.CONFIRMING && hit?.role === 'cancel') return { type: 'cancel', source, t };
    if (controller.state === STATE.ACTIVE && hit?.role === 'pause') return { type: 'togglePause', source, t };
    return { type: 'click', source, t, risk: hit?.risk ?? 'normal', targetId: hit?.key ?? null };
  }

  return {
    controller,
    get cursor() {
      return { ...cursor };
    },
    get range() {
      return currentRange();
    },
    setScreen(s) {
      screen = s;
    },
    setRange(r) {
      userRange = r;
      smoother.reset();
    },
    /** Forget every range: the next second of looking ahead becomes the new centre. */
    recenter() {
      userRange = null;
      autoRange = null;
      centerSamples.length = 0;
      smoother.reset();
    },
    configure(next) {
      cfg = { ...cfg, ...next };
      smoother.setStrength(cfg.smoothing);
      dwell.configure({ dwellMs: cfg.dwellMs, radiusPx: cfg.dwellRadiusPx });
      faceTrigger.configure(faceTriggerOpts(cfg));
      winkLeft.configure(winkTriggerOpts(cfg));
      winkRight.configure(winkTriggerOpts(cfg));
      eyesHold.configure({ holdMs: cfg.eyesPauseHoldMs });
      palmHold.configure({ holdMs: cfg.handPauseHoldMs });
      controller.configure({ confirmTimeoutMs: cfg.confirmTimeoutMs });
    },
    /** Point the cursor somewhere directly (dev mode: real mouse). */
    setCursor(p) {
      cursor = { ...p };
    },
    /** Inject a signal directly (dev mode: keyboard shortcuts and real mouse clicks). */
    signal(kind, t, source = 'keyboard') {
      if (kind === 'togglePause') return controller.handle({ type: 'togglePause', source, t });
      const actions = controller.handle(signalToEvent(source, hitTest(cursor), t));
      if (actions.some((x) => x.type === 'click' || x.type === 'confirmStart')) dwell.requireLeave(cursor);
      return actions;
    },
    /**
     * @param frame see format above
     * @param opts { moveCursor: boolean } false while the real mouse drives the cursor
     */
    process(frame, { moveCursor = true } = {}) {
      const { t } = frame;
      const actions = [];
      const face = frame.face;

      // 1. Cursor
      if (face?.pose) {
        if (!autoRange && !userRange) {
          centerSamples.push(face.pose);
          if (centerSamples.length >= AUTO_CENTER_FRAMES) autoRange = rangeAroundCenter(averagePose(centerSamples));
        }
        if (moveCursor) {
          const target = poseToScreen(face.pose, scaleRange(currentRange(), cfg.cursorSpeed), screen);
          cursor = smoother.filter(target, t);
        }
      }
      const hit = hitTest(cursor);
      const paused = controller.state === STATE.PAUSED;

      // 2. Dwell (fallback click). Never runs while paused.
      let dwellProgress = 0;
      // Dwell only while the cursor is really being driven (face tracked, or
      // the real mouse in dev mode): a frozen cursor must never dwell-click.
      const cursorLive = !!face?.pose || !moveCursor;
      if (cfg.dwellEnabled && !paused && cursorLive) {
        const d = dwell.update(cursor, t, !!hit?.clickable, hit?.key ?? null);
        dwellProgress = d.progress;
        if (d.fired) actions.push(...controller.handle(signalToEvent('dwell', hit, t)));
      } else {
        dwell.reset();
      }

      // 3. Face click
      let faceProgress = 0;
      let faceLevel = null;
      if (cfg.faceClickEnabled && cfg.faceClickGesture === 'wink') {
        const w = face ? winkValues(face.blendshapes, { closed: cfg.winkClosed, open: cfg.winkOpen, swap: cfg.winkSwapEyes }) : { left: null, right: null };
        const l = winkLeft.update(w.left, t);
        const r = winkRight.update(w.right, t);
        faceProgress = Math.max(l.progress, r.progress);
        faceLevel = face ? faceProgress : null;
        if (l.fired) actions.push(...controller.handle(signalToEvent('wink', hit, t)));
        if (r.fired) actions.push(...controller.handle(signalToEvent('wink', hit, t, 'right')));
      } else if (cfg.faceClickEnabled) {
        faceLevel = face ? blendshapeValue(face.blendshapes, cfg.faceClickGesture) : null;
        const r = faceTrigger.update(faceLevel, t);
        faceProgress = r.progress;
        if (r.fired) actions.push(...controller.handle(signalToEvent('face', hit, t)));
      }

      // 4. Pause by closing both eyes (works in every state)
      let eyesProgress = 0;
      const pauseByEyes = cfg.eyesPauseEnabled || !cfg.handEnabled; // always keep one pause signal
      if (pauseByEyes) {
        const closed = face ? eyesClosedValue(face.blendshapes) : null;
        const r = eyesHold.update(closed === null ? null : closed >= cfg.eyesClosedThreshold, t);
        eyesProgress = r.progress;
        if (r.fired) actions.push(...controller.handle({ type: 'togglePause', source: 'eyes', t }));
      }

      // 5. Hand gestures (optional)
      let handKind = null;
      let palmProgress = 0;
      if (cfg.handEnabled) {
        handKind = frame.hand ? frame.hand.kind : null;
        const fist = fistTrigger.update(handKind === null ? null : handKind === 'fist' ? 1 : 0, t);
        if (fist.fired) actions.push(...controller.handle(signalToEvent('hand', hit, t)));
        const palm = palmHold.update(handKind === null ? null : handKind === 'palm', t);
        palmProgress = palm.progress;
        if (palm.fired) actions.push(...controller.handle({ type: 'togglePause', source: 'hand', t }));
      }

      actions.push(...controller.handle({ type: 'tick', t }));
      // after any click, a resting cursor must not dwell-click whatever appears under it
      if (actions.some((x) => x.type === 'click' || x.type === 'confirmStart')) dwell.requireLeave(cursor);

      return {
        cursor: { ...cursor },
        hit,
        state: controller.state,
        actions,
        detected: { face: !!face, hand: handKind },
        progress: { dwell: dwellProgress, face: faceProgress, eyes: eyesProgress, palm: palmProgress },
        faceLevel,
      };
    },
  };
}

function winkTriggerOpts(cfg) {
  // the wink signal is 0 or 1, so on/off are both 0.5
  return {
    on: 0.5,
    off: 0.5,
    confirmFrames: cfg.confirmFrames,
    releaseFrames: 6,
    minHoldMs: cfg.winkHoldMs,
    refractoryMs: cfg.refractoryMs,
    graceMs: cfg.trackingGraceMs,
  };
}

function faceTriggerOpts(cfg) {
  return {
    on: cfg.faceClickOn,
    off: cfg.faceClickOff,
    confirmFrames: cfg.confirmFrames,
    releaseFrames: cfg.releaseFrames,
    minHoldMs: cfg.minHoldMs,
    refractoryMs: cfg.refractoryMs,
    graceMs: cfg.trackingGraceMs,
  };
}
