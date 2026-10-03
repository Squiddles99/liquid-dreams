import { describe, expect, it } from 'vitest';
import { PROFILE_SEGMENTS, type Vec2, buildProfile } from './lipProfile';
import { peakLanding, peakSetup, peakStation } from './peakStation.fixture';
import { TIDES, peakPsi, setWaveHeight } from './reefReport';

/**
 * Andrew, 2026-10-03 (his red markup over the 12 ft side-on drawing): the face under the tube and the tube's own back
 * are one hollow curve — from the foot, up the face, up the back wall and over into the lip's ceiling. No floor, no
 * step. The face used to rise to where the lip lands and the tube's floor turned back from there, nearly flat: a 62°
 * corner at 12 ft (54° at 8 ft) while the lip was in the air.
 */
const n = PROFILE_SEGMENTS;
const F0 = n.front, U0 = n.front + n.face + n.wall;
/** Signed turn (degrees) at each interior point of a polyline. */
function turns(pts: readonly Vec2[]): number[] {
  const out: number[] = [];
  for (let i = 1; i + 1 < pts.length; i++) {
    const a = Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0]);
    const b = Math.atan2(pts[i + 1][1] - pts[i][1], pts[i + 1][0] - pts[i][0]);
    let d = ((b - a) * 180) / Math.PI;
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    if (Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]) > 1e-4 && Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) > 1e-4) out.push(d);
  }
  return out;
}

describe("the face and the tube's back are one hollow curve (Andrew's red line)", () => {
  const fields = Object.fromEntries((Object.keys(TIDES) as (keyof typeof TIDES)[]).map((t) => [t, peakSetup(12, TIDES[t])]));
  for (const tide of Object.keys(TIDES) as (keyof typeof TIDES)[]) {
    for (const ft of [4, 8, 12]) {
      it(`${ft} ft, ${tide} tide: no corner from the foot up the back wall into the ceiling, and it only turns one way`, { timeout: 120_000 }, () => {
        const base = fields[tide];
        const setup = { ...base, wave: { ...base.wave, heightM: setWaveHeight(ft) } };
        const psi = peakPsi(setup.field, setWaveHeight(ft), false);
        if (!Number.isFinite(psi)) return; // doesn't break at the peak at this size and tide
        const tl = peakLanding(psi, { setup });
        for (const k of [0.3, 0.6, 0.9, 1]) {
          const st = peakStation(psi, tl * k, { setup });
          const p = buildProfile(st.base, st.input, st.lip, st.frameBase);
          const curve = p.points.slice(F0 - 2, U0 + 3);
          const t = turns(curve);
          const where = `${ft} ft ${tide} at ${(k * 100).toFixed(0)}% of the throw`;
          // A corner is a turn standing out from its neighbours (the step: 62° with ~0° either side); the tube's round back
          // turns ~30° a sample over several samples, all one way, and is no corner.
          const spike = Math.max(...t.map((d, i) => Math.abs(d) - Math.max(Math.abs(t[i - 1] ?? 0), Math.abs(t[i + 1] ?? 0))));
          expect(spike, `${where}: the largest corner (° over its neighbours)`).toBeLessThan(20);
          const pos = t.filter((d) => d > 2).length, neg = t.filter((d) => d < -2).length;
          expect(Math.min(pos, neg), `${where}: turns both ways (+${pos} / −${neg})`).toBe(0);
        }
      });
    }
  }
});
