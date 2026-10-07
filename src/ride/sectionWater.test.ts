import { describe, expect, it } from 'vitest';
import type { Station, StationEntry } from '../breaker/crestTrace';
import { profileKnots } from '../breaker/wombProfile';
import { sectionPoint, sectionSamples } from '../breaker/wombSection';
import { CurveCache, lowestWetCrossing, thinStations, withSections } from './sectionWater';
import { INVERT_ITERATIONS, flatWater } from './water';

/** A straight crest along z through x = 0, the wave travelling +x, stations 1 m apart, all at one section. */
function crest(section: Station['section']): Station[] {
  return Array.from({ length: 21 }, (_, i): Station => ({
    gap: false, wave: 0, x: 0, z: i - 10, arc: i - 10, nx: 1, nz: 0, H: 4, c: 9, r: 1.2, tb: 0.5, wait: null, psi: 0.09, lipH: null, Hb: null, until: null, section,
  }));
}

describe('sectionWater: the ride stands on the drawn sections', () => {
  it('is the section where the ribbon draws (on this water’s own sheet), the sheet elsewhere', () => {
    const sec = { A: 3, phase: 0.2, hollow: 1, rho: 1 };
    const water = withSections(flatWater(0.5), crest(sec), 0.5);
    const flat = (u: number): [number, number] => [u, 0];
    const c = sectionSamples(sec, flat).curve.map((q): [number, number] => { const p = sectionPoint(q, 3, flat); return [p[0] / 3, p[1] / 3]; });
    for (const u of [0.3, 1.5, 4, 6]) {
      const want = 0.5 + 3 * lowestWetCrossing(c, u / 3)!.y;
      expect(water(u, 0).y).toBeCloseTo(want, 6);
      expect(water(u, 3.5).y).toBeCloseTo(want, 6);
    }
    // Off the ribbon: past the profile's ends, and beyond the crest's last station.
    expect(water(-25, 0).y).toBe(0.5);
    expect(water(0, 30).y).toBe(0.5);
  });

  it('under a thrown lip, stands on the tube’s floor, not on the lip above it', () => {
    const sec = { A: 3, phase: 1, hollow: 1, rho: 1 };
    const water = withSections(flatWater(0), crest(sec), 0);
    const k = profileKnots(1, 1), floor = k[10], tip = k[6];
    // Between the tube's floor and the tip, in u: the lip overhangs there.
    const u = (floor[0] + tip[0]) / 2;
    const y = water(3 * u, 0).y;
    expect(y).toBeLessThan(3 * 0.3);
    expect(y).toBeLessThan(0.5 * 3 * k[3][1]);
  });

  it('at ρ 0 (a traced line’s cut end) and at phase 0 it is the sheet', () => {
    for (const sec of [{ A: 3, phase: 1, hollow: 1, rho: 0 }, { A: 3, phase: 0, hollow: 1, rho: 1 }]) {
      const water = withSections(flatWater(0.5), crest(sec), 0.5);
      for (let u = -20; u <= 20; u += 0.5) expect(water(u, 0).y).toBe(0.5);
    }
  });
});

describe('sectionWater and the ride', () => {
  it('never reads steeper than the ride wipes out at, on the steepest wall the family draws', async () => {
    const { WIPEOUT_SLOPE } = await import('./ridePhysics');
    for (const phase of [0.45, 0.6, 0.8, 1, 1.3]) {
      const water = withSections(flatWater(0), crest({ A: 3, phase, hollow: 1, rho: 1 }), 0);
      for (let u = -8; u <= 8; u += 0.05) {
        const w = water(u, 0);
        expect(Math.hypot(w.slopeX, w.slopeZ), `phase ${phase} u ${u.toFixed(2)}`).toBeLessThan(WIPEOUT_SLOPE);
      }
    }
  });
});

