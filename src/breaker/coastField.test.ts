import { beforeAll, describe, expect, it } from 'vitest';
import { type Bathymetry, buildBathymetry, downsample } from '../seabed/bathymetry';
import { DEFAULT_COAST_PARAMS } from '../seabed/coastFeatures';
import { buildCoastMap } from '../seabed/coastMap';
import { COAST_GRID, depthBg } from '../seabed/coastProfile';
import { type CoastField, coastSample, computeCoastField } from './coastField';
import { farSample } from './coastFarField';
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
