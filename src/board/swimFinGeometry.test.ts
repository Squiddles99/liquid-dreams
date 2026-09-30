import { describe, expect, it } from 'vitest';
import { meshVolume, openEdges } from './boardGeometry';
import { buildSwimFin } from './swimFinGeometry';

/** Each built body's foot around its ankle (x across, y up from the sole, z forward), measured from the .glb skins. */
const FEET = {
  female: { toeTip: 0.172, heel: -0.045, left: -0.039, right: 0.052, top: 0.099 },
  male: { toeTip: 0.2, heel: -0.064, left: -0.043, right: 0.057, top: 0.101 },
};

describe.each(Object.entries(FEET))('swim fin for the %s foot', (_, foot) => {
  const f = buildSwimFin(foot.toeTip);
  const P: [number, number, number][] = [];
  for (let i = 0; i < f.positions.length; i += 3) P.push([f.positions[i], f.positions[i + 1], f.positions[i + 2]]);
  it('is closed and solid', () => {
    expect(openEdges(f.indices)).toBe(0);
    expect(meshVolume(f.positions, f.indices)).toBeGreaterThan(0);
  });
  it('has the whole foot in its pocket, heel to toes (Andrew, gate 2: the toes stuck out over the fin)', () => {
    const pocket = P.filter((p) => p[1] > 0.001 || p[2] < 0.5 * foot.toeTip); // the blade is flat under the forefoot
    expect(Math.min(...pocket.map((p) => p[2])), 'behind the heel').toBeLessThan(foot.heel - 0.005);
    expect(Math.max(...pocket.map((p) => p[2])), 'past the toes').toBeGreaterThan(foot.toeTip + 0.01);
    expect(Math.min(...pocket.map((p) => p[0])), 'the inside of the foot').toBeLessThan(foot.left - 0.003);
    expect(Math.max(...pocket.map((p) => p[0])), 'the outside of the foot').toBeGreaterThan(foot.right + 0.003);
    expect(Math.min(...P.map((p) => p[1])), 'a sole under the foot').toBeLessThan(-0.005);
  });
  it('runs its blade 22 cm past the toes', () => {
    expect(Math.max(...P.map((p) => p[2]))).toBeCloseTo(foot.toeTip + 0.22, 6);
  });
});
