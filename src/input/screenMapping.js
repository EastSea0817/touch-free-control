// Pure geometry helpers: landmarks (normalized 0..1 per axis) -> pixels.

/** Mirror a normalized x so the preview behaves like a mirror. */
export function mirrorX(x) {
  return 1 - x;
}

/**
 * Map a normalized landmark to a point on an element that shows the video
 * with `object-fit: cover` and a mirrored (scaleX(-1)) <video>.
 *
 * cover = the video is scaled by max(boxW/videoW, boxH/videoH) and centred,
 * so the overflowing part is cropped equally on both sides.
 */
export function landmarkToCoverPixel(lm, video, box, { mirror = true } = {}) {
  const scale = Math.max(box.width / video.width, box.height / video.height);
  const drawnW = video.width * scale;
  const drawnH = video.height * scale;
  const offsetX = (box.width - drawnW) / 2; // negative when cropped
  const offsetY = (box.height - drawnH) / 2;
  const nx = mirror ? mirrorX(lm.x) : lm.x;
  return { x: offsetX + nx * drawnW, y: offsetY + lm.y * drawnH };
}

/**
 * Distance between two normalized landmarks with aspect-ratio correction:
 * x is multiplied by videoWidth/videoHeight so both axes use the same unit.
 */
export function aspectDistance(a, b, aspect) {
  const dx = (a.x - b.x) * aspect;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}
