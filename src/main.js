// App wiring: camera -> MediaPipe -> input engine -> UI.
// The pure decision logic lives in src/input, src/core and src/data.

import { createFaceTracker } from './vision/faceTracker.js';
import { startCamera } from './vision/camera.js';
import { createInputEngine } from './core/inputEngine.js';
import { STATE } from './core/inputController.js';
import { loadProfile, saveProfile, clearProfile } from './data/profileStore.js';
import { DEFAULT_SETTINGS } from './core/settings.js';
import { createCalibration } from './input/calibration.js';
import { createHoldDetector, eyesClosedValue } from './input/faceClick.js';
import { landmarkToCoverPixel } from './input/screenMapping.js';
import { createCursorOverlay } from './ui/cursorOverlay.js';
import { createDetectionIndicator } from './ui/detectionIndicator.js';
import { createFeedback } from './ui/feedback.js';
import { createPracticeScreen } from './ui/screens/practice.js';
import { createOnboarding } from './ui/screens/onboarding.js';
import { createNewsScreen } from './ui/screens/news.js';
import { createFormScreen } from './ui/screens/form.js';
import { createSettingsScreen } from './ui/screens/settings.js';
import { createRouter } from './ui/router.js';
import { createReplayPlayer, createRecorder, parseRecording } from './dev/replay.js';
import { createDebugLog, buildDebugReport } from './core/debugLog.js';

const $ = (sel) => document.querySelector(sel);
const DEV = new URLSearchParams(location.search).get('dev') === '1';
const VERSION = typeof __APP_VERSION__ === 'undefined' ? 'dev' : __APP_VERSION__;
const NO_FACE_MS = 2500;
const SOURCE_NAMES = { face: 'a facial gesture', wink: 'a left wink', dwell: 'dwell (holding still)', hand: 'a fist', keyboard: 'the keyboard', mouse: 'the mouse' };

// ---------- state ----------
const profile = loadProfile();
let settings = profile.settings;
let started = false;
let tracker = null;
let handTracker = null;
let handLoading = false;
let cameraOn = false;
let replay = null;
let recorder = null;
let calibration = null;
let calibrationCancel = null;
let lastFaceSeen = 0;
let lastHand = null;
let frameNo = 0;
let lastVideoTime = -1;
let mouseUntil = 0;
let busy = false;
let dispatching = false;
let lastFrame = null;
let savedRange = profile.range;
let noFaceShown = false;

const video = $('#video');
const feedback = createFeedback($('#toasts'));
feedback.setMuted(!settings.sound);
const cursor = createCursorOverlay($('#cursor'));
const indicator = createDetectionIndicator($('#indicators'));
// Short text events for "Copy debug info" (no images or face numbers).
const debugLog = createDebugLog();

// ---------- hit testing (which element is under the virtual cursor) ----------
const keyOf = new WeakMap();
const byKey = new Map();
let keyCounter = 0;
const CLICKABLE = 'button, a[href], [data-clickable], input, select, textarea';

function elementAt(p) {
  const el = document.elementFromPoint(p.x, p.y);
  const target = el?.closest(CLICKABLE);
  if (!target || target.disabled || target.closest('.hidden')) return null;
  return target;
}

function hitTest(p) {
  const el = elementAt(p);
  if (!el) return { clickable: false, key: null, risk: 'normal', role: null };
  let key = keyOf.get(el);
  if (!key) {
    key = `el${++keyCounter}`;
    keyOf.set(el, key);
  }
  byKey.set(key, new WeakRef(el));
  return { clickable: true, key, risk: el.closest('[data-risk]')?.dataset.risk ?? 'normal', role: el.dataset.role ?? null };
}

const engine = createInputEngine({
  settings,
  range: profile.range,
  screen: { width: innerWidth, height: innerHeight },
  hitTest,
});
addEventListener('resize', () => engine.setScreen({ width: innerWidth, height: innerHeight }));

// ---------- acting on decisions ----------
function activate(el) {
  dispatching = true;
  try {
    if (el.matches('input, select, textarea')) el.focus();
    el.click();
  } finally {
    dispatching = false;
  }
}

let hoverEl = null;
function setHover(el) {
  if (el === hoverEl) return;
  hoverEl?.classList.remove('tfc-hover');
  hoverEl = el;
  hoverEl?.classList.add('tfc-hover');
}

