import { describe, it, expect } from 'vitest';
import { createReplayPlayer, createRecorder, parseRecording } from '../src/dev/replay.js';

describe('dev replay and recorder', () => {
  it('plays frames in real time and stops at the end', () => {
    const frames = [0, 100, 200].map((t) => ({ t, face: null, hand: null, tag: t }));
    const p = createReplayPlayer(frames);
    expect(p.next(1000).tag).toBe(0);
    expect(p.next(1150).tag).toBe(100);
    expect(p.next(1200).tag).toBe(200);
    expect(p.next(1201)).toBeNull();
  });

  it('records only numbers (pose + blendshapes), never images', () => {
    let rec = null;
    const r = createRecorder(100, (x) => (rec = x));
    const face = { pose: { yaw: 0.123456, pitch: 0 }, blendshapes: { jawOpen: 0.51234, _neutral: 0.1 }, landmarks: [{ x: 1 }] };
    r.push({ t: 1000, face, hand: null });
    r.push({ t: 1101, face, hand: null });
    expect(rec.frames).toHaveLength(2);
    expect(rec.frames[0].face.landmarks).toBeUndefined();
    expect(rec.frames[0].face.blendshapes).toEqual({ jawOpen: 0.512 });
    expect(rec.frames[1].t).toBe(101);
    expect(() => parseRecording(rec)).not.toThrow();
  });

  it('rejects files that are not recordings', () => {
    expect(() => parseRecording({ hello: 1 })).toThrow(/not a recording/);
  });
});
