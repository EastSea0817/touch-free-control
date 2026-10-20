// Desktop app wiring: camera -> MediaPipe -> the SAME input engine as the web
// prototype -> the REAL Windows mouse (through window.desktop from preload.cjs).
// Ideas from testing Google Project Gameface (Apache-2.0), rebuilt in JS:
// step-card setup, per-gesture sensitivity with a live meter. My own additions:
// click lock, wink clicks, calibration, pre-start environment check,
// caregiver-once setup (after setup the app starts by itself).

import { createFaceTracker } from '../vision/faceTracker.js';
import { startCamera } from '../vision/camera.js';
import { createInputEngine } from '../core/inputEngine.js';
import { STATE } from '../core/inputController.js';
import { loadProfile, saveProfile } from '../data/profileStore.js';
import { createCalibration } from '../input/calibration.js';
import { createFeedback } from '../ui/feedback.js';
import { createCursorGate } from './cursorGate.js';
import { checkEnvironment, faceBox, averageBrightness } from './envCheck.js';
import { gestureMeters, stepSensitivity, clickIntent, GESTURE_HELP } from './meters.js';

const $ = (s) => document.querySelector(s);
const desktop = window.desktop ?? null; // null when opened in a normal browser (tests)

// The desktop app has no buttons of its own to aim at, so dwell (which needs a
// clickable target) stays off; clicks come from face gestures only.
const DESKTOP_DEFAULTS = { dwellEnabled: false };

const profile = loadProfile();
let settings = { ...profile.settings, ...DESKTOP_DEFAULTS };
let range = profile.range;
let onboarded = profile.onboarded;

let screenInfo = { x: 0, y: 0, width: 1920, height: 1080 };
let tracker = null;
let engine = null;
let mode = 'setup'; // 'setup' | 'running'
let step = 0;
let calibration = null;
let lastVideoTime = -1;
let envOk = false;
let envFrames = 0;
let lastEnv = null;
const gate = createCursorGate();
const feedback = createFeedback(document.createElement('div'));
feedback.setMuted(!settings.sound);

const video = $('#video');
const canvas = document.createElement('canvas');
canvas.width = 64;
canvas.height = 36;
const ctx2d = canvas.getContext('2d', { willReadFrequently: true });

function save() {
  saveProfile({ settings, range, onboarded });
}

// ---------- startup ----------
async function boot() {
  if (desktop) {
    screenInfo = await desktop.getScreen();
    if (!(await desktop.mouseSupported())) $('#mouse-note').classList.remove('hidden');
    desktop.onShortcut((name) => {
      if (!engine) return;
      if (name === 'togglePause') apply(engine.signal('togglePause', performance.now(), 'keyboard'));
      if (name === 'recenter') recenter();
    });
  }
  try {
    await startCamera(video);
    tracker = await createFaceTracker();
  } catch (err) {
    showError(err);
    return;
  }
  engine = createInputEngine({
    settings,
    range,
    screen: { width: screenInfo.width, height: screenInfo.height },
    hitTest: () => ({ clickable: false, key: null, risk: 'normal', role: null }),
  });
  bindUi();
  renderSettings();
  if (onboarded) startRunning();
  else showSetup(0);
  // A timer, not requestAnimationFrame: rAF stops when the window is minimized
  // or hidden, but the mouse must keep working while other apps are in front.
  setInterval(loop, 1000 / 30);
}

function showError(err) {
  const msg = {
    permission: 'Camera permission was refused. Allow the camera for this app and restart it.',
    'no-camera': 'No camera was found. Connect a webcam and restart the app.',
    busy: 'The camera is used by another app (for example a video call). Close it and restart.',
  }[err?.code] ?? `Could not start: ${err?.message ?? err}. Check the internet connection (the face model is downloaded on first start).`;
  const el = $('#error');
  el.textContent = msg;
  el.classList.remove('hidden');
  $('#state').textContent = 'Error';
}

// ---------- main loop ----------
function loop() {
  if (!tracker || video.readyState < 2 || video.currentTime === lastVideoTime) return;
  lastVideoTime = video.currentTime;
  const t = performance.now();
  const face = tracker.detect(video, t);
  const frame = { t, face: face ? { pose: face.pose, blendshapes: face.blendshapes } : null, hand: null };

  if ((envFrames++ & 7) === 0) updateEnvironment(face);
  if (calibration) return stepCalibration(face, t);

  const r = engine.process(frame);
  renderMeters(face?.blendshapes ?? null);

  if (mode === 'running') {
    const paused = r.state === STATE.PAUSED;
    const intent = clickIntent(face?.blendshapes ?? null, settings, r.progress.face) ? 1 : 0;
    const g = gate.update(r.cursor, intent, paused);
    if (g.move && desktop) desktop.moveMouse(g.move.x + screenInfo.x, g.move.y + screenInfo.y);
    apply(r.actions, g.clickAt);
  }
}

