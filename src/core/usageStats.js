// Usage insights (desktop app). Pure: numbers in, numbers and text out.
// Turns the DA200 Lesson 23 analytics plan into a small on-device feature:
//   Descriptive  - what happened?      describeSessions()
//   Diagnostic   - why did it happen?  diagnose()
//   Predictive   - what will happen?   predictRisk()   (a small hand-written decision tree)
//   Prescriptive - what should we do?  prescribe()     (suggestions the USER approves)
//
// Privacy: only counts, times and coarse labels ('dark' / 'ok' / 'bright').
// Never camera images, landmarks or blendshape numbers. Recording is opt-in,
// stays on this computer and can be deleted at any time.

export const LIMITS = Object.freeze({
  maxSessions: 30, // oldest sessions drop off first (a queue)
  maxClicks: 400, // per session
  wrongWindowMs: 15000, // "last click was wrong" must come within 15 s of that click
  lostAfterMs: 500, // face missing this long counts as one "tracking lost"
  jitterMaxStepPx: 40, // larger steps are real head moves, not shake
  predictAfterMs: 2 * 60 * 1000, // the risk score needs the first 2 minutes
  fatigueMin: 20,
});

const round1 = (v) => Math.round(v * 10) / 10;
const per10 = (n, ms) => (ms > 0 ? (n / ms) * 600000 : 0);

// ---------- recording ----------

/**
 * Records one mouse-control session.
 * @param opts { now: () => ms, gesture, settings }
 */
export function createSessionRecorder({ now = () => Date.now(), gesture = 'wink', settings = {} } = {}) {
  const start = now();
  const s = {
    start,
    end: start,
    gesture,
    settings: pickSettings(settings),
    clicks: [], // { m: minutes since start, light, wrong }
    lost: 0,
    pauses: 0,
    light: { dark: 0, ok: 0, bright: 0 },
    distance: { far: 0, ok: 0, near: 0 },
    jitterSum: 0,
    jitterN: 0,
    early: null, // snapshot of the first 2 minutes for the risk score
  };
  let lastLight = 'ok';
  let missingSince = null;
  let counted = false;
  let lastCursor = null;

  function snapshotEarly(t) {
    if (!s.early && t - start >= LIMITS.predictAfterMs) {
      s.early = { lost: s.lost, wrong: s.clicks.filter((c) => c.wrong).length, jitter: avgJitter(s), dark: darkShare(s) };
    }
  }

  return {
    get session() {
      return s;
    },
    /** Once per camera frame while controlling. */
    frame({ face, cursor }) {
      const t = now();
      s.end = t;
      if (face) {
        missingSince = null;
        counted = false;
        if (cursor && lastCursor) {
          const step = Math.hypot(cursor.x - lastCursor.x, cursor.y - lastCursor.y);
          if (step <= LIMITS.jitterMaxStepPx) {
            s.jitterSum += step;
            s.jitterN += 1;
          }
        }
        lastCursor = cursor ? { ...cursor } : null;
      } else {
        lastCursor = null;
        if (missingSince === null) missingSince = t;
        if (!counted && t - missingSince >= LIMITS.lostAfterMs) {
          s.lost += 1;
          counted = true;
        }
      }
      snapshotEarly(t);
    },
    /** A few times a second, from the environment check. */
    env({ light, distance }) {
      if (light in s.light) {
        s.light[light] += 1;
        lastLight = light;
      }
      if (distance in s.distance) s.distance[distance] += 1;
    },
    click() {
      const t = now();
      if (s.clicks.length >= LIMITS.maxClicks) return;
      s.clicks.push({ m: round1((t - start) / 60000), light: lastLight, wrong: false, t });
    },
    /** The user says the last click was a mistake. Returns true if a click was marked. */
    markWrong() {
      const t = now();
      const c = s.clicks[s.clicks.length - 1];
      if (!c || c.wrong || t - c.t > LIMITS.wrongWindowMs) return false;
      c.wrong = true;
      return true;
    },
    pause() {
      s.pauses += 1;
    },
    /** Plain data for storage (drops the raw click times). */
    finish() {
      s.end = now();
      return toStored(s);
    },
  };
}

function pickSettings(st) {
  const keys = ['faceClickOn', 'winkClosed', 'winkHoldMs', 'smoothing', 'cursorSpeed'];
  const out = {};
  for (const k of keys) if (typeof st[k] === 'number') out[k] = st[k];
  return out;
}

