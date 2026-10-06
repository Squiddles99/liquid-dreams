import { beachHeight } from '../land/landHeight';
import { describe, expect, it } from 'vitest';
import { depthBg } from './coastProfile';
import { bedHeightAt, bedMaterialAt, buildBathymetry, downsample, ledgeSignedDistance, reefProfileDepth, reefWarp, seawardDepth } from './bathymetry';
import { OPEN_COAST_MATERIAL } from './shoreReef';
import { SHORE_X } from './coastProfile';
import { DEFAULT_REEF_PARAMS, NORTH_LEDGE, REEF_GRID, REEF_WARP, SHELF_INNER_X, SOUTH_LEDGE, rockReachM } from './wombReef';

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
  it('is shallow on the shelf (its base depth or less on average), never shallower than the minimum', () => {
    let sum = 0, n = 0;
    // The shelf south of the corner, between the south ledge and the shore's platform.
    for (let x = 5; x <= 50; x += 5) for (let z = 20; z <= 140; z += 5) {
      const d = depth(x, z);
      expect(d).toBeGreaterThanOrEqual(DEFAULT_REEF_PARAMS.minDepthM - 1e-6);
      sum += d; n++;
    }
    expect(sum / n).toBeLessThan(DEFAULT_REEF_PARAMS.shelfDepthM);
  });
  it('matches the coast profile at and beyond the map edges (continuity for the far field)', () => {
    for (const z of [-449, 299]) for (const x of [-399, -200, 0, SHORE_X - 30]) {
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
    const shift = (z: number) => (z > 1000 ? 120 : 0), x = SHORE_X + 110;
    expect(bedHeightAt(bathy, x, 2000, shift)).toBeCloseTo(-depthBg(x - 120), 6);
    expect(bedHeightAt(bathy, x, 0, shift)).toBeCloseTo(bedHeightAt(bathy, x, 0), 6);
    expect(bedHeightAt(bathy, 0, 0, shift)).toBe(bedHeightAt(bathy, 0, 0)); // inside the reef map
  });
});

describe('the beach under the swash (Phase 4b spec §3.3, Ruling W7)', () => {
  it('landward of the waterline the shading bed follows the beach profile; seaward it is unchanged', () => {
    expect(bedHeightAt(bathy, SHORE_X + 6, 3000)).toBeCloseTo(beachHeight(6), 6);
    expect(bedHeightAt(bathy, SHORE_X + 30, 3000, () => 0)).toBeCloseTo(beachHeight(30), 6);
    expect(bedHeightAt(bathy, SHORE_X - 40, 3000)).toBeCloseTo(-depthBg(SHORE_X - 40), 6);
    // shifted: the waterline at SHORE_X + 120
    expect(bedHeightAt(bathy, SHORE_X + 120 + 5, 3000, () => 120)).toBeCloseTo(beachHeight(5), 6);
  });
  it('is continuous with the seabed at the waterline, at any shift', () => {
    for (const shift of [-300, 0, 150]) {
      const xs = SHORE_X + shift;
      expect(Math.abs(bedHeightAt(bathy, xs + 0.001, 3000, () => shift) - bedHeightAt(bathy, xs - 0.001, 3000, () => shift))).toBeLessThan(0.01);
    }
  });
});

import { BOMBIE_X, BOMBIE_Z, MOUND_CREST_Y, MOUND_HALF_X_M } from '../bombie/bombieModel';
describe('the Bombie’s mound (4c-3)', () => {
  const b = buildBathymetry();
  it('rises to 5 m below mean sea level outside the reef map, and leaves the bed alone beyond its oval', () => {
    expect(bedHeightAt(b, BOMBIE_X, BOMBIE_Z)).toBeCloseTo(MOUND_CREST_Y, 3);
    expect(bedHeightAt(b, BOMBIE_X + MOUND_HALF_X_M + 5, BOMBIE_Z)).toBeCloseTo(-depthBg(BOMBIE_X + MOUND_HALF_X_M + 5), 3);
    // 0.3 of its half width, not 0.5: the sea around it is 15 m since R1 §1 and the mound's outer half (its base is −26 m)
    // lies under that floor.
    expect(bedHeightAt(b, BOMBIE_X + MOUND_HALF_X_M * 0.3, BOMBIE_Z)).toBeGreaterThan(bedHeightAt(b, BOMBIE_X + MOUND_HALF_X_M + 5, BOMBIE_Z));
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
    for (const q of [{ ...p, faceWidthM: 0 }, { ...p, slopeEndM: p.faceWidthM }, { ...p, slopeEndM: 0, faceWidthM: 0 }, { ...p, ledgeDepthM: 12, faceBaseDepthM: 7 }, { ...p, faceBaseDepthM: 22, slopeDepthM: 15 }]) {
      let prev = -Infinity;
      for (let v = 0; v < 300; v += 1) { const d = reefProfileDepth(v, q); expect(Number.isFinite(d)).toBe(true); expect(d).toBeGreaterThanOrEqual(prev - 1e-9); prev = d; }
    }
  });
  it('inshore of the reef the bed stays the coast’s shallows (south of the peak near the beach)', () => {
    for (const [x, z] of [[SHORE_X - 15, 200], [SHORE_X - 20, 120], [SHORE_X - 25, 250]]) expect(depth(x, z)).toBeCloseTo(depthBg(x), 0);
  });
  it('along the peak’s south-west line the bed deepens steadily from the ledge to 300 m out (no step back up > 2 cm)', () => {
    let prev = depth(0, 0);
    for (let s = 1; s <= 300; s++) {
      const d = depth(-s * Math.SQRT1_2, s * Math.SQRT1_2);
      expect(d, `${s} m out`).toBeGreaterThanOrEqual(prev - 0.02);
      prev = Math.max(prev, d);
    }
  });
  it('the face and the slope are where the params put them square off the left\'s first leg (±1.5 m: the warp)', () => {
    // Out from the first leg's middle, square to it (seaward).
    const [a, b] = [NORTH_LEDGE[0], NORTH_LEDGE[1]], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const nx = (b[1] - a[1]) / L, nz = -(b[0] - a[0]) / L, mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    const at = (v: number) => depth(mx + nx * v, mz + nz * v);
    // The face's foot: the profile's, capped (98 m off the beach) by the coast deepened toward the slope's depth; a steep
    // face either way, ~8.4 m in its 15 m (R1 §1: 15 → 3.5 m over 15 m; was ~13 m in 20 m).
    expect(Math.abs(at(p.faceWidthM) - seawardDepth(p.faceWidthM, mx + nx * p.faceWidthM, p))).toBeLessThan(1.5);
    expect(at(p.faceWidthM) - at(0)).toBeGreaterThan(0.6 * (p.faceBaseDepthM - p.ledgeDepthM));
    expect(at(p.slopeEndM)).toBeGreaterThan(p.slopeDepthM - 2);
    expect(at(p.slopeEndM)).toBeLessThan(p.slopeDepthM + 1.5);
  });
  it('meets the coast profile at the west, north and south map edges (the far field)', () => {
    for (const z of [-300, 0, 200]) expect(depth(-399, z)).toBeCloseTo(depthBg(-399), 1);
    expect(seawardDepth(1000, -1000, p)).toBe(depthBg(-1000));
    expect(SHORE_X).toBe(94);
  });
});