function apply(actions, clickAt = null) {
  for (const a of actions) {
    if (a.type === 'click' && mode === 'running') {
      const p = clickAt ?? engine.cursor;
      desktop?.click(a.button === 'right' ? 'right' : 'left', p.x + screenInfo.x, p.y + screenInfo.y);
      feedback.beep(a.button === 'right' ? 'right' : 'click');
    } else if (a.type === 'state') {
      renderState(a.state);
    } else if (a.type === 'paused') {
      feedback.beep('pause');
      flash('Paused. Nothing will be clicked and the cursor stays still.');
    } else if (a.type === 'resumed') {
      feedback.beep('resume');
      flash('Resumed.');
    }
  }
}

let flashTimer = null;
function flash(text) {
  const el = $('#flash');
  el.textContent = text;
  el.classList.remove('hidden');
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => el.classList.add('hidden'), 2500);
}

function renderState(state) {
  const pill = $('#state');
  const paused = state === STATE.PAUSED;
  pill.textContent = mode !== 'running' ? 'Setup' : paused ? 'Paused' : 'Controlling the mouse';
  pill.className = `pill ${mode === 'running' ? (paused ? 'paused' : 'on') : ''}`;
  $('#btn-pause').textContent = paused ? 'Resume' : 'Pause';
}

// ---------- environment check ----------
function updateEnvironment(face) {
  let brightness = null;
  try {
    ctx2d.drawImage(video, 0, 0, canvas.width, canvas.height);
    brightness = averageBrightness(ctx2d.getImageData(0, 0, canvas.width, canvas.height).data, 1);
  } catch {
    brightness = null;
  }
  const box = face ? faceBox(face.landmarks) : null;
  const env = checkEnvironment({ brightness, face: box });
  envOk = env.ok;
  const key = env.hints.map((h) => h.code).join();
  if (key !== lastEnv) {
    lastEnv = key;
    $('#hints').innerHTML = env.ok
      ? '<li class="ok">Light, distance and position look good.</li>'
      : env.hints.map((h) => `<li>${h.text}</li>`).join('');
  }
  const ff = $('#face-frame');
  ff.classList.toggle('good', env.ok);
  if (box) {
    ff.style.left = `${(box.cx - box.width / 2) * 100}%`;
    ff.style.width = `${box.width * 100}%`;
    ff.style.top = `${(box.cy - box.width * 0.75) * 100}%`;
    ff.style.height = `${box.width * 1.5 * 100}%`;
    ff.style.display = 'block';
  } else {
    ff.style.display = 'none';
  }
  if (mode === 'setup' && step === 0) $('#next-0').disabled = !env.ok;
}

// ---------- setup steps ----------
function showSetup(n) {
  mode = 'setup';
  step = n;
  $('#setup').classList.remove('hidden');
  $('#running').classList.add('hidden');
  document.querySelectorAll('.card').forEach((c) => c.classList.toggle('hidden', Number(c.dataset.step) !== n));
  $('#step-dots').innerHTML = [0, 1, 2, 3].map((i) => `<li class="${i === n ? 'cur' : i < n ? 'done' : ''}"></li>`).join('');
  if (n === 0) $('#next-0').disabled = !envOk;
  if (n === 2) renderGestureChoice();
  renderState(engine.controller.state);
}

function startRunning() {
  mode = 'running';
  onboarded = true;
  save();
  gate.reset();
  $('#setup').classList.add('hidden');
  $('#running').classList.remove('hidden');
  renderState(engine.controller.state);
}

function recenter() {
  // forget the auto range: the next second of looking at the middle becomes the centre
  range = null;
  engine.recenter();
  gate.reset();
  save();
  flash('Re-centered. Look at the middle of the screen for a second.');
}

// ---------- calibration (full screen) ----------
async function startCalibration() {
  if (desktop) await desktop.setFullScreen(true);
  calibration = createCalibration();
  $('#calibration').classList.remove('hidden');
}

async function endCalibration(newRange) {
  calibration = null;
  $('#calibration').classList.add('hidden');
  if (desktop) await desktop.setFullScreen(false);
  if (newRange) {
    range = newRange;
    engine.setRange(range);
    save();
  }
  showSetup(2);
}

function stepCalibration(face, t) {
  const r = calibration.feed(face?.pose ?? null, t);
  if (r.done) return endCalibration(r.failed ? null : r.range);
  const dot = $('#cal-dot');
  dot.style.left = `${r.step.screen.x * 100}%`;
  dot.style.top = `${r.step.screen.y * 100}%`;
  $('#cal-fill').style.transform = `scale(${r.progress})`;
  $('#cal-msg').textContent = !face
    ? 'I cannot see your face.'
    : r.waitingForMove
      ? `Turn your head toward ${r.step.label}.`
      : `Hold still… (${calibration.stepIndex + 1} / 5)`;
}

// ---------- gesture choice and meters ----------
function renderGestureChoice() {
  document.querySelectorAll('#gesture-choice button').forEach((b) => b.classList.toggle('sel', b.dataset.g === settings.faceClickGesture));
  $('#gesture-help').textContent = GESTURE_HELP[settings.faceClickGesture];
}

