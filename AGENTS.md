# AGENTS.md — Touch-free Computer Control (working title)

> Codex reads this file automatically at the start of every task. Keep it in the repository root.

## What this project is
A web app that lets people with motor impairments control an on-screen practice
environment without touching a mouse, keyboard, or touchpad, using only a standard
webcam. This is my individual course project for DA200 (Design of AI and Data-driven
Services, Fall 2026). It must open from a single public link (HTTPS) so classmates
and my professor can try it on any laptop.

MVP inputs:
- Head movement -> moves a virtual cursor (primary)
- Facial gesture (default: mouth open / `jawOpen`; option: eyebrow raise / `browInnerUp`) -> click (primary)
- Dwell click (hold the cursor still) -> click (fallback)
- Hand gesture -> click / pause (optional, off by default, for users with partial hand movement)

The browser cannot move the real OS mouse, so the app controls a VIRTUAL cursor inside
its own pages. A Chrome extension (control real websites) and a desktop app (control
the real mouse) are stretch goals. Do not start them unless I ask.

## Core design principle
"The system turns my movements into clicks, but I make every decision."
- Never act when unsure. A missed click is better than a wrong click.
- Every detection and every action gets visible feedback (indicator + toast/highlight).
- Pause must always be one signal away, and nothing fires while paused.
- High-risk actions (any element with `data-risk="high"`) need a second, different,
  deliberate confirmation signal. A timeout cancels.

## My own AI feature (the core of the project)
A personal intent classifier. During calibration the user records a few samples of
their own click gesture AND of look-alike movements (talking, yawning, coughing,
looking around, smiling). A k-NN classifier over a short window of MediaPipe face
blendshape features decides whether a movement is an intentional click and outputs a
confidence score. A click fires only above the user's confidence threshold; below it,
nothing happens (optionally a "Did you mean to click?" hint).
Until this exists, use a simple threshold + hold-time trigger so the rest of the app works.
Implement k-NN myself in plain JS. No external ML library.

## Design lessons carried over from my earlier proposal (keep these)
My earlier concept (voice taps on a phone) was reviewed by my professor. The target is now
final: people with motor impairments controlling a computer touch-free. These technical
ideas from that review still apply and must stay in the design:
- Confidence-gated actions: act only above a threshold; when unsure, ask or do nothing.
- High-risk blocklist: deleting, submitting, sending, paying, changing settings need
  explicit confirmation (`data-risk="high"`), never a single gesture.
- Adversarial look-alikes: test with movements that look like a click but are not
  (talking, yawning, coughing, smiling, looking away). They must be rejected.
- On-device processing: camera data never leaves the browser.
- A pause signal that always works, and a visible state (ACTIVE / PAUSED / CONFIRMING).
- Automation cap: the system suggests and executes, but never decides on its own
  (roughly Sheridan level 5–7). No auto-actions without a user signal.
- Verify AI-written code: labeled test set run as automated tests, every generated file
  reviewed, and a privacy/secret audit before sharing the link.
- Link-openable web beta first; native apps are stretch goals.
- Differentiation: existing tools (Google Project Gameface, macOS Head Pointer, Camera Mouse)
  already move a cursor with the head. My edge is the personal intent classifier that cuts
  false clicks from natural movement, plus measured results (false clicks per 10 minutes).

## Tech stack
- Vite + vanilla JavaScript (ES modules). No framework unless I agree.
- `@mediapipe/tasks-vision`: FaceLandmarker (blendshapes + facial transformation matrix,
  running mode VIDEO) and GestureRecognizer. Check the current official MediaPipe docs
  for API details; do not rely on memory. Load model/wasm files from the official CDN.
- Vitest for unit tests of pure logic.
- Static deploy: GitHub Pages via GitHub Actions (configure Vite `base`). HTTPS is required for webcam access.
- Persistence: `localStorage` only (calibration profile, settings, session metrics).
- No backend, no API keys.

## Vision and interaction implementation rules
These come from webcam demos that were tuned by actually running them. Follow them unless I say otherwise.
- **Scale-invariant thresholds (most important).** Divide every distance by a body-size
  reference before comparing: face width (landmarks 234 <-> 454) for face features, palm size
  (wrist 0 <-> middle MCP 9) for hand features. Moving closer to or farther from the camera
  must not change decisions.
- **Aspect-ratio correction.** Landmarks are normalized 0–1 per axis; multiply x by
  `videoWidth / videoHeight` before computing distances or angles.
- **Mirror mode.** Apply `transform: scaleX(-1)` to the `<video>` only. Do not transform the
  canvas; flip coordinates in code with `1 - x`. Cursor movement must match the user's
  direction (head turns right -> cursor moves right on screen).
