import { describe, expect, it } from 'vitest';
import { FOOTPRINT_GRID, STATION_VEC4S, VERTS_PER_STATION, packStations, ribbonDrawCount, ribbonIndices } from './BreakingRibbon';
import { MAX_STATIONS, type Station, type StationEntry } from './crestTrace';
import { PROFILE_SAMPLES } from './lipProfile';
import { TB_INFINITY, TB_NULL } from './lipProfileNodes';
import { REEF_GRID } from '../seabed/wombReef';

const station = (x: number, tb: number | null): Station => ({ gap: false, wave: 0, x, z: -x, arc: x, nx: 0.6, nz: 0.8, H: 2 + x, c: 9, r: 1.2, tb });
const GAP: StationEntry = { gap: true };
const ROW = STATION_VEC4S * 4;
const row = (d: Float32Array, i: number): number[] => Array.from(d.subarray(i * ROW, (i + 1) * ROW));

describe('BreakingRibbon stations', () => {
  it('has a skirt vertex at each end of the profile', () => {
    expect(VERTS_PER_STATION).toBe(PROFILE_SAMPLES + 2);
  });

  it('packs [x, z, nx, nz], [H, c, r, tb], [gap, 0, 0, 0] with tb encoded, and a gap as a dead copy of the previous live station', () => {
    const d = new Float32Array(MAX_STATIONS * ROW);
    const n = packStations([station(1, 0.25), station(2, null), GAP, station(3, Infinity)], d);
    expect(n).toBe(4);
    expect(row(d, 0)).toEqual([1, -1, 0.6, 0.8, 3, 9, 1.2, 0.25, 0, 0, 0, 0].map(Math.fround));
    expect(row(d, 1)[7]).toBe(TB_NULL);
    expect(row(d, 2)).toEqual([...row(d, 1).slice(0, 8), 1, 0, 0, 0]);
    expect(row(d, 3)[7]).toBe(TB_INFINITY);
    expect(row(d, 3)[8]).toBe(0);
  });

  it('a gap before any live station copies the first live one; nothing live packs nothing; at most MAX_STATIONS rows', () => {
    const d = new Float32Array(MAX_STATIONS * ROW);
    expect(packStations([GAP, station(5, 0.1)], d)).toBe(2);
    expect(row(d, 0)).toEqual([...row(d, 1).slice(0, 8), 1, 0, 0, 0]);
    expect(packStations([], d)).toBe(0);
    expect(packStations([GAP, GAP], d)).toBe(0);
    const many = Array.from({ length: MAX_STATIONS + 5 }, (_, i) => station(i * 0.01, 0.2));
    expect(packStations(many, d)).toBe(MAX_STATIONS);
  });
});

describe('BreakingRibbon mesh', () => {
  const V = VERTS_PER_STATION;
  it('indexes two triangles per quad over every station row pair, row by row', () => {
    const idx = ribbonIndices();
    expect(idx.length).toBe((MAX_STATIONS - 1) * (V - 1) * 6);
    expect(Array.from(idx.subarray(0, 6))).toEqual([0, 1, V, 1, V + 1, V]);
    // The quad of station row i and sample j starts at ((i·(V − 1)) + j)·6.
    const q = (5 * (V - 1) + 7) * 6, a = 5 * V + 7;
    expect(Array.from(idx.subarray(q, q + 6))).toEqual([a, a + 1, a + V, a + 1, a + V + 1, a + V]);
    let max = 0;
    for (const k of idx) max = Math.max(max, k);
    expect(max).toBe(MAX_STATIONS * V - 1);
  });

  it('winds the triangles so they face out of the water (dProfile × dStation, as the normal pass orients them)', () => {
    // crestTrace orders stations along +t̂ and the profile runs front → back (along −n): a flat strip with n = +x,
    // t̂ = (−n.z, n.x) = +z. Both triangles of a quad must face up.
    const P = (k: number): number[] => { const i = Math.floor(k / V), j = k % V; return [-j, 0, i]; };
    const idx = ribbonIndices();
    for (let t = 0; t < 12; t += 3) {
      const [a, b, c] = [P(idx[t]), P(idx[t + 1]), P(idx[t + 2])];
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      expect(u[2] * v[0] - u[0] * v[2]).toBeGreaterThan(0);
    }
  });

  it('draws (stationCount − 1) × (VERTS_PER_STATION − 1) × 6 indices, none below two rows', () => {
    expect(ribbonDrawCount(0)).toBe(0);
    expect(ribbonDrawCount(1)).toBe(0);
    expect(ribbonDrawCount(2)).toBe((V - 1) * 6);
    expect(ribbonDrawCount(MAX_STATIONS)).toBe(ribbonIndices().length);
  });

  it('lays the footprint texels (0.5 m) over the reef grid, texel centres on its points', () => {
    expect(FOOTPRINT_GRID.cellM).toBe(0.5);
    expect([FOOTPRINT_GRID.size.x, FOOTPRINT_GRID.size.y]).toEqual([1300, 1500]);
    expect(FOOTPRINT_GRID.origin.x + FOOTPRINT_GRID.cellM / 2).toBe(REEF_GRID.x0);
    expect(FOOTPRINT_GRID.origin.y + FOOTPRINT_GRID.cellM / 2).toBe(REEF_GRID.z0);
    expect(FOOTPRINT_GRID.size.x * FOOTPRINT_GRID.cellM).toBe(REEF_GRID.nx * REEF_GRID.cellM);
    expect(FOOTPRINT_GRID.size.y * FOOTPRINT_GRID.cellM).toBe(REEF_GRID.nz * REEF_GRID.cellM);
  });
});
