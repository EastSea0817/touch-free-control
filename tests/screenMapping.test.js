import { describe, it, expect } from 'vitest';
import { landmarkToCoverPixel, mirrorX, aspectDistance } from '../src/input/screenMapping.js';

describe('screenMapping', () => {
  it('mirrors x', () => {
    expect(mirrorX(0.2)).toBeCloseTo(0.8);
  });

  it('maps the centre of the video to the centre of the box', () => {
    const p = landmarkToCoverPixel({ x: 0.5, y: 0.5 }, { width: 1280, height: 720 }, { width: 800, height: 800 });
    expect(p.x).toBeCloseTo(400);
    expect(p.y).toBeCloseTo(400);
  });

  it('crops the wider side with object-fit: cover (16:9 video in a square box)', () => {
    // scale = max(800/1280, 800/720) = 1.111..; drawn width = 1422.2, offset = -311.1
    const video = { width: 1280, height: 720 };
    const box = { width: 800, height: 800 };
    const left = landmarkToCoverPixel({ x: 1, y: 0 }, video, box); // mirrored -> left edge of drawn video
    expect(left.x).toBeCloseTo(-311.11, 1);
    expect(left.y).toBeCloseTo(0);
  });

  it('flips direction in mirror mode', () => {
    const video = { width: 640, height: 480 };
    const box = { width: 640, height: 480 };
    expect(landmarkToCoverPixel({ x: 0.25, y: 0.5 }, video, box).x).toBeCloseTo(480);
    expect(landmarkToCoverPixel({ x: 0.25, y: 0.5 }, video, box, { mirror: false }).x).toBeCloseTo(160);
  });

  it('corrects aspect ratio in distances', () => {
    // 0.1 horizontally on a 16:9 video is longer than 0.1 vertically
    const aspect = 16 / 9;
    const h = aspectDistance({ x: 0, y: 0 }, { x: 0.1, y: 0 }, aspect);
    const v = aspectDistance({ x: 0, y: 0 }, { x: 0, y: 0.1 }, aspect);
    expect(h / v).toBeCloseTo(aspect);
  });
});
