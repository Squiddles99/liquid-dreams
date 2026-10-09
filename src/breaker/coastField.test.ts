import { beforeAll, describe, expect, it } from 'vitest';
import { travelDirectionXZ } from '../conditions/directions';
import { type Bathymetry, buildBathymetry, downsample } from '../seabed/bathymetry';
import { DEFAULT_COAST_PARAMS } from '../seabed/coastFeatures';
import { buildCoastMap } from '../seabed/coastMap';
import { COAST_GRID, depthBg } from '../seabed/coastProfile';
import { type CoastField, coastSample, computeCoastField } from './coastField';
import { computeFarField, farSample } from './coastFarField';
import { ONSET_RECORD_LENGTH } from './breaking';
import { type ReefField, computeReefField, sampleField } from './reefField';

/** The coast bed of the 1-D coast profile: depthBg(x) everywhere (what the far field solves exactly). */
function flatCoast(): Bathymetry {
  const g = COAST_GRID, n = g.nx * g.nz;
  const bed = new Float32Array(n);
  for (let r = 0; r < g.nz; r++) for (let c = 0; c < g.nx; c++) bed[r * g.nx + c] = -depthBg(g.x0 + c * g.cellM);
  return { grid: g, bed, sand: new Float32Array(n), weed: new Float32Array(n) };
}

/** A deterministic scatter of points (a fixed LCG, no Math.random). */
function points(count: number, x0: number, x1: number, z0: number, z1: number): [number, number][] {
  let s = 12345;
  const r = (): number => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  return Array.from({ length: count }, () => [x0 + (x1 - x0) * r(), z0 + (z1 - z0) * r()]);
}

const reefBed = downsample(buildBathymetry(), 4); // 2 m: the reef field's tests' coarse grid, for speed
const SWELL = { periodS: 15, fromDeg: 225, tideM: 0 };

