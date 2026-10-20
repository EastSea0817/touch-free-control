# AI use log

I record every task where AI wrote or changed code, what I still need to review,
and which tests verify it (course requirement for honest AI attribution).

## 2026-10-06 · Phases 0–2 (setup, head cursor, face click, pause)

**Tool:** Claude (Claude Code), following AGENTS.md and the Phase 0–2 prompts.

**Files AI generated:**
- Setup: `package.json`, `vite.config.js`, `index.html`, `src/styles.css`, `.github/workflows/deploy.yml`, `README.md`
- Vision (MediaPipe only): `src/vision/mediapipe.js`, `camera.js`, `faceTracker.js`, `handTracker.js`
- Pure logic: `src/input/screenMapping.js`, `headPointer.js`, `smoothing.js`, `dwell.js`, `faceClick.js`, `handGestures.js`, `calibration.js`;
  `src/core/settings.js`, `inputController.js`, `inputEngine.js`; `src/data/profileStore.js`; `src/dev/replay.js`
- UI: `src/main.js`, `src/ui/cursorOverlay.js`, `detectionIndicator.js`, `feedback.js`, `screens/practice.js`
- Tests: `tests/*.test.js`, `scripts/make-synthetic-fixture.js`, `tests/fixtures/synthetic-session.json` (SYNTHETIC numbers, not a real recording)

**Design choices to understand and be able to explain:**
- Head pose = nose tip offset from the face centre, divided by face width/height (scale-invariant). Not the transformation matrix.
- Smoothing = One Euro filter (smooths tremor when still, follows fast moves).
- Face click = debounce (4 frames + 120 ms) + hysteresis (on 0.5 / off 0.25, 10 release frames) + 600 ms refractory + tracking-loss grace. A tracking loss after a click is never treated as a release.
- Dwell only on clickable targets and only while the cursor is really tracked; must leave before it can fire again.
- Real mouse/keyboard clicks also go through the controller, so PAUSED and high-risk confirmation cannot be bypassed.
- MediaPipe pinned to 0.10.35 (1.1.0 was released the same day and is untested).

**What I still need to review / check myself in a real browser:**
- [ ] Read each generated file (start with `src/input/faceClick.js` and `src/core/inputController.js`).
- [ ] Cursor direction: turning my head right moves the cursor right; looking up moves it up.
- [ ] Default thresholds feel right (mouth click 0.5, eyes-closed 0.55 for 2 s, dwell 1.2 s). Normal talking should rarely click.
- [ ] Calibration reaches all four corners.
- [ ] Record my own 3 s samples in `?dev=1` (talking, yawning, clicks) and add them to `tests/fixtures/`.
- [ ] Privacy check: the Network tab shows only jsdelivr (wasm) and storage.googleapis.com (model) requests.

**Tests that verify it:** `npm test` → 72 tests in 11 files (mapping, head pose scale invariance, smoothing,
dwell, trigger debounce/hysteresis/refractory/300 ms tracking drop, hold detector, hand openness,
state machine incl. "no click in PAUSED" and confirmation, profile store, calibration, replay/recorder,
and the whole engine on the synthetic replay). `npm run build` passes.
Browser check by AI (headless Chromium, fake camera without a face): page loads, model loads,
"I can't see your face" message shows, replay pauses/resumes, high-risk confirmation rejects the same
signal and accepts a different one, clicks are blocked while paused.

## 2026-10-06 · Wink clicks (my request)

**What changed:** New click mode, now the default: left wink = left click, right wink = right click.
A wink means one eye closed while the other stays open (a normal blink closes both eyes),
held for 1.5 s (my choice, so it is never mistaken for a blink). "Click with" cycles winks → mouth → eyebrows.
"Swap eyes" exists in case the camera reports the eyes the other way round. Right click never starts
or runs a high-risk action. The cursor ring fills while a wink is held.

**Files AI changed:** `src/core/settings.js`, `src/input/faceClick.js` (`winkValues`, time-based progress),
`src/core/inputEngine.js`, `src/core/inputController.js`, `src/main.js`, `src/ui/feedback.js`,
`src/ui/screens/practice.js` (right click flags a target), `index.html`, `src/styles.css`.

**I still need to check:** a left wink makes a left click (not right); 1.5 s feels OK; squinting or rubbing an eye does not click.

**Tests:** `tests/wink.test.js` (wink vs blink, short wink, pause, right click on high-risk, paused) and a progress test in
`tests/faceClick.test.js`. `npm test` → 82 passed; `npm run build` passes.

## 2026-10-06 · Phase 3: interim skeleton (one flow, cursor only)

**What changed:** Start-up guide (privacy → camera check → choose how to click → calibrate or skip),
a Home menu, a Settings ("rules") screen with big −/+ and toggle buttons, and three practice tasks:
(a) targets, (b) mock news page (open the library article), (c) mock form with a high-risk
"Delete my account" button. Big Up/Down scroll buttons appear on long pages because the virtual cursor
has no scroll wheel. Dwell now waits until the cursor moves away after ANY click, so a new button
appearing under a resting cursor is never clicked by accident (a real bug found while testing this phase).

**Files AI generated/changed:** `index.html`, `src/styles.css`, `src/main.js`, `src/ui/router.js`,
`src/ui/screens/onboarding.js`, `news.js`, `form.js`, `settings.js`, `src/core/settings.js` (`SETTING_SPECS`,
`stepSetting`, `formatSetting`), `src/data/profileStore.js` (`onboarded`), `src/input/dwell.js`, `src/core/inputEngine.js`.

**Cursor-only audit (AI, headless Chromium at 1280×800 and 1024×700):** every button on every screen is at
least 64×64 px and is not covered by another element at its centre; all three tasks and the onboarding
were completed; Delete opened the confirmation and Cancel did nothing. Steps that needed a real mouse: none found.
(The audit used real mouse clicks routed through the same controller, not a real face.)