- **object-fit: cover correction.** Map landmarks to screen with
  `scale = max(canvasW / videoW, canvasH / videoH)` and centre the crop, so overlays line up.
- **Debounce every trigger.** A gesture is confirmed only after N consecutive frames, released
  after M consecutive missing frames, with a minimum hold time. Starting points: confirm 4–5
  frames, release 9–12 frames. Put these in settings/constants, not scattered literals.
- **Hysteresis + refractory + tracking-loss grace.** After a click fires, the signal must fall
  clearly below a lower "release" threshold before it can fire again; keep a minimum interval
  between clicks (≈600 ms); and if tracking is lost briefly (< ~400–900 ms), do not treat it as a
  release. Without these, a short tracking dropout causes double clicks (a real bug seen in demos).
- **Smoothing.** Exponential smoothing (or One Euro) on the cursor; starting factor ~0.45.
- **Loop and performance.** One `requestAnimationFrame` loop with a `busy` flag so only one frame
  is in flight. Do not use MediaPipe `camera_utils`. Cap canvas pixel ratio at
  `Math.min(devicePixelRatio, 1.5)`. If both face and hand models run, run hands every
  other frame (or only when hand input is on). No per-frame `shadowBlur`, emoji `fillText`, or
  `createRadialGradient`; pre-render glows to an offscreen canvas once.
- **Camera request.** `getUserMedia({ video: { width: {ideal:1280}, height: {ideal:720}, facingMode:'user' }, audio: false })`.
- **Pin versions.** Pin the exact `@mediapipe/tasks-vision` version in package.json and in the
  wasm/model URLs. Never use `@latest`.
- **Friendly failure states, no raw errors.** Catch `error` / `unhandledrejection`. Show a large,
  plain-language message only when something fails: model load failed (check internet, reload),
  camera permission denied (how to allow it in the address bar), no camera found, no face detected
  (lighting/position tips). Show a loading overlay with a spinner until the first video frame.
- **No developer look in user mode.** Do not draw face meshes or hand skeletons for users; show only
  the cursor, the detection indicator, and feedback. Landmark drawing is for `?dev=1` only.
- **Audio feedback (optional).** If I add click sounds, synthesize a short tone with Web Audio
  (no TTS), play it once per action (not repeatedly while held), resume the AudioContext on the
  first user signal, and allow mute.

## Structure
```
src/
  vision/      faceTracker.js, handTracker.js        (the ONLY place that calls MediaPipe)
  input/       headPointer.js, smoothing.js, dwell.js, faceClick.js, handGestures.js
  ai/          features.js, intentClassifier.js      (pure functions, fully tested)
  core/        inputController.js                    (state machine: ACTIVE / PAUSED / CONFIRMING)
  ui/          cursorOverlay.js, detectionIndicator.js, feedback.js, screens/
  data/        profileStore.js, sessionLogger.js
  practice/    target grid, mock news page, mock form with a high-risk "Delete" button
tests/
  fixtures/    labeled blendshape samples, including look-alike traps
```
Everything in `input/`, `ai/`, `core/`, `data/` must be pure, testable logic: numbers in,
decisions out. No DOM or MediaPipe imports there.

## Hard rules (privacy, safety, accessibility)
- Never store, upload, or log video frames or images. Process frames in memory only.
- No analytics, trackers, or network requests other than loading MediaPipe models/wasm.
- No secrets in the repo.
- Always show whether the camera is on and whether input is ACTIVE or PAUSED.
- Every screen, including onboarding, calibration and settings, must be usable with the
  virtual cursor alone. A step that needs a real mouse is a bug.
- Click targets at least 64x64 px with generous spacing, high contrast, respect `prefers-reduced-motion`.
- Keep a developer fallback (`?dev=1`: real mouse/keyboard, plus a "replay fixture" mode
  that feeds recorded blendshape JSON instead of the camera) so logic can be tested without a webcam.

## Working in this sandbox
- You cannot use a webcam here. Verify with unit tests, `npm run build`, and the fixture-replay
  mode. Tell me exactly what I need to check myself in a real browser.
- Before finishing any task, run `npm test` and `npm run build` and report the results.
  Do not say a task is done if either fails.

## How to work with me
- I have basic Python/JS experience. In your final message, explain what changed and why in plain language.
- Keep changes small and focused on the current phase. Do not refactor unrelated code.
- Ask (or stop and list options) before adding any new dependency.
- Write or update unit tests for every piece of pure logic you touch.
- Append an entry to `AI_USE_LOG.md` for every task: date, files AI generated or changed,
  what I still need to review, which tests verify it. This is a course requirement for
  honest AI attribution, and my professor asked for a plan to verify AI-written code.
- Write docs and UI text in first person singular ("I"), not "we/team": this is an individual project.
