import { describe, expect, it } from 'vitest';
import { buildPolarGrid } from './polarGrid';

describe('buildPolarGrid', () => {
  const opts = { segments: 64, innerRadiusM: 0.5, outerRadiusM: 1000 };
  const g = buildPolarGrid(opts);
  it('has a centre vertex plus one vertex per segment per ring', () => {
    expect(g.positions.length / 3).toBe(1 + g.ringRadii.length * opts.segments);
  });
  it('rings grow strictly and reach the outer radius', () => {
    for (let i = 1; i < g.ringRadii.length; i++) expect(g.ringRadii[i]).toBeGreaterThan(g.ringRadii[i - 1]);
    expect(g.ringRadii.at(-1)!).toBeGreaterThanOrEqual(opts.outerRadiusM);
    expect(g.ringRadii[0]).toBe(opts.innerRadiusM);
  });
  it('has the expected triangle count and valid indices', () => {
    expect(g.indices.length / 3).toBe(opts.segments + (g.ringRadii.length - 1) * opts.segments * 2);
    const vertexCount = g.positions.length / 3;
    expect(Math.max(...g.indices)).toBeLessThan(vertexCount);
  });
  it('every triangle faces up (+Y)', () => {
    const p = g.positions, idx = g.indices;
    for (let t = 0; t < idx.length; t += 3) {
      const [a, b, c] = [idx[t] * 3, idx[t + 1] * 3, idx[t + 2] * 3];
      const e1x = p[b] - p[a], e1z = p[b + 2] - p[a + 2];
      const e2x = p[c] - p[a], e2z = p[c + 2] - p[a + 2];
      expect(e1z * e2x - e1x * e2z).toBeGreaterThan(0); // y of e1 × e2
    }
  });
  it('the default grid stays within a sane vertex budget', () => {
    const d = buildPolarGrid();
    expect(d.positions.length / 3).toBeLessThan(300_000);
  });
});