function toStored(s) {
  return {
    ...s,
    clicks: s.clicks.map(({ m, light, wrong }) => ({ m, light, wrong })),
    light: { ...s.light },
    distance: { ...s.distance },
    early: s.early ? { ...s.early } : null,
  };
}

/** Adds a session to the list, keeping only the newest LIMITS.maxSessions. Skips empty ones. */
export function addSession(sessions, session) {
  if (!session || session.end - session.start < 30000) return sessions.slice();
  return [...sessions, session].slice(-LIMITS.maxSessions);
}

function avgJitter(s) {
  return s.jitterN ? s.jitterSum / s.jitterN : 0;
}
function darkShare(s) {
  const n = s.light.dark + s.light.ok + s.light.bright;
  return n ? s.light.dark / n : 0;
}

// ---------- 1. Descriptive: what happened? ----------

export function describeSessions(sessions) {
  let ms = 0, clicks = 0, wrong = 0, lost = 0;
  for (const s of sessions) {
    ms += s.end - s.start;
    clicks += s.clicks.length;
    wrong += s.clicks.filter((c) => c.wrong).length;
    lost += s.lost;
  }
  return {
    sessions: sessions.length,
    minutes: Math.round(ms / 60000),
    clicks,
    wrong,
    successRate: clicks ? Math.round(((clicks - wrong) / clicks) * 100) : null,
    wrongPer10: round1(per10(wrong, ms)),
    lostPer10: round1(per10(lost, ms)),
    recent: sessions.slice(-7).map((s) => ({
      start: s.start,
      clicks: s.clicks.length,
      wrong: s.clicks.filter((c) => c.wrong).length,
      minutes: round1((s.end - s.start) / 60000),
    })),
  };
}

// ---------- 2. Diagnostic: why did it happen? ----------

const MIN_GROUP = 5; // clicks needed in each group before comparing

function rate(list) {
  return list.length ? list.filter((c) => c.wrong).length / list.length : 0;
}

function compare(a, b, factor, text) {
  if (a.length < MIN_GROUP || b.length < MIN_GROUP) return null;
  const ra = rate(a);
  const rb = rate(b);
  if (ra <= rb || ra - rb < 0.1) return null;
  return { factor, ratio: rb > 0 ? round1(ra / rb) : null, text, wrongRate: Math.round(ra * 100), baseRate: Math.round(rb * 100) };
}

/** Compares wrong-click rates between situations. Returns the findings that stand out. */
export function diagnose(sessions) {
  const all = sessions.flatMap((s) => s.clicks.map((c) => ({ ...c, gesture: s.gesture })));
  const findings = [
    compare(all.filter((c) => c.light === 'dark'), all.filter((c) => c.light === 'ok'), 'light', 'More wrong clicks when the room is dark.'),
    compare(all.filter((c) => c.light === 'bright'), all.filter((c) => c.light === 'ok'), 'backlight', 'More wrong clicks with bright light behind you.'),
    compare(all.filter((c) => c.m >= LIMITS.fatigueMin), all.filter((c) => c.m < LIMITS.fatigueMin), 'fatigue', `More wrong clicks after ${LIMITS.fatigueMin} minutes of use.`),
    compare(all.filter((c) => c.gesture === 'jawOpen'), all.filter((c) => c.gesture === 'wink'), 'mouth', 'Mouth clicks go wrong more often than winks (talking or yawning?).'),
    compare(all.filter((c) => c.gesture === 'wink'), all.filter((c) => c.gesture === 'jawOpen'), 'wink', 'Winks go wrong more often than mouth clicks (blinking?).'),
  ].filter(Boolean);
  return { findings, clicksUsed: all.length, enough: all.length >= MIN_GROUP * 2 };
}

// ---------- 3. Predictive: what will happen? ----------

/**
 * Risk that this session goes badly, from its first 2 minutes.
 * A small decision tree written by hand so every answer can be explained.
 * (A tree trained on real users' data can replace it later.)
 */
