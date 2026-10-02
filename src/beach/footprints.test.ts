import { describe, expect, it } from 'vitest';
import { TrackNetwork, routeTracks } from '../land/tracks';
import { testLand } from '../land/testLand';
import { MAX_PRINTS, printsNear } from './Footprints';

describe('printsNear (dune-up-close §4.3)', () => {
  const net = new TrackNetwork(routeTracks(testLand(), [-300, 300]));
  const [x, z] = net.data.pieces[1].points[20];
  const p = printsNear(net, x, z, 20);
  it('is capped at 600 and stays on the tracks', () => {
    expect(p.length).toBeGreaterThan(30);
    expect(p.length).toBeLessThanOrEqual(MAX_PRINTS);
    for (const q of p) expect(net.onTrack(q.x, q.z) || net.worn(q.x, q.z) > 0.9).toBe(true);
  });
  it('strides 0.6–0.8 m along each lane of the beach path', () => {
    const lane = printsNear(net, x, z, 6).filter((q) => q.left && net.nearest(q.x, q.z).halfWidthM === 0.45 && !net.inClearing(q.x, q.z));
    lane.sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z));
    let checked = 0;
    for (let i = 1; i < lane.length; i++) {
      const g = Math.min(...lane.filter((_, k) => k !== i).map((q) => Math.hypot(q.x - lane[i].x, q.z - lane[i].z)));
      if (g < 1.2) {
        expect(g).toBeGreaterThanOrEqual(0.55);
        expect(g).toBeLessThanOrEqual(0.85);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(3);
  });
  it('is the same set whatever the camera', () => {
    const a = printsNear(net, x, z, 10).map((q) => `${q.x.toFixed(4)},${q.z.toFixed(4)}`);
    const b = new Set(printsNear(net, x + 3, z, 20).map((q) => `${q.x.toFixed(4)},${q.z.toFixed(4)}`));
    for (const k of a) expect(b.has(k)).toBe(true);
  });
  it('scuffs the clearing', () => {
    const j = net.data.junction;
    expect(printsNear(net, j.x, j.z, 3).filter((q) => net.inClearing(q.x, q.z)).length).toBeGreaterThan(15);
  });
});
