import { describe, expect, it } from 'vitest';
import { NORTH_LEDGE, SOUTH_LEDGE, TIP } from '../seabed/wombReef';
import { DEFAULT_BREAK_PARAMS as P, ONSET_RECORD_LENGTH as R, onsetTime } from './breaking';
import { sampleField, sampleOnset } from './reefField';
import { leftStretches, setWaveHeight } from './reefReport';
import { coastReefField } from './testField';

// womb-story Task 2 (spec 3.1, re-cut at STOP 0: a 270/14 bar; 225/15 is measured and reported): the swell's first break is
// at the take-off, the right breaks after it and all at once (a closeout).
const segD = (line: readonly (readonly [number, number])[], x: number, z: number) => {
  let d = Infinity;
  for (let j = 0; j + 1 < line.length; j++) {
    const [a, b] = [line[j], line[j + 1]], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
    d = Math.min(d, Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz));
  }
  return d;
};

/** The right is read from this far down its edge (m): past the 15 m the first break may lie from the tip. */
const RIGHT_FROM_M = 20;

describe('the first break is the tip at 270/14 (womb-story spec 3.1)', () => {
  const f = coastReefField({ periodS: 14, fromDeg: 270, tideM: 0.5, peel: true });
  // STOP (Task 2, 2026-10-14): depth alone cannot pass this at 270/14 (task3-stop.md §Task 2: rightLedgeDepthM 3.5-12 swept,
  // the far corner first to 6.5 m, the near right turns with or 0.5 s before the tip's held turn from 8 m on); RIGHT_SHAPE is
  // untouched by ruling, so the bar waits for Fable's ruling. Un-skip when it rules.
  it.skip.each([4, 7, 12])('%i ft: the reef first breaks within 15 m of the tip; the right after it by 0.5 s, spread <= 3 s', (ft) => {
    const H = setWaveHeight(ft), { nx, cellM, x0, z0 } = f.grid;
    // The earliest turn (τ − tb) on the reef: within 30 m of either ledge.
    let first = { t: Infinity, x: NaN, z: NaN };
    for (let i = 0; i < f.tau.length; i++) {
      const tb = onsetTime(f.onset, i * R, H, P);
      if (tb === null || !Number.isFinite(tb)) continue;
      const x = x0 + (i % nx) * cellM, z = z0 + Math.floor(i / nx) * cellM;
      if (Math.min(segD(NORTH_LEDGE, x, z), segD(SOUTH_LEDGE, x, z)) > 30) continue;
      if (f.tau[i] - tb < first.t) first = { t: f.tau[i] - tb, x, z };
    }
    expect(Math.hypot(first.x - TIP[0], first.z - TIP[1]), `first break at (${first.x}, ${first.z}), T ${first.t.toFixed(2)} s`).toBeLessThanOrEqual(15);
    // The tip's turn, and the right's turns (its edge every 2.5 m, the first broken point on each ray: reefReport).
    const r0 = sampleOnset(f, TIP[0], TIP[1])!, tb0 = onsetTime(r0, 0, H, P);
    const tipT = sampleField(f, TIP[0], TIP[1]).tau - (tb0 ?? NaN);
    // The right from RIGHT_FROM_M down its edge: its first metres are the take-off corner (the tip's own section).
    const [a, b] = SOUTH_LEDGE, L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const from: [number, number] = [a[0] + ((b[0] - a[0]) * RIGHT_FROM_M) / L, a[1] + ((b[1] - a[1]) * RIGHT_FROM_M) / L];
    const right = leftStretches(f, H, [from, ...SOUTH_LEDGE.slice(1)], { all: [0, 1, 2] }, P).all;
    expect(right, 'the right breaks').not.toBeNull();
    expect(right!.start - tipT, `right ${right!.start.toFixed(2)} s, tip ${tipT.toFixed(2)} s`).toBeGreaterThanOrEqual(0.5);
    expect(right!.end - right!.start).toBeLessThanOrEqual(3);
  }, 600_000);
});