function renderMeters(blendshapes) {
  const host = mode === 'running' ? $('#run-meters') : $('#meters');
  if (mode === 'setup' && step !== 2) return;
  const meters = gestureMeters(blendshapes, settings);
  if (host.dataset.sig !== settings.faceClickGesture) {
    host.dataset.sig = settings.faceClickGesture;
    host.innerHTML = meters
      .map(
        (m) => `<div class="meter" data-id="${m.id}">
          <div class="meter-label">${m.label}</div>
          <div class="meter-row">
            <button class="pm" data-id="${m.id}" data-d="-1" aria-label="Easier to click">−</button>
            <div class="bar"><div class="fill"></div><div class="line"></div></div>
            <button class="pm" data-id="${m.id}" data-d="1" aria-label="Harder to click">+</button>
          </div></div>`,
      )
      .join('');
  }
  for (const m of meters) {
    const el = host.querySelector(`.meter[data-id="${m.id}"]`);
    if (!el) continue;
    el.querySelector('.fill').style.width = `${Math.round((m.value ?? 0) * 100)}%`;
    el.querySelector('.line').style.left = `${Math.round(m.threshold * 100)}%`;
    el.classList.toggle('pass', m.value !== null && m.value >= m.threshold);
  }
}

// ---------- settings (big − / + buttons) ----------
const SETTINGS_ROWS = [
  { key: 'cursorSpeed', label: 'Cursor speed', step: 0.1, min: 0.4, max: 1.6, fmt: (v) => v.toFixed(1) },
  { key: 'smoothing', label: 'Smoothing (steadier, slower)', step: 0.1, min: 0, max: 1, fmt: (v) => v.toFixed(1) },
  { key: 'winkHoldMs', label: 'Wink hold time', step: 250, min: 500, max: 3000, fmt: (v) => `${(v / 1000).toFixed(2)} s` },
  { key: 'eyesPauseHoldMs', label: 'Close both eyes to pause', step: 500, min: 1000, max: 4000, fmt: (v) => `${(v / 1000).toFixed(1)} s` },
];

function renderSettings() {
  $('#settings').innerHTML =
    SETTINGS_ROWS.map(
      (r) => `<div class="set-row"><span>${r.label}</span>
        <button class="pm" data-set="${r.key}" data-d="-1">−</button>
        <output id="v-${r.key}">${r.fmt(settings[r.key])}</output>
        <button class="pm" data-set="${r.key}" data-d="1">+</button></div>`,
    ).join('') +
    `<div class="set-row"><span>Click with</span><div class="choice small" id="run-gesture">
      <button data-g="wink">Winks</button><button data-g="jawOpen">Mouth</button><button data-g="browInnerUp">Eyebrows</button></div></div>
     <div class="set-row"><span>Swap left/right eye</span><button class="pm wide" id="swap">${settings.winkSwapEyes ? 'On' : 'Off'}</button></div>
     <div class="set-row"><span>Click sounds</span><button class="pm wide" id="sound">${settings.sound ? 'On' : 'Off'}</button></div>`;
  document.querySelectorAll('#run-gesture button').forEach((b) => b.classList.toggle('sel', b.dataset.g === settings.faceClickGesture));
}

function setSettings(next) {
  settings = { ...settings, ...next };
  engine.configure(settings);
  feedback.setMuted(!settings.sound);
  save();
}

function bindUi() {
  $('#next-0').onclick = () => showSetup(1);
  $('#cal-start').onclick = () => startCalibration();
  $('#cal-skip').onclick = () => showSetup(2);
  $('#next-2').onclick = () => showSetup(3);
  $('#go').onclick = () => {
    feedback.unlockAudio();
    startRunning();
  };
  $('#btn-pause').onclick = () => apply(engine.signal('togglePause', performance.now(), 'mouse'));
  $('#btn-recenter').onclick = () => recenter();
  $('#btn-setup').onclick = () => showSetup(0);

  document.addEventListener('click', (e) => {
    const g = e.target.closest('[data-g]');
    if (g) {
      setSettings({ faceClickGesture: g.dataset.g });
      renderGestureChoice();
      renderSettings();
      return;
    }
    const pm = e.target.closest('.pm[data-id]');
    if (pm) {
      setSettings(stepSensitivity(settings, pm.dataset.id, Number(pm.dataset.d)));
      return;
    }
    const s = e.target.closest('.pm[data-set]');
    if (s) {
      const row = SETTINGS_ROWS.find((r) => r.key === s.dataset.set);
      const v = Math.round((settings[row.key] + row.step * Number(s.dataset.d)) * 1000) / 1000;
      setSettings({ [row.key]: Math.min(row.max, Math.max(row.min, v)) });
      $(`#v-${row.key}`).textContent = row.fmt(settings[row.key]);
      return;
    }
    if (e.target.id === 'swap') {
      setSettings({ winkSwapEyes: !settings.winkSwapEyes });
      e.target.textContent = settings.winkSwapEyes ? 'On' : 'Off';
    }
    if (e.target.id === 'sound') {
      setSettings({ sound: !settings.sound });
      e.target.textContent = settings.sound ? 'On' : 'Off';
    }
  });
}

boot();
