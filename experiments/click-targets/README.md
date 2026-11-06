# Experiment: what can Windows tell us is clickable?

Goal: see whether Touch-free Control could "snap" the cursor to clickable
things (video thumbnails, comment buttons, the search box) without AI, using
Windows UI Automation, the same accessibility info Voice Access uses.

## Run (Windows)

1. Open YouTube in Chrome or Edge.
2. Double-click `run-experiment.bat`.
3. Within 5 seconds, click on the YouTube window.
4. Boxes appear on everything Windows reports as clickable, with a number.
   Press **Esc** to close (or wait 30 s).

The console prints how many targets were found, by type, and how long the
scan took. A CSV list is saved next to the script.

Read-only and offline: it never clicks and sends nothing anywhere.

## What to note

- Are all thumbnails, titles, comment/like buttons and the search box boxed?
- Anything clickable that is **not** boxed? (That is where AI vision would be needed.)
- Scan time: if it is over ~1 s, snapping would need a cached / incremental scan.
