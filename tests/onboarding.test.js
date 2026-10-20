import { describe, it, expect } from 'vitest';
import { cameraCheck } from '../src/ui/screens/onboarding.js';

const frame = (faceWidth, nose = { x: 0.5, y: 0.5 }) => ({ face: { pose: { yaw: 0, pitch: 0, faceWidth }, landmarks: { 1: nose } } });

describe('camera check', () => {
  it('reports no face', () => {
    expect(cameraCheck({ face: null })).toEqual({ face: false, distance: null, center: null });
  });
  it('checks distance by face size', () => {
    expect(cameraCheck(frame(0.1)).distance).toBe('far');
    expect(cameraCheck(frame(0.4)).distance).toBe('ok');
    expect(cameraCheck(frame(0.9)).distance).toBe('near');
  });
  it('checks that the face is near the middle', () => {
    expect(cameraCheck(frame(0.4)).center).toBe(true);
    expect(cameraCheck(frame(0.4, { x: 0.9, y: 0.5 })).center).toBe(false);
  });
});
