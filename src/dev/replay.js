// Dev tools: play back recorded frames instead of the camera, and record
// frames (numbers only: head pose + blendshape scores; never images).

/** Validate a recording file. Returns frames or throws a friendly error. */
export function parseRecording(json) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  if (!data || data.format !== 'tfc-frames-v1' || !Array.isArray(data.frames)) {
    throw new Error('This is not a recording from this app (format tfc-frames-v1).');
  }
  return data;
}

/** Plays frames in real time. next(now) returns the frame due now (or null when finished). */
export function createReplayPlayer(frames, { loop = false } = {}) {
  let start = null;
  let i = 0;
  const duration = frames.length ? frames[frames.length - 1].t - frames[0].t : 0;
  const t0 = frames.length ? frames[0].t : 0;
  return {
    next(now) {
      if (!frames.length) return null;
      if (start === null) start = now;
      let elapsed = now - start;
      if (elapsed > duration) {
        if (!loop) return null;
        start = now;
        i = 0;
        elapsed = 0;
      }
      while (i < frames.length - 1 && frames[i + 1].t - t0 <= elapsed) i += 1;
      return { ...frames[i], t: now };
    },
    get progress() {
      return duration ? Math.min(1, i / (frames.length - 1)) : 1;
    },
  };
}

/** Collects frames for `ms`, then calls onDone(recording). */
export function createRecorder(ms, onDone) {
  const frames = [];
  let start = null;
  let finished = false;
  return {
    push(frame) {
      if (finished) return;
      if (start === null) start = frame.t;
      const face = frame.face
        ? { pose: { yaw: round(frame.face.pose.yaw), pitch: round(frame.face.pose.pitch) }, blendshapes: roundAll(frame.face.blendshapes) }
        : null;
      frames.push({ t: Math.round(frame.t - start), face, hand: frame.hand ? { kind: frame.hand.kind } : null });
      if (frame.t - start >= ms) {
        finished = true;
        onDone({ format: 'tfc-frames-v1', synthetic: false, label: '', recordedAt: new Date().toISOString(), frames });
      }
    },
    get finished() {
      return finished;
    },
  };
}

function round(v) {
  return Math.round(v * 10000) / 10000;
}
function roundAll(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) if (k !== '_neutral') out[k] = Math.round(v * 1000) / 1000;
  return out;
}