describe('thinStations: the ride’s stations thinned by arc (plan 2026-10-07 ride-framerate Task 7, spec R6)', () => {
  const at = (arc: number): Station => ({ ...crest({ A: 3, phase: 1, hollow: 1, rho: 1 })[0], arc, z: arc });
  const runOf = (from: number, n: number, step: number): Station[] => Array.from({ length: n }, (_, i) => at(from + i * step));
  const arcs = (es: readonly StationEntry[]): (number | 'gap')[] => es.map((e) => (e.gap ? 'gap' : Math.round(e.arc * 1e6) / 1e6));

  it('keeps the gap, the first and last of each run, and no two kept stations under 0.9 m apart by arc', () => {
    const a = runOf(0, 50, 0.1), b = runOf(20, 10, 0.2); // the second run 1.8 m: longer than the spacing
    const out = thinStations([...a, { gap: true }, ...b], 1);
    const gapAt = out.findIndex((e) => e.gap);
    expect(gapAt).toBeGreaterThan(0);
    const runs = [out.slice(0, gapAt) as Station[], out.slice(gapAt + 1) as Station[]];
    expect(runs[0][0]).toBe(a[0]); expect(runs[0][runs[0].length - 1]).toBe(a[a.length - 1]);
    expect(runs[1][0]).toBe(b[0]); expect(runs[1][runs[1].length - 1]).toBe(b[b.length - 1]);
    for (const r of runs) for (let i = 1; i < r.length; i++) expect(Math.abs(r[i].arc - r[i - 1].arc)).toBeGreaterThanOrEqual(0.9 - 1e-9);
    // Thinned: 4.9 m of run at 1 m keeps ~5, not 50.
    expect(runs[0].length).toBeLessThanOrEqual(6);
    expect(arcs(out).filter((x) => x === 'gap')).toHaveLength(1);
  });

  it('a run shorter than the spacing keeps its first station', () => {
    const r = runOf(5, 4, 0.1);
    expect(thinStations(r, 1)).toEqual([r[0]]);
  });

  it('stations already further apart than the spacing are all kept', () => {
    const r = runOf(-10, 8, 2.5);
    expect(thinStations(r, 1)).toEqual(r);
  });
});

describe('CurveCache: a station’s curve kept across frames (plan 2026-10-07 ride-framerate Task 8, spec R7)', () => {
  const sec = { A: 3, phase: 0.8, hollow: 1, rho: 1 };
  const one = (section = sec, x = 0): Station[] => [{ ...crest(section)[10], x, arc: 0 }];
  const counting = (): { water: (x: number, z: number) => ReturnType<ReturnType<typeof flatWater>>; n: () => number } => {
    const flat = flatWater(0); let n = 0;
    return { water: (x, z) => { n++; return flat(x, z); }, n: () => n };
  };
  const read = (cache: CurveCache, stations: Station[], x: number): number => {
    const sheet = counting();
    const water = withSections(sheet.water, stations, 0, { kept: cache });
    water(stations[0].x + 1, 0);
    return sheet.n() - 1; // less the point's own read
  };

  it('a curve built once is read on later frames with the same numbers and a moved station at no further sheet reads', () => {
    const cache = new CurveCache(4, () => 'w0|0');
    expect(read(cache, one(), 0)).toBeGreaterThan(100);
    for (let f = 1; f <= 3; f++) {
      cache.nextFrame();
      expect(read(cache, one(sec, 0.3 * f), 0)).toBe(0);
    }
    expect(cache.built).toBe(1);
  });

  it('rebuilds on a 1/32 change of phase, and once the curve is 5 frames old', () => {
    const cache = new CurveCache(4, () => 'w0|0');
    read(cache, one(), 0);
    cache.nextFrame();
    expect(read(cache, one({ ...sec, phase: sec.phase + 1 / 32 }), 0)).toBeGreaterThan(100);
    for (let f = 0; f < 5; f++) cache.nextFrame();
    expect(read(cache, one({ ...sec, phase: sec.phase + 1 / 32 }), 0)).toBeGreaterThan(100);
    expect(cache.built).toBe(3);
  });

  it('reads the same water as without it on the frame it builds', () => {
    const plain = withSections(flatWater(0.5), crest(sec), 0.5);
    const cached = withSections(flatWater(0.5), crest(sec), 0.5, { kept: new CurveCache(4, (s) => `w0|${s.arc}`) });
    for (const u of [0.3, 1.5, 4]) expect(cached(u, 0.2)).toEqual(plain(u, 0.2));
  });
});

