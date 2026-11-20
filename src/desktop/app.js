// Desktop app wiring: camera -> MediaPipe -> the SAME input engine as the web
// prototype -> the REAL Windows mouse (through window.desktop from preload.cjs).
// Ideas from testing Google Project Gameface (Apache-2.0), rebuilt in JS:
// sidebar layout, step-by-step setup, per-gesture sensitivity with a live meter. My own additions:
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
import { createSessionRecorder, addSession, describeSessions, diagnose, predictRisk, prescribe, sessionsCsv, clicksCsv } from '../core/usageStats.js';
import { loadStats, saveStats, clearStats } from '../data/statsStore.js';

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
let controlling = false; // true while the real mouse follows the head
let page = 'home';
let cameraChecked = false;
let calibration = null;
let lastVideoTime = -1;
let envOk = false;
let envFrames = 0;
let lastEnv = null;
const gate = createCursorGate();
const feedback = createFeedback(document.createElement('div'));
feedback.setMuted(!settings.sound);

const video = $('#video'); // the small live view in the sidebar; tracking reads this one
const bigVideo = $('#video-big'); // the large preview on the camera page (same stream)
const canvas = document.createElement('canvas');
canvas.width = 64;
canvas.height = 36;
const ctx2d = canvas.getContext('2d', { willReadFrequently: true });

function save() {
  saveProfile({ settings, range, onboarded });
}

// ---------- usage insights (opt-in, numbers only, this computer only) ----------
let stats = loadStats();
let recorder = null;

function startRecording() {
  if (stats.optIn && !recorder) recorder = createSessionRecorder({ gesture: settings.faceClickGesture, settings });
}

function stopRecording() {
  if (!recorder) return;
  stats.sessions = addSession(stats.sessions, recorder.finish());
  recorder = null;
  saveStats(stats);
}

// keep what was recorded if the window is closed while controlling
window.addEventListener('beforeunload', () => stopRecording());

