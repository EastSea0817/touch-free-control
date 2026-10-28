# Beta scope (Demo Day, Dec 15/17, 2026)

Advice from the course and from hackathon judges says the same thing: pick one narrow, real problem,
build the happy path for it really well, and lead the demo with the problem, not the technology.

## The beta in one sentence

> Someone who can't use their hands sets up the Windows app once, then moves the **real mouse** with their head
> and clicks with a wink in any program, for example opening a website and playing a video.

## Core flow (must work every time)

1. Open the Windows app → camera and light check.
2. Fit the pointer to my head range (5 points) → choose wink click and set its sensitivity with the live meter.
3. Turn on Mouse control → move the real pointer over the desktop and other apps.
4. Do one real task without hands: open Chrome, go to a site, click a link or a video (click lock keeps the pointer still while I wink).
5. Pause by closing both eyes (or Ctrl+Alt+P for a caregiver); resume the same way.

The **browser demo** (GitHub Pages link) is the no-install version for classmates: same head pointer and wink click,
but only inside its own practice pages, because a browser cannot move the real mouse. It covers the course rule
that the beta opens from a link; the Windows app is what I demo as the real product.

## AI feature

- **Now:** an on-device face model (MediaPipe FaceLandmarker) turns each camera frame into head pose and
  expression scores, and my own logic turns those into cursor moves and clicks.
- **Planned:** a personal intent classifier (k-NN on my own short recordings) that rejects look-alike
  movements such as talking or yawning, measured as false clicks per 10 minutes.
- *To decide before Demo Day:* which of these I present as "the one real AI feature".

## Later (not for the beta)

Not needed for the core flow, so they wait. Each one could become an issue.

- Scrolling and dragging with the head in the Windows app (today: move, left click, right click)
- An on-screen keyboard for typing
- "Copy debug info" in the Windows app (the browser demo has it)
- A signed installer (today: a portable .exe that Windows warns about)
- Mac version
- Hand gestures and mouth/eyebrow clicks (they work, but are not part of the demo)
- A Korean version of the on-screen text
- A mobile or tablet version
- Trying an adaptive accessibility toolkit (for example Google's AI Accessibility Toolkit) in the web version
- Login, accounts, cloud sync: **not planned** (everything stays on the device)

## Demo checklist

- [ ] Start with the problem: who can't use a mouse, and what that costs them (one sentence + one photo or quote).
- [ ] Demo the Windows app with my hands in my lap, on a real task in another program.
- [ ] Let classmates try the browser demo link (or the Windows app on my laptop).
- [ ] Have a backup video in case the room light or camera fails.
- [ ] End with one number from testing (for example SUS score or false clicks) and what I changed because of it.
