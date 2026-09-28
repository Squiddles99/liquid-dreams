import { describe, expect, it } from 'vitest';
import { depthBg, SHORE_X } from '../seabed/coastProfile';
import { readBakedLand } from './bakedLand.testutil';
import { decodeLandFile, type LandFile } from './landData';
import { DEFAULT_BEACH, LandHeight, PIN_BLEND_M, PIN_HALF_M, REEF_CENTRE_Z, beachHeight } from './landHeight';

/** A synthetic coast: the real waterline at x = wl(z), land rising 0.2 m per m inland of it. */
function synthetic(wl: (z: number) => number): LandFile {
  const fine = { x0: -800, z0: -4000, cellM: 8, nx: 401, nz: 1001 };
  const ring = { x0: -3000, z0: -15000, cellM: 32, nx: 282, nz: 938 };
  const sky = { x0: -800, z0: -4000, cellM: 16, nx: 2, nz: 2 };
  const fill = (g: typeof fine) => {
    const h = new Float32Array(g.nx * g.nz);
    for (let j = 0; j < g.nz; j++) for (let i = 0; i < g.nx; i++) {
      const x = g.x0 + i * g.cellM, z = g.z0 + j * g.cellM;
      h[j * g.nx + i] = Math.max(0, (x - wl(z)) * 0.2);
    }
    return h;
  };
  return {
    fine, ring, sky, fineHeights: fill(fine), ringHeights: fill(ring), skyView: new Float32Array(4).fill(1),
    fineWaterline: Float32Array.from({ length: fine.nz }, (_, j) => wl(fine.z0 + j * fine.cellM)),
    ringWaterline: Float32Array.from({ length: ring.nz }, (_, j) => wl(ring.z0 + j * ring.cellM)),
  };
}

describe('beachHeight', () => {
  it('rises steadily from the seabed through the toe (never dips)', () => {
    let prev = -Infinity;
    for (let d = -45; d <= 60; d += 0.25) {
      const h = beachHeight(d);
      expect(h).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = h;
    }
  });
  it('is continuous at every breakpoint and meets the seabed at the waterline', () => {
    for (const d of [0, 12, 40, 55]) expect(Math.abs(beachHeight(d + 1e-6) - beachHeight(d - 1e-6))).toBeLessThan(1e-3);
    expect(beachHeight(0)).toBeCloseTo(-depthBg(SHORE_X), 6);
    expect(beachHeight(-30)).toBeCloseTo(-depthBg(SHORE_X - 30), 6);
    expect(beachHeight(12)).toBeCloseTo(DEFAULT_BEACH.wetTopM, 6);
    expect(beachHeight(40)).toBeCloseTo(DEFAULT_BEACH.beachTopM, 6);
    expect(beachHeight(55)).toBeCloseTo(DEFAULT_BEACH.toeTopM, 6);
  });
});

describe('LandHeight on a synthetic coast', () => {
  const land = new LandHeight(synthetic((z) => (z < 1500 ? 250 : 350)));
  it('pins the waterline at exactly 190 m around the reef, and follows the real one beyond', () => {
    for (let z = REEF_CENTRE_Z - PIN_HALF_M; z <= REEF_CENTRE_Z + PIN_HALF_M; z += 50) expect(land.waterlineAt(z)).toBe(190);
    expect(land.waterlineAt(-3000)).toBeCloseTo(250, 3);
    expect(land.waterlineAt(REEF_CENTRE_Z + PIN_HALF_M + PIN_BLEND_M / 2)).toBeGreaterThan(190);
  });
  it('smooths a 100 m step in the real waterline over about 400 m', () => {
    expect(land.realWaterlineAt(1250)).toBeCloseTo(250, 1); // its ±200 m window ends before the step
    expect(land.realWaterlineAt(1500)).toBeGreaterThan(280);
    expect(land.realWaterlineAt(1500)).toBeLessThan(320);
    expect(land.realWaterlineAt(1720)).toBeCloseTo(350, 1);
  });
  it('is continuous across the beach band, the blend and the fine grid edge', () => {
    for (const z of [0, 2500]) {
      const xs = land.waterlineAt(z);
      for (const d of [0, 12, 40, 55, 120]) expect(Math.abs(land.heightAt(xs + d + 0.01, z) - land.heightAt(xs + d - 0.01, z))).toBeLessThan(0.05);
    }
    for (let x = 2150; x <= 2410; x += 7) expect(Math.abs(land.heightAt(x + 0.01, 0) - land.heightAt(x - 0.01, 0))).toBeLessThan(0.05);
  });
  it('keeps the beach above the sea and the land behind it at least beach height', () => {
    for (const z of [-2000, 0, 800, 3000]) {
      const xs = land.waterlineAt(z);
      for (let d = 12; d < 40; d += 1) expect(land.heightAt(xs + d, z)).toBeGreaterThan(0.6);
      for (let d = 40; d < 400; d += 5) expect(land.heightAt(xs + d, z)).toBeGreaterThan(DEFAULT_BEACH.beachTopM - 1.6);
    }
  });
  it('gives the seabed shift samples every 50 m from z = −15000 to 15000', () => {
    const s = land.waterlineSamples(50);
    expect(s.length).toBe(601);
    expect(s[0]).toBeCloseTo(land.waterlineAt(-15000), 6);
    expect(s[Math.round((0 + 15000) / 50)]).toBe(190);
  });
});

describe('LandHeight on the baked data', () => {
  const land = new LandHeight(decodeLandFile(readBakedLand()));
  it('finds the real waterline at the Womb within 190 ± 30 m', () => {
    expect(Math.abs(land.realWaterlineAt(0) - 190)).toBeLessThanOrEqual(30);
    expect(land.waterlineAt(REEF_CENTRE_Z)).toBe(190);
  });
  it('climbs to the ridge behind the Womb (≥ 60 m by 600 m inland)', () => {
    expect(land.heightAt(190 + 600, 0)).toBeGreaterThan(60);
  });
  it('meets the shifted seabed at the waterline everywhere outside the reef map (no lagoons)', async () => {
    const { bedHeightAt, buildBathymetry } = await import('../seabed/bathymetry');
    const bathy = buildBathymetry();
    const samples = land.waterlineSamples(50);
    const shiftAt = (z: number) => {
      const f = Math.min(599.999, Math.max(0, (z + 15000) / 50)), i = Math.floor(f), t = f - i;
      return samples[i] * (1 - t) + samples[i + 1] * t - 190;
    };
    for (let z = -14000; z <= 14000; z += 137) {
      if (z > -500 && z < 350) continue; // the reef map
      const xs = land.waterlineAt(z);
      expect(Math.abs(bedHeightAt(bathy, xs - 0.01, z, shiftAt) - land.heightAt(xs + 0.01, z))).toBeLessThan(0.1);
    }
  }, 30_000); // builds the reef map
});
