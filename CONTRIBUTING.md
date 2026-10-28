# Contributing to Touch-free Control

Thank you for helping! This project lets people who can't easily use their hands control a computer with a webcam.
Small help is very welcome: a typo fix, a test, a bug report, or trying the app and telling me what was hard.

## Good places to start

- Issues labelled [**good first issue**](https://github.com/EastSea0817/touch-free-control/labels/good%20first%20issue)
  are small and well described.
- Documentation and tests count as real contributions.
- Not a coder? Try the app with your hands in your lap and
  [open an issue](https://github.com/EastSea0817/touch-free-control/issues/new/choose) about anything that was hard.

## Run it

```bash
npm install
npm run dev      # open the printed localhost link in Chrome
npm test         # unit tests
```

Add `?dev=1` to the URL to move the cursor with the real mouse and replay a recorded session (no webcam needed).
[docs/how-it-works.md](docs/how-it-works.md) shows how the parts fit together.

## Rules for pull requests

- **Small and focused:** one change per pull request.
- **Tests pass** (`npm test`) and you **ran the app yourself** for the part you changed.
- **Say if AI helped** write the change and how you checked it (see [docs/verification.md](docs/verification.md)).
- **No secrets** (API keys, passwords) in the code.
- **Accessibility first:** every button must work with the virtual cursor alone, be at least 64x64 px,
  and nothing new may click without a clear signal from the user.
- **Privacy:** camera images and face data never leave the device.

## Reporting a bug

In the app, open **Settings → Copy debug info** and paste the text into the bug report.
It contains no images or face data.

## Respect

Many users of this tool live with a disability. "Nothing about us without us": design with them, listen to their
feedback, and keep discussions kind.
