import { describe, expect, it } from 'vitest';
import { depthBg } from './coastProfile';
import { bedHeightAt, buildBathymetry, downsample, reefWarp } from './bathymetry';
import { DEFAULT_REEF_PARAMS, NORTH_LEDGE, REEF_GRID, REEF_WARP, SOUTH_LEDGE } from './wombReef';

const bathy = buildBathymetry();
const depth = (x: number, z: number) => -bedHeightAt(bathy, x, z);

describe('the Womb reef', () => {
  it('builds the full grid, deterministically', () => {
    expect(bathy.bed.length).toBe(REEF_GRID.nx * REEF_GRID.nz);
    const again = buildBathymetry();
    expect(again.bed[123456]).toBe(bathy.bed[123456]);
    expect(again.sand[654321]).toBe(bathy.sand[654321]);
  });
  it('is 6 m deep at the take-off corner (Andrew)', () => {
    expect(depth(0, 0)).toBeCloseTo(DEFAULT_REEF_PARAMS.ledgeDepthM, 1);
  });
  it('holds ledge depth along both ledges', () => {
    for (const [x, z] of [...NORTH_LEDGE.slice(0, 3), ...SOUTH_LEDGE.slice(0, 2)]) {
      expect(depth(x, z)).toBeGreaterThan(DEFAULT_REEF_PARAMS.ledgeDepthM - 1.5);
      expect(depth(x, z)).toBeLessThan(DEFAULT_REEF_PARAMS.ledgeDepthM + 1.5);
    }
  });
  it('drops to deep water just seaward of the ledges and to the south-west', () => {
    expect(depth(-30, 0)).toBeGreaterThan(11);
    expect(depth(-20, 40)).toBeGreaterThan(11);
  });
  it('is shallower on the shelf than at the ledge, never shallower than the minimum', () => {
    let sum = 0, n = 0;
    for (let x = 45; x <= 105; x += 5) for (let z = -200; z <= -40; z += 5) {
      const d = depth(x, z);
      expect(d).toBeGreaterThanOrEqual(DEFAULT_REEF_PARAMS.minDepthM - 1e-6);
      sum += d; n++;
    }
    expect(sum / n).toBeLessThan(DEFAULT_REEF_PARAMS.ledgeDepthM);
  });
  it('has sand pockets and reef on the shelf, sand in the deep', () => {
    let sandy = 0, rocky = 0;
    for (let x = 45; x <= 105; x += 2) for (let z = -200; z <= -20; z += 2) {
      const i = Math.round((z - REEF_GRID.z0) / REEF_GRID.cellM) * REEF_GRID.nx + Math.round((x - REEF_GRID.x0) / REEF_GRID.cellM);
      if (bathy.sand[i] > 0.5) sandy++; else rocky++;
    }
    expect(sandy).toBeGreaterThan(20);
    expect(rocky).toBeGreaterThan(sandy);
    const deepI = Math.round((100 - REEF_GRID.z0) / REEF_GRID.cellM) * REEF_GRID.nx + Math.round((-300 - REEF_GRID.x0) / REEF_GRID.cellM);
    expect(bathy.sand[deepI]).toBeGreaterThan(0.9);
  });
  it('matches the coast profile at and beyond the map edges (continuity for the far field)', () => {
    for (const z of [-449, 299]) for (const x of [-399, -200, 0, 150]) {
      expect(depth(x, z)).toBeCloseTo(depthBg(x), 1);
    }
    expect(depth(-1000, 0)).toBe(depthBg(-1000));
  });
  it('downsamples by averaging', () => {
    const d = downsample(bathy, 2);
    expect(d.grid.nx).toBe(REEF_GRID.nx / 2);
    expect(d.grid.cellM).toBe(1);
    const i = 300 * d.grid.nx + 400;
    const src = (r: number, c: number) => bathy.bed[r * REEF_GRID.nx + c];
    expect(d.bed[i]).toBeCloseTo((src(600, 800) + src(600, 801) + src(601, 800) + src(601, 801)) / 4, 5);
  });
});

describe('reef domain warp', () => {
  it('is deterministic', () => {
    expect(reefWarp(37.2, -164.8)).toEqual(reefWarp(37.2, -164.8));
  });
  it('is zero at the peak (0, 0), so the take-off corner is untouched', () => {
    const [dx, dz] = reefWarp(0, 0);
    expect(dx).toBeCloseTo(0, 9);
    expect(dz).toBeCloseTo(0, 9);
  });
  it('never moves a ledge crossing by more than ampM + detailAmpM', () => {
    const cap = REEF_WARP.ampM + REEF_WARP.detailAmpM;
    for (const [x, z] of [...NORTH_LEDGE, ...SOUTH_LEDGE]) {
      const [dx, dz] = reefWarp(x, z);
      expect(Math.hypot(dx, dz)).toBeLessThanOrEqual(cap + 1e-9);
    }
    // And broadly, off the ledges too.
    for (let x = -300; x <= 200; x += 37) for (let z = -400; z <= 250; z += 41) {
      const [dx, dz] = reefWarp(x, z);
      expect(Math.hypot(dx, dz)).toBeLessThanOrEqual(cap + 1e-9);
    }
  });
});
