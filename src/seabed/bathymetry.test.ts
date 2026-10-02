import { beachHeight } from '../land/landHeight';
import { describe, expect, it } from 'vitest';
import { depthBg } from './coastProfile';
import { bedHeightAt, buildBathymetry, downsample, reefProfileDepth, reefWarp, seawardDepth } from './bathymetry';
import { SHORE_X } from './coastProfile';
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
  it('the warp actually used by buildBathymetry (coarse lattice, interpolated) is still exactly zero at the peak', () => {
    // (0, 0) sits exactly on the SDF_CELL_M coarse lattice, so ledgeSignedDistance(0, 0) = 0 is read back
    // without interpolation error. If the warp lookup inside buildBathymetry were not exactly [0, 0] here,
    // the take-off corner would sit at a nonzero signed distance from the ledge vertex and this would miss.
    const i = Math.round((0 - REEF_GRID.z0) / REEF_GRID.cellM) * REEF_GRID.nx + Math.round((0 - REEF_GRID.x0) / REEF_GRID.cellM);
    expect(bathy.bed[i]).toBe(-DEFAULT_REEF_PARAMS.ledgeDepthM);
  });
  it('holds ledge depth along both ledges', () => {
    for (const [x, z] of [...NORTH_LEDGE.slice(0, 3), ...SOUTH_LEDGE.slice(0, 2)]) {
      expect(depth(x, z)).toBeGreaterThan(DEFAULT_REEF_PARAMS.ledgeDepthM - 1.5);
      expect(depth(x, z)).toBeLessThan(DEFAULT_REEF_PARAMS.ledgeDepthM + 1.5);
    }
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

describe('bedHeightAt with a waterline shift (Phase 4a spec §4.4)', () => {
  it('moves the coast profile east by the shift outside the map, and leaves the map alone', () => {
    const shift = (z: number) => (z > 1000 ? 120 : 0);
    expect(bedHeightAt(bathy, 300, 2000, shift)).toBeCloseTo(-depthBg(300 - 120), 6);
    expect(bedHeightAt(bathy, 300, 0, shift)).toBeCloseTo(bedHeightAt(bathy, 300, 0), 6);
    expect(bedHeightAt(bathy, 0, 0, shift)).toBe(bedHeightAt(bathy, 0, 0)); // inside the reef map
  });
});

describe('the beach under the swash (Phase 4b spec §3.3, Ruling W7)', () => {
  it('landward of the waterline the shading bed follows the beach profile; seaward it is unchanged', () => {
    expect(bedHeightAt(bathy, 190 + 6, 3000)).toBeCloseTo(beachHeight(6), 6);
    expect(bedHeightAt(bathy, 190 + 30, 3000, () => 0)).toBeCloseTo(beachHeight(30), 6);
    expect(bedHeightAt(bathy, 150, 3000)).toBeCloseTo(-depthBg(150), 6);
    // shifted: the waterline at 190 + 120
    expect(bedHeightAt(bathy, 310 + 5, 3000, () => 120)).toBeCloseTo(beachHeight(5), 6);
  });
  it('is continuous with the seabed at the waterline, at any shift', () => {
    for (const shift of [-300, 0, 150]) {
      const xs = 190 + shift;
      expect(Math.abs(bedHeightAt(bathy, xs + 0.001, 3000, () => shift) - bedHeightAt(bathy, xs - 0.001, 3000, () => shift))).toBeLessThan(0.01);
    }
  });
});

import { BOMBIE_X, BOMBIE_Z, MOUND_CREST_Y, MOUND_HALF_X_M } from '../bombie/bombieModel';
describe('the Bombie’s mound (4c-3)', () => {
  const b = buildBathymetry();
  it('rises to 5 m below mean sea level outside the reef map, and leaves the bed alone beyond its oval', () => {
    expect(bedHeightAt(b, BOMBIE_X, BOMBIE_Z)).toBeCloseTo(MOUND_CREST_Y, 3);
    expect(bedHeightAt(b, BOMBIE_X + MOUND_HALF_X_M + 5, BOMBIE_Z)).toBeLessThan(-20);
    expect(bedHeightAt(b, BOMBIE_X + MOUND_HALF_X_M * 0.5, BOMBIE_Z)).toBeGreaterThan(bedHeightAt(b, BOMBIE_X + MOUND_HALF_X_M + 5, BOMBIE_Z));
  });
});

describe('the reef seaward of the ledges (spec 2026-10-02 §3)', () => {
  const p = DEFAULT_REEF_PARAMS;
  it('the profile: the ledge depth at the ledge, the face base at its width, the slope depth at its end and beyond, never shallowing', () => {
    expect(reefProfileDepth(0, p)).toBeCloseTo(p.ledgeDepthM, 9);
    expect(reefProfileDepth(-5, p)).toBeCloseTo(p.ledgeDepthM, 9);
    expect(reefProfileDepth(p.faceWidthM, p)).toBeCloseTo(p.faceBaseDepthM, 9);
    expect(reefProfileDepth(p.slopeEndM, p)).toBeCloseTo(p.slopeDepthM, 9);
    expect(reefProfileDepth(p.slopeEndM + 100, p)).toBeCloseTo(p.slopeDepthM, 9);
    for (let v = 0; v < 400; v += 0.5) expect(reefProfileDepth(v + 0.5, p)).toBeGreaterThanOrEqual(reefProfileDepth(v, p));
  });
  it('the slope beyond the face is steady: the same gradient all the way to its end', () => {
    const g = (v: number) => reefProfileDepth(v + 1, p) - reefProfileDepth(v, p);
    for (let v = p.faceWidthM + 1; v < p.slopeEndM - 2; v += 7) expect(g(v)).toBeCloseTo(g(p.faceWidthM + 1), 9);
  });
  it('degenerate params (dev panel) stay finite and never shallow seaward (plan Review Focus 3)', () => {
    for (const q of [{ ...p, faceWidthM: 0 }, { ...p, slopeEndM: p.faceWidthM }, { ...p, slopeEndM: 0, faceWidthM: 0 }]) {
      let prev = -Infinity;
      for (let v = 0; v < 300; v += 1) { const d = reefProfileDepth(v, q); expect(Number.isFinite(d)).toBe(true); expect(d).toBeGreaterThanOrEqual(prev - 1e-9); prev = d; }
    }
  });
  it('inshore of the reef the bed stays the coast’s shallows (south of the peak near the beach)', () => {
    for (const [x, z] of [[150, 200], [170, 120], [120, 250]]) expect(depth(x, z)).toBeCloseTo(depthBg(x), 0);
  });
  it('along the peak’s south-west line the bed deepens steadily from the ledge to 300 m out (no step back up > 2 cm)', () => {
    let prev = depth(0, 0);
    for (let s = 1; s <= 300; s++) {
      const d = depth(-s * Math.SQRT1_2, s * Math.SQRT1_2);
      expect(d, `${s} m out`).toBeGreaterThanOrEqual(prev - 0.02);
      prev = Math.max(prev, d);
    }
  });
  it('the face and the slope are where the params put them along the peak’s line (±1.5 m: the line leaves the ledge at an angle)', () => {
    const at = (v: number) => depth(-v * Math.SQRT1_2, v * Math.SQRT1_2);
    expect(at(p.faceWidthM)).toBeGreaterThan(p.faceBaseDepthM - 1.5);
    expect(at(p.slopeEndM)).toBeGreaterThan(p.slopeDepthM - 2);
    expect(at(p.slopeEndM)).toBeLessThan(p.slopeDepthM + 1.5);
  });
  it('meets the coast profile at the west, north and south map edges (the far field)', () => {
    for (const z of [-300, 0, 200]) expect(depth(-399, z)).toBeCloseTo(depthBg(-399), 1);
    expect(seawardDepth(1000, -1000, p)).toBe(depthBg(-1000));
    expect(SHORE_X).toBe(190);
  });
});
