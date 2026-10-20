// The ONLY place (with handTracker.js) that calls MediaPipe for faces.
// Frames are processed in memory and never stored or sent anywhere.
import { FaceLandmarker } from '@mediapipe/tasks-vision';
import { createWithFallback, FACE_MODEL_URL } from './mediapipe.js';
import { headPoseFromLandmarks } from '../input/headPointer.js';

const OPTIONS = {
  baseOptions: { modelAssetPath: FACE_MODEL_URL },
  runningMode: 'VIDEO',
  numFaces: 1,
  outputFaceBlendshapes: true,
  outputFacialTransformationMatrixes: false,
};

export async function createFaceTracker() {
  let landmarker = await createWithFallback(FaceLandmarker, OPTIONS);
  let switching = false;
  let onCpu = false;

  // Some computers create the GPU version fine but fail on the first frame
  // (broken WebGL). Then switch to the CPU version once and carry on.
  function switchToCpu() {
    if (switching || onCpu) return;
    switching = true;
    createWithFallback(FaceLandmarker, OPTIONS, ['CPU'])
      .then((cpu) => {
        try {
          landmarker.close();
        } catch {
          /* already broken */
        }
        landmarker = cpu;
        onCpu = true;
      })
      .finally(() => {
        switching = false;
      });
  }

  let lastTs = -1;
  return {
    /**
     * @returns null when no face, else { landmarks, blendshapes: {name: score}, pose }
     */
    detect(video, nowMs) {
      // MediaPipe needs strictly increasing timestamps
      const ts = nowMs <= lastTs ? lastTs + 1 : nowMs;
      lastTs = ts;
      if (switching) return null;
      let res;
      try {
        res = landmarker.detectForVideo(video, ts);
      } catch (err) {
        if (onCpu) throw err;
        switchToCpu();
        return null;
      }
      const landmarks = res.faceLandmarks?.[0];
      if (!landmarks) return null;
      const blendshapes = {};
      for (const c of res.faceBlendshapes?.[0]?.categories ?? []) blendshapes[c.categoryName] = c.score;
      const aspect = video.videoWidth / video.videoHeight;
      const pose = headPoseFromLandmarks(landmarks, aspect);
      if (!pose) return null;
      return { landmarks, blendshapes, pose };
    },
    close() {
      landmarker.close();
    },
  };
}
