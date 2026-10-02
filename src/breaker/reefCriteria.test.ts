import { describe, expect, it } from 'vitest';
import { buildBathymetry, downsample } from '../seabed/bathymetry';
import { type ReefField, computeReefField } from './reefField';
import { BREAK_NEAR_PEAK_M, CLOSEOUT_SPREAD_S, LOW_TIDE_12FT_REACH_M, THROWN_12_PSI, CRITERIA_SIZES_FT, PEEL_BAND, PEEL_SIZES_FT, TIDES, type Tide, evaluateReef, firstBreakSeaward, formatCard, setWaveHeight } from './reefReport';

// Spec 2026-10-02-womb-reef-design §2 (Andrew): where the Womb breaks, how it peels and how it barrels, by conditions.
const bed = downsample(buildBathymetry(), 2);
const field = (tideM: number, fromDeg = 225, periodS = 15): ReefField => computeReefField({ bed, periodS, fromDeg, tideM });
const fields = Object.fromEntries((Object.keys(TIDES) as Tide[]).map((t) => [t, field(TIDES[t])])) as Record<Tide, ReefField>;
const card = evaluateReef(fields);
console.log(formatCard(card));

describe("the Womb's reef: where and how it breaks (spec 2026-10-02 §2)", () => {
  it('every set wave 4–12 ft first breaks at the take-off spot or within 30 m seaward of it, at every tide (§2.1)', () => {
    for (const t of Object.keys(TIDES) as Tide[]) CRITERIA_SIZES_FT.forEach((ft, i) => {
      expect(card.firstBreak[t][i], `${ft} ft, ${t} tide`).toBeLessThanOrEqual(BREAK_NEAR_PEAK_M);
      if (ft >= 6) expect(Number.isFinite(card.firstBreak[t][i]), `${ft} ft, ${t} tide breaks at the take-off`).toBe(true);
    });
  });
  it('nowhere does a 12 ft set wave break more than 30 m seaward of the ledges (40 m at low tide, too big for it: Andrew) (§2.1)', () => {
    for (const t of Object.keys(TIDES) as Tide[]) {
      const w = card.furthest12[t];
      expect(w ? w.v : 0, `${t} tide: ${w ? `(${w.x}, ${w.z})` : ''}`).toBeLessThanOrEqual(t === 'low' ? LOW_TIDE_12FT_REACH_M : BREAK_NEAR_PEAK_M);
    }
  });
  it('the left peels from the peak itself, in order, at 8–20 m/s (4–8 ft, mid tide) (§2.2)', () => {
    PEEL_SIZES_FT.forEach((ft, i) => {
      expect(card.peelMonotonic[i], `${ft} ft breaks in order from the peak`).toBe(true);
      expect(card.peel[i], `${ft} ft`).toBeGreaterThanOrEqual(PEEL_BAND[0]);
      expect(card.peel[i], `${ft} ft`).toBeLessThanOrEqual(PEEL_BAND[1]);
    });
  });
  it('12 ft on the ideal day is the biggest cylinder or thrown out, on the line to state 6 (§2.3; Andrew accepted 0.079)', () => {
    expect(card.ideal12.psi, `${card.ideal12.tide} tide`).toBeGreaterThanOrEqual(THROWN_12_PSI);
  });
  it('12 ft on an ordinary day closes the left out: its first 40 m breaks within 1.5 s (§2.3)', () => {
    expect(card.ordinary12Spread).toBeLessThanOrEqual(CLOSEOUT_SPREAD_S);
  });
  it('smaller days: 6–8 ft an oval or cylinder at mid tide, the cylinder or just thrown out when ideal (Andrew); 4 ft never thrown (§2.3)', () => {
    expect(card.passes.smallDays).toBe(true);
  });
});

describe('off the default swell (plan Review Focus 1–2)', () => {
  const H = setWaveHeight(12);
  for (const [name, fromDeg, periodS] of [['215°', 215, 15], ['235°', 235, 15], ['12 s', 225, 12], ['18 s', 225, 18]] as const) {
    it(`12 ft at mid tide from ${name} still first breaks within 30 m of the peak`, { timeout: 60_000 }, () => {
      expect(firstBreakSeaward(field(0, fromDeg, periodS), H)).toBeLessThanOrEqual(BREAK_NEAR_PEAK_M);
    });
  }
});