**I still need to check:** the whole flow with my face only (no hands), especially onboarding step 1 → 2 → 3.

**Tests:** `tests/settings.test.js`, `tests/onboarding.test.js`, new cases in `tests/dwell.test.js`.
`npm test` → 95 passed; `npm run build` passes.

## 2026-10-07 · Cursor speed setting (my request: the cursor felt too sensitive)

New setting `cursorSpeed` (default 0.8, Settings → Cursor speed, 0.4–1.6). It widens or narrows my calibrated head range
(`scaleRange` in `src/input/headPointer.js`, used in `src/core/inputEngine.js`). Test: `tests/headPointer.test.js` "cursor speed". `npm test` → 96 passed; build passes.

## 2026-10-08 · Form fix from my pilot test

In my pilot, the "Delete my account" button was below the bottom of the window on the form screen, so I never saw it.
Measured: on a 1280×600 window its top was at 614 px (off screen). Now the form is compact (topic and frequency side by side,
choice buttons 72 px tall, still ≥ 64 px) and the button sits at 335–415 px. Files: `index.html`, `src/styles.css`. `npm test` passes.

## 2026-10-17 · Desktop app that drives the real Windows mouse (v0.2.0)

**Why:** After testing Google Project Gameface I wanted my tool to replace the real mouse in every program, not only inside my web page.
The web version stays as the link-openable class demo.

**Tool:** Claude (Claude Code). Gameface (Apache-2.0, Python) was used for **ideas only**; no Gameface code was copied.
Ideas taken: step-by-step setup screen, per-gesture sensitivity with a live meter. My own answers to the problems I found in Gameface:
click lock, wink clicks, real 5-point calibration, pre-start light/distance/position check, setup done once and remembered.

**Files AI generated/changed:**
- Desktop shell: `electron/main.cjs` (window, `app://` protocol, camera-only permission, Ctrl+Alt+P / Ctrl+Alt+C shortcuts),
  `electron/preload.cjs` (the only bridge: screen size, move, click, full screen), `electron/mouse.cjs` (user32 `SetCursorPos` + `mouse_event` through koffi)
- Page: `desktop.html`, `src/desktop/app.js`, `src/desktop/desktop.css`
- Pure logic: `src/desktop/cursorGate.js` (click lock, still cursor while paused), `src/desktop/envCheck.js`, `src/desktop/meters.js`
- Shared: `src/core/inputEngine.js` (`recenter()`), `src/vision/mediapipe.js` (bundled wasm/model first, CDN fallback),
  `src/vision/faceTracker.js` (switch to CPU if the GPU fails on the first frame), `scripts/fetch-mediapipe.js`, `vite.config.js`, `package.json`
- Versions updated to the latest: MediaPipe 0.10.35 → 1.1.1, Vite 8.3.4, Vitest 5.0.5, Electron 44.8.0, electron-builder 26.15.3, koffi 3.3.3

**Checked by AI:** `npm test` → 117 passed (new: `tests/desktop.test.js`, recenter test). `npm run build` passes.
Headless Chromium with a fake camera: setup → steps 1–4 → running → pause works, settings are saved, MediaPipe 1.1.1 loads.
Electron under a virtual display (Linux): the window opens from `app://local/desktop.html` with no internet for the model,
the bridge answers, and the CPU fallback kicks in when WebGL is missing. A Windows portable `.exe` was built and contains the Windows koffi module.

**Not checked (needs my Windows laptop):**
- [ ] The real mouse moves and clicks (`SetCursorPos` / `mouse_event`). This could not run in the Linux test machine.
- [ ] Cursor position is right on a high-DPI screen (125 % / 150 % scaling) and on the primary monitor only.
- [ ] Click lock feels right: the cursor stops while I hold a wink and the click lands on the target.
- [ ] Windows SmartScreen warning on the unsigned `.exe` (More info → Run anyway).
- [ ] Read `electron/mouse.cjs`, `src/desktop/cursorGate.js` and `src/desktop/app.js` myself.

## 2026-10-20 · Professional desktop design (v0.3.0)

**Why:** The first desktop window looked cheap. I wanted it to feel like a finished product, like Google Project Gameface.
I approved a screenshot draft before anything was pushed.

**Tool:** Claude (Claude Code). Gameface was used as a visual reference only; no Gameface code or images were copied.

**What changed (look only, the engine and gestures are the same):**
- Sidebar navigation: Home, Camera & light, Head range, Click gestures (each with a done mark), Cursor & timing, Shortcuts & help, small live camera view
- Top bar: status, Pause, and a Mouse control on/off switch
- Home hero with a drawing and setup tiles; camera check shown as a light / distance / position checklist; gesture cards with icons
- Settings as rows with a short explanation, − / + buttons and a small track; on/off switches for swap eyes and sounds
- Inline SVG icons, Material-like colours, automatic dark mode, every button at least 64x64 px, reduced motion respected
- Window 1120x780 (was a tall 440x760 always-on-top window)
- Files: `desktop.html`, `src/desktop/desktop.css`, `src/desktop/app.js`, `electron/main.cjs`, README, 시작하기.md

**Checked by AI:** `npm test` → 117 passed. `npm run build` passes. Headless Chromium with a fake camera: every page opens from the sidebar,
"Finish setup" turns mouse control on, the switch and Pause work, settings are saved, light and dark screenshots look right.

**Not checked (needs my Windows laptop):**
- [ ] The new window size and layout on my real screen (and at 125 % / 150 % scaling)
- [ ] The window is no longer always on top: check that minimising it while controlling the mouse feels fine
