import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three/webgpu';
import { SINK_M, boardFrameFrom, chaseCamera, placeAhead, probePoints, stableLookAt } from './placement';

const P = { x: 10, z: -5, headingDeg: 90, heightNudgeM: 0, pitchNudgeDeg: 0 };

describe('the stand’s placement', () => {
  it('points the nose along the compass heading (90° = east = +x) and sits on flat water', () => {
    const f = boardFrameFrom(P, 0.9, 0.25, [0.4, 0.4, 0.4, 0.4], 0);
    expect(f.forward.x).toBeCloseTo(1, 9);
    expect(f.up.y).toBeCloseTo(1, 9);
    expect(f.position.y).toBeCloseTo(0.4 - SINK_M, 9);
  });
  it('pitches with the water under nose and tail, and tilts away from the higher rail', () => {
    const f = boardFrameFrom({ ...P, headingDeg: 0 }, 0.9, 0.25, [0.6, 0.2, 0.5, 0.3], 0);
    expect(f.forward.y).toBeGreaterThan(0);
    expect(f.up.x).toBeLessThan(0); // heading north, the right rail is east (+x) and higher
  });
  it('sits on the tide, finite, until the probe has read back (Review Focus 2)', () => {
    const f = boardFrameFrom(P, 0.9, 0.25, [null, null, null, null], 0.7);
    expect(f.position.y).toBeCloseTo(0.7 - SINK_M, 9);
    expect([f.forward, f.up, f.position].flatMap((v) => [v.x, v.y, v.z]).every(Number.isFinite)).toBe(true);
  });
  it('probes the nose, tail and both rails', () => {
    const pts = probePoints({ ...P, headingDeg: 0 }, 1, 0.25);
    expect(pts[0][1]).toBeLessThan(-5); // nose to the north (−z)
    expect(pts[2][0]).toBeGreaterThan(10); // right rail to the east
  });
  it('puts the chase camera behind and above, looking along the heading', () => {
    const cam = chaseCamera(boardFrameFrom(P, 0.9, 0.25, [0, 0, 0, 0], 0), 90);
    expect(cam.mode).toBe('free');
    expect(cam.position[0]).toBeLessThan(10);
    expect(cam.position[1]).toBeGreaterThan(1);
    expect(cam.yawDeg).toBe(90);
  });
  it('places the board 6 m ahead of the camera, nose along its view', () => {
    expect(placeAhead({ mode: 'free', position: [0, 3, 0], yawDeg: 90, pitchDeg: -10 })).toEqual({ x: 6, z: 0, headingDeg: 90 });
  });
});

describe('the gaze holds against the board (spec §3.6; final review: it pitched and rolled with the board)', () => {
  const flat = boardFrameFrom(P, 0.9, 0.25, [0.4, 0.4, 0.4, 0.4], 0);
  // Nose up 0.3 m over the board and the right rail 0.2 m down: pitched and rolled.
  const tilted = boardFrameFrom(P, 0.9, 0.25, [0.7, 0.1, 0.2, 0.6], 0);
  it('looks the same way on a pitched, rolled board as on a flat one with the same heading', () => {
    const look = new Vector3(1, -0.4, 0.3);
    const a = stableLookAt(flat, look).sub(flat.position).normalize(), b = stableLookAt(tilted, look).sub(tilted.position).normalize();
    expect(a.distanceTo(b)).toBeLessThan(1e-9);
  });
  it('keeps the pose’s own look up/down level with the horizon, 10 m out', () => {
    const d = stableLookAt(tilted, new Vector3(1, 0, 0)).sub(tilted.position);
    expect(d.y).toBeCloseTo(0, 9);
    expect(d.length()).toBeCloseTo(10, 9);
  });
});
