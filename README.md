# Touch-free Control

**Move your computer's real mouse with your head and click with a wink, in every program. No hands, just a webcam.**

A free, open-source (Apache-2.0) tool for people who can't easily use their hands, for example after a spinal cord
injury, with ALS or with a strong tremor. I am building it as my individual project for DA200 (Fall 2026).

<!-- Demo GIF: record a 10-second screen capture of the desktop app (hands in lap) and save it as docs/images/demo.gif, then show it here:
![Touch-free Control demo](docs/images/demo.gif) -->

| | How |
| --- | --- |
| 🖱️ **Move** | Turn your head. The real mouse pointer follows, in any app or website. |
| 👉 **Click** | Wink and hold for 1.5 s (left eye = click, right eye = right click). Normal blinks never click. |
| ⏸️ **Pause** | Close both eyes for 2 s (or Ctrl+Alt+P). Nothing is clicked while paused. |
| 🎯 **Click lock** | While you hold a wink, the pointer stays still, so the click lands where you aimed. |
| 🔒 **Privacy** | Camera frames are processed on your computer only. Nothing is stored or sent. |

## Try it

- **Windows app (the real tool):** download `TouchFreeControl-0.3.0-windows.zip` from
  [Releases](https://github.com/EastSea0817/touch-free-control/releases), unzip it and run the `.exe`
  (Windows may warn about an unknown app: More info → Run anyway). Or build it yourself (see below).
- **Browser demo (no install):** [eastsea0817.github.io/touch-free-control](https://eastsea0817.github.io/touch-free-control/)
  in Chrome with a webcam. A browser is not allowed to move the real mouse, so this demo moves a cursor
  **inside its own practice pages only**. It is a quick way to feel the head pointer and wink click.

**Status:** student beta. What the beta must do, and what waits for later: [docs/beta-scope.md](docs/beta-scope.md).

## How it works

```
webcam → face model (MediaPipe, on device) → head pose → my head range → smoothing → cursor
                                           → wink / eyes-closed detection → input controller → click · pause · confirm
```

The full picture, with the file for each step and where to look when something breaks:
[docs/how-it-works.md](docs/how-it-works.md).

## Desktop app (v0.3.0): controls the real Windows mouse

The main app. It runs on Windows (Electron) and moves and clicks the **real** mouse, so it works in every program:
the browser, Word, YouTube, games.

- **Layout:** a sidebar (Home, the three setup steps with done marks, Cursor & timing, Shortcuts & help, a small live camera view) and a top bar with the status, Pause and a Mouse control on/off switch. Light and dark mode follow Windows.
- **Setup once (3 steps):** camera and light check (light, distance, position) → 5-point head range → choose how to click and set its sensitivity with a live meter. After that the app starts by itself.
- **Click lock:** while a click gesture is being held, the cursor stays still, so the click lands where I aimed (opening the mouth or winking moves the face a little).
- **Pause:** close both eyes for 2 s, or Ctrl+Alt+P (for a caregiver). **Re-center:** Ctrl+Alt+C.
- The face model and MediaPipe wasm are bundled, so it starts without the internet; if missing it falls back to the CDN.

```bash
npm install
npm run desktop        # build and open the desktop app
npm run desktop:dist   # make a portable Windows .exe in release/
```

Credit: the sidebar layout, step-by-step setup and per-gesture sensitivity meter were inspired by
[Google Project Gameface](https://github.com/google/project-gameface) (Apache-2.0). No Gameface code is included;
the ideas were rebuilt in JavaScript.

## Something not working?

In the browser demo, open **Settings → Copy debug info** and paste the text into a
[bug report](https://github.com/EastSea0817/touch-free-control/issues/new?template=bug_report.md).
It lists the version, settings and the last clicks, pauses and errors. It never includes camera images or face data.
For the Windows app, describe what happened and which setting you changed (a debug button there is planned).

## Want to help?

Start with an issue labelled
[good first issue](https://github.com/EastSea0817/touch-free-control/labels/good%20first%20issue) and read
[CONTRIBUTING.md](CONTRIBUTING.md). Trying the app with your hands in your lap and telling me what was hard helps too.

## How I check AI-written code

Most of this code was written with an AI coding assistant, and I am responsible for it. Every change is small,
tested (`npm test`, also on GitHub for every pull request), run by me by hand, and logged in
[AI_USE_LOG.md](AI_USE_LOG.md). The checklist: [docs/verification.md](docs/verification.md).

## Browser demo (web version)

- **Move the cursor** by turning my head.
- **Click** by winking (left eye = click, right eye = right click, held 1.5 s), or by opening my mouth / raising my eyebrows, or by holding the cursor still on a target (dwell).
- **Pause** by closing both eyes for 2 seconds. Nothing is clicked while paused.
- **Hand gestures** (optional, off by default): make a fist to click, hold an open palm for 1.5 s to pause.
- **Risky buttons** (marked `data-risk="high"`) ask "Confirm?" and need a second, *different* signal. A timeout cancels.

The browser cannot move the real mouse, so the web app moves a virtual cursor inside its own pages.
The only network requests load the MediaPipe model and wasm files.

### Screens (browser demo)

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
src/core/     settings, input controller (ACTIVE/PAUSED/CONFIRMING), input engine, debug log (pure)
src/data/     profile store (localStorage)
src/desktop/  desktop app page: click lock, environment check, gesture meters
electron/     desktop shell: window, real mouse (user32 via koffi), shortcuts
src/ui/       cursor, detection indicator, feedback, screens
src/dev/      replay and recorder
tests/        Vitest tests + fixtures
```

## Publish with GitHub Pages

1. Push to the `main` branch.
2. In the repository: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. The workflow in `.github/workflows/deploy.yml` runs the tests, builds, and deploys.
4. The link appears in **Actions → the latest run → deploy**, like `https://<user>.github.io/<repo>/`.