let confirmTimer = null;
function showConfirm(pending) {
  const el = byKey.get(pending.targetId)?.deref();
  const what = el?.dataset.confirmText || `Do "${el?.textContent?.trim() || 'this action'}"?`;
  $('#confirm-text').textContent = what;
  const others = availableSources().filter((s) => s !== pending.source);
  $('#confirm-how').textContent =
    `I used ${SOURCE_NAMES[pending.source] ?? pending.source} for the first step. To confirm, point at "Yes" and use a different signal: ` +
    others.map((s) => SOURCE_NAMES[s]).join(' or ') + '.';
  $('#confirm').classList.remove('hidden');
  const bar = $('#confirm-timer');
  const total = pending.deadline - performance.now();
  clearInterval(confirmTimer);
  confirmTimer = setInterval(() => {
    const left = Math.max(0, pending.deadline - performance.now());
    bar.style.width = `${(left / total) * 100}%`;
  }, 100);
}
function hideConfirm() {
  clearInterval(confirmTimer);
  $('#confirm').classList.add('hidden');
}

function availableSources() {
  const s = [];
  if (settings.faceClickEnabled) s.push(settings.faceClickGesture === 'wink' ? 'wink' : 'face');
  if (settings.dwellEnabled) s.push('dwell');
  if (settings.handEnabled) s.push('hand');
  s.push('mouse', 'keyboard');
  return s;
}

function applyActions(actions) {
  for (const a of actions) {
    debugLog.add(a.type, [a.state, a.source, a.button, a.reason, a.confirmed && 'confirmed'].filter(Boolean).join(' '));
    switch (a.type) {
      case 'click': {
        cursor.pulse();
        const el = a.targetId ? byKey.get(a.targetId)?.deref() : null;
        if (el && el.isConnected && a.button === 'right') {
          feedback.highlight(el);
          feedback.beep('right');
          const r = el.getBoundingClientRect();
          el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
        } else if (el && el.isConnected) {
          feedback.highlight(el);
          feedback.beep('click');
          if (!el.closest('[data-risk="high"]') || a.confirmed) {
            activate(el);
          }
        }
        break;
      }
      case 'blocked':
        if (a.reason === 'paused') feedback.toast('Paused: I ignored that click.', { kind: 'warn' });
        else feedback.toast('Choose "Yes" or "Cancel" first.', { kind: 'warn' });
        break;
      case 'confirmStart':
        feedback.beep('confirm');
        showConfirm(a);
        break;
      case 'confirmRejected':
        feedback.toast('Please confirm with a different signal than the first one.', { kind: 'warn', ms: 2500 });
        break;
      case 'confirmed':
        hideConfirm();
        break;
      case 'confirmCancelled':
        hideConfirm();
        feedback.beep('cancel');
        feedback.toast(a.reason === 'timeout' ? 'Time ran out. Nothing was done.' : 'Cancelled. Nothing was done.');
        break;
      case 'paused':
        feedback.beep('pause');
        break;
      case 'resumed':
        feedback.beep('resume');
        feedback.toast('Resumed');
        break;
      case 'state':
        renderState(a.state);
        break;
      default:
        break;
    }
  }
}

function renderState(state) {
  const badge = $('#state-badge');
  badge.textContent = state;
  badge.className = `badge state-${state}`;
  $('#paused-banner').classList.toggle('hidden', state !== STATE.PAUSED);
  cursor.setPaused(state === STATE.PAUSED);
  $('#btn-pause').textContent = state === STATE.PAUSED ? 'Paused' : 'Pause';
  $('#paused-banner').innerHTML =
    '<strong>Paused.</strong> Nothing will be clicked. ' +
    (settings.eyesPauseEnabled || !settings.handEnabled ? 'Close both eyes for 2 seconds to resume.' : 'Hold an open palm for 1.5 seconds to resume.') +
    (DEV ? ' (Dev: press P.)' : '');
}

