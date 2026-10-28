# How I verify code (especially AI-written code)

Most of this project was written with an AI coding assistant. The AI writes fast, but **I am responsible for
what it ships**. These rules come from Parth Panchal's SFSU CS seminar (Oct 27, 2026) and from my course
(DA200: verify and attribute AI-generated code).

## Rules for every change

1. **Small and focused.** One change per pull request, so I can read the whole diff.
2. **Run it myself before calling it done.** Tests passing is not enough; open the app and try the flow
   (checklist below), with my hands in my lap.
3. **Check that every API and package really exists.** Look at the official docs and pin the version
   (for example MediaPipe `@mediapipe/tasks-vision` in `package.json`). AI sometimes invents functions.
4. **No secrets in the repo.** API keys go in a `.env` file, which `.gitignore` keeps out of Git.
   This app needs no keys today; keep it that way unless there is no other choice.
5. **Understand the system, not every line.** I should be able to explain the flow in
   [how-it-works.md](how-it-works.md) and say which file to open when something breaks.
6. **Write it down.** Every AI-assisted change gets an entry in [AI_USE_LOG.md](../AI_USE_LOG.md):
   what changed, how it was checked, and what I still need to check myself.

## Automatic checks

- `npm test`: unit tests (Vitest) for the pure input logic, the controller, settings, storage and the debug log.
  The whole engine is also replayed on a recorded (synthetic) session, so it is tested without a webcam.
- `npm run build`: the production build must pass.
- GitHub runs both on every pull request (`.github/workflows/test.yml`), and again before each deploy.

## Manual check (5 minutes, hands in lap)

**Windows app (the main product)**, built with `npm run desktop` or the portable `.exe`:

- [ ] Setup: camera and light check turns green; 5-point head range reaches all four corners.
- [ ] Turning my head right moves the real pointer right; looking up moves it up.
- [ ] Mouse control on: the real pointer moves over the desktop and in other apps (Chrome, Notepad).
- [ ] A left wink held until the ring is full clicks; a right wink right-clicks.
- [ ] While a wink is held, the pointer stays still (click lock), so the click lands on the target.
- [ ] Normal blinking and talking for 30 seconds cause **no** clicks.
- [ ] Closing both eyes for 2 s pauses (pointer stops, winks do nothing); Ctrl+Alt+P and Ctrl+Alt+C work.
- [ ] Real task: open a website in Chrome and click a link or a video without hands.

**Browser demo** (`npm run dev`, or the GitHub Pages link), additionally:

- [ ] The page loads, asks for the camera, and "Camera on" shows.
- [ ] "Delete my account" asks "Confirm?" and needs a *different* signal; waiting cancels it.
- [ ] Settings → "Copy debug info" shows a report with no images or face numbers.
- [ ] Privacy: DevTools → Network shows only the app files and the MediaPipe model/wasm, no uploads.

## When a tester reports a problem

In the browser demo, ask them to open **Settings → Copy debug info** and paste the text into a
[GitHub issue](https://github.com/EastSea0817/touch-free-control/issues/new?template=bug_report.md) or a message.
It shows the version, settings and the last events (clicks, pauses, errors), so I can understand the problem
without being next to them. For the Windows app (no debug button yet), ask for a short screen recording
and which settings they changed.