describe('the station curve reads the sheet only where it is used (exact; ride-framerate, after Task 8)', () => {
  // A sheet with a bump and a steep step along x: every curve sample that reads it gets a different value.
  const bumpy = (x: number): number => 0.4 * Math.sin(0.7 * x) + 0.8 / (1 + Math.exp(-4 * (x - 2)));
  const sheetAlong = (u: number): [number, number] => [u, bumpy(u)];
  const sections = [{ A: 3, phase: 0.45, hollow: 1, rho: 1 }, { A: 3, phase: 1, hollow: 0.6, rho: 1 }, { A: 2, phase: 1.4, hollow: 1, rho: 0.7 }];
  const counting = (): { water: ReturnType<typeof flatWater>; n: () => number } => {
    const flat = flatWater(0); let n = 0;
    return { water: (x, z) => { n++; return { ...flat(x, z), y: bumpy(x) }; }, n: () => n };
  };

  it('is the curve sectionPoint builds, bit for bit', () => {
    for (const sec of sections) {
      const want = sectionSamples(sec, sheetAlong).curve.map((q): [number, number] => { const p = sectionPoint(q, sec.A, sheetAlong); return [p[0] / sec.A, p[1] / sec.A]; });
      const water = withSections(counting().water, crest(sec), 0);
      for (const u of [-6, -1, 0.3, 1.2, 2.5, 4, 6.5]) {
        const hit = lowestWetCrossing(want, u / sec.A);
        if (hit) expect(water(u, 0).y, `phase ${sec.phase} u ${u}`).toBe(sec.A * hit.y);
      }
    }
  });

  it('reads no sheet for a sample at sheet weight 0', () => {
    let some = 0;
    for (const sec of sections) {
      const curve = sectionSamples(sec, sheetAlong).curve, zero = curve.filter((q) => q[5] === 0).length;
      some += zero;
      let knots = 0;
      sectionSamples(sec, (u) => { knots++; return sheetAlong(u); });
      const c = counting();
      withSections(c.water, [crest(sec)[10]], 0)(1, 0);
      // The point's own read, the knots', and one per sample the sheet weighs into.
      expect(c.n(), `phase ${sec.phase}`).toBe(1 + knots + curve.length - zero);
    }
    expect(some).toBeGreaterThan(0);
  });
});

describe('the station curve’s sheet read warm along the normal (ride-framerate R8)', () => {
  const sec = { A: 3, phase: 1, hollow: 0.8, rho: 1 };
  const bumpy = (x: number): number => 0.4 * Math.sin(0.7 * x) + 0.8 / (1 + Math.exp(-4 * (x - 2)));
  const base = (x: number, z: number): ReturnType<ReturnType<typeof flatWater>> => ({ ...flatWater(0)(x, z), y: bumpy(x), lx: x - 0.1, lz: z, residual: 0 });

  it('the first read is cold (INVERT_ITERATIONS passes), every later one starts from the nearest read so far, moved along the normal', () => {
    const calls: { x: number; start?: { x: number; z: number }; passes: number }[] = [];
    const at = (x: number, z: number, start: { x: number; z: number } | undefined, passes: number) => { calls.push({ x, start, passes }); return base(x, z); };
    withSections(base, [crest(sec)[10]], 0, { along: { at, passes: 1 } })(1, 0);
    expect(calls[0].start).toBeUndefined();
    expect(calls[0].passes).toBe(INVERT_ITERATIONS);
    for (const c of calls.slice(1)) {
      expect(c.passes).toBe(1);
      // base's label is x − 0.1 wherever it is read: the start moved along the normal (+x here) lands on the label exactly.
      expect(c.start!.x).toBeCloseTo(c.x - 0.1, 12);
    }
  });

  it('with an along read that is the base itself, the water is unchanged', () => {
    const plain = withSections(base, crest(sec), 0);
    const warm = withSections(base, crest(sec), 0, { along: { at: (x, z) => base(x, z), passes: 1 } });
    for (const u of [-5, 0.4, 1.3, 2.6, 5]) expect(warm(u, 0.3)).toEqual(plain(u, 0.3));
  });

  it('a warm read that has not converged (residual over WARM_RESIDUAL_M) is read again cold', () => {
    const calls: { start?: { x: number; z: number }; passes: number }[] = [];
    const at = (x: number, z: number, start: { x: number; z: number } | undefined, passes: number) => {
      calls.push({ start, passes });
      return { ...base(x, z), residual: start ? 1 : 0 };
    };
    withSections(base, [crest(sec)[10]], 0, { along: { at, passes: 2 } })(1, 0);
    // Every warm read is followed by a cold one.
    for (let i = 1; i < calls.length; i += 2) {
      expect(calls[i].passes).toBe(2);
      expect(calls[i + 1].start).toBeUndefined();
      expect(calls[i + 1].passes).toBe(INVERT_ITERATIONS);
    }
  });
});

