import { describe, expect, it } from 'vitest';
import { PROFILE_SEGMENTS, type Vec2, buildProfile, sheetYAt } from './lipProfile';
import { peakLanding, peakSetup, peakStation } from './peakStation.fixture';
import { TIDES, peakPsi, setWaveHeight } from './reefReport';

/**
 * Andrew, 2026-10-03 (his red markup over the 12 ft side-on drawing): the face under the tube and the tube's own back
 * are one hollow curve — from the foot, up the face, up the back wall and over into the lip's ceiling. No floor, no
 * step. The face used to rise to where the lip lands and the tube's floor turned back from there, nearly flat: a 62°
 * corner at 12 ft (54° at 8 ft) while the lip was in the air.
 */
const n = PROFILE_SEGMENTS;
const F0 = n.front, U0 = n.front + n.face + n.wall, C1 = U0 + n.under + n.cap;
/** Signed turn (degrees) at each interior point of a polyline. */
function turns(pts: readonly Vec2[], minLen = 1e-4): number[] {
  const out: number[] = [];
  for (let i = 1; i + 1 < pts.length; i++) {
    const a = Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0]);
    const b = Math.atan2(pts[i + 1][1] - pts[i][1], pts[i + 1][0] - pts[i][0]);
    let d = ((b - a) * 180) / Math.PI;
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    if (Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]) > minLen && Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) > minLen) out.push(d);
  }
  return out;
}

describe("the face and the tube's back are one hollow curve (Andrew's red line), and the lip's back has no step", () => {
  const fields = Object.fromEntries((Object.keys(TIDES) as (keyof typeof TIDES)[]).map((t) => [t, peakSetup(12, TIDES[t])]));
  for (const tide of Object.keys(TIDES) as (keyof typeof TIDES)[]) {
    for (const ft of [4, 8, 12]) {
      it(`${ft} ft, ${tide} tide: no corner from the foot up the back wall into the ceiling, and it only turns one way`, { timeout: 120_000 }, () => {
        const base = fields[tide];
        const setup = { ...base, wave: { ...base.wave, heightM: setWaveHeight(ft) } };
        const psi = peakPsi(setup.field, setWaveHeight(ft), false);
        if (!Number.isFinite(psi)) return; // doesn't break at the peak at this size and tide
        const tl = peakLanding(psi, { setup });
        for (const k of [0.04, 0.07, 0.1, 0.14, 0.2, 0.3, 0.6, 0.9, 1, 1.15]) {
          const st = peakStation(psi, tl * k, { setup });
          const p = buildProfile(st.base, st.input, st.lip, st.frameBase);
          const curve = p.points.slice(F0 - 2, U0 + 3);
          const t = turns(curve);
          const where = `${ft} ft ${tide} at ${(k * 100).toFixed(0)}% of the throw`;
          // A corner is a turn standing out from its neighbours (the step: 62° with ~0° either side); the tube's round back
          // turns ~30° a sample over several samples, all one way, and is no corner.
          const spike = Math.max(...t.map((d, i) => Math.abs(d) - Math.max(Math.abs(t[i - 1] ?? 0), Math.abs(t[i + 1] ?? 0))));
          // While it fades in too (Andrew, 2026-10-03: the young lip hooked off the back wall at 55°), between pieces of 1 cm
          // or more (at 4% of the throw the curl is a few cm across).
          const tc = k < 0.3 ? turns(curve, 0.01) : t;
          const spikeC = Math.max(...tc.map((d, i) => Math.abs(d) - Math.max(Math.abs(tc[i - 1] ?? 0), Math.abs(tc[i + 1] ?? 0))));
          if (k <= 1) expect(spikeC, `${where}: the largest corner (° over its neighbours)`).toBeLessThan(20);
          // One way only along the hollow curve itself, from past the foot (at the foot the trough's own upward curve meets
          // it; the corner check above covers that point). After the landing the pile rides the face: shape checks stop there.
          const own = t.slice(2), pos = k > 1 ? 0 : own.filter((d) => d > 2).length, neg = own.filter((d) => d < -2).length;
          // While the young curl fades in from the water (LIP_EMERGE_PROGRESS) it turns no more than 6° the wrong way
          // anywhere (Andrew, 2026-10-03, down the line: a notch where the back wall met the ceiling, 26° at 0.2 s).
          // Turns between sub-centimetre pieces don't count (ruling): at 4% of the throw the curl is a few cm across, its
          // samples millimetres apart; the notch was on 10–20 cm pieces.
          if (k < 0.3) { expect(Math.max(0, ...turns(curve, 0.01).slice(2)), `${where}: the largest wrong-way turn while it fades in (°)`).toBeLessThan(6); continue; }
          expect(Math.min(pos, neg), `${where}: turns both ways (+${pos} / −${neg})`).toBe(0);
          // The tube's floor is the water the lip lands on: the hollow face never sags below the trough's lowest water.
          let minC = Infinity, lo = Infinity, hi = -Infinity;
          for (let j = F0; j < U0; j++) { const q = p.points[j]; minC = Math.min(minC, q[1]); lo = Math.min(lo, q[0]); hi = Math.max(hi, q[0]); }
          let minS = Infinity;
          for (let x = lo; x <= hi + 5; x += 0.1) minS = Math.min(minS, sheetYAt(st.frameBase, p.frame.K, x));
          expect(minS - minC, `${where}: the floor under the trough's lowest water (m)`).toBeLessThanOrEqual(0.05);
          // The lip's back (Andrew, 2026-10-03, option A): the lip hangs from the crest it was thrown from, which has sunk
          // since; from the tube's top it slopes down to the wave's back with no step.
          const b = turns(p.points.slice(C1 + 4, C1 + n.outer + 8)); // past the tip (the cap meets the outer surface there)
          const backSpike = Math.max(...b.map((d, i) => Math.abs(d) - Math.max(Math.abs(b[i - 1] ?? 0), Math.abs(b[i + 1] ?? 0))));
          if (k <= 1) expect(backSpike, `${where}: the largest corner on the lip's back (° over its neighbours)`).toBeLessThan(20);
        }
      });
    }
  }
});
