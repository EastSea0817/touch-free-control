// Copies the MediaPipe wasm files from node_modules and downloads the face and
// hand models into public/mediapipe, so the built app (web and desktop) works
// without reaching a CDN. Runs automatically before `npm run build`.
// If a download fails the app still works online (it falls back to the CDN).
import { mkdirSync, copyFileSync, existsSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const out = join(root, 'public', 'mediapipe');
const wasmSrc = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const MODELS = [
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
  'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task',
];

mkdirSync(join(out, 'wasm'), { recursive: true });
for (const f of readdirSync(wasmSrc)) copyFileSync(join(wasmSrc, f), join(out, 'wasm', f));
console.log(`mediapipe: copied ${readdirSync(wasmSrc).length} wasm files`);

for (const url of MODELS) {
  const file = join(out, url.split('/').pop());
  if (existsSync(file) && statSync(file).size > 0) continue;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    console.log(`mediapipe: downloaded ${url.split('/').pop()}`);
  } catch (err) {
    console.warn(`mediapipe: could not download ${url} (${err.message}); the app will load it online instead.`);
  }
}
