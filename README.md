# Touch-free Control (DA200 individual project, Fall 2026)

I am building a web app that lets people with motor impairments control a computer
without touching a mouse, keyboard or touchpad, using only a normal webcam.

- **Move the cursor** by turning my head.
- **Click** by winking (left eye = click, right eye = right click, held 1.5 s), or by opening my mouth / raising my eyebrows, or by holding the cursor still on a target (dwell).
- **Pause** by closing both eyes for 2 seconds. Nothing is clicked while paused.
- **Hand gestures** (optional, off by default): make a fist to click, hold an open palm for 1.5 s to pause.
- **Risky buttons** (marked `data-risk="high"`) ask "Confirm?" and need a second, *different* signal. A timeout cancels.

The browser cannot move the real mouse, so the app moves a virtual cursor inside its own pages.
Camera frames are processed on my device only. Nothing is stored or sent. The only network
requests load the MediaPipe model and wasm files (pinned version 0.10.35).

## Desktop app (v0.2.0): controls the real Windows mouse

The same engine also runs as a Windows desktop app (Electron) that moves and clicks the **real** mouse,
so it works in every program, not only inside my pages.

- **Setup once (4 step cards):** camera and light check → 5-point head range → choose how to click and set its sensitivity with a live meter → ready. After that the app starts by itself.
- **Click lock:** while a click gesture is being held, the cursor stays still, so the click lands where I aimed (opening the mouth or winking moves the face a little).
- **Pause:** close both eyes for 2 s, or Ctrl+Alt+P (for a caregiver). **Re-center:** Ctrl+Alt+C.
- The face model and MediaPipe wasm are bundled, so it starts without the internet; if missing it falls back to the CDN.

```bash
npm install
npm run desktop        # build and open the desktop app
npm run desktop:dist   # make a portable Windows .exe in release/
```

Credit: the step-card setup and per-gesture sensitivity meter were inspired by
[Google Project Gameface](https://github.com/google/project-gameface) (Apache-2.0). No Gameface code is included;
the ideas were rebuilt in JavaScript.

## Screens

Start-up guide (privacy, camera check, click style, calibration) → Home → three practice tasks
(targets, mock news, mock form with a high-risk Delete button) and Settings. Every screen works with
the virtual cursor alone; long pages get big Up/Down scroll buttons. Demo steps: `docs/demo-script.md`.

## Run it locally

```bash
npm install
npm run dev      # open the printed http://localhost:5173 link in Chrome
npm test         # unit tests (Vitest)
npm run build    # production build into dist/
```

The camera only works on `https://` or `localhost`, not when opening the HTML file directly.

## Dev mode (`?dev=1`)

Open `http://localhost:5173/?dev=1`:
- the real mouse moves the cursor, **C** = click, **P** = pause/resume
- face landmarks are drawn on the preview
- **Replay sample** plays a synthetic recording (talking, a click with a tracking drop, pause, a blocked click, resume, a click)
- **Record 3 s** downloads my blendshape numbers (no images) as JSON; **Load recording** replays one

## Folder structure

```
src/vision/   MediaPipe only (camera, face tracker, hand tracker)
src/input/    head pointer, smoothing, dwell, face click trigger, hand gestures, calibration (pure)
src/core/     settings, input controller (ACTIVE/PAUSED/CONFIRMING), input engine (pure)
src/data/     profile store (localStorage)
src/desktop/  desktop app page: click lock, environment check, gesture meters
electron/     desktop shell: window, real mouse (user32 via koffi), shortcuts
src/ui/       cursor, detection indicator, feedback, screens
src/dev/      replay and recorder
tests/        Vitest tests + fixtures
```

## Publish with GitHub Pages

1. Create a new GitHub repository and push this folder to the `main` branch.
2. In the repository: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. The workflow in `.github/workflows/deploy.yml` runs the tests, builds, and deploys.
4. The link appears in **Actions → the latest run → deploy**, like `https://<user>.github.io/<repo>/`.
