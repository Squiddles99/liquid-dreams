import { describe, expect, it } from 'vitest';
import { BAND_FADE_M, NORTH_LEDGE, RIGHT_TIP_KEEP_M, SOUTH_LEDGE, TIP } from '../seabed/wombReef';
import { DEFAULT_BREAK_PARAMS as P, ONSET_RECORD_LENGTH as R, onsetDelay, onsetTime } from './breaking';
import { type ReefField, sampleField, sampleOnset } from './reefField';
import { setWaveHeight } from './reefReport';
import { coastReefField } from './testField';

// womb-story Task 2 (spec 3.1, re-cut at STOP 1: by ONSET, the ray's own break, not its turn: the tip's turn waits on the
// curl clock): at 270/14 the swell's first break is at the take-off, the right breaks after it and all at once.
type Pt = readonly [number, number];
const segD = (line: readonly Pt[], x: number, z: number) => {
  let d = Infinity;
  for (let j = 0; j + 1 < line.length; j++) {
    const [a, b] = [line[j], line[j + 1]], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
    d = Math.min(d, Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz));
  }
  return d;
};
/** The seaward-most broken point on the ray through (px, pz), 120 m seaward to 60 m inshore (as tools/_storyTable): its
 * onset (τ − tb − hold) and turn (τ − tb). */
function rayHit(f: ReefField, H: number, px: number, pz: number) {
  let x = px, z = pz;
  for (let d = 0; d < 120; d++) { const s = sampleField(f, x, z); x -= s.dirX; z -= s.dirZ; }
  for (let d = -120; d <= 60; d += 0.5) {
    const r = sampleOnset(f, x, z), s = sampleField(f, x, z), tb = r ? onsetTime(r, 0, H, P) : null;
    if (r && tb !== null) return { onset: s.tau - tb - onsetDelay(r, 0, H, P), turn: s.tau - tb };
    x += s.dirX * 0.5; z += s.dirZ * 0.5;
  }
  return null;
}
/** The right is read from where its bed is its own (m): within RIGHT_TIP_KEEP_M + its fade the corner keeps the tip's
 * depth by design (the take-off's own section, which breaks and turns with the tip: STOP 1b, task3b-stop.md). */
const RIGHT_FROM_M = RIGHT_TIP_KEEP_M + BAND_FADE_M;

describe('the first break is the tip at 270/14 (womb-story spec 3.1, by onset)', () => {
  const f = coastReefField({ periodS: 14, fromDeg: 270, tideM: 0.5, peel: true });
  it.each([4, 7])('%i ft: the first onset within 25 m of the tip; every right onset after the tip\'s; the right\'s turns spread <= 3.5 s', (ft) => {
    const H = setWaveHeight(ft), { nx, cellM, x0, z0 } = f.grid;
    // The earliest onset on the reef: within 30 m of either ledge.
    let first = { t: Infinity, x: NaN, z: NaN };
    for (let i = 0; i < f.tau.length; i++) {
      const tb = onsetTime(f.onset, i * R, H, P);
      if (tb === null || !Number.isFinite(tb)) continue;
      const x = x0 + (i % nx) * cellM, z = z0 + Math.floor(i / nx) * cellM;
      if (Math.min(segD(NORTH_LEDGE, x, z), segD(SOUTH_LEDGE, x, z)) > 30) continue;
      const t = f.tau[i] - tb - onsetDelay(f.onset, i * R, H, P);
      if (t < first.t) first = { t, x, z };
    }
    expect(Math.hypot(first.x - TIP[0], first.z - TIP[1]), `first onset at (${first.x}, ${first.z}), ${first.t.toFixed(2)} s`).toBeLessThanOrEqual(25);
    const tip = rayHit(f, H, TIP[0], TIP[1]);
    expect(tip, 'the tip breaks').not.toBeNull();
    // The right's edge (all its legs) every 2.5 m from RIGHT_FROM_M.
    const right: { s: number; onset: number; turn: number }[] = [];
    for (let j = 0, s0 = 0; j + 1 < SOUTH_LEDGE.length; j++) {
      const [a, b] = [SOUTH_LEDGE[j], SOUTH_LEDGE[j + 1]], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      for (let s = Math.ceil(Math.max(0, RIGHT_FROM_M - s0) / 2.5) * 2.5; s < L; s += 2.5) {
        const h = rayHit(f, H, a[0] + ((b[0] - a[0]) * s) / L, a[1] + ((b[1] - a[1]) * s) / L);
        if (h) right.push({ s: s0 + s, ...h });
      }
      s0 += L;
    }
    expect(right.length, 'the right breaks').toBeGreaterThan(0);
    const early = right.reduce((m, r) => (r.onset < m.onset ? r : m));
    expect(early.onset - tip!.onset, `right's earliest onset ${early.onset.toFixed(2)} s at ${early.s} m, tip ${tip!.onset.toFixed(2)} s`).toBeGreaterThan(0);
    const turns = right.map((r) => r.turn);
    expect(Math.max(...turns) - Math.min(...turns), 'the right\'s turns spread').toBeLessThanOrEqual(3.5);
  }, 600_000);
});