export function predictRisk(session) {
  if (!session?.early) return { level: null, reason: 'Learning from the first 2 minutes…' };
  const { lost, wrong, jitter, dark } = session.early;
  if (lost >= 4) return { level: 'high', reason: 'The camera lost your face often.' };
  if (wrong >= 2) return { level: 'high', reason: 'Two or more wrong clicks already.' };
  if (dark > 0.5) return { level: 'medium', reason: 'The room was dark most of the time.' };
  if (jitter > 6) return { level: 'medium', reason: 'The cursor was shaky.' };
  if (lost >= 2 || wrong === 1) return { level: 'medium', reason: 'A few small problems.' };
  return { level: 'low', reason: 'Tracking and clicks look steady.' };
}

// ---------- 4. Prescriptive: what should we do? ----------

/**
 * Suggestions. Each one may carry a settings patch; the app shows an Apply
 * button and changes nothing until the user presses it.
 */
export function prescribe({ summary, findings = [], risk = null, settings, current = null }) {
  const out = [];
  const has = (f) => findings.some((x) => x.factor === f);
  if (has('light') || (current && darkShare(current) > 0.5)) {
    out.push({ id: 'light', text: 'Turn on a light in front of you.', why: 'Dark rooms make face tracking less sure.' });
  }
  if (has('backlight')) out.push({ id: 'backlight', text: 'Avoid a window or lamp behind you.', why: 'Bright light behind you hides your face.' });
  if (has('fatigue')) out.push({ id: 'break', text: 'Take a short break after 20 minutes. Close both eyes to pause.', why: 'Wrong clicks rise later in a session.' });
  if (summary && summary.wrongPer10 >= 1) {
    if (settings.faceClickGesture === 'wink') {
      const v = Math.min(3000, settings.winkHoldMs + 250);
      if (v > settings.winkHoldMs) out.push({ id: 'hold', text: `Hold winks a little longer (${(v / 1000).toFixed(2)} s).`, why: `${summary.wrongPer10} wrong clicks per 10 min.`, patch: { winkHoldMs: v } });
    } else {
      const v = Math.round(Math.min(0.85, settings.faceClickOn + 0.05) * 100) / 100;
      if (v > settings.faceClickOn) out.push({ id: 'threshold', text: 'Make the click gesture a little harder (higher line).', why: `${summary.wrongPer10} wrong clicks per 10 min.`, patch: { faceClickOn: v, faceClickOff: Math.round((v / 2) * 1e4) / 1e4 } });
    }
  }
  if (has('mouth') && settings.faceClickGesture === 'jawOpen') {
    out.push({ id: 'gesture', text: 'Try winks instead of the mouth.', why: 'Talking or yawning may look like a mouth click.', patch: { faceClickGesture: 'wink' } });
  }
  const shaky = current?.early?.jitter > 6 || risk?.reason === 'The cursor was shaky.';
  if (shaky && settings.smoothing < 1) {
    const v = Math.round(Math.min(1, settings.smoothing + 0.1) * 10) / 10;
    out.push({ id: 'smooth', text: `Make the cursor steadier (smoothing ${v.toFixed(1)}).`, why: 'The cursor was shaky.', patch: { smoothing: v } });
  }
  if ((summary && summary.lostPer10 >= 3) || risk?.reason === 'The camera lost your face often.') {
    out.push({ id: 'camera', text: 'Run the Camera & light check again.', why: 'The camera often lost your face.', go: 'camera' });
  }
  return out;
}

// ---------- export for Pandas / Excel ----------

export function sessionsCsv(sessions) {
  const head = 'session,date,minutes,gesture,click_threshold,wink_hold_ms,smoothing,clicks,wrong_clicks,tracking_lost,pauses,dark_share,avg_jitter_px';
  const rows = sessions.map((s, i) =>
    [
      i + 1,
      new Date(s.start).toISOString().slice(0, 10),
      round1((s.end - s.start) / 60000),
      s.gesture,
      s.settings.faceClickOn ?? '',
      s.settings.winkHoldMs ?? '',
      s.settings.smoothing ?? '',
      s.clicks.length,
      s.clicks.filter((c) => c.wrong).length,
      s.lost,
      s.pauses,
      round1(darkShare(s) * 100) / 100,
      round1(avgJitter(s)),
    ].join(','),
  );
  return [head, ...rows].join('\n');
}

export function clicksCsv(sessions) {
  const head = 'session,gesture,minute,light,wrong';
  const rows = sessions.flatMap((s, i) => s.clicks.map((c) => [i + 1, s.gesture, c.m, c.light, c.wrong ? 1 : 0].join(',')));
  return [head, ...rows].join('\n');
}