describe('the bed’s material (spec 2026-10-02 §4)', () => {
  const g = REEF_GRID;
  const cell = (x: number, z: number) => Math.round((z - g.z0) / g.cellM) * g.nx + Math.round((x - g.x0) / g.cellM);
  /** On the reef: the shelf, or seaward of the ledges within the rock's reach (and inside the map's edge fades). */
  const onReef = (x: number, z: number) => { const sd = ledgeSignedDistance(x, z); return z > -380 && z < 230 && x < 100 && (sd >= 0 || -sd <= rockReachM(z) - 25); };
  it('weedy rock is the default on the reef: under 10% of it is sandy, and it is mostly weed', () => {
    let n = 0, sandy = 0, weed = 0;
    for (let x = -300; x <= 98; x += 2) for (let z = -378; z <= 228; z += 2) {
      if (!onReef(x, z)) continue;
      const i = cell(x, z); n++; if (bathy.sand[i] > 0.5) sandy++; weed += bathy.weed[i];
    }
    expect(sandy / n).toBeLessThan(0.1);
    expect(weed / n).toBeGreaterThan(0.5);
  });
  it('sand lies only in scattered pockets: no sandy patch over 600 m², and at least 6 of them', () => {
    const X0 = -300, X1 = 98, Z0 = -378, Z1 = 228, S = 2, nx = (X1 - X0) / S + 1, nz = (Z1 - Z0) / S + 1;
    const sandy = new Uint8Array(nx * nz);
    for (let r = 0; r < nz; r++) for (let c = 0; c < nx; c++) sandy[r * nx + c] = bathy.sand[cell(X0 + c * S, Z0 + r * S)] > 0.5 ? 1 : 0;
    const seen = new Uint8Array(nx * nz), areas: number[] = [];
    for (let i = 0; i < sandy.length; i++) {
      if (!sandy[i] || seen[i]) continue;
      let count = 0; const stack = [i]; seen[i] = 1;
      while (stack.length) {
        const j = stack.pop()!, c = j % nx, r = (j - c) / nx; count++;
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const cc = c + dc, rr = r + dr, k = rr * nx + cc;
          if (cc >= 0 && cc < nx && rr >= 0 && rr < nz && sandy[k] && !seen[k]) { seen[k] = 1; stack.push(k); }
        }
      }
      areas.push(count * S * S);
    }
    expect(Math.max(0, ...areas)).toBeLessThanOrEqual(600);
    expect(areas.filter((a) => a >= 40).length).toBeGreaterThanOrEqual(6);
  });
  it('the rock runs down the deep slope north of the peak; south of the peak, past the face, the open coast', () => {
    for (const [x, z] of [[-59, -113], [-109, -113], [-80, -200]]) {
      const i = cell(x, z);
      expect(bathy.sand[i], `(${x}, ${z})`).toBeLessThan(0.3);
      expect(bathy.weed[i], `(${x}, ${z})`).toBeGreaterThan(0.4);
    }
    const [s, w] = bedMaterialAt(bathy, -100, 180, undefined, false);
    expect(s).toBeCloseTo(OPEN_COAST_MATERIAL[0], 1);
    expect(w).toBeCloseTo(OPEN_COAST_MATERIAL[1], 1);
  });
  it('the map’s bed meets the open coast’s at its edges (no seam)', () => {
    const edge: [number, number][] = [[-399, -300], [-399, 0], [-399, 200], [-200, -449], [0, -449], [-200, 299], [0, 299]];
    for (const [x, z] of edge) {
      const [s, w] = bedMaterialAt(bathy, x, z, undefined, false);
      expect(s, `(${x}, ${z})`).toBeCloseTo(OPEN_COAST_MATERIAL[0], 1);
      expect(w, `(${x}, ${z})`).toBeCloseTo(OPEN_COAST_MATERIAL[1], 1);
    }
  });
  it('the shore platform meets the reef: no sand strip anywhere between the beach and the reef (regression guard)', () => {
    for (let z = -440; z <= 290; z += 10) for (let x = SHELF_INNER_X; x <= SHORE_X - 5; x += 5) expect(bedMaterialAt(bathy, x, z)[0], `(${x}, ${z})`).toBeLessThan(0.5);
  });
});
