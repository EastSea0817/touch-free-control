// Pre-start environment check (desktop app). Pure: numbers in, hints out.
// Tells the user, before they start, whether the light, distance and position
// are good enough, instead of leaving them to guess why tracking is poor.

export const ENV_LIMITS = Object.freeze({
  minBrightness: 60, // average 0..255 luminance of the camera image
  maxBrightness: 215,
  minFaceWidth: 0.18, // face width as a share of the image width
  maxFaceWidth: 0.55,
  maxCenterOffset: 0.18, // face centre distance from image centre (share of width/height)
});

/**
 * @param m { brightness: number|null, face: null | { cx, cy, width } } all normalized 0..1 except brightness
 * @returns {{ ok: boolean, hints: Array<{code:string, text:string}> }}
 */
export function checkEnvironment(m, limits = ENV_LIMITS) {
  const hints = [];
  if (typeof m.brightness === 'number') {
    if (m.brightness < limits.minBrightness) hints.push({ code: 'dark', text: 'It is too dark. Turn on a light in front of you.' });
    else if (m.brightness > limits.maxBrightness) hints.push({ code: 'bright', text: 'It is too bright. Avoid a window or lamp behind you.' });
  }
  if (!m.face) {
    hints.push({ code: 'noFace', text: 'I cannot see your face. Sit in front of the camera.' });
  } else {
    if (m.face.width < limits.minFaceWidth) hints.push({ code: 'far', text: 'Move a little closer to the camera.' });
    else if (m.face.width > limits.maxFaceWidth) hints.push({ code: 'near', text: 'Move a little further from the camera.' });
    const dx = m.face.cx - 0.5;
    const dy = m.face.cy - 0.5;
    if (Math.abs(dx) > limits.maxCenterOffset || Math.abs(dy) > limits.maxCenterOffset) {
      hints.push({ code: 'offCenter', text: 'Move so your face is in the middle of the preview.' });
    }
  }
  return { ok: hints.length === 0, hints };
}

/** Face box from MediaPipe landmarks (normalized). Mirrored so it matches the preview. */
export function faceBox(landmarks) {
  if (!landmarks?.length) return null;
  let minX = 1, maxX = 0, minY = 1, maxY = 0;
  for (const p of landmarks) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { cx: 1 - (minX + maxX) / 2, cy: (minY + maxY) / 2, width: maxX - minX };
}

/** Average luminance of RGBA pixel data, sampling every `step`-th pixel. */
export function averageBrightness(data, step = 16) {
  let sum = 0;
  let n = 0;
  for (let i = 0; i + 2 < data.length; i += 4 * step) {
    sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    n++;
  }
  return n ? sum / n : null;
}