// Real mouse/keyboard clicks also go through the controller, so PAUSED and
// high-risk confirmation apply to them too (no side door around the safety
// rules). Dev tools and error screens are exempt.
document.addEventListener(
  'click',
  (e) => {
    if (dispatching || !started) return;
    if (e.target.closest('#dev-panel, #error, #loading')) return;
    e.preventDefault();
    e.stopPropagation();
    let point = { x: e.clientX, y: e.clientY };
    if (e.detail === 0) {
      // keyboard (Enter/Space) on a focused element: aim at its centre
      const r = e.target.getBoundingClientRect();
      point = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    mouseUntil = performance.now() + 1500;
    engine.setCursor(point);
    applyActions(engine.signal('click', performance.now(), e.detail === 0 ? 'keyboard' : 'mouse'));
  },
  true,
);

// ---------- calibration ----------
function startCalibration() {
  debugLog.add('calibrationStart');
  calibration = createCalibration();
  calibrationCancel = createHoldDetector({ holdMs: 2000 });
  $('#calibration').classList.remove('hidden');
  cursor.show(false);
  renderCalibration({ step: calibration.step, progress: 0, waitingForMove: false });
}

function renderCalibration(r) {
  if (!r.step) return;
  const dot = $('#cal-dot');
  dot.style.left = `${r.step.screen.x * innerWidth}px`;
  dot.style.top = `${r.step.screen.y * innerHeight}px`;
  $('#cal-step').textContent = `${calibration.stepIndex + 1} / 5`;
  $('#cal-msg').textContent = r.waitingForMove
    ? `Turn your head toward ${r.step.label}.`
    : `Hold still while looking at ${r.step.label}…`;
  $('#cal-ring').style.strokeDashoffset = String(188.5 * (1 - r.progress));
}

function endCalibration(message, kind) {
  debugLog.add('calibrationEnd', message ?? '');
  calibration = null;
  $('#calibration').classList.add('hidden');
  cursor.show(true);
  if (message) feedback.toast(message, { kind, ms: 3000 });
}

function stepCalibration(frame) {
  const closed = frame.face ? eyesClosedValue(frame.face.blendshapes) : null;
  if (calibrationCancel.update(closed === null ? null : closed >= settings.eyesClosedThreshold, frame.t).fired) {
    endCalibration('Calibration cancelled. I kept the previous range.');
    return;
  }
  const r = calibration.feed(frame.face?.pose ?? null, frame.t);
  if (r.done) {
    if (r.failed) {
      endCalibration('I could not measure your range. Please try again and turn a little further.', 'warn');
    } else {
      engine.setRange(r.range);
      savedRange = r.range;
      persist();
      endCalibration('Calibration saved.');
    }
    return;
  }
  renderCalibration(r);
}

// ---------- main loop: one rAF loop, one frame in flight ----------
function readFrame(now) {
  if (replay) {
    const f = replay.next(now);
    if (!f) {
      stopReplay();
      feedback.toast('Replay finished');
      return null;
    }
    return f;
  }
  if (!cameraOn || !tracker || video.readyState < 2) return null;
  if (video.currentTime === lastVideoTime) return null; // no new video frame yet
  lastVideoTime = video.currentTime;
  frameNo += 1;
  const face = tracker.detect(video, now);
  if (settings.handEnabled && handTracker && frameNo % 2 === 0) {
    lastHand = handTracker.detect(video, now); // hands every other frame
  } else if (!settings.handEnabled) {
    lastHand = null;
  }
  return { t: now, face, hand: lastHand };
}

function loop(now) {
  requestAnimationFrame(loop);
  if (busy) return;
  busy = true;
  try {
    const frame = readFrame(now);
    if (frame) {
      lastFrame = frame;
      if (frame.face) lastFaceSeen = now;
      if (recorder) recorder.push(frame);
      if (calibration) stepCalibration(frame);
      else render(engine.process(frame, { moveCursor: now > mouseUntil }), frame);
    } else if (DEV && !replay && !cameraOn) {
      // dev mode without camera: still let the mouse drive the cursor
      render(engine.process({ t: now, face: null, hand: null }, { moveCursor: false }), null);
    }
    const noFace = cameraOn && !replay && now - lastFaceSeen > NO_FACE_MS;
    $('#noface').classList.toggle('hidden', !noFace);
    if (noFace !== noFaceShown) {
      noFaceShown = noFace;
      debugLog.add(noFace ? 'faceLost' : 'faceFound');
    }
  } finally {
    busy = false;
  }
}

function render(out, frame) {
  cursor.move(out.cursor);
  // the ring fills for dwell, and also while a wink is being held
  cursor.setDwell(settings.faceClickGesture === 'wink' ? Math.max(out.progress.dwell, out.progress.face) : out.progress.dwell);
  setHover(out.hit?.clickable ? byKey.get(out.hit.key)?.deref() : null);
  applyActions(out.actions);
  indicator.update({
    faceSeen: !!frame?.face,
    clickLevel: out.faceLevel,
    clickThreshold: settings.faceClickOn,
    clickFiring: out.progress.face > 0,
    clickLabel: (GESTURES[settings.faceClickGesture] ?? GESTURES.wink).label,
    eyesProgress: out.progress.eyes,
    handEnabled: settings.handEnabled,
    handKind: out.detected.hand,
  });
  if (frame?.face && frameNo % 6 === 0) renderBlendshapes(frame.face.blendshapes);
  if (DEV && frame?.face?.landmarks) drawLandmarks(frame.face.landmarks);
  if (router.current === 'onboarding') screens.onboarding.update(frame);
}

function renderBlendshapes(bs) {
  const top = Object.entries(bs)
    .filter(([k]) => k !== '_neutral')
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const ol = $('#blendshapes');
  ol.replaceChildren(
    ...top.map(([k, v]) => {
      const li = document.createElement('li');
      li.textContent = `${k}: ${v.toFixed(2)}`;
      return li;
    }),
  );
}

// ---------- dev mode ----------
const devCanvas = $('#dev-canvas');
const devCtx = devCanvas.getContext('2d');
function drawLandmarks(lms) {
  const box = devCanvas.getBoundingClientRect();
  const dpr = Math.min(devicePixelRatio, 1.5);
  if (devCanvas.width !== Math.round(box.width * dpr)) {
    devCanvas.width = Math.round(box.width * dpr);
    devCanvas.height = Math.round(box.height * dpr);
  }
  devCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  devCtx.clearRect(0, 0, box.width, box.height);
  devCtx.fillStyle = '#4ef08a';
  const v = { width: video.videoWidth, height: video.videoHeight };
  for (let i = 0; i < lms.length; i += 2) {
    const p = landmarkToCoverPixel(lms[i], v, box);
    devCtx.fillRect(p.x - 0.75, p.y - 0.75, 1.5, 1.5);
  }
}

function startReplay(recording) {
  replay = createReplayPlayer(recording.frames);
  $('#dev-info').textContent = recording.synthetic ? 'Replaying SYNTHETIC sample' : `Replaying ${recording.frames.length} frames`;
}
function stopReplay() {
  replay = null;
  $('#dev-info').textContent = '';
}

function setupDev() {
  $('#dev-panel').classList.remove('hidden');
  devCanvas.classList.remove('hidden');
  cursor.show(true);
  addEventListener('mousemove', (e) => {
    mouseUntil = performance.now() + 1500;
    engine.setCursor({ x: e.clientX, y: e.clientY });
  });
  addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea')) return;
    if (e.key === 'c' || e.key === 'C') applyActions(engine.signal('click', performance.now(), 'keyboard'));
    if (e.key === 'p' || e.key === 'P') applyActions(engine.signal('togglePause', performance.now(), 'keyboard'));
  });
  $('#dev-replay-sample').addEventListener('click', async () => {
    try {
      const res = await fetch(new URL('fixtures/synthetic-session.json', document.baseURI));
      startReplay(parseRecording(await res.json()));
    } catch {
      feedback.toast('Could not load the sample recording.', { kind: 'warn' });
    }
  });
  $('#dev-file').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      startReplay(parseRecording(await file.text()));
    } catch (err) {
      feedback.toast(err.message, { kind: 'warn', ms: 3000 });
    }
    e.target.value = '';
  });
  $('#dev-stop-replay').addEventListener('click', stopReplay);
  $('#dev-record').addEventListener('click', () => {
    if (!cameraOn) {
      feedback.toast('Recording needs the camera.', { kind: 'warn' });
      return;
    }
    $('#dev-info').textContent = 'Recording 3 s…';
    recorder = createRecorder(3000, (rec) => {
      recorder = null;
      $('#dev-info').textContent = `Recorded ${rec.frames.length} frames`;
      const blob = new Blob([JSON.stringify(rec)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `recording-${Date.now()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
  });
}

// ---------- app actions used by the screens (all reachable with the virtual cursor) ----------
let onboarded = profile.onboarded;

function persist() {
  saveProfile({ settings, range: savedRange, onboarded });
}

const GESTURES = {
  wink: { hint: 'wink your left eye and hold it until the ring is full (right eye = right click)', label: 'Wink' },
  jawOpen: { hint: 'open your mouth for a moment', label: 'Mouth' },
  browInnerUp: { hint: 'raise your eyebrows for a moment', label: 'Eyebrows' },
};

function updateHints() {
  const g = GESTURES[settings.faceClickGesture] ?? GESTURES.wink;
  const ways = [g.hint];
  if (settings.dwellEnabled) ways.push('hold the cursor still on it');
  if (settings.handEnabled) ways.push('make a fist');
  const text = `Move the cursor by turning your head. To press a button, ${ways.join(', or ')}.`;
  document.querySelectorAll('.how-to-press').forEach((el) => (el.textContent = text));
}

async function loadHandTracker() {
  if (handTracker) return true;
  if (handLoading || !cameraOn) return false;
  handLoading = true;
  feedback.toast('Loading the hand model…');
  try {
    const { createHandTracker } = await import('./vision/handTracker.js');
    handTracker = await createHandTracker();
    return true;
  } catch {
    feedback.toast('I could not load the hand model. Check the internet connection.', { kind: 'warn', ms: 3000 });
    return false;
  } finally {
    handLoading = false;
  }
}

const app = {
  get settings() {
    return settings;
  },
  updateSettings(patch) {
    if (Object.keys(patch).length) debugLog.add('settings', Object.entries(patch).map(([k, v]) => `${k}=${v}`).join(' '));
    settings = { ...settings, ...patch };
    engine.configure(settings);
    feedback.setMuted(!settings.sound);
    updateHints();
    renderState(engine.controller.state);
    persist();
  },
  async setHandEnabled(on) {
    if (on && !(await loadHandTracker())) {
      if (!cameraOn) feedback.toast('Hand gestures need the camera.', { kind: 'warn' });
      return;
    }
    app.updateSettings({ handEnabled: on });
    if (on) feedback.toast('Hand gestures on: make a fist to click, hold an open palm to pause.', { ms: 3000 });
  },
  startCalibration() {
    if (!cameraOn) {
      feedback.toast('Calibration needs the camera.', { kind: 'warn' });
      return;
    }
    startCalibration();
  },
  finishOnboarding() {
    onboarded = true;
    persist();
    router.go('home');
  },
  resetProfile() {
    clearProfile();
    settings = { ...DEFAULT_SETTINGS };
    savedRange = null;
    engine.setRange(null);
    app.updateSettings({});
    feedback.toast('My profile was reset to the defaults.');
  },
  toast(text) {
    feedback.toast(text, { ms: 3000 });
  },
  debugReport() {
    return buildDebugReport({
      version: VERSION,
      settings,
      status: {
        state: engine.controller.state,
        camera: cameraOn ? 'on' : 'off',
        faceModel: tracker ? 'loaded' : 'not loaded',
        handModel: handTracker ? 'loaded' : 'not loaded',
        faceSeen: noFaceShown ? 'no' : 'yes',
        calibrated: savedRange ? 'yes' : 'no',
        onboarded: onboarded ? 'yes' : 'no',
        screen: router.current,
      },
      env: { userAgent: navigator.userAgent, screen: `${innerWidth}x${innerHeight} @${devicePixelRatio}x` },
      events: debugLog.events,
    });
  },
};

const screens = {};
const router = createRouter((name) => {
  if (name === 'onboarding') screens.onboarding.start();
  if (name === 'news') screens.news.reset();
  if (name === 'form') screens.form.reset();
  if (name === 'settings') screens.settings.render();
});

function setupScreens() {
  createPracticeScreen({ root: $('#screen-practice'), feedback });
  screens.onboarding = createOnboarding({ root: $('#screen-onboarding'), app });
  screens.news = createNewsScreen({ root: $('#screen-news'), feedback });
  screens.form = createFormScreen({ root: $('#screen-form'), feedback });
  screens.settings = createSettingsScreen({ root: $('#screen-settings'), app });
  document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => router.go(b.dataset.go)));
  $('#btn-home').addEventListener('click', () => router.go('home'));
  $('#btn-settings').addEventListener('click', () => router.go('settings'));
  $('#home-calibrate').addEventListener('click', () => app.startCalibration());

  // The virtual cursor cannot use a scroll wheel, so long pages get big scroll buttons.
  const step = () => Math.round(innerHeight * 0.6);
  $('#scroll-up').addEventListener('click', () => window.scrollBy({ top: -step(), behavior: 'smooth' }));
  $('#scroll-down').addEventListener('click', () => window.scrollBy({ top: step(), behavior: 'smooth' }));
  const updateScroll = () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    $('#scroll-buttons').classList.toggle('hidden', max <= 4);
    $('#scroll-up').disabled = scrollY <= 2;
    $('#scroll-down').disabled = scrollY >= max - 2;
  };
  addEventListener('scroll', updateScroll, { passive: true });
  addEventListener('resize', updateScroll);
  new ResizeObserver(updateScroll).observe(document.body);
}

// ---------- errors: plain language, no raw errors ----------
const ERRORS = {
  permission: [
    'Camera access is blocked',
    'Click the camera icon in the address bar, choose "Allow", then press "Try again".',
  ],
  'no-camera': ['No camera found', 'Connect a webcam (or close other apps that use it), then press "Try again".'],
  busy: ['The camera is in use', 'Another app or tab is using the camera. Close it, then press "Try again".'],
  insecure: ['The camera is not available here', 'Open this page from its https:// link (or localhost), not as a file.'],
  model: ['The face model did not load', 'Check your internet connection, then press "Try again".'],
  camera: ['The camera could not start', 'Reload the page. If it keeps happening, try another browser such as Chrome.'],
  generic: ['Something went wrong', 'Reload the page to start again.'],
};

function showError(code) {
  debugLog.add('error', code);
  const [title, text] = ERRORS[code] ?? ERRORS.generic;
  $('#error-title').textContent = title;
  $('#error-text').textContent = text;
  $('#loading').classList.add('hidden');
  $('#error').classList.remove('hidden');
  if (DEV) {
    $('#error-replay').textContent = 'Continue without a camera';
    $('#error-replay').onclick = (e) => {
      e.preventDefault();
      $('#error').classList.add('hidden');
    };
  }
}
$('#error-retry').addEventListener('click', () => location.reload());

addEventListener('error', (e) => {
  console.error(e.error || e.message);
  debugLog.add('jsError', e.message);
  if (!started) showError('generic');
});
addEventListener('unhandledrejection', (e) => {
  console.error(e.reason);
  debugLog.add('jsError', e.reason?.message ?? e.reason);
  if (!started) showError('generic');
});

// ---------- start ----------
async function main() {
  setupScreens();
  updateHints();
  router.go(onboarded ? 'home' : 'onboarding');
  renderState(engine.controller.state);
  addEventListener('pointerdown', () => feedback.unlockAudio(), { once: true });
  addEventListener('keydown', () => feedback.unlockAudio(), { once: true });
  if (DEV) setupDev();

  started = true;
  requestAnimationFrame(loop);

  try {
    $('#loading-text').textContent = 'Starting the camera…';
    await startCamera(video);
    $('#camera-status').className = 'chip chip-on';
    $('#camera-status .label').textContent = 'Camera on';
    debugLog.add('cameraOn');
  } catch (err) {
    showError(err.code || 'camera');
    return;
  }
  try {
    $('#loading-text').textContent = 'Loading the face model…';
    tracker = await createFaceTracker();
    debugLog.add('faceModelLoaded');
  } catch {
    showError('model');
    return;
  }
  if (settings.handEnabled) {
    try {
      const { createHandTracker } = await import('./vision/handTracker.js');
      handTracker = await createHandTracker();
    } catch {
      app.updateSettings({ handEnabled: false });
    }
  }
  cameraOn = true;
  lastFaceSeen = performance.now();
  cursor.show(true);
  $('#loading').classList.add('hidden');
  if (onboarded && !profile.range) feedback.toast('Tip: choose "Calibrate" to fit the cursor to your comfortable head range.', { ms: 4000 });
}

main();

// expose nothing globally; lastFrame kept for debugging in dev tools only
if (DEV) window.__tfc = { get lastFrame() { return lastFrame; }, engine };
