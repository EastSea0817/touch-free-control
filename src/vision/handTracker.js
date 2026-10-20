// Optional hand input. Loaded only when hand gestures are turned on.
import { GestureRecognizer } from '@mediapipe/tasks-vision';
import { createWithFallback, GESTURE_MODEL_URL } from './mediapipe.js';
import { classifyHand } from '../input/handGestures.js';

export async function createHandTracker() {
  const recognizer = await createWithFallback(GestureRecognizer, {
    baseOptions: { modelAssetPath: GESTURE_MODEL_URL },
    runningMode: 'VIDEO',
    numHands: 1,
  });
  let lastTs = -1;
  return {
    /** @returns null when no hand, else { kind, landmarks, gestureName, gestureScore } */
    detect(video, nowMs) {
      const ts = nowMs <= lastTs ? lastTs + 1 : nowMs;
      lastTs = ts;
      const res = recognizer.recognizeForVideo(video, ts);
      const landmarks = res.landmarks?.[0];
      if (!landmarks) return null;
      const top = res.gestures?.[0]?.[0];
      const gestureName = top?.categoryName ?? 'None';
      const gestureScore = top?.score ?? 0;
      const aspect = video.videoWidth / video.videoHeight;
      const kind = classifyHand({ gestureName, gestureScore, landmarks, aspect }) ?? 'none';
      return { kind, landmarks, gestureName, gestureScore };
    },
    close() {
      recognizer.close();
    },
  };
}
