import { describe, expect, it } from 'vitest';
import { type Bathymetry, bedHeightAt, buildBathymetry, downsample } from './bathymetry';
import { DEFAULT_REEF_PARAMS as P, LEFT_BEARING_DEG, NORTH_LEDGE, SOUTH_LEDGE, TIP, ledgeAlongM, segmentBarrelW, segmentHollow } from './wombReef';

// womb-story Task 1 (STOP 0 ruling, task0-stop.md): the reef tells the story. The target hollow along the ridden band (Task
// 3b, STOP 1 ruling 2: barrelHollow on A, blended to wallHollow on B and C), the drop region past ledgeWallM (the ledge and the shelf inshore of it, to the
// inside leg's first 200 m) at dropDepthM, and nothing else moves.
const story = buildBathymetry();
/** The drop pushed off the map: main's bed (the target hollow does not touch the bed). */
const main = buildBathymetry({ ...P, ledgeWallM: 1e4 });
const br = (LEFT_BEARING_DEG * Math.PI) / 180, along = [Math.sin(br), -Math.cos(br)], inshore = [Math.cos(br), Math.sin(br)];
const at = (a: number, i: number): [number, number] => [TIP[0] + a * along[0] + i * inshore[0], TIP[1] + a * along[1] + i * inshore[1]];
/** Still water (m) at tide 0.5. */
const still = (b: Bathymetry, x: number, z: number) => 0.5 - bedHeightAt(b, x, z);
const cell = (b: Bathymetry, a: Float32Array, x: number, z: number) => a[Math.round((z - b.grid.z0) / b.grid.cellM) * b.grid.nx + Math.round((x - b.grid.x0) / b.grid.cellM)];

describe('the Womb story reef', () => {
  it('segmentHollow: barrelHollow on A, blended over ledgeBlendM to wallHollow on B and C (Task 3b)', () => {
    for (const [a, want] of [[0, 0.8], [50, 0.8], [57.5, 0.45], [65, 0.1], [100, 0.1], [170, 0.1]] as const) expect(segmentHollow(a, P), `along ${a}`).toBeCloseTo(want, 1);
    expect(segmentHollow(100, { ...P, wallHollow: 0.3 })).toBeCloseTo(0.3, 5);
    for (const [a, want] of [[0, 1], [50, 1], [57.5, 0.5], [65, 0], [170, 0]] as const) expect(segmentBarrelW(a, P), `along ${a}`).toBeCloseTo(want, 2);
  });
  it('ledgeAlongM reads metres down the left from the tip', () => {
    expect(ledgeAlongM(...at(70, 20))).toBeCloseTo(70, 6);
    expect(ledgeAlongM(...TIP)).toBeCloseTo(0, 6);
  });
  it('drops to dropDepthM past ledgeWallM, on the ledge and 30 m inshore of it', () => {
    for (const a of [140, 160]) for (const i of [0, 30]) expect(still(story, ...at(a, i)), `along ${a}, ${i} m inshore`).toBeCloseTo(P.dropDepthM + 0.5, 1);
  });
  it('drops up the whole inside leg (Task 3c, STOP 1 ruling 7): on its ledge and 30 m inshore, to the north fade of the reef', () => {
    const legX = NORTH_LEDGE[1][0];
    for (const z of [-300, -380]) for (const i of [0, 30]) expect(still(story, legX + i, z), `inside leg z ${z}, ${i} m inshore`).toBeCloseTo(P.dropDepthM + 0.5, 1);
  });
  it('leaves A, B, the tip and the right unchanged to 1 cm', () => {
    const pts: (readonly [number, number])[] = [TIP, ...SOUTH_LEDGE];
    for (const a of [0, 25, 50, 100, 115]) for (const i of [-10, 0, 30]) pts.push(at(a, i));
    for (const [x, z] of pts) expect(Math.abs(bedHeightAt(story, x, z) - bedHeightAt(main, x, z)), `(${x.toFixed(1)}, ${z.toFixed(1)})`).toBeLessThan(0.01);
  });
  it('carries the target hollow, its weights and the ridden band in the bed, through downsample (Task 3b)', () => {
    const d = downsample(story, 2);
    for (const b of [story, d]) {
      expect(b.hollowTarget && b.hollowA && b.hollowW && b.band).toBeTruthy();
      // The tip is exempt (its own psi): weight 0 there, full from TIP_EXEMPT_M down the left.
      expect(cell(b, b.hollowW!, ...TIP)).toBeLessThan(0.02);
      expect(cell(b, b.hollowTarget!, ...at(30, 0))).toBeCloseTo(P.barrelHollow, 2);
      expect(cell(b, b.hollowA!, ...at(30, 0))).toBeCloseTo(1, 2);
      expect(cell(b, b.hollowW!, ...at(30, 0))).toBeCloseTo(1, 2);
      expect(cell(b, b.hollowTarget!, ...at(100, 20))).toBeCloseTo(P.wallHollow, 2);
      expect(cell(b, b.hollowA!, ...at(100, 20))).toBeCloseTo(0, 2);
      expect(cell(b, b.hollowW!, ...at(100, 20))).toBeCloseTo(1, 2);
      expect(cell(b, b.band!, ...at(100, 20))).toBeCloseTo(1, 3);
      // Off the band: the right, the open sea 200 m out, the shelf north of the inside: weight 0, band 0.
      for (const p of [SOUTH_LEDGE[2], at(100, -200), [0, -420] as [number, number]]) {
        expect(cell(b, b.hollowW!, p[0], p[1])).toBeCloseTo(0, 3);
        expect(cell(b, b.band!, p[0], p[1])).toBeCloseTo(0, 3);
      }
    }
  });
});
