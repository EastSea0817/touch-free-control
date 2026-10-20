// Shared MediaPipe loading. Versions are pinned (never @latest).
// The wasm files and models are bundled next to the app (public/mediapipe,
// filled by scripts/fetch-mediapipe.js), so it starts without the internet and
// is not blocked by school/office networks. If they are missing, it falls back
// to the CDN.
import { FilesetResolver } from '@mediapipe/tasks-vision';
import { MEDIAPIPE_VERSION } from '../core/settings.js';

export const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
export const LOCAL_BASE = './mediapipe';
export const FACE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
export const GESTURE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task';

const filesets = new Map();
export function loadFileset(base = WASM_URL) {
  if (!filesets.has(base)) filesets.set(base, FilesetResolver.forVisionTasks(base));
  return filesets.get(base);
}

/** Local copy first, then the CDN; GPU first, then CPU (some laptops have no usable WebGL). */
export async function createWithFallback(Task, options, delegates = ['GPU', 'CPU']) {
  const remoteModel = options.baseOptions.modelAssetPath;
  const sources = [
    { wasm: `${LOCAL_BASE}/wasm`, model: `${LOCAL_BASE}/${remoteModel.split('/').pop()}` },
    { wasm: WASM_URL, model: remoteModel },
  ];
  let lastError = null;
  for (const src of sources) {
    for (const delegate of delegates) {
      try {
        const fileset = await loadFileset(src.wasm);
        return await Task.createFromOptions(fileset, { ...options, baseOptions: { ...options.baseOptions, modelAssetPath: src.model, delegate } });
      } catch (err) {
        lastError = err;
      }
    }
  }
  throw lastError;
}
