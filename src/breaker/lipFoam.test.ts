import { describe, expect, it } from 'vitest';
import { OUTER_LIP_SHARE, PROFILE_SEGMENTS, type Profile, buildProfile, sampleSegment } from './lipProfile';
import { peakLanding, peakSetup, peakStation } from './peakStation.fixture';
import { TIDES, peakPsi, setWaveHeight } from './reefReport';

/**
 * Andrew's foam zones (2026-09-29) and the clear curtain (spec 2026-10-03 lip-and-tube-look §3): while the tube is held
 * open the lip's outside is clear water with streaks at its top edge and tip; foam climbs up it from where it hit as the
 * tube collapses.
 */
const n = PROFILE_SEGMENTS;
const OUTER0 = n.front + n.face + n.wall + n.under + n.cap;
/** σ of an outer sample: 0 over the tube's top, 1 at the tip (lipProfile.profilePoint's). */
const sigmaOf = (j: number, p: Profile): number => (p.frame.xiTip > 0 ? Math.max(0, Math.min(1, 1 - sampleSegment(j).s / OUTER_LIP_SHARE)) : 0);
const onBand = (j: number): boolean => sampleSegment(j).s <= OUTER_LIP_SHARE;

describe("the lip's outside is a clear curtain while the tube is held open, and foams from where it hit as it collapses", () => {
  const fields = Object.fromEntries((Object.keys(TIDES) as (keyof typeof TIDES)[]).map((t) => [t, peakSetup(12, TIDES[t])]));
  for (const tide of Object.keys(TIDES) as (keyof typeof TIDES)[]) {
    for (const ft of [4, 8, 12]) {
      it(`${ft} ft, ${tide} tide`, { timeout: 180_000 }, () => {
        const base = fields[tide];
        const setup = { ...base, wave: { ...base.wave, heightM: setWaveHeight(ft) } };
        const psi = peakPsi(setup.field, setWaveHeight(ft), false);
        if (!Number.isFinite(psi)) return; // doesn't break at the peak at this size and tide
        const tl = peakLanding(psi, { setup });
        const at = (tb: number): Profile => { const st = peakStation(psi, tb, { setup }); return buildProfile(st.base, st.input, st.lip, st.frameBase); };
        // The hold: landed, not yet collapsing.
        let held: Profile | null = null, tb = tl;
        for (; tb < tl + 3; tb += 0.05) { const p = at(tb); if (p.frame.landing > 0.99 && p.frame.collapse === 0) { held = p; break; } }
        if (held === null || held.frame.weight < 0.1) return; // no tube to hold (ψ too small at this size and tide)
        const h = held;
        const where = `${ft} ft ${tide} held at tb ${tb.toFixed(2)}`;
        for (let j = OUTER0; j < OUTER0 + n.outer; j++) {
          const sg = sigmaOf(j, h);
          if (onBand(j) && sg >= 0.2 && sg <= 0.8) expect(h.curlFoam[j], `${where}: mid-curtain j ${j} σ ${sg.toFixed(2)}`).toBeLessThan(0.1);
        }
        const capMid = OUTER0 - n.cap / 2;
        expect(h.curlFoam[capMid], `${where}: the tip where it hit`).toBeGreaterThanOrEqual(0.5);
        // The collapse: each outer sample's foam never falls, and it climbs (the middle before the top).
        let prev = h.curlFoam.slice(OUTER0, OUTER0 + n.outer), midFirst: number | null = null, topAtMid = 0, last = h;
        const mid = OUTER0 + Math.round((1 - 0.5) * OUTER_LIP_SHARE * n.outer);
        const tops = Array.from({ length: n.outer }, (_, k) => OUTER0 + k).filter((j) => onBand(j) && sigmaOf(j, h) <= 0.1);
        for (let t = tb; t < tb + 8; t += 1 / 30) {
          const p = at(t);
          const cur = p.curlFoam.slice(OUTER0, OUTER0 + n.outer);
          cur.forEach((c, k) => expect(c, `${where}: outer ${k} at tb ${t.toFixed(2)} fell`).toBeGreaterThanOrEqual(prev[k] - 1e-6));
          if (midFirst === null && p.curlFoam[mid] > 0.5) { midFirst = t; topAtMid = Math.max(...tops.map((j) => p.curlFoam[j])); }
          prev = cur; last = p;
          if (p.frame.collapse >= 0.3 + 1e-3 && midFirst !== null) break; // past the foam's rise (LANDING_FOAM_RISE)
        }
        expect(midFirst, `${where}: the mid-curtain foams`).not.toBeNull();
        expect(topAtMid, `${where}: the top when the middle first foams`).toBeLessThan(0.5);
        for (let j = OUTER0; j < OUTER0 + n.outer; j++) if (onBand(j)) expect(last.curlFoam[j], `${where}: outer j ${j} after the rise`).toBeGreaterThanOrEqual(0.9);
      });
    }
  }
});
