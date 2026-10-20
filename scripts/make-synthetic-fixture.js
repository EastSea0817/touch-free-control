// Generates tests/fixtures/synthetic-session.json and a copy for dev replay.
// SYNTHETIC data (made-up numbers), not a real recording. It exists so the
// pipeline can be tested before I record my own samples in dev mode.
// Run: node scripts/make-synthetic-fixture.js
import { writeFileSync, mkdirSync } from 'node:fs';

const FPS = 30;
const dt = 1000 / FPS;
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const noise = (a) => (rand() - 0.5) * 2 * a;

const frames = [];
const segments = [];
function seg(label, startS, endS) { segments.push({ label, startMs: startS * 1000, endMs: endS * 1000 }); }

seg('neutral', 0, 1);
seg('talking (look-alike, must NOT click)', 1, 4);
seg('deliberate mouth open with 300 ms tracking drop (exactly 1 click)', 4.5, 5.3);
seg('eyes closed 2.5 s (pause)', 6, 8.5);
seg('mouth open while paused (must be blocked)', 9, 9.8);
seg('eyes closed 2.5 s (resume)', 11, 13.5);
seg('deliberate mouth open (1 click)', 14, 14.8);
seg('turn head right (cursor moves right)', 15.5, 17);

for (let i = 0; i < 17.5 * FPS; i++) {
  const t = Math.round(i * dt);
  const s = t / 1000;
  let jaw = 0.03 + Math.abs(noise(0.02));
  let blink = 0.05 + Math.abs(noise(0.03));
  let yaw = noise(0.004);
  const pitch = noise(0.004);

  if (s >= 1 && s < 4) {
    jaw = 0.22 + 0.2 * Math.sin(s * 2 * Math.PI * 4) + noise(0.03);
    // two short spikes above the click threshold (2 frames each)
    if (i === 60 || i === 61 || i === 95 || i === 96) jaw = 0.56;
  }
  if (s >= 4.5 && s < 5.3) jaw = 0.75 + noise(0.04);
  if (s >= 6 && s < 8.5) blink = 0.8 + noise(0.05);
  if (s >= 9 && s < 9.8) jaw = 0.75 + noise(0.04);
  if (s >= 11 && s < 13.5) blink = 0.8 + noise(0.05);
  if (s >= 14 && s < 14.8) jaw = 0.75 + noise(0.04);
  if (s >= 15.5) yaw = Math.min(0.25, (s - 15.5) * 0.3);

  // natural blinks (short, must not pause)
  if (i % 100 === 50) blink = 0.9;

  const lost = s >= 4.8 && s < 5.1; // 300 ms tracking drop mid-gesture
  frames.push({
    t,
    face: lost
      ? null
      : {
          pose: { yaw: +yaw.toFixed(4), pitch: +pitch.toFixed(4) },
          blendshapes: {
            jawOpen: +Math.max(0, jaw).toFixed(3),
            browInnerUp: +Math.abs(noise(0.05)).toFixed(3),
            eyeBlinkLeft: +blink.toFixed(3),
            eyeBlinkRight: +(blink + noise(0.02)).toFixed(3),
          },
        },
    hand: null,
  });
}

const out = {
  format: 'tfc-frames-v1',
  synthetic: true,
  note: 'Made-up numbers for testing the pipeline. Replace with my own recordings for Phase 4.',
  fps: FPS,
  segments,
  expected: { clicks: 2, blocked: 1, pauseToggles: 2 },
  frames,
};
mkdirSync('tests/fixtures', { recursive: true });
mkdirSync('public/fixtures', { recursive: true });
writeFileSync('tests/fixtures/synthetic-session.json', JSON.stringify(out));
writeFileSync('public/fixtures/synthetic-session.json', JSON.stringify(out));
console.log('frames:', frames.length);
