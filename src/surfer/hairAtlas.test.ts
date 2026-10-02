import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodePng } from '../land/png';

/**
 * The hair strand atlas (dune select spec §13.2), rasterised by tools/surfer/hair_atlas.py from parametric strands. Channels:
 * R depth (1 in front), G root → tip, B each strand's random, A coverage (in alpha, so a premultiplying decoder only
 * scales the others where the coverage is partial).
 */
interface AtlasTile { name: string; role: string; col: number; row: number }
interface AtlasTable { size: number; cols: number; rows: number; padPx: number; tiles: AtlasTile[] }

const table: AtlasTable = JSON.parse(readFileSync('public/surfer/hairAtlas.json', 'utf8'));
const png = decodePng(new Uint8Array(readFileSync('public/surfer/hairAtlas.png')));

describe('the hair strand atlas (dune select spec §13.2)', () => {
  it('is one 2048² RGBA texture of 8 × 2 tiles, with every role the cards need', async () => {
    const img = await png;
    expect([img.width, img.height, table.size, table.cols, table.rows]).toEqual([2048, 2048, 2048, 8, 2]);
    expect(table.tiles).toHaveLength(16);
    for (const role of ['core', 'outer', 'flyaway', 'fringe', 'braid', 'tail']) expect(table.tiles.some((t) => t.role === role), role).toBe(true);
  });

  it('each tile holds a lock of strands: partly covered, empty in its padding (no bleed between tiles)', async () => {
    const img = await png;
    const tw = img.width / table.cols, th = img.height / table.rows;
    for (const t of table.tiles) {
      let sum = 0, n = 0, border = 0;
      for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
        const a = img.rgba[4 * ((t.row * th + y) * img.width + t.col * tw + x) + 3];
        const pad = x < table.padPx || y < table.padPx || x >= tw - table.padPx || y >= th - table.padPx;
        if (pad) border = Math.max(border, a);
        else { sum += a; n++; }
      }
      const mean = sum / n / 255;
      expect(mean, `${t.name} coverage`).toBeGreaterThan(t.role === 'flyaway' || t.role === 'fringe' ? 0.05 : 0.2);
      expect(mean, `${t.name} coverage`).toBeLessThan(0.85);
      expect(border, `${t.name} padding`).toBe(0);
    }
  });

  it('G runs root → tip along the strands, and B gives each strand its own shade', async () => {
    const img = await png;
    const tw = img.width / table.cols, th = img.height / table.rows;
    for (const t of table.tiles) {
      const at = (f: number): number => {
        const y = Math.round(table.padPx + f * (th - 2 * table.padPx));
        let s = 0, n = 0;
        for (let x = table.padPx; x < tw - table.padPx; x++) {
          const i = 4 * ((t.row * th + y) * img.width + t.col * tw + x);
          if (img.rgba[i + 3] > 128) { s += img.rgba[i + 1]; n++; }
        }
        return n ? s / n : Number.NaN;
      };
      const root = at(0.08), tip = at(t.role === 'fringe' || t.role === 'tail' ? 0.4 : 0.85);
      expect(root, `${t.name} root`).toBeLessThan(tip);
      let s = 0, s2 = 0, n = 0;
      for (let y = table.padPx; y < th - table.padPx; y += 4) for (let x = table.padPx; x < tw - table.padPx; x += 2) {
        const i = 4 * ((t.row * th + y) * img.width + t.col * tw + x);
        if (img.rgba[i + 3] > 128) { const b = img.rgba[i + 2] / 255; s += b; s2 += b * b; n++; }
      }
      const sd = Math.sqrt(Math.max(0, s2 / n - (s / n) ** 2));
      expect(sd, `${t.name} strand shades`).toBeGreaterThan(0.12);
    }
  });
});
