import { describe, expect, it } from 'vitest';
import { type Bathymetry, bedHeightAt, buildBathymetry, downsample } from './bathymetry';
import { DEFAULT_REEF_PARAMS as P, LEFT_BEARING_DEG, SOUTH_LEDGE, TIP, hollowShareAt, ledgeAlongM } from './wombReef';

// womb-story Task 1 (STOP 0 ruling, task0-stop.md): the reef tells the story. The hollow share along the ridden band (1 on
// A, blended to shelfHollowShare on B and C), the drop region past ledgeWallM (the ledge and the shelf inshore of it, to the
// inside leg's first 200 m) at dropDepthM, and nothing else moves.
const story = buildBathymetry();
/** The drop pushed off the map: main's bed (the share does not touch the bed). */
const main = buildBathymetry({ ...P, ledgeWallM: 1e4 });
const br = (LEFT_BEARING_DEG * Math.PI) / 180, along = [Math.sin(br), -Math.cos(br)], inshore = [Math.cos(br), Math.sin(br)];
const at = (a: number, i: number): [number, number] => [TIP[0] + a * along[0] + i * inshore[0], TIP[1] + a * along[1] + i * inshore[1]];
/** Still water (m) at tide 0.5. */
const still = (b: Bathymetry, x: number, z: number) => 0.5 - bedHeightAt(b, x, z);
const cell = (b: Bathymetry, a: Float32Array, x: number, z: number) => a[Math.round((z - b.grid.z0) / b.grid.cellM) * b.grid.nx + Math.round((x - b.grid.x0) / b.grid.cellM)];

describe('the Womb story reef', () => {
  it('hollowShareAt: 1 on A, blended over ledgeBlendM to shelfHollowShare', () => {
    for (const [a, want] of [[0, 1], [50, 1], [57, 0.5], [65, 0], [100, 0], [170, 0]] as const) expect(hollowShareAt(a, P), `along ${a}`).toBeCloseTo(want, 1);
    expect(hollowShareAt(100, { ...P, shelfHollowShare: 0.4 })).toBeCloseTo(0.4, 5);
  });
  it('ledgeAlongM reads metres down the left from the tip', () => {
    expect(ledgeAlongM(...at(70, 20))).toBeCloseTo(70, 6);
    expect(ledgeAlongM(...TIP)).toBeCloseTo(0, 6);
  });
  it('drops to dropDepthM past ledgeWallM, on the ledge and 30 m inshore of it', () => {
    for (const a of [140, 160]) for (const i of [0, 30]) expect(still(story, ...at(a, i)), `along ${a}, ${i} m inshore`).toBeCloseTo(P.dropDepthM + 0.5, 1);
  });
  it('leaves A, B, the tip and the right unchanged to 1 cm', () => {
    const pts: (readonly [number, number])[] = [TIP, ...SOUTH_LEDGE];
    for (const a of [0, 25, 50, 100, 115]) for (const i of [-10, 0, 30]) pts.push(at(a, i));
    for (const [x, z] of pts) expect(Math.abs(bedHeightAt(story, x, z) - bedHeightAt(main, x, z)), `(${x.toFixed(1)}, ${z.toFixed(1)})`).toBeLessThan(0.01);
  });
  it('carries the hollow share and the ridden band in the bed, through downsample', () => {
    const d = downsample(story, 2);
    for (const b of [story, d]) {
      expect(b.share && b.band).toBeTruthy();
      expect(cell(b, b.share!, ...TIP)).toBeCloseTo(1, 3);
      expect(cell(b, b.share!, ...at(100, 20))).toBeCloseTo(P.shelfHollowShare, 2);
      expect(cell(b, b.band!, ...at(100, 20))).toBeCloseTo(1, 3);
      // Off the band: the right, the open sea 200 m out, the shelf north of the inside leg's first 200 m: share 1, band 0.
      for (const p of [SOUTH_LEDGE[2], at(100, -200), [0, -420] as [number, number]]) {
        expect(cell(b, b.share!, p[0], p[1])).toBeCloseTo(1, 3);
        expect(cell(b, b.band!, p[0], p[1])).toBeCloseTo(0, 3);
      }
    }
  });
});
