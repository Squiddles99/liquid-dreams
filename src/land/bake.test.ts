import { describe, expect, it } from 'vitest';
import {
  FINE_GRID, LAT0, LON0, M_PER_DEG_LAT, RING_GRID, type TileMosaic, gridSampler, latLonToTile, medianFilter, rowWaterline, sampleMosaic,
  skyViewGrid, tileRange, worldToLatLon,
} from './bake';

describe('tile geometry', () => {
  it('maps world metres to latitude and longitude around the peak', () => {
    expect(worldToLatLon(0, 0)).toEqual([LAT0, LON0]);
    const [lat] = worldToLatLon(0, 1000);
    expect((LAT0 - lat) * M_PER_DEG_LAT).toBeCloseTo(1000, 6); // +z is south
  });
  it('puts the peak where the downloaded tiles say (zoom 15: 26850.04, 19666.72)', () => {
    const [tx, ty] = latLonToTile(LAT0, LON0, 15);
    expect(tx).toBeCloseTo(26850.04, 2);
    expect(ty).toBeCloseTo(19666.72, 2);
  });
  it('lists the tiles the grids need (within the downloaded sets)', () => {
    const f = tileRange(FINE_GRID, 15);
    expect(f.tx0).toBeGreaterThanOrEqual(26847); expect(f.tx1).toBeLessThanOrEqual(26853);
    expect(f.ty0).toBeGreaterThanOrEqual(19662); expect(f.ty1).toBeLessThanOrEqual(19670);
    const r = tileRange(RING_GRID, 12);
    expect(r.tx0).toBeGreaterThanOrEqual(3355); expect(r.tx1).toBeLessThanOrEqual(3356);
    expect(r.ty0).toBeGreaterThanOrEqual(2456); expect(r.ty1).toBeLessThanOrEqual(2460);
  });
  it('samples a mosaic bilinearly between pixel centres, NaN outside', () => {
    const [tx, ty] = latLonToTile(LAT0, LON0, 15);
    const m: TileMosaic = { zoom: 15, tx0: Math.floor(tx), ty0: Math.floor(ty), cols: 1, rows: 1, heights: new Float32Array(256 * 256) };
    for (let j = 0; j < 256; j++) for (let i = 0; i < 256; i++) m.heights[j * 256 + i] = i; // height = pixel column
    const px = (tx - Math.floor(tx)) * 256 - 0.5;
    expect(sampleMosaic(m, 0, 0)).toBeCloseTo(px, 3);
    expect(Number.isNaN(sampleMosaic(m, 50000, 0))).toBe(true);
  });
});

describe('rowWaterline (plan ruling P2)', () => {
  const cell = 4, x0 = 0;
  it('finds the sea-level trough between the smeared sea band and the land', () => {
    // sea 0, smear 2–6 m, trough < 0.5 at index 10, then land rising
    const row = [0, 0, 1, 3, 5, 6, 5, 4, 3, 2, 0.2, 1, 4, 8, 12, 20, 30];
    expect(rowWaterline(row, x0, cell)).toBe(44); // one cell east of index 10
  });
  it('without a trough within 150 m of the rise, takes the 3 m crossing nearest the rise (not the seaward edge of the smear)', () => {
    const row = [0, ...new Array(50).fill(1.5), 3.5, 6, 11, 20]; // a 200 m smear running straight into the land
    expect(rowWaterline(row, x0, cell)).toBe(51 * cell);
  });
  it('is NaN for a row with no land', () => {
    expect(Number.isNaN(rowWaterline([0, 1, 2, 3, 0], x0, cell))).toBe(true);
  });
  it('the median filter removes a lone outlier and skips NaN', () => {
    const a = Float32Array.from([190, 191, 189, -300, 190, 192, NaN, 191]);
    const m = medianFilter(a, 2);
    expect(m[3]).toBeGreaterThan(185);
    expect(m[6]).toBeGreaterThan(185);
  });
});

describe('skyViewGrid', () => {
  it('is 1 on open flat ground and lower at the foot of a wall', () => {
    const flat = skyViewGrid(() => 0, { x0: 0, z0: 0, cellM: 16, nx: 2, nz: 2 });
    expect(Math.min(...flat)).toBeCloseTo(1, 6);
    const wall = skyViewGrid((x) => (x > 40 ? 200 : 0), { x0: 0, z0: 0, cellM: 16, nx: 2, nz: 1 });
    expect(wall[0]).toBeLessThan(0.95);
  });
  it('gridSampler is bilinear over a GridSpec and 0 outside', () => {
    const s = gridSampler({ x0: 0, z0: 0, cellM: 10, nx: 2, nz: 2 }, Float32Array.from([0, 10, 20, 30]));
    expect(s(5, 5)).toBeCloseTo(15, 6);
    expect(s(-1, 0)).toBe(0);
  });
});
