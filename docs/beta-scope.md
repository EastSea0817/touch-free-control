# Beta scope (Demo Day, Dec 15/17, 2026)

Advice from the course and from hackathon judges says the same thing: pick one narrow, real problem,
build the happy path for it really well, and lead the demo with the problem, not the technology.

## The beta in one sentence

> Someone who can't use their hands opens a link, sets the app up once, and presses buttons on real-looking
> pages using only head movements and a wink.

## Core flow (must work every time)

1. Open the link → privacy note → camera check.
2. Choose the click style (wink) → fit the cursor to my head range.
3. Practice: hit the targets → open a news article → fill in a form.
4. Safety: a risky button asks "Confirm?" and needs a different signal.
5. Pause by closing both eyes; resume the same way.

## AI feature

- **Now:** an on-device face model (MediaPipe FaceLandmarker) turns each camera frame into head pose and
  expression scores, and my own logic turns those into cursor moves and clicks.
- **Planned:** a personal intent classifier (k-NN on my own short recordings) that rejects look-alike
  movements such as talking or yawning, measured as false clicks per 10 minutes.
- *To decide before Demo Day:* which of these I present as "the one real AI feature".

## Later (not for the beta)

Not needed for the core flow, so they wait. Each one could become an issue.

- Hand gestures and mouth/eyebrow clicks (they work, but are not part of the demo)
- "Copy debug info" in the desktop app
- A Korean version of the on-screen text
- A mobile or tablet version
- Trying an adaptive accessibility toolkit (for example Google's AI Accessibility Toolkit) in the web version
- Login, accounts, cloud sync: **not planned** (everything stays on the device)

## Demo checklist

- [ ] Start with the problem: who can't use a mouse, and what that costs them (one sentence + one photo or quote).
- [ ] Demo with my hands in my lap, following `docs/demo-script.md`.
- [ ] Have a backup video in case the room light or camera fails.
- [ ] End with one number from testing (for example SUS score or false clicks) and what I changed because of it.
