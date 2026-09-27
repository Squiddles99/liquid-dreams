import { describe, expect, it } from 'vitest';
import { STATION_VEC4S, VERTS_PER_STATION, packStations } from './BreakingRibbon';
import { MAX_STATIONS, type Station, type StationEntry } from './crestTrace';
import { PROFILE_SAMPLES } from './lipProfile';
import { TB_INFINITY, TB_NULL } from './lipProfileNodes';

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
