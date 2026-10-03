import { describe, expect, it } from 'vitest';
import { PROFILE_SEGMENTS as n, type Vec2, buildProfile, profileFrame } from './lipProfile';
import { peakSetup, peakStation } from './peakStation.fixture';
import { TIDES, peakPsi, setWaveHeight } from './reefReport';

/**
 * The barrel's size (spec 2026-10-03-barrel-size-design, option A, Andrew 2026-10-03): the tube hangs from the crest its
 * section stood at while it threw (the record's lipH), not the crest it has sunk to since, and the lip is thinner than
 * Pick & Feddersen's whole jet. Andrew's orange, an ordinary 12 ft wave: a tube 8 m wide and 10 m tall, the tip landing
 * 13 m ahead of the crest, a lip 1.5 m thick. Option A alone closes the width, the reach and the lip; the height waits on
 * the water at the peak (option B).
 */
/** The largest horizontal and vertical chords of a closed polygon. */
function chords(poly: readonly Vec2[]): { w: number; h: number } {
  const span = (axis: 0 | 1): number => {
    const o = 1 - axis;
    let lo = Infinity, hi = -Infinity;
    for (const q of poly) { lo = Math.min(lo, q[o]); hi = Math.max(hi, q[o]); }
    let best = 0;
    for (let k = 1; k < 200; k++) {
      const v = lo + ((hi - lo) * k) / 200, xs: number[] = [];
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length];
        if ((a[o] - v) * (b[o] - v) < 0) xs.push(a[axis] + ((v - a[o]) / (b[o] - a[o])) * (b[axis] - a[axis]));
      }
      xs.sort((x, y) => x - y);
      for (let i = 0; i + 1 < xs.length; i += 2) best = Math.max(best, xs[i + 1] - xs[i]);
    }
    return best;
  };
  return { w: span(0), h: span(1) };
}
// The tube's air: from where the lip lands (the face's last sample, hollowCurve's split), up the back wall and round the
// ceiling to the tip, closed by the tip's chord back to the landing.
const W0 = n.front + n.face, C0 = n.front + n.face + n.wall + n.under;

/** The peak's profile as its lip lands (the station where tb is its own τ_land), for a wave of `ft` at a tide. */
function landed(ft: number, tide: keyof typeof TIDES, lull: boolean, offshoreMs = 0) {
  const base = peakSetup(12, TIDES[tide]);
  const setup = { ...base, wave: { ...base.wave, heightM: setWaveHeight(ft) } };
  const psi = peakPsi(setup.field, setWaveHeight(ft), lull);
  let tb = 1;
  for (let i = 0; i < 4; i++) { const st = peakStation(psi, tb, { setup, offshoreMs }); tb = profileFrame(st.frameBase, st.input, st.lip).tauLand; }
  const st = peakStation(psi, tb, { setup, offshoreMs });
  const p = buildProfile(st.base, st.input, st.lip, st.frameBase);
  const air = p.points.slice(W0, C0 + 1);
  let area = 0;
  for (let i = 0; i < air.length; i++) { const a = air[i], b = air[(i + 1) % air.length]; area += a[0] * b[1] - b[0] * a[1]; }
  return { p, f: p.frame, st, ...chords(air), area: Math.abs(area) / 2 };
}

