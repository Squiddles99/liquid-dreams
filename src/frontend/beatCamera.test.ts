// src/frontend/beatCamera.test.ts
import { Vector3 } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { testLand } from '../land/testLand';
import { TrackNetwork, routeTracks } from '../land/tracks';
import { PRESETS } from '../surfer/presets';
import { type CrewPlace, SELECT_SPACING_M, conditionsShot, crewFor, easePose, gearShot, poseCamera, riderShot, stagingReady } from './beatCamera';
import type { CameraPose } from '../dev/momentLink';

const land = testLand();
const net = new TrackNetwork(routeTracks(land, [-300, 300]));
const ground = (x: number, z: number): number => land.baseHeightAt(x, z) - net.sinkAt(x, z);
const stand = net.standSpot();
const W = 1920, H = 1080;

/** A rider's on-screen box (px): a 0.5 m-wide column from their ground to their height. */
function box(pose: CameraPose, p: CrewPlace): { minX: number; maxX: number; minY: number; maxY: number; inFront: boolean } {
  const cam = poseCamera(pose, W / H), g = ground(p.x, p.z), h = PRESETS[p.preset].heightM;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, inFront = true;
  for (const dx of [-0.25, 0.25]) for (const dz of [-0.25, 0.25]) for (const y of [g, g + h]) {
    const v = new Vector3(p.x + dx, y, p.z + dz);
    if (v.clone().applyMatrix4(cam.matrixWorldInverse).z > 0) inFront = false;
    v.project(cam);
    const sx = ((v.x + 1) / 2) * W, sy = ((1 - v.y) / 2) * H;
    minX = Math.min(minX, sx); maxX = Math.max(maxX, sx); minY = Math.min(minY, sy); maxY = Math.max(maxY, sy);
  }
  return { minX, maxX, minY, maxY, inFront };
}
/** The slide panel's raked leading edge (900 px wide, 110 px rake): x at screen height y. */
const panelEdge = (y: number): number => W - 900 + 110 * (1 - y / H);

describe('the beats\' shots (dune select spec §4; ruling: the crew spread on the turn)', () => {
  it('waits for the land\'s tracks before staging (Review Focus 3)', () => {
    expect(stagingReady(null)).toBe(false);
    expect(stagingReady({ trackNetwork: null })).toBe(false);
    expect(stagingReady({ trackNetwork: net })).toBe(true);
  });
  it('stands the crew facing the sea for Conditions, T-Bone · Shazza · Grommet left to right from behind', () => {
    const crew = crewFor('conditions', stand);
    expect(crew.map((c) => c.preset)).toEqual(['male', 'female', 'grommet']);
    for (const c of crew) expect(c.headingDeg).toBe((stand.headingDeg + 180) % 360);
    const pose = conditionsShot(stand, ground), xs = crew.map((c) => box(pose, c));
    expect(xs[0].maxX).toBeLessThan(xs[1].maxX);
    expect(xs[1].maxX).toBeLessThan(xs[2].maxX);
  });
  it('turns them round without crossing: the outer two side-step outward (a pace or two), nobody walks through the others', () => {
    const before = crewFor('conditions', stand), after = crewFor('rider', stand);
    for (const b of before) {
      const a = after.find((c) => c.preset === b.preset)!;
      expect(Math.hypot(a.x - b.x, a.z - b.z), b.preset).toBeLessThanOrEqual(1.1);
    }
  });
  it('re-forms them facing inland, 2.1 m apart, T-Bone · Shazza · Grommet left to right from the camera', () => {
    const crew = crewFor('rider', stand);
    expect(crew.map((c) => c.preset)).toEqual(['male', 'female', 'grommet']);
    expect(Math.hypot(crew[0].x - crew[1].x, crew[0].z - crew[1].z)).toBeCloseTo(SELECT_SPACING_M, 6);
    const pose = riderShot(crew[1], ground);
    const xs = crew.map((c) => box(pose, c));
    expect(xs[0].maxX).toBeLessThan(xs[1].minX + 1e-6);
  });
  it('frames Conditions from behind and above, the crew centre-right, the camera over the clearing or a track', () => {
    const pose = conditionsShot(stand, ground);
    const crew = crewFor('conditions', stand).map((c) => box(pose, c));
    const mid = (crew[0].minX + crew[2].maxX) / 2;
    expect(mid / W).toBeGreaterThan(0.45);
    expect(mid / W).toBeLessThan(0.75);
    // Over the clearing, a corridor or their worn edge (3.8 m inland of the stand spot is just past the clearing's 2.5 m half-width).
    expect(net.worn(pose.position[0], pose.position[2])).toBeGreaterThan(0);
    expect(pose.position[1]).toBeGreaterThan(ground(pose.position[0], pose.position[2]) + 0.4);
  });
  for (const focus of ['male', 'female', 'grommet'] as const) {
    it(`frames ${focus} in Choose your rider: the left third, the head high, the other two outside the frame or behind the panel`, () => {
      const crew = crewFor('rider', stand), me = crew.find((c) => c.preset === focus)!;
      const pose = riderShot(me, ground), b = box(pose, me);
      const cx = (b.minX + b.maxX) / 2;
      expect(cx / W).toBeGreaterThan(0.28);
      expect(cx / W).toBeLessThan(0.38);
      expect(b.minY / H).toBeGreaterThan(0.15);
      expect(b.minY / H).toBeLessThan(0.35);
      for (const o of crew.filter((c) => c.preset !== focus)) {
        const ob = box(pose, o);
        const hidden = !ob.inFront || ob.maxX < 0 || ob.minX > W || ob.minX > panelEdge(Math.max(0, ob.minY));
        expect(hidden, `${o.preset} visible at x ${ob.minX.toFixed(0)}–${ob.maxX.toFixed(0)}`).toBe(true);
      }
      expect(pose.position[1]).toBeGreaterThan(ground(pose.position[0], pose.position[2]) + 0.3);
    });
  }
  it('frames the chosen rider alone in Grab your gear, in the left half', () => {
    const me = crewFor('gear', stand).find((c) => c.preset === 'female')!;
    const b = box(gearShot(me, ground), me);
    const cx = (b.minX + b.maxX) / 2;
    expect(cx / W).toBeGreaterThan(0.2);
    expect(cx / W).toBeLessThan(0.42);
  });
  it('eases between shots, the yaw the short way round', () => {
    const a: CameraPose = { mode: 'free', position: [0, 1, 0], yawDeg: 350, pitchDeg: 0 };
    const b: CameraPose = { mode: 'free', position: [10, 3, 0], yawDeg: 10, pitchDeg: -10 };
    expect(easePose(a, b, 0)).toEqual(a);
    expect(easePose(a, b, 1)).toEqual({ ...b, yawDeg: 10 });
    const mid = easePose(a, b, 0.5);
    expect(mid.position[0]).toBeCloseTo(5, 6);
    expect(Math.min(mid.yawDeg, 360 - mid.yawDeg)).toBeCloseTo(0, 6);
  });
});
