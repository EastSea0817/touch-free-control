// Hand gesture helpers (optional input, off by default).
// All hand distances are divided by palm size (wrist 0 <-> middle-finger MCP 9),
// so the decision does not change when the hand moves closer or farther away.

import { aspectDistance } from './screenMapping.js';

const WRIST = 0;
const MIDDLE_MCP = 9;
const FINGERTIPS = [8, 12, 16, 20]; // index, middle, ring, pinky (thumb ignored)

export function palmSize(landmarks, aspect) {
  return aspectDistance(landmarks[WRIST], landmarks[MIDDLE_MCP], aspect);
}

/**
 * Average fingertip-to-wrist distance in "palms".
 * Open hand ~1.8-2.1, closed fist ~0.8-1.2.
 */
export function handOpenness(landmarks, aspect) {
  if (!landmarks || landmarks.length < 21) return null;
  const palm = palmSize(landmarks, aspect);
  if (palm < 1e-6) return null;
  const sum = FINGERTIPS.reduce((s, i) => s + aspectDistance(landmarks[i], landmarks[WRIST], aspect), 0);
  return sum / FINGERTIPS.length / palm;
}

export const FIST_MAX_OPENNESS = 1.5;
export const PALM_MIN_OPENNESS = 1.6;
export const MIN_GESTURE_SCORE = 0.6;

/**
 * Combine the recognizer's label with my own openness check, so both have to
 * agree before a gesture counts (never act when unsure).
 * @returns 'fist' | 'palm' | 'none' | null (null = no hand visible)
 */
export function classifyHand({ gestureName, gestureScore, landmarks, aspect }) {
  if (!landmarks) return null;
  const open = handOpenness(landmarks, aspect);
  if (open === null) return null;
  if (gestureScore < MIN_GESTURE_SCORE) return 'none';
  if (gestureName === 'Closed_Fist' && open <= FIST_MAX_OPENNESS) return 'fist';
  if (gestureName === 'Open_Palm' && open >= PALM_MIN_OPENNESS) return 'palm';
  return 'none';
}