describe('the coast field (lineup truth, Task 2)', () => {
  let flat: CoastField;
  beforeAll(() => { flat = computeCoastField({ bed: flatCoast(), ...SWELL }); }, 60_000);

  it('(a) over the 1-D coast profile it is the far field: τ within 1 % of the travel time from the grid\'s west edge, direction within 1°', () => {
    const g = COAST_GRID;
    let worstTau = 0, worstDeg = 0;
    // The water: west of the beach ramp's 2 m depth (x 59); landward the profile is a 0.5 m flat standing in for land.
    for (const [x, z] of points(200, g.x0 + 4, 59, g.z0 + 4, g.z0 + (g.nz - 2) * g.cellM)) {
      const c = coastSample(flat, flat.far, x, z), f = farSample(flat.far, x, z);
      const travel = f.tau - farSample(flat.far, g.x0, z).tau;
      worstTau = Math.max(worstTau, Math.abs(c.tau - f.tau) / Math.max(travel, 1));
      const dot = Math.min(1, c.dirX * f.dirX + c.dirZ * f.dirZ);
      worstDeg = Math.max(worstDeg, (Math.acos(dot) * 180) / Math.PI);
    }
    expect(worstTau).toBeLessThan(0.01);
    expect(worstDeg).toBeLessThan(1);
  });

  it('(d) beyond the coast grid it is the far field exactly', () => {
    for (const z of [-2000, 0, 1200]) {
      const c = coastSample(flat, flat.far, -1600, z), f = farSample(flat.far, -1600, z);
      expect(c).toEqual(f);
    }
  });

  describe('seeding the reef field', () => {
    let plain: ReefField, seeded: ReefField;
    beforeAll(() => {
      plain = computeReefField({ bed: reefBed, ...SWELL });
      seeded = computeReefField({ bed: reefBed, ...SWELL, coast: flatCoast() });
    }, 300_000);

    it('(b) over the 1-D coast profile the coast-seeded reef field is the reef field: τ 0.02 s, amp 1 %, onset record 1e-3 (water ≥ 1 m)', () => {
      let dTau = 0, dAmp = 0, dOnset = 0;
      for (let i = 0; i < plain.tau.length; i++) {
        // The 0.5 m flat landward of the waterline stands in for land: no wave reads it.
        if (plain.depth[i] < 1) continue;
        dTau = Math.max(dTau, Math.abs(plain.tau[i] - seeded.tau[i]));
        dAmp = Math.max(dAmp, Math.abs(plain.amp[i] - seeded.amp[i]) / plain.amp[i]);
        for (let j = i * ONSET_RECORD_LENGTH; j < (i + 1) * ONSET_RECORD_LENGTH; j++) {
          const a = plain.onset[j], b = seeded.onset[j];
          // Relative above 1: the hold (until) runs to ~10⁴ s, where Float32 keeps ~1e-3 s.
          if (Number.isFinite(a) || Number.isFinite(b)) dOnset = Math.max(dOnset, Math.abs(a - b) / Math.max(1, Math.abs(a)));
        }
      }
      expect(seeded.coast).toBeDefined();
      expect(plain.onset.length).toBe(plain.tau.length * ONSET_RECORD_LENGTH);
      expect(dTau).toBeLessThan(0.02);
      expect(dAmp).toBeLessThan(0.01);
      expect(dOnset).toBeLessThan(1e-3);
    });
  });

  it('(c) on the real coast the sea is continuous across the reef grid\'s edge: τ ≤ 0.02 s apart along its edges, in water ≥ 3 m', () => {
    const coastBed = buildCoastMap(reefBed, DEFAULT_COAST_PARAMS);
    const field = computeReefField({ bed: reefBed, ...SWELL, coast: coastBed });
    const coast = field.coast!;
    const g = field.grid, x1 = g.x0 + (g.nx - 1) * g.cellM, z1 = g.z0 + (g.nz - 1) * g.cellM, inset = g.cellM;
    const along: [number, number][] = [];
    for (let i = 0; i < 7; i++) along.push([g.x0 + inset, g.z0 + 60 + i * 100]); // west edge
    for (let i = 0; i < 7; i++) along.push([g.x0 + 40 + i * 70, g.z0 + inset]); // north edge
    for (let i = 0; i < 6; i++) along.push([g.x0 + 40 + i * 70, z1 - inset]); // south edge
    let inflow = 0, outflow = 0, n = 0;
    for (const [x, z] of along) {
      expect(x).toBeLessThan(x1);
      const reef = sampleField(field, x, z);
      // Where a set is still a swell: in the surf on the beach ramp (< 3 m) the 4 m coast cells lag the 2 m reef cells by
      // up to 0.27 s (1 m of travel at 1.5 m deep).
      if (reef.depth < 3) continue;
      const d = Math.abs(reef.tau - coastSample(coast, coast.far, x, z).tau);
      if (z < g.z0 + 2 * inset) outflow = Math.max(outflow, d); else inflow = Math.max(inflow, d);
      n++;
    }
    expect(n).toBeGreaterThanOrEqual(19);
    expect(inflow).toBeLessThanOrEqual(0.02);
    expect(outflow).toBeLessThanOrEqual(0.03);
  }, 300_000);
});

describe('the drawn sea outside the reef grid (lineup truth, Task 3: sampleField)', () => {
  let field: ReefField;
  beforeAll(() => {
    field = computeReefField({ bed: reefBed, ...SWELL, coast: buildCoastMap(reefBed, DEFAULT_COAST_PARAMS) });
  }, 300_000);

  it('is the 1-D far field beyond the coast grid, exactly (x −1 600)', () => {
    for (const z of [-2000, -500, 0, 800]) expect(sampleField(field, -1600, z)).toEqual(farSample(field.far, -1600, z));
  });

  it('is the coast field away from the reef grid and the coast grid\'s edges (Lefthanders, the Bombie)', () => {
    for (const [x, z] of [[-250, -1666], [-400, -1600], [-280, 1020], [-150, 900]]) {
      expect(sampleField(field, x, z)).toEqual(coastSample(field.coast!, field.far, x, z));
    }
  });

  it('has no step at the reef grid\'s edges or the coast grid\'s: τ either side of each within 0.02 s (water ≥ 3 m)', () => {
    const g = field.grid, x1 = g.x0 + (g.nx - 1) * g.cellM, z1 = g.z0 + (g.nz - 1) * g.cellM, e = 0.05;
    const C = COAST_GRID, cz1 = C.z0 + (C.nz - 1) * C.cellM;
    const pairs: [number, number, number, number][] = [];
    for (let z = g.z0 + 20; z < z1; z += 60) pairs.push([g.x0 + e, z, g.x0 - e, z]);
    for (let x = g.x0 + 20; x < x1; x += 50) { pairs.push([x, g.z0 + e, x, g.z0 - e]); pairs.push([x, z1 - e, x, z1 + e]); }
    for (let z = C.z0 + 200; z < cz1; z += 300) pairs.push([C.x0 + e, z, C.x0 - e, z]);
    for (const x of [-1400, -1000, -600, -300]) { pairs.push([x, C.z0 + e, x, C.z0 - e]); pairs.push([x, cz1 - e, x, cz1 + e]); }
    let worst = 0, where = '', n = 0;
    for (const [ax, az, bx, bz] of pairs) {
      const a = sampleField(field, ax, az), b = sampleField(field, bx, bz);
      if (a.depth < 3) continue;
      const d = Math.abs(a.tau - b.tau);
      if (d > worst) { worst = d; where = `(${ax}, ${az})`; }
      n++;
    }
    expect(n).toBeGreaterThan(40);
    expect(worst, where).toBeLessThanOrEqual(0.02);
  });
});

