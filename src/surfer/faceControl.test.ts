import { describe, expect, it } from 'vitest';
import { applyFaceParams, idleContextFor, restingFace } from './faceControl';
import { FACE_CHANNELS } from './idleLife';
import { DEFAULT_SURFER_PARAMS } from './surferParams';

describe('the face on the stand (closeup spec §5.2)', () => {
  it('lets the head look around only sitting or on land (Review Focus 3)', () => {
    expect(idleContextFor('sit', false, 0).still).toBe(true);
    expect(idleContextFor('trim', true, 0).still).toBe(true);
    for (const pose of ['paddle', 'popup', 'drop', 'bottomTurn', 'trim', 'barrel', 'kickout', 'bail', 'prone', 'proneBarrel', 'dropKnee'] as const) {
      expect(idleContextFor(pose, false, 0).still, pose).toBe(false);
    }
  });
  it('works hardest paddling, less riding, not at all sitting', () => {
    expect(idleContextFor('paddle', false, 0).exertionTarget).toBe(1);
    expect(idleContextFor('sit', false, 0).exertionTarget).toBe(0);
    const ride = idleContextFor('bottomTurn', false, 0).exertionTarget;
    expect(ride).toBeGreaterThan(0);
    expect(ride).toBeLessThan(1);
  });
  it('clamps the sun’s facing to 0–1', () => {
    expect(idleContextFor('sit', false, -0.5).sunFacing).toBe(0);
    expect(idleContextFor('sit', false, 2).sunFacing).toBe(1);
  });
  it('a resting face is all zeros', () => {
    const r = restingFace();
    for (const c of FACE_CHANNELS) expect(r[c]).toBe(0);
    expect([r.gazeYawDeg, r.gazePitchDeg, r.headYawDeg, r.headPitchDeg]).toEqual([0, 0, 0, 0]);
  });
  it('the manual face overrides the dials’ channels and the gaze, keeping the breathing', () => {
    const idle = { ...restingFace(), breathe: 0.4, nostrils: 0.2, blinkL: 1, blinkR: 1, smile: 0.3 };
    const p = { ...DEFAULT_SURFER_PARAMS, faceManual: true, faceBlink: 0.2, faceSmile: 0.9, faceJaw: 0.1, faceBrows: 0.5, faceSquint: 0.3, gazeYawDeg: 4, gazePitchDeg: -2 };
    const f = applyFaceParams(idle, p);
    expect([f.blinkL, f.blinkR, f.smile, f.jawOpen, f.browsUp, f.squint]).toEqual([0.2, 0.2, 0.9, 0.1, 0.5, 0.3]);
    expect([f.gazeYawDeg, f.gazePitchDeg]).toEqual([4, -2]);
    expect([f.breathe, f.nostrils]).toEqual([0.4, 0.2]);
    expect(applyFaceParams(idle, { ...p, faceManual: false })).toEqual(idle);
  });
});
