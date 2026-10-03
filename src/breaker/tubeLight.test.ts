import { describe, expect, it } from 'vitest';
import { PROFILE_SAMPLES, PROFILE_SEGMENTS, type Profile, TUBE_ROOT_SAMPLE, TUBE_TIP_SAMPLE, type Vec2, buildProfile, sampleSegment, tubeLight } from './lipProfile';
import { peakLanding, peakSetup, peakStation } from './peakStation.fixture';
import { TIDES, peakPsi, setWaveHeight } from './reefReport';

/**
 * The tube's light (spec 2026-10-03 lip-and-tube-look §5): seen side-on from a point inside the tube, directions out of
 * the mouth (below the tip) are open, between the tip and the lip's root the lip is in the way, beyond the root the wave's
 * body is.
 */
const n = PROFILE_SEGMENTS;
const WALL_MID = n.front + n.face + Math.floor(n.wall / 2);
const deg = Math.PI / 180;
const sunAt = (a: number): Vec2 => [Math.cos(a), Math.sin(a)];
const angle = (from: Vec2, to: Vec2): number => Math.atan2(to[1] - from[1], to[0] - from[0]);
const inTube = (j: number): boolean => ['face', 'wall'].includes(sampleSegment(j).seg);

describe('the light inside the tube comes out of its mouth, through its lip, or not at all (behind the wave)', () => {
  const fields = Object.fromEntries((Object.keys(TIDES) as (keyof typeof TIDES)[]).map((t) => [t, peakSetup(12, TIDES[t])]));
  for (const tide of Object.keys(TIDES) as (keyof typeof TIDES)[]) {
    for (const ft of [8, 12]) {
      it(`${ft} ft, ${tide} tide`, { timeout: 180_000 }, () => {
        const base = fields[tide];
        const setup = { ...base, wave: { ...base.wave, heightM: setWaveHeight(ft) } };
        const psi = peakPsi(setup.field, setWaveHeight(ft), false);
        if (!Number.isFinite(psi)) return;
        const tl = peakLanding(psi, { setup });
        const at = (tb: number | null): Profile => { const st = peakStation(psi, tb, { setup }); return buildProfile(st.base, st.input, st.lip, st.frameBase); };
        let held: Profile | null = null, tb = tl;
        for (; tb < tl + 3; tb += 0.05) { const p = at(tb); if (p.frame.landing > 0.99 && p.frame.collapse === 0) { held = p; break; } }
        if (held === null || held.frame.weight < 0.5) return;
        const where = `${ft} ft ${tide} held at tb ${tb.toFixed(2)}`;
        const w = held.frame.weight, q = held.points[WALL_MID];
        const aT = angle(q, held.points[TUBE_TIP_SAMPLE]);
        let aR = angle(q, held.points[TUBE_ROOT_SAMPLE]);
        if (aR < aT) aR += 2 * Math.PI;
        const out = tubeLight(held, sunAt(aT - 10 * deg))[WALL_MID];
        expect(out.sLip + out.sBody, `${where}: sun out of the mouth`).toBeLessThanOrEqual(0.05);
        expect(tubeLight(held, sunAt((aT + aR) / 2))[WALL_MID].sLip, `${where}: sun through the lip`).toBeGreaterThanOrEqual(0.95 * w);
        expect(tubeLight(held, sunAt(aR + 10 * deg))[WALL_MID].sBody, `${where}: sun behind the wave`).toBeGreaterThanOrEqual(0.95 * w);
        const lights = tubeLight(held, sunAt(45 * deg));
        expect(lights[WALL_MID].o, `${where}: deep in, little sky`).toBeLessThan(0.3);
        // Landed, the cross-section is closed (its sky comes along the tube, from the younger sections nearer the peel):
        // the mouth's extra sky shows while the lip is in the air.
        let air: Profile | null = null;
        for (let t = 0.5 * tl; t < tl; t += 0.05) { const p = at(t); if (p.frame.weight > 0.5 && p.frame.landing === 0) { air = p; break; } }
        expect(air, `${where}: a lip in the air`).not.toBeNull();
        const T = air!.points[TUBE_TIP_SAMPLE], airLights = tubeLight(air!, sunAt(45 * deg));
        let nearest = -1, best = Infinity;
        for (let j = n.front; j < n.front + n.face; j++) { const d = Math.hypot(air!.points[j][0] - T[0], air!.points[j][1] - T[1]); if (d < best) { best = d; nearest = j; } }
        expect(airLights[nearest].o, `${where}: more sky near the mouth (in the air)`).toBeGreaterThan(airLights[WALL_MID].o);
        lights.forEach((l, j) => {
          if (!inTube(j)) expect([l.sLip, l.sBody, l.o], `${where}: j ${j} (${sampleSegment(j).seg}) is open`).toEqual([0, 0, 1]);
        });
        // Review focus 1: the sun below the horizon stays finite and in range.
        for (const l of tubeLight(held, sunAt(-20 * deg))) for (const v of [l.sLip, l.sBody, l.o, l.tLip]) expect(Number.isFinite(v)).toBe(true);
        // Open before the throw and once collapsed; no jumps between (1/30 s steps, sun 45° from in front).
        for (const l of tubeLight(at(null), sunAt(45 * deg))) expect([l.sLip, l.sBody, l.o]).toEqual([0, 0, 1]);
        // The lip's shadow edge and the mouth's edge sweep across a point in a frame as the lip throws and collapses (real
        // moving edges): the tube's mean light must not jump, and no more than two points a step may flip.
        const mean = (ls: ReturnType<typeof tubeLight>, k: 'sLip' | 'sBody' | 'o'): number => { let s = 0, c = 0; ls.forEach((l, j) => { if (inTube(j)) { s += l[k]; c++; } }); return s / c; };
        let prev = tubeLight(at(0), sunAt(45 * deg)), end: Profile | null = null;
        for (let t = 1 / 30; t < tb + 10; t += 1 / 30) {
          const p = at(t), cur = tubeLight(p, sunAt(45 * deg));
          cur.forEach((l, j) => {
            for (const v of [l.sLip, l.sBody, l.o]) { expect(Number.isFinite(v), `${where}: finite at tb ${t.toFixed(2)} j ${j}`).toBe(true); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
          });
          const flips = cur.filter((l, j) => Math.max(Math.abs(l.sLip - prev[j].sLip), Math.abs(l.sBody - prev[j].sBody), Math.abs(l.o - prev[j].o)) > 0.6).length;
          expect(flips, `${where}: points flipping at tb ${t.toFixed(2)}`).toBeLessThanOrEqual(2);
          for (const k of ['sLip', 'sBody', 'o'] as const) expect(Math.abs(mean(cur, k) - mean(prev, k)), `${where}: mean ${k} jumps at tb ${t.toFixed(2)}`).toBeLessThanOrEqual(0.3);
          prev = cur;
          if (p.frame.collapse >= 1) { end = p; break; }
        }
        expect(end, `${where}: collapses`).not.toBeNull();
        for (const l of tubeLight(end!, sunAt(45 * deg))) expect([l.sLip, l.sBody, l.o]).toEqual([0, 0, 1]);
        expect(PROFILE_SAMPLES).toBe(160);
      });
    }
  }
});
