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

Open the web app in Chrome (`npm run dev`, or the GitHub Pages link) and tick each line:

- [ ] The page loads and asks for the camera; "Camera on" shows.
- [ ] Turning my head right moves the cursor right; looking up moves it up.
- [ ] Calibration reaches all four corners.
- [ ] A left wink held until the ring is full clicks the button under the cursor.
- [ ] Normal blinking and talking for 30 seconds cause **no** clicks.
- [ ] Closing both eyes for 2 s pauses; a wink while paused does nothing; closing again resumes.
- [ ] "Delete my account" asks "Confirm?" and needs a *different* signal; waiting cancels it.
- [ ] Settings → "Copy debug info" shows a report with no images or face numbers.
- [ ] Privacy: DevTools → Network shows only the app files and the MediaPipe model/wasm, no uploads.

Desktop app (Windows only), additionally:

- [ ] The real mouse moves and clicks in another program (for example Notepad).
- [ ] While a wink is held, the cursor stays still (click lock).
- [ ] Ctrl+Alt+P pauses and Ctrl+Alt+C re-centres.

## When a tester reports a problem

Ask them to open **Settings → Copy debug info** and paste the text into a
[GitHub issue](https://github.com/EastSea0817/touch-free-control/issues/new?template=bug_report.md) or a message.
It shows the version, settings and the last events (clicks, pauses, errors), so I can understand the problem
without being next to them.
