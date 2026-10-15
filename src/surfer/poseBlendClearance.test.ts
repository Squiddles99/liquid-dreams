// Ride pose blend Task 6 (spec §4): no limb through another on blended frames, for both standing riders and stances,
// sweeping every dial; and the goofy blend is the regular one mirrored. The capsules are the Blender clips' check's
// (tools/hero/check_clearance.py), with its brushing tolerance.
import { readFileSync } from 'node:fs';
import { Vector3 } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { layoutFor } from '../board/boardSpec';
import { newRiderState, riderDrive, type RiderDrive } from '../ride/riderBody';
import { blendOnBoard } from './poseBlend';
import type { PoseLib } from './poseLib';
import { PRESETS, type Stance, boardFor } from './presets';
import { type BoneName, referenceSkeleton } from './rig';
import type { BoardFrame } from './solvePose';

const lib = JSON.parse(readFileSync('public/surfer/poses/poses.json', 'utf8')) as PoseLib;
const FLAT: BoardFrame = { position: new Vector3(), forward: new Vector3(1, 0, 0), up: new Vector3(0, 1, 0) };
const RADIUS: Record<string, number> = { thigh: 0.075, shin: 0.05, upperarm: 0.045, forearm: 0.038 };
const TOLERANCE = -0.025; // brushing contact, as the Blender check accepted (forearm against the shin in the tuck)
const SEG: Record<string, [BoneName, BoneName]> = {};
for (const s of ['l', 'r'] as const) {
  SEG[`thigh_${s}`] = [`thigh_${s}`, `shin_${s}`];
  SEG[`shin_${s}`] = [`shin_${s}`, `foot_${s}`];
  SEG[`upperarm_${s}`] = [`upperarm_${s}`, `forearm_${s}`];
  SEG[`forearm_${s}`] = [`forearm_${s}`, `hand_${s}`];
}
const PAIRS: [string, string][] = [];
for (const a of ['thigh_l', 'shin_l']) for (const b of ['thigh_r', 'shin_r']) PAIRS.push([a, b]);
for (const arm of ['upperarm_l', 'forearm_l', 'upperarm_r', 'forearm_r']) for (const leg of ['thigh_l', 'shin_l', 'thigh_r', 'shin_r']) PAIRS.push([arm, leg]);

function segDist(p1: Vector3, q1: Vector3, p2: Vector3, q2: Vector3): number {
  let best = Infinity;
  const d = q2.clone().sub(p2), dd = Math.max(d.lengthSq(), 1e-12);
  for (let i = 0; i <= 24; i++) {
    const s = p1.clone().lerp(q1, i / 24), t = Math.min(1, Math.max(0, s.clone().sub(p2).dot(d) / dd));
    best = Math.min(best, s.distanceTo(p2.clone().addScaledVector(d, t)));
  }
  return best;
}

type Drive = RiderDrive & { pumpIdleT: number };
const base: Drive = { ...riderDrive({ ...newRiderState(1.65, 55), carve: 0 }), pumpIdleT: 9 };
/** Every dial swept 0 → 1 → 0 (the pump through both halves of its phase). */
function* sweep(): Generator<Drive> {
  const ramp = [0, 0.25, 0.5, 0.75, 1, 0.75, 0.5, 0.25, 0];
  for (const k of ramp) yield { ...base, tuck: k };
  for (const kind of ['tall', 'hand', 'lowBarrel', 'standBarrel'] as const) {
    for (const k of ramp) yield { ...base, stall: k, stallW: { tall: 0, hand: 0, lowBarrel: 0, standBarrel: 0, [kind]: 1 } };
  }
  for (const k of ramp) yield { ...base, driveOut: k };
  for (const carve of [0.6, -0.6]) for (let i = 0; i <= 12; i++) yield { ...base, carve, pumpIdleT: 0, pumpPhase: i / 12 };
}

function solve(name: 'female' | 'male', stance: Stance, d: Drive) {
  const preset = PRESETS[name], rest = referenceSkeleton(preset.heightM), spec = boardFor(preset, 'thruster');
  return blendOnBoard(lib, rest, { spec, layout: layoutFor(spec, rest.heightM), stance, dials: { compression: 0, lean: 0, twist: 0, reach: 0 }, balance: null }, d, 0, FLAT, null).joint;
}

describe('the pose blend: no limb through another (spec §4)', () => {
  for (const name of ['female', 'male'] as const) for (const stance of ['regular', 'goofy'] as const) {
    it(`${name} ${stance}: every pair clear within the brushing tolerance through every dial's sweep`, () => {
      const worst: Record<string, number> = {};
      let i = 0;
      for (const d of sweep()) {
        const J = solve(name, stance, d);
        for (const [a, b] of PAIRS) {
          const [a0, a1] = SEG[a], [b0, b1] = SEG[b];
          const gap = segDist(J[a0], J[a1], J[b0], J[b1]) - RADIUS[a.slice(0, -2)] - RADIUS[b.slice(0, -2)];
          const key = `${a}/${b}`;
          if (gap < (worst[key] ?? Infinity)) worst[key] = gap;
        }
        i++;
      }
      const bad = Object.entries(worst).filter(([, g]) => g < TOLERANCE).map(([k, g]) => `${k} ${(100 * g).toFixed(1)} cm`);
      expect(bad, `${i} frames`).toEqual([]);
    });
  }

  it('the goofy blend is the regular one mirrored across the board\'s centreline (left and right swapped)', () => {
    const other = (b: string): BoneName => (b.endsWith('_l') ? `${b.slice(0, -2)}_r` : b.endsWith('_r') ? `${b.slice(0, -2)}_l` : b) as BoneName;
    for (const d of [{ ...base, tuck: 1 }, { ...base, stall: 1, stallW: { tall: 0, hand: 1, lowBarrel: 0, standBarrel: 0 } }]) {
      const R = solve('female', 'regular', d), G = solve('female', 'goofy', d);
      for (const b of ['pelvis', 'spine_03', 'hand_r', 'hand_l', 'foot_l', 'shin_r'] as const) {
        const g = G[other(b)], r = R[b];
        expect(g.x, b).toBeCloseTo(r.x, 1.7);
        expect(g.y, b).toBeCloseTo(r.y, 1.7);
        expect(g.z, b).toBeCloseTo(-r.z, 1.7);
      }
    }
  });
});
