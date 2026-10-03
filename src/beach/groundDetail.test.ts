import { describe, expect, it } from 'vitest';
import { TrackNetwork, routeTracks } from '../land/tracks';
import { testLand } from '../land/testLand';
import { MASK_CELL_M, MASK_N, buildTracksMask } from './groundDetail';

describe('the tracks mask (dune-up-close §4.3)', () => {
  const net = new TrackNetwork(routeTracks(testLand(), [-300, 300]));
  const [x, z] = net.data.pieces[0].points[150];
  const cornerX = Math.round(x / 4) * 4 - 32, cornerZ = Math.round(z / 4) * 4 - 32;
  const m = buildTracksMask(net, cornerX, cornerZ);
  it('holds the worn mask and the sink on the patch lattice', () => {
    for (const [i, j] of [[128, 128], [10, 200], [255, 0], [130, 131]]) {
      const px = cornerX + i * MASK_CELL_M, pz = cornerZ + j * MASK_CELL_M;
      expect(m[(j * MASK_N + i) * 2]).toBeCloseTo(net.wornAt(px, pz), 6);
      expect(m[(j * MASK_N + i) * 2 + 1]).toBeCloseTo(net.sinkAt(px, pz), 6);
    }
  });
  it('marks the track it was built round', () => {
    const i = Math.round((x - cornerX) / MASK_CELL_M), j = Math.round((z - cornerZ) / MASK_CELL_M);
    expect(m[(j * MASK_N + i) * 2]).toBeGreaterThan(0.9);
    expect(m[(j * MASK_N + i) * 2 + 1]).toBeGreaterThan(0.03);
  });
  it('reuses what an 8 m recentre shares, giving exactly the full build', () => {
    const moved = buildTracksMask(net, cornerX + 8, cornerZ - 4, undefined, { mask: m, cornerX, cornerZ });
    const full = buildTracksMask(net, cornerX + 8, cornerZ - 4);
    let worst = 0;
    for (let k = 0; k < full.length; k++) worst = Math.max(worst, Math.abs(moved[k] - full[k]));
    expect(worst).toBe(0);
  });
  it('is quick enough to rebuild on a recentre (§5: 0.5 ms in the game; vitest is slower)', () => {
    // Five warm-up recentres (the JIT), then the median of ten timed ones (a test process among others: a GC or a
    // descheduling lands in a few of them).
    let prev = { mask: buildTracksMask(net, cornerX, cornerZ), cornerX, cornerZ };
    const times: number[] = [];
    for (let k = 1; k <= 15; k++) {
      const c = { x: cornerX + 8 * k, z: cornerZ }, t0 = performance.now();
      prev = { mask: buildTracksMask(net, c.x, c.z, undefined, prev), cornerX: c.x, cornerZ: c.z };
      if (k > 5) times.push(performance.now() - t0);
    }
    const ms = times.sort((a, b) => a - b)[5];
    console.log(`tracks mask (incremental): median ${ms.toFixed(2)} ms`);
    expect(ms).toBeLessThan(2);
  });
});
