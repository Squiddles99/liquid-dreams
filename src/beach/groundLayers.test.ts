import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('the ground layers (dune-up-close §4.3)', () => {
  it('are built: five layers, a 256² height copy for the CPU, licensed', () => {
    const meta = JSON.parse(readFileSync('public/heath/groundLayers.json', 'utf8'));
    expect(meta.layers).toEqual(['sand', 'soil', 'limestone', 'track', 'footprints']);
    expect(meta.meanColour).toHaveLength(5);
    expect(readFileSync('public/heath/groundLayers.height.bin').byteLength).toBe(5 * 256 * 256 * 2);
    expect(existsSync('public/heath/groundLayers.colour.png') && existsSync('public/heath/groundLayers.nrh.png')).toBe(true);
    expect(readFileSync('public/heath/LICENSES.md', 'utf8')).toMatch(/groundLayers/);
  });
  it("tile seamlessly: the step across each height's wrap is no bigger than its steps inside", () => {
    const b = readFileSync('public/heath/groundLayers.height.bin');
    const h = new Uint16Array(b.buffer, b.byteOffset, b.byteLength / 2);
    for (let l = 0; l < 4; l++) {
      const at = (x: number, y: number): number => h[l * 65536 + y * 256 + x] / 65535;
      let seam = 0, inner = 0;
      for (let i = 0; i < 256; i++) {
        seam = Math.max(seam, Math.abs(at(0, i) - at(255, i)), Math.abs(at(i, 0) - at(i, 255)));
        for (let j = 0; j < 255; j++) inner = Math.max(inner, Math.abs(at(j + 1, i) - at(j, i)), Math.abs(at(i, j + 1) - at(i, j)));
      }
      expect(seam, `layer ${l}`).toBeLessThanOrEqual(inner);
    }
  });
});
