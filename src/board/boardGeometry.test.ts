import { describe, expect, it } from 'vitest';
import { type BoardDims, type BoardKind, bottomYAt, deckYAt, halfWidthAt, layoutFor, makeBoard, uAt } from './boardSpec';
import { PART, buildBoard, meshVolume, openEdges } from './boardGeometry';

const QUIVER: [string, BoardKind, BoardDims, number | null][] = [
  ['female thruster', 'thruster', { lengthIn: 70, widthIn: 18.75, thicknessIn: 2.3125 }, 26],
  ['male thruster', 'thruster', { lengthIn: 72, widthIn: 19.25, thicknessIn: 2.4375 }, 29],
  ['female step-up', 'stepUp', { lengthIn: 76, widthIn: 19, thicknessIn: 2.5 }, 30],
  ['male step-up', 'stepUp', { lengthIn: 80, widthIn: 19.5, thicknessIn: 2.625 }, 34],
  ['female bodyboard', 'bodyboard', { lengthIn: 40, widthIn: 21, thicknessIn: 2.625 }, null],
  ['male bodyboard', 'bodyboard', { lengthIn: 42, widthIn: 21.5, thicknessIn: 2.625 }, null],
];

describe.each(QUIVER)('%s', (_label, kind, dims, litres) => {
  const spec = makeBoard(kind, dims);
  const m = buildBoard(spec);
  const P = m.positions, n = P.length / 3;

  it('is closed and consistently wound (every edge shared by exactly two triangles)', () => {
    expect(openEdges(m.indices)).toBe(0);
  });

  it.runIf(litres !== null)(`holds ${litres} L ± 1.5 (spec §5.1), computed from the shape`, () => {
    expect(Math.abs(meshVolume(P, m.indices) * 1000 - litres!)).toBeLessThan(1.5);
  });

  it('is its shaper numbers: length and width within 5 mm', () => {
    const xs: number[] = [], zs: number[] = [];
    for (let i = 0; i < n; i++) if (m.part[i] !== PART.fin) { xs.push(P[i * 3]); zs.push(P[i * 3 + 2]); }
    expect(Math.abs(Math.max(...xs) - Math.min(...xs) - spec.lengthM)).toBeLessThan(0.005);
    expect(Math.abs(Math.max(...zs) - Math.min(...zs) - spec.maxWidthM)).toBeLessThan(0.005);
  });

  it('is left/right symmetric (every vertex has a mirror within 0.1 mm)', () => {
    let worst = 0;
    for (let i = 0; i < n; i++) {
      let best = Infinity;
      for (let j = 0; j < n; j++) best = Math.min(best, Math.hypot(P[i * 3] - P[j * 3], P[i * 3 + 1] - P[j * 3 + 1], P[i * 3 + 2] + P[j * 3 + 2]));
      worst = Math.max(worst, best);
    }
    expect(worst).toBeLessThan(1e-4);
  });

  it('puts every spot and the leash plug on the deck, inside the outline', () => {
    const lay = layoutFor(spec, 1.7);
    for (const [x, y, z] of [...Object.values(lay.spots), lay.leashPlug]) {
      expect(Math.abs(x)).toBeLessThan(spec.lengthM / 2);
      expect(Math.abs(z)).toBeLessThan(halfWidthAt(spec, uAt(spec, x)));
      expect(y).toBeCloseTo(deckYAt(spec, x, z), 9);
      expect(y - bottomYAt(spec, x, z)).toBeGreaterThan(0.01);
    }
  });

  it('hangs its fins under the bottom, never through the deck', () => {
    let lowest = Infinity;
    for (let i = 0; i < n; i++) {
      if (m.part[i] !== PART.fin) continue;
      const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
      expect(y).toBeLessThan(deckYAt(spec, x, z));
      lowest = Math.min(lowest, y);
    }
    if (spec.fins.length) expect(lowest).toBeLessThan(bottomYAt(spec, -spec.lengthM / 2 + spec.fins[0].fromTailM, 0) - 0.1);
    else expect(lowest).toBe(Infinity);
  });
});

describe('stance', () => {
  it('puts the front foot 0.31 × the rider’s height ahead of the back foot, over the fins', () => {
    const spec = makeBoard('thruster', { lengthIn: 72, widthIn: 19.25, thicknessIn: 2.4375 });
    const lay = layoutFor(spec, 1.78);
    expect(lay.spots.front[0] - lay.spots.back[0]).toBeCloseTo(0.31 * 1.78, 9);
    expect(lay.spots.back[0]).toBeCloseTo(-spec.lengthM / 2 + 0.3, 9);
  });
});

describe("the bodyboard's leash plug", () => {
  it("is in the top middle of its nose (Andrew)", () => {
    const bb = makeBoard('bodyboard', { lengthIn: 39, widthIn: 21, thicknessIn: 2.25 });
    const [x, , z] = layoutFor(bb, 1.42).leashPlug;
    expect(z).toBeCloseTo(0, 9);
    expect(x).toBeGreaterThan(bb.lengthM / 2 - 0.08);
  });
});
