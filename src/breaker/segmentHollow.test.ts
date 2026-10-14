import { describe, expect, it } from 'vitest';
import { DEFAULT_REEF_PARAMS as RP, LEFT_BEARING_DEG, TIP, ledgeAlongM } from '../seabed/wombReef';
import { DEFAULT_BREAK_PARAMS as P, onsetPsi, onsetTime } from './breaking';
import { psiOfHollow, sampleField, sampleOnset } from './reefField';
import { hollowFromPsi, setWaveHeight } from './reefReport';
import { coastReefField } from './testField';

// womb-story Task 3b (STOP 1 ruling 2): one mechanism for A and B, a target hollow per segment. On A the reef raises psi0 to
// at least barrelHollow's, on B and C it pulls it down to wallHollow's; the tip keeps its own. Read as the story table
// reads the left: on each ray through the ledge every 2 m, the seaward-most broken point, segmented by its own along.
const f = coastReefField({ periodS: 14, fromDeg: 270, tideM: 0.5, peel: true });
const br = (LEFT_BEARING_DEG * Math.PI) / 180;
function hollowOnRay(along: number, H: number): { along: number; hollow: number } | null {
  let x = TIP[0] + along * Math.sin(br), z = TIP[1] - along * Math.cos(br);
  for (let d = 0; d < 120; d++) { const s = sampleField(f, x, z); x -= s.dirX; z -= s.dirZ; }
  for (let d = -120; d <= 60; d += 0.5) {
    const r = sampleOnset(f, x, z), s = sampleField(f, x, z);
    if (r && onsetTime(r, 0, H, P) !== null) return { along: ledgeAlongM(x, z), hollow: hollowFromPsi(onsetPsi(r, 0, H, P)) };
    x += s.dirX * 0.5; z += s.dirZ * 0.5;
  }
  return null;
}

describe('a target hollow per segment (womb-story Task 3b)', () => {
  it('psiOfHollow inverts reefReport.hollowFromPsi', () => {
    for (const h of [0, 0.1, 0.45, 0.8, 1]) expect(hollowFromPsi(psiOfHollow(h))).toBeCloseTo(h, 9);
  });
  it.each([4, 7, 12])('%i ft at 270/14: A barrels (hollow >= 0.7 from 10 m), B is a wall (hollow <= 0.2, steady within 0.1)', (ft) => {
    const H = setWaveHeight(ft), A: number[] = [], B: number[] = [];
    for (let a = 0; a <= RP.ledgeWallM; a += 2) {
      const h = hollowOnRay(a, H);
      if (!h) continue;
      if (h.along >= 10 && h.along <= RP.ledgeBarrelM) A.push(h.hollow);
      if (h.along >= RP.ledgeBarrelM + RP.ledgeBlendM && h.along <= RP.ledgeWallM) B.push(h.hollow);
    }
    expect(A.length, 'A breaks').toBeGreaterThan(5);
    expect(B.length, 'B breaks').toBeGreaterThan(10);
    expect(Math.min(...A), 'A hollow').toBeGreaterThanOrEqual(0.7);
    expect(Math.max(...B), 'B hollow').toBeLessThanOrEqual(0.2);
    expect(Math.max(...B) - Math.min(...B), 'B steady').toBeLessThanOrEqual(0.1);
  }, 600_000);
});
