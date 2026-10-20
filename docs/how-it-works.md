# How the input pipeline works (Phases 0–2)

Each video frame becomes numbers, and pure functions turn the numbers into decisions:

1. **faceTracker** (MediaPipe FaceLandmarker, VIDEO mode) → 478 landmarks + 52 blendshape scores.
2. **headPointer** → head pose `{yaw, pitch}` = nose tip offset from the face centre ÷ face size.
   Dividing by face size means moving closer to the camera does not move the cursor.
3. **calibration range** → maps my comfortable head range to the whole screen
   (auto-centred in the first second; "Calibrate" records centre + 4 corners).
4. **smoothing** (One Euro) → steady cursor without lag on big moves.
5. **dwell** → click when the cursor rests on a clickable target for 1.2 s.
6. **faceClick trigger** → turns the noisy `jawOpen` score into single clicks
   (debounce, hysteresis, refractory time, tracking-loss grace).
7. **hold detector** → both eyes closed for 2 s toggles pause.
8. **inputController** (ACTIVE / PAUSED / CONFIRMING) → the only place that says yes or no to a click.
   High-risk targets need a second, different signal; a timeout cancels.

Phase 4 will replace the simple threshold in step 6 with my personal k-NN intent classifier.
