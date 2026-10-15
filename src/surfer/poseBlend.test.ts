import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { newRiderState, riderDrive } from '../ride/riderBody';
import type { PoseLib } from './poseLib';
import { PUMP_EASE_S, blendSample, blendWeights, pumpTime, toeRailDown } from './poseBlend';

const lib = JSON.parse(readFileSync('public/surfer/poses/poses.json', 'utf8')) as PoseLib;
const drive = (over: Partial<ReturnType<typeof riderDrive>> = {}) => ({ ...riderDrive({ ...newRiderState(1.65, 55), carve: 0 }), pumpIdleT: 9, ...over });
const sum = (w: object) => Object.values(w as Record<string, number>).reduce((a, b) => a + b, 0);

describe('pose blend weights (spec §3)', () => {
  it('all dials at rest: nothing over the base (today\'s trim)', () => expect(sum(blendWeights(drive()))).toBe(0));
  it('each dial at full gives its own pose', () => {
    expect(blendWeights(drive({ tuck: 1 })).tuck).toBeCloseTo(1, 6);
    expect(blendWeights(drive({ stall: 1, stallW: { tall: 0, hand: 1, lowBarrel: 0, standBarrel: 0 } })).stallHand).toBeCloseTo(1, 6);
    expect(blendWeights(drive({ driveOut: 1 })).driveOut).toBeCloseTo(1, 6);
    expect(blendWeights(drive({ pumpIdleT: 0 })).pump).toBeCloseTo(1, 6);
  });
  it('never past 1 above the base (a tuck pressed mid-stall, pumping)', () => {
    const w = blendWeights(drive({ tuck: 1, stall: 1, driveOut: 1, pumpIdleT: 0 }));
    expect(sum(w)).toBeLessThanOrEqual(1 + 1e-9);
  });
  it('carving without pumping keeps the pump out (no phantom pumping)', () => {
    expect(blendWeights(drive({ carve: 0.9, pumpIdleT: 9 })).pump).toBe(0);
  });
  it('the pump eases out within PUMP_EASE_S of the last pump', () => {
    expect(blendWeights(drive({ pumpIdleT: PUMP_EASE_S * 0.5 })).pump).toBeGreaterThan(0);
    expect(blendWeights(drive({ pumpIdleT: PUMP_EASE_S })).pump).toBe(0);
  });
  it('the pump clip follows the phase, toe and heel halves by the rail', () => {
    const T = lib.clips.pumpCycle.frames / lib.fps;
    expect(pumpTime(0, true, lib)).toBeCloseTo(T / 8, 6);       // toe half starts at the top (pmp2)
    expect(pumpTime(0.5, true, lib)).toBeCloseTo((3 * T) / 8, 6); // its bottom (pmp4)
    expect(pumpTime(0.5, false, lib)).toBeCloseTo((7 * T) / 8, 6); // the heel half's bottom (pmp8)
  });
  it('a stall-kind change never snaps the pose (bounded change per 1/60 s)', () => {
    let prev = blendSample(lib, 'regular', 0, drive({ stall: 1, stallW: { tall: 1, hand: 0, lowBarrel: 0, standBarrel: 0 } }), true).sample;
    for (let i = 1; i <= 9; i++) {
      const k = i / 9; // the physics eases kinds over 0.15 s: 9 frames
      const s = blendSample(lib, 'regular', i / 60, drive({ stall: 1, stallW: { tall: 1 - k, hand: 0, lowBarrel: k, standBarrel: 0 } }), true).sample;
      for (const b of ['spine_03', 'thigh_r', 'upperarm_r']) expect(Math.abs(s.rot[b]!.dot(prev.rot[b]!))).toBeGreaterThan(Math.cos(0.25));
      prev = s;
    }
  });
  it('the toe rail is down when the carve rolls the board toward the toes: regular +carve, goofy -carve', () => {
    expect(toeRailDown(0.5, 'regular')).toBe(true);
    expect(toeRailDown(-0.5, 'regular')).toBe(false);
    expect(toeRailDown(0.5, 'goofy')).toBe(false);
    expect(toeRailDown(-0.5, 'goofy')).toBe(true);
  });
});