// ---------- startup ----------
async function boot() {
  bindNav();
  go('home');
  renderStatus();
  if (desktop) {
    screenInfo = await desktop.getScreen();
    if (!(await desktop.mouseSupported())) $('#mouse-note').classList.remove('hidden');
    desktop.onShortcut((name) => {
      if (!engine) return;
      if (name === 'togglePause') apply(engine.signal('togglePause', performance.now(), 'keyboard'));
      if (name === 'recenter') recenter();
      if (name === 'wrongClick') markWrongClick();
    });
  }
  try {
    await startCamera(video);
    bigVideo.srcObject = video.srcObject;
    bigVideo.play().catch(() => {});
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
  renderGestureChoice();
  // Caregiver-once setup: after the first setup the app goes straight to work.
  if (onboarded) setControl(true);
  renderStatus();
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
  renderStatus('error');
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
  if (page === 'click') renderMeters(face?.blendshapes ?? null);

  if (controlling) {
    const paused = r.state === STATE.PAUSED;
    const intent = clickIntent(face?.blendshapes ?? null, settings, r.progress.face) ? 1 : 0;
    const g = gate.update(r.cursor, intent, paused);
    recorder?.frame({ face: !!face, cursor: r.cursor });
    if (g.move && desktop) desktop.moveMouse(g.move.x + screenInfo.x, g.move.y + screenInfo.y);
    apply(r.actions, g.clickAt);
  } else {
    apply(r.actions.filter((a) => a.type !== 'click'));
  }
}

function apply(actions, clickAt = null) {
  for (const a of actions) {
    if (a.type === 'click' && controlling) {
      const p = clickAt ?? engine.cursor;
      desktop?.click(a.button === 'right' ? 'right' : 'left', p.x + screenInfo.x, p.y + screenInfo.y);
      feedback.beep(a.button === 'right' ? 'right' : 'click');
      recorder?.click();
    } else if (a.type === 'state') {
      renderStatus();
    } else if (a.type === 'paused') {
      feedback.beep('pause');
      recorder?.pause();
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

// ---------- status (sidebar card) ----------
function renderStatus(forced) {
  const paused = engine?.controller.state === STATE.PAUSED;
  const kind = forced ?? (!engine ? 'starting' : !controlling ? 'off' : paused ? 'paused' : 'on');
  $('#state').textContent = {
    starting: 'Starting the camera…',
    error: 'Something went wrong',
    off: 'Mouse control is off',
    paused: 'Paused',
    on: 'Controlling the mouse',
  }[kind];
  $('#status-card').dataset.kind = kind;
  const sw = $('#control-switch');
  sw.setAttribute('aria-checked', String(controlling));
  sw.disabled = !engine;
  const pause = $('#btn-pause');
  pause.textContent = paused ? 'Resume' : 'Pause';
  pause.classList.toggle('hidden', !controlling);
  $('#btn-begin').classList.toggle('hidden', onboarded);
  const start = $('#btn-start');
  start.classList.toggle('hidden', !onboarded);
  start.textContent = controlling ? 'Stop mouse control' : 'Start mouse control';
  start.classList.toggle('primary', !controlling);
  start.classList.toggle('tonal', controlling);
  renderStepMarks();
}

function renderStepMarks() {
  const done = { camera: onboarded || cameraChecked, range: onboarded || !!range, click: onboarded };
  document.querySelectorAll('.step-mark').forEach((m) => {
    m.classList.toggle('done', !!done[m.dataset.for]);
    m.innerHTML = done[m.dataset.for] ? '<svg><use href="#i-check" /></svg>' : '';
  });
}

function setControl(on) {
  controlling = on;
  gate.reset();
  if (on) startRecording();
  else stopRecording();
  if (on) {
    feedback.unlockAudio();
    onboarded = true;
    save();
  }
  renderStatus();
}

// ---------- pages ----------
function go(name) {
  page = name;
  document.querySelectorAll('.page').forEach((p) => p.classList.toggle('hidden', p.dataset.page !== name));
  document.querySelectorAll('#nav [data-page]').forEach((b) => b.classList.toggle('cur', b.dataset.page === name));
  if (name === 'camera') $('#next-camera').disabled = !envOk;
  if (name === 'range') $('#range-status').textContent = range ? 'I have a saved range. Start again to replace it.' : '';
  if (name === 'click') renderGestureChoice();
  if (name === 'insights') renderInsights();
  $('.main').scrollTop = 0;
}

function bindNav() {
  document.addEventListener('click', (e) => {
    const n = e.target.closest('#nav [data-page], [data-go]');
    if (n) go(n.dataset.go ?? n.dataset.page);
  });
}

function recenter() {
  // forget the auto range: the next second of looking at the middle becomes the centre
  range = null;
  engine.recenter();
  gate.reset();
  save();
  renderStepMarks();
  flash('Re-centered. Look at the middle of the screen for a second.');
}

// ---------- environment check ----------
const CHECKS = {
  light: { codes: ['dark', 'bright'], ok: 'The light is good.' },
  distance: { codes: ['far', 'near'], ok: 'You are at a good distance.' },
  position: { codes: ['offCenter'], ok: 'Your face is in the middle.' },
};

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
  if (recorder) {
    const code = (list) => env.hints.find((h) => list.includes(h.code))?.code;
    recorder.env({ light: code(['dark', 'bright']) ?? 'ok', distance: code(['far', 'near']) ?? 'ok' });
  }
  if (env.ok && !cameraChecked) {
    cameraChecked = true;
    renderStepMarks();
  }
  const key = env.hints.map((h) => h.code).join();
  if (key !== lastEnv) {
    lastEnv = key;
    const noFace = env.hints.find((h) => h.code === 'noFace');
    for (const [name, c] of Object.entries(CHECKS)) {
      const li = document.querySelector(`#checks [data-check="${name}"]`);
      const hint = env.hints.find((h) => c.codes.includes(h.code)) ?? (name !== 'light' ? noFace : null);
      li.dataset.state = hint ? 'bad' : 'ok';
      li.querySelector('[data-text]').textContent = hint ? hint.text : c.ok;
      li.querySelector('.ck-state').innerHTML = `<svg><use href="#${hint ? 'i-dot' : 'i-check'}" /></svg>`;
    }
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
  if (page === 'camera') $('#next-camera').disabled = !env.ok;
}

// ---------- calibration (full screen) ----------
let controlBeforeCalibration = false;
async function startCalibration() {
  controlBeforeCalibration = controlling;
  controlling = false;
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
  controlling = controlBeforeCalibration;
  gate.reset();
  renderStatus();
  go(newRange || !onboarded ? 'click' : 'range');
  if (!newRange) flash('I could not finish the head range. I kept the previous one.');
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
  document.querySelectorAll('#gesture-choice [data-g]').forEach((b) => {
    const sel = b.dataset.g === settings.faceClickGesture;
    b.classList.toggle('sel', sel);
    b.setAttribute('aria-pressed', String(sel));
  });
  $('#gesture-help').textContent = GESTURE_HELP[settings.faceClickGesture];
}

function renderMeters(blendshapes) {
  const host = $('#meters');
  const meters = gestureMeters(blendshapes, settings);
  if (host.dataset.sig !== settings.faceClickGesture) {
    host.dataset.sig = settings.faceClickGesture;
    host.innerHTML = meters
      .map(
        (m) => `<div class="meter" data-id="${m.id}">
          <div class="meter-label"><span>${m.label}</span><span class="meter-state"></span></div>
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
    const pass = m.value !== null && m.value >= m.threshold;
    el.querySelector('.fill').style.width = `${Math.round((m.value ?? 0) * 100)}%`;
    el.querySelector('.line').style.left = `${Math.round(m.threshold * 100)}%`;
    const st = el.querySelector('.meter-state');
    st.textContent = m.value === null ? 'I cannot see your face' : pass ? 'Click' : '';
    st.classList.toggle('muted', !pass);
    el.classList.toggle('pass', pass);
  }
}

// ---------- settings (big − / + buttons) ----------
const SETTINGS_ROWS = [
  { key: 'cursorSpeed', label: 'Cursor speed', help: 'How far the cursor moves when I turn my head.', step: 0.1, min: 0.4, max: 1.6, fmt: (v) => `${v.toFixed(1)}×` },
  { key: 'smoothing', label: 'Smoothing', help: 'Higher is steadier but a little slower.', step: 0.1, min: 0, max: 1, fmt: (v) => v.toFixed(1) },
  { key: 'winkHoldMs', label: 'Wink hold time', help: 'How long I keep one eye closed to click.', step: 250, min: 500, max: 3000, fmt: (v) => `${(v / 1000).toFixed(2)} s` },
  { key: 'eyesPauseHoldMs', label: 'Pause hold time', help: 'How long I close both eyes to pause.', step: 500, min: 1000, max: 4000, fmt: (v) => `${(v / 1000).toFixed(1)} s` },
];
const TOGGLES = [
  { id: 'swap', key: 'winkSwapEyes', label: 'Swap left and right eye', help: 'Use this if the camera image is not mirrored.' },
  { id: 'sound', key: 'sound', label: 'Click sounds', help: 'A short sound for each click and pause.' },
];

function renderSettings() {
  $('#settings').innerHTML =
    SETTINGS_ROWS.map(
      (r) => `<div class="set-row"><div class="set-text"><b>${r.label}</b><small>${r.help}</small></div>
        <div class="stepper">
          <button class="pm" data-set="${r.key}" data-d="-1" aria-label="Less">−</button>
          <div class="step-mid"><output id="v-${r.key}">${r.fmt(settings[r.key])}</output><div class="mini-track"><span id="t-${r.key}"></span></div></div>
          <button class="pm" data-set="${r.key}" data-d="1" aria-label="More">+</button>
        </div></div>`,
    ).join('') +
    TOGGLES.map(
      (t) => `<div class="set-row"><div class="set-text"><b>${t.label}</b><small>${t.help}</small></div>
        <button class="switch" id="${t.id}" role="switch" aria-checked="${!!settings[t.key]}" aria-label="${t.label}"><span></span></button></div>`,
    ).join('');
  SETTINGS_ROWS.forEach(renderTrack);
}

function renderTrack(row) {
  $(`#v-${row.key}`).textContent = row.fmt(settings[row.key]);
  $(`#t-${row.key}`).style.width = `${((settings[row.key] - row.min) / (row.max - row.min)) * 100}%`;
}

function setSettings(next) {
  settings = { ...settings, ...next };
  engine.configure(settings);
  feedback.setMuted(!settings.sound);
  save();
}

function bindUi() {
  $('#btn-begin').onclick = () => go('camera');
  $('#btn-start').onclick = () => setControl(!controlling);
  $('#control-switch').onclick = () => setControl(!controlling);
  $('#next-camera').onclick = () => go('range');
  $('#cal-start').onclick = () => startCalibration();
  $('#cal-skip').onclick = () => go('click');
  $('#next-click').onclick = () => {
    setControl(true);
    go('home');
    flash('Setup is done. I am now controlling the mouse.');
  };
  $('#btn-pause').onclick = () => apply(engine.signal('togglePause', performance.now(), 'mouse'));
  $('#btn-recenter').onclick = () => recenter();
  $('#btn-setup').onclick = () => go('camera');
  $('#stats-optin').onclick = () => setOptIn(!stats.optIn);
  $('#btn-wrong').onclick = () => markWrongClick();
  $('#btn-export').onclick = () => exportCsv();
  $('#btn-clear-stats').onclick = () => {
    stopRecording();
    stats = { optIn: stats.optIn, sessions: [] };
    clearStats();
    saveStats(stats);
    startRecordingIfControlling();
    renderInsights();
    flash('Your usage numbers were deleted.');
  };
  setInterval(() => {
    if (page === 'insights') renderInsights();
  }, 2000);

  document.addEventListener('click', (e) => {
    const g = e.target.closest('[data-g]');
    if (g) {
      setSettings({ faceClickGesture: g.dataset.g });
      renderGestureChoice();
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
      renderTrack(row);
      return;
    }
    const t = TOGGLES.find((x) => x.id === e.target.closest('.switch')?.id);
    if (t) {
      setSettings({ [t.key]: !settings[t.key] });
      e.target.closest('.switch').setAttribute('aria-checked', String(!!settings[t.key]));
    }
  });
}

// ---------- My insights page (Lesson 23: descriptive, diagnostic, predictive, prescriptive) ----------
function startRecordingIfControlling() {
  if (controlling) startRecording();
}

function setOptIn(on) {
  stats.optIn = on;
  if (on) startRecordingIfControlling();
  else stopRecording();
  saveStats(stats);
  renderInsights();
}

function markWrongClick() {
  if (!recorder) return flash(stats.optIn ? 'Start mouse control first.' : 'Turn on "Keep usage numbers" in My insights first.');
  flash(recorder.markWrong() ? 'Thanks. I noted that the last click was wrong.' : 'There was no click in the last 15 seconds.');
  if (page === 'insights') renderInsights();
}

function esc(t) {
  return String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

function renderInsights() {
  $('#stats-optin').setAttribute('aria-checked', String(stats.optIn));
  $('#insights-body').classList.toggle('off', !stats.optIn);
  // include the running session so the numbers move while you use the app
  const live = recorder ? { ...recorder.session, clicks: recorder.session.clicks.slice() } : null;
  const sessions = live ? [...stats.sessions, live] : stats.sessions;

  // 1. Descriptive
  const d = describeSessions(sessions);
  const kpi = (v, label) => `<div class="kpi"><b>${v}</b><small>${label}</small></div>`;
  $('#ins-kpis').innerHTML =
    kpi(d.successRate === null ? '–' : `${d.successRate}%`, 'clicks that were right') +
    kpi(d.wrongPer10, 'wrong clicks / 10 min') +
    kpi(d.minutes, `minutes in ${d.sessions} session${d.sessions === 1 ? '' : 's'}`);
  const max = Math.max(1, ...d.recent.map((r) => r.clicks));
  $('#ins-bars').innerHTML = d.recent.length
    ? d.recent
        .map((r) => {
          const ok = ((r.clicks - r.wrong) / max) * 100;
          const bad = (r.wrong / max) * 100;
          return `<div class="bar-col" title="${r.clicks} clicks, ${r.wrong} wrong, ${r.minutes} min"><div class="bad" style="height:${bad}%"></div><div class="ok" style="height:${ok}%"></div></div>`;
        })
        .join('')
    : '<p class="muted">No sessions yet.</p>';

  // 2. Diagnostic
  const dx = diagnose(sessions);
  $('#ins-why').innerHTML = dx.findings.length
    ? dx.findings.map((f) => `<li><span>${esc(f.text)}<small>${f.wrongRate}% wrong vs ${f.baseRate}% otherwise</small></span></li>`).join('')
    : `<li><span>${dx.enough ? 'Nothing stands out. Clicks go wrong about equally everywhere.' : 'Need more clicks to compare situations.'}<small>Based on ${dx.clicksUsed} clicks.</small></span></li>`;

  // 3. Predictive
  const risk = predictRisk(live);
  const label = { low: 'Low risk', medium: 'Medium risk', high: 'High risk' }[risk.level] ?? 'Waiting';
  $('#ins-risk').innerHTML = live
    ? `<span class="risk-badge" data-level="${risk.level ?? ''}">${label}</span><span>${esc(risk.reason)}</span>`
    : '<span class="muted">Start mouse control to see how this session is going.</span>';

  // 4. Prescriptive (the user approves every change)
  const todo = prescribe({ summary: d, findings: dx.findings, risk, settings, current: live });
  $('#ins-todo').innerHTML = todo.length
    ? todo
        .map(
          (t, i) => `<li><span>${esc(t.text)}<small>${esc(t.why)}</small></span>${
            t.patch ? `<button class="btn tonal" data-apply="${i}">Apply</button>` : t.go ? `<button class="btn text" data-go="${t.go}">Open</button>` : ''
          }</li>`,
        )
        .join('')
    : '<li><span>No changes needed right now.</span></li>';
  $('#ins-todo').onclick = (e) => {
    const b = e.target.closest('[data-apply]');
    if (!b) return;
    const t = todo[Number(b.dataset.apply)];
    setSettings(t.patch);
    renderSettings();
    renderGestureChoice();
    flash(`Applied: ${t.text}`);
    renderInsights();
  };
}

function exportCsv() {
  const all = recorder ? [...stats.sessions, recorder.session] : stats.sessions;
  for (const [name, text] of [
    ['nohands-sessions.csv', sessionsCsv(all)],
    ['nohands-clicks.csv', clicksCsv(all)],
  ]) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
}

boot();
