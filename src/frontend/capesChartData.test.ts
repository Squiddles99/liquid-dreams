// src/frontend/capesChartData.test.ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { capesToChart } from './capesGeom';

const d = JSON.parse(readFileSync('public/ui/capesChart.json', 'utf8')) as { land: string; coast: string; islands: string };
const pts = d.coast.slice(1).split(' L').map((p) => p.split(',').map(Number) as [number, number]);

describe('the baked coastline', () => {
  it('is a closed land polygon and an open coast line', () => {
    expect(d.land.startsWith('M')).toBe(true); expect(d.land.trim().endsWith('Z')).toBe(true);
    expect(pts.length).toBeGreaterThan(300); // 462 at the spec's 0.7 px tolerance (plan guessed 1500+)
  });
  it('passes within 12 px of Cape Naturaliste, Gracetown and Cape Leeuwin', () => {
    for (const [lon, lat] of [[115.0045, -33.5375], [114.988, -33.866], [115.134, -34.3757]]) {
      const [x, y] = capesToChart(lon, lat);
      expect(Math.min(...pts.map(([px, py]) => Math.hypot(px - x, py - y)))).toBeLessThan(12);
    }
  });
  it('keeps the file small enough to load with the menus', () => {
    expect(JSON.stringify(d).length).toBeLessThan(250_000);
  });
});