describe('the barrel sized from the crest it was thrown from (option A)', () => {
  it('ordinary 12 ft (mid tide, in a set): about as wide as the orange, the tip out to it, the lip as thick', { timeout: 300_000 }, () => {
    const o = landed(12, 'mid', false), f = o.f;
    const throwCrest = f.K[1] + f.crestLift;
    console.log(`ordinary 12 ft: tube ${o.w.toFixed(1)} × ${o.h.toFixed(1)} m, tip ${(f.tip[0] - f.K[0]).toFixed(1)} m ahead at ${f.tip[1].toFixed(2)}, lip ${f.tTop.toFixed(2)} m, crest ${f.K[1].toFixed(2)} thrown from ${throwCrest.toFixed(2)}`);
    expect(f.crestLift, 'hung above the crest now (it has sunk since the throw)').toBeGreaterThan(0.5);
    expect(o.w, 'the tube\'s width (m)').toBeGreaterThanOrEqual(7);
    expect(o.w).toBeLessThanOrEqual(9);
    expect(o.h, 'the tube\'s height (m): option A reaches ~7; the orange\'s 10 waits on the water (option B)').toBeGreaterThanOrEqual(6.5);
    expect(f.tip[0] - f.K[0], 'the tip lands this far ahead of the crest (m)').toBeGreaterThanOrEqual(11);
    expect(f.tip[0] - f.K[0]).toBeLessThanOrEqual(15);
    expect(f.tTop, 'the lip\'s thickness over the tube\'s top (m)').toBeGreaterThanOrEqual(1.2);
    expect(f.tTop).toBeLessThanOrEqual(1.8);
  });
  it('ideal 12 ft (after a lull) throws further than ordinary and is no smaller; 8 ft is smaller', { timeout: 300_000 }, () => {
    // The tube is sized until its point meets the water (impactHeight), so at one wave height over the same water a
    // heavier ψ reaches it at about the same size, thrown further (spec ruling: the ideal day's bigger tube waits on the
    // water at the peak, option B).
    const o = landed(12, 'mid', false), ideal = landed(12, 'mid', true), small = landed(8, 'mid', false);
    const reach = (x: typeof o) => x.f.tip[0] - x.f.K[0];
    console.log(`air: ordinary ${o.area.toFixed(1)} m² (reach ${reach(o).toFixed(1)}), ideal ${ideal.area.toFixed(1)} m² (${ideal.w.toFixed(1)} × ${ideal.h.toFixed(1)}, reach ${reach(ideal).toFixed(1)}), 8 ft ${small.area.toFixed(1)} m²`);
    expect(reach(ideal)).toBeGreaterThanOrEqual(reach(o) + 0.5);
    expect(ideal.area).toBeGreaterThanOrEqual(o.area);
    expect(small.area).toBeLessThan(0.6 * o.area);
  });
  it('the tube grows smoothly with the wave: no jump between waves a quarter-foot apart (10–13 ft, mid tide)', { timeout: 600_000 }, () => {
    // The face's join used to step out toward the trough (FACE_CONCAVE_STEPS) once a bigger tube landed past the foot,
    // and stop at four steps: between 12.5 and 12.75 ft the foot moved 4 m and the tube lost 17% of its air.
    let prev = -1, worst = 0, at = '';
    for (let ft = 10; ft <= 13.001; ft += 0.25) {
      const a = landed(ft, 'mid', false).area;
      if (prev > 0 && Math.abs(a - prev) / prev > worst) { worst = Math.abs(a - prev) / prev; at = `${(ft - 0.25).toFixed(2)}→${ft.toFixed(2)} ft`; }
      prev = a;
    }
    expect(worst, `the largest change in the tube's air between neighbours (${at})`).toBeLessThan(0.1);
  });
  it("down the line (Andrew, 2026-10-03: not nearly hollow enough): it opens early and stays open after the lip lands", { timeout: 600_000 }, () => {
    // Full size for 0.7 s (≈ 8 m of crest at the peel's 12 m/s), a quarter of it half way through the throw, closed 1.5 s
    // after the landing: down the line, a slit. A thrown lip is out before it falls, and the tube behind it stays open
    // until the whitewater fills it.
    const base = peakSetup(12, TIDES.mid);
    const setup = { ...base, wave: { ...base.wave, heightM: setWaveHeight(12) } };
    const psi = peakPsi(setup.field, setWaveHeight(12), false);
    let tl = 1;
    for (let i = 0; i < 4; i++) { const st = peakStation(psi, tl, { setup }); tl = profileFrame(st.frameBase, st.input, st.lip).tauLand; }
    const air = (tb: number): number => {
      const st = peakStation(psi, tb, { setup }), p = buildProfile(st.base, st.input, st.lip, st.frameBase), q = p.points.slice(W0, C0 + 1);
      let a = 0;
      for (let i = 0; i < q.length; i++) { const u = q[i], v = q[(i + 1) % q.length]; a += u[0] * v[1] - v[0] * u[1]; }
      return Math.abs(a) / 2;
    };
    const landedAir = air(tl), half = air(tl / 2);
    const held = [0.25, 0.5, 0.75, 1, 1.25, 1.5].map((d) => air(tl + d));
    console.log(`air: landing ${landedAir.toFixed(1)} m², half way ${half.toFixed(1)}, after the landing ${held.map((a) => a.toFixed(1)).join(' / ')}`);
    expect(half / landedAir, 'half way through the throw, its share of the air at the landing').toBeGreaterThanOrEqual(0.45);
    // Ruling: 0.7, not 0.8: held open, the section still runs inshore over the reef top as it peels (its H 6.5 → 4.7 m and
    // its trough −4.8 → −3.4 m in 1.5 s), and the tube is the wave's.
    expect(Math.min(...held) / landedAir, 'for 1.5 s after the landing, its least share of the air at the landing').toBeGreaterThanOrEqual(0.7);
  });
});