describe('the coast field keeps the reef\'s hmin over the reef map (review I1)', () => {
  it('at the reef grid\'s north (outflow) edge the coast\'s hmin is the reef\'s within 5 % (water ≥ 3 m; measured 1.3 %), so the drawn breaking does not switch off 40 m out', () => {
    const field = computeReefField({ bed: reefBed, ...SWELL, coast: buildCoastMap(reefBed, DEFAULT_COAST_PARAMS) });
    const g = field.grid, coast = field.coast!;
    let worst = 0, where = '', n = 0;
    for (let x = g.x0 + 20; x < g.x0 + (g.nx - 1) * g.cellM - 20; x += 10) {
      const z = g.z0 + g.cellM;
      const reef = sampleField(field, x, z);
      if (reef.depth < 3) continue;
      const c = coastSample(coast, coast.far, x, z);
      const d = Math.abs(c.hmin - reef.hmin) / reef.hmin;
      if (d > worst) { worst = d; where = `(${x}, ${z}) reef ${reef.hmin.toFixed(2)} coast ${c.hmin.toFixed(2)}`; }
      n++;
    }
    expect(n).toBeGreaterThan(20);
    expect(worst, where).toBeLessThan(0.05);
  }, 300_000);
});

describe('the swell dial is the offshore swell at the coast seed (womb-retune spec §2)', () => {
  const coastBed = buildCoastMap(reefBed, DEFAULT_COAST_PARAMS);
  const g = COAST_GRID, row = Math.round((0 - g.z0) / g.cellM);
  for (const tideM of [-0.5, 0, 0.5]) {
    it(`at tide ${tideM} the reference depth is the coast map's at the coast grid's west edge on the Womb's row, where the swell has the dial's height and direction (a buoy: ruling C)`, () => {
      const c = computeCoastField({ bed: coastBed, ...SWELL, tideM });
      const hSeed = tideM - coastBed.bed[row * g.nx];
      expect(hSeed).toBeGreaterThan(20); // the real shelf, not the 15 m basin
      expect(c.far.refDepthM).toBeCloseTo(hSeed, 4);
      const seed = coastSample(c, c.far, g.x0, 0), d = travelDirectionXZ(SWELL.fromDeg);
      expect(seed.amp).toBeCloseTo(1, 2);
      expect(Math.abs(Math.atan2(seed.dirZ, seed.dirX) - Math.atan2(d.z, d.x)) * 180 / Math.PI).toBeLessThan(0.5);
      // Snell's invariant set in the seed's water, so the swell is less oblique by 15 m than the 15 m-set swell was
      const old = computeFarField(SWELL.periodS, SWELL.fromDeg, tideM);
      expect(Math.abs(c.far.p)).toBeLessThan(Math.abs(old.p));
    }, 120_000);
  }
  it('with no coast the reference is the far field\'s 15 m (plus tide), as ?coast=off has it', () => {
    for (const tideM of [-0.5, 0, 0.5]) expect(computeFarField(15, 225, tideM).refDepthM).toBeCloseTo(depthBg(-400) + tideM, 6);
  });
});
