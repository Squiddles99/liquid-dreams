import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RELIEF_M, layerWeights, loadGroundLayersCpu, reliefAt } from './groundHeights';

const bin = readFileSync('public/heath/groundLayers.height.bin');
const layers = loadGroundLayersCpu(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength) as ArrayBuffer);

describe('groundHeights (dune-up-close §4.3)', () => {
  it('reads each layer tiled every 2 m', () => {
    expect(layers.height(1, 0.5, 0.75)).toBe(layers.height(1, 2.5, -1.25));
    expect(layers.height(2, -3.75, 7.25)).toBe(layers.height(2, 0.25, 1.25));
  });
  it('weighs the layers from the cover and the worn mask (summing to the cover)', () => {
    const w = layerWeights([0.1, 0.5, 0.15, 0.25], 0.4);
    expect(w[0] + w[1] + w[2] + w[3]).toBeCloseTo((0.1 + 0.5 + 0.15 + 0.25) * 0.6 + 0.4, 9);
    expect(w[3]).toBe(0.4);
  });
  it('keeps the relief within ±2.5 cm, and flat on a track', () => {
    for (let x = 0; x < 4; x += 0.25) {
      for (let z = 0; z < 2; z += 0.25) {
        const r = reliefAt(layers, [0, 0.5, 0.2, 0.3], 0, x, z, 1);
        expect(Math.abs(r)).toBeLessThanOrEqual(RELIEF_M / 2 + 1e-9);
        expect(reliefAt(layers, [0, 0.5, 0.2, 0.3], 1, x, z, 1)).toBe(0);
      }
    }
  });
  it('lets the higher layer win where two share a pixel (the height blend)', () => {
    // Half sand, half soil: the relief at each point is the higher of the two layers' (within the soft band).
    let agree = 0, n = 0;
    for (let x = 0; x < 2; x += 0.25) {
      for (let z = 0; z < 2; z += 0.25) {
        const s = layers.height(0, x, z), o = layers.height(1, x, z);
        const r = reliefAt(layers, [0, 0.5, 0, 0.5], 0, x, z, 1) / RELIEF_M + 0.5;
        if (Math.abs(s - o) > 0.05) {
          n++;
          if (Math.abs(r - Math.max(s, o)) < 0.02) agree++;
        }
      }
    }
    expect(agree / n).toBeGreaterThan(0.9);
  });
});
