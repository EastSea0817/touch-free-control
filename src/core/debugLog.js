// A small in-memory log for bug reports ("Copy debug info").
// It keeps short text events only (clicks, pauses, errors, settings changes):
// never camera images, face landmarks or blendshape numbers. Nothing is saved
// or sent; the user decides whether to copy the report and share it.

export function createDebugLog({ max = 60, now = () => Date.now() } = {}) {
  const events = [];
  return {
    add(type, detail = '') {
      events.push({ t: now(), type: String(type), detail: String(detail).slice(0, 200) });
      if (events.length > max) events.shift();
    },
    get events() {
      return events.slice();
    },
    clear() {
      events.length = 0;
    },
  };
}

// Only plain values from the settings go into the report.
function plainSettings(settings) {
  const out = {};
  for (const [k, v] of Object.entries(settings ?? {})) {
    if (['number', 'boolean', 'string'].includes(typeof v)) out[k] = v;
  }
  return out;
}

export function buildDebugReport({ version = 'dev', app = 'web', settings, status = {}, env = {}, events = [], now = Date.now() }) {
  const lines = [
    'Touch-free Control debug info',
    `Version: ${version} (${app})`,
    `Time: ${new Date(now).toISOString()}`,
    `Browser: ${env.userAgent ?? 'unknown'}`,
    `Screen: ${env.screen ?? 'unknown'}`,
    '',
    'Status:',
    ...Object.entries(status).map(([k, v]) => `  ${k}: ${v}`),
    '',
    'Settings:',
    ...Object.entries(plainSettings(settings)).map(([k, v]) => `  ${k}: ${v}`),
    '',
    `Last ${events.length} events (seconds before now):`,
    ...events.map((e) => `  -${((now - e.t) / 1000).toFixed(1)}s  ${e.type}${e.detail ? `  ${e.detail}` : ''}`),
    '',
    'No camera images or face data are included.',
  ];
  return lines.join('\n');
}
