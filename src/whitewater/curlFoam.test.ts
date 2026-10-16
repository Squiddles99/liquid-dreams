import { describe, expect, it } from 'vitest';
import { CLEAN_TUBE, FACE_FOAM_PHASE, FRINGE_WIDTH, curlFoamAt, packInnerFringe, tipFringeAt, unpackFringe, unpackInner } from './curlFoam';

describe('curlFoam: the lip with photo 5\'s timing (whitewater §3.4)', () => {
  it('keeps the lip\'s face clean before the tube caves in (face foam 0 before phase 1.2)', () => {
    for (const ph of [0.5, 0.8, 1.0, 1.19]) expect(curlFoamAt(ph, 0.5, 0, 1), `phase ${ph}`).toBe(0);
    expect(FACE_FOAM_PHASE[0]).toBe(1.2);
  });

  it('hides the sheet\'s foam inside the open tube, and lets it back as the tube caves in', () => {
    expect(curlFoamAt(1.0, 0.5, 1, 1)).toBeCloseTo(-CLEAN_TUBE, 12);
    expect(curlFoamAt(1.5, 0.5, 1, 1)).toBeGreaterThanOrEqual(0);
  });

  it('climbs the lip\'s face from the tip as the tube caves in', () => {
    expect(curlFoamAt(1.5, 0.2, 0, 1)).toBeGreaterThan(curlFoamAt(1.5, 0.8, 0, 1));
    expect(curlFoamAt(1.5, 0.2, 0, 1)).toBeGreaterThan(0.5);
  });

  it('carries no fringe of its own (the tip\'s fringe is tipFringeAt, F2), and is 0 where the curl is 0', () => {
    expect(curlFoamAt(0.8, 0.02, 0, 1)).toBe(0);
    for (const ph of [0.8, 1.0, 1.5]) for (const inside of [0, 1]) expect(Math.abs(curlFoamAt(ph, 0.02, inside, 0))).toBe(0);
  });
});

describe('tipFringeAt: the tip\'s own thin white band (whitewater F2)', () => {
  it('is a torn edge (0.02 of the reach, breaking-look item 4; was 0.06) and solid at the tip from the throw', () => {
    expect(FRINGE_WIDTH).toBe(0.02); // breaking-look item 4 (2026-10-15): a torn edge, not a hose (F2 had 0.06)
    expect(tipFringeAt(0.8, 0.002, 1)).toBeGreaterThanOrEqual(0.9);
    expect(tipFringeAt(0.8, FRINGE_WIDTH, 1)).toBe(0);
    expect(tipFringeAt(0.3, 0.002, 1)).toBe(0);
  });
  it('is only on the lip\'s own samples (tip → crest), never past the tip into the tube', () => {
    expect(tipFringeAt(0.8, 0.01, 0)).toBe(0);
  });
  it('travels in the normal buffer\'s .w beside the inner flag without changing the flag\'s 0.5 test', () => {
    for (const inner of [0, 1]) for (const f of [0, 0.3, 1]) {
      const w = packInnerFringe(inner, f);
      expect(w > 0.5).toBe(inner === 1);
      expect(unpackInner(w)).toBe(inner);
      expect(unpackFringe(w)).toBeCloseTo(inner === 1 ? f : 0, 12);
    }
  });
});

describe('the landed curtain erodes (breaking-look item 4, L5)', () => {
  it('erosion 0 before landing + 0.2 s, rising to 1 by landing + 0.85 s (0.65 s after it starts); the fringe <= 0.02 of the reach', async () => {
    const { curtainErosion, CURTAIN_EROSION_S, FRINGE_WIDTH: W, NOT_LANDED } = await import('./curlFoam');
    const { IMPACT_DELAY_S, IMPACT_WINDOW_S } = await import('./sprayEmitters');
    expect(CURTAIN_EROSION_S[0]).toBeCloseTo(IMPACT_DELAY_S, 9);
    expect(CURTAIN_EROSION_S[1]).toBeCloseTo(IMPACT_DELAY_S + IMPACT_WINDOW_S + 0.3, 9);
    expect(curtainErosion(NOT_LANDED)).toBe(0);
    for (const t of [0, 0.1, 0.2]) expect(curtainErosion(t)).toBe(0);
    expect(curtainErosion(0.5)).toBeGreaterThan(0);
    expect(curtainErosion(0.5)).toBeLessThan(1);
    expect(curtainErosion(0.85)).toBeCloseTo(1, 9);
    expect(curtainErosion(5)).toBe(1);
    expect(W).toBeLessThanOrEqual(0.02);
  });

  // Overnight fix 2026-10-16 T6: the lane's clock starts at the end of the tube's hold (CURTAIN_ERODES_AT_PHASE), not the lip's
  // landing: the erosion discards the whole row, and from the landing it took the lip and the tube through their hold.
  it("the station lane: the time since its tube's hold ends (CURTAIN_ERODES_AT_PHASE on its own clock), NOT_LANDED before", async () => {
    const { sinceLand, CURTAIN_ERODES_AT_PHASE } = await import('../breaker/BreakingRibbon');
    const { collapseSpan, flightTime, sectionPhase, tubeHold } = await import('../breaker/wombSection');
    const { NOT_LANDED, SHEET_FOAM_LAG_S } = await import('./curlFoam');
    const st = (tb: number | null) => ({ H: 3, Hb: 3, tb } as never);
    const from = flightTime(3) + tubeHold(3, 15) + (CURTAIN_ERODES_AT_PHASE - 1) * collapseSpan(3, 15);
    expect(sinceLand(st(null), 15)).toBe(NOT_LANDED);
    expect(sinceLand(st(flightTime(3) + 0.4), 15)).toBe(NOT_LANDED);
    expect(sinceLand(st(from - 0.01), 15)).toBe(NOT_LANDED);
    expect(sinceLand(st(from + 0.4), 15)).toBeCloseTo(0.4 - SHEET_FOAM_LAG_S, 9);
    expect(sectionPhase({ H: 3, Hb: 3, r: 1, tb: from, until: 0, psi: 0.06, periodS: 15, x: 0, z: 0 }, { ribbonOnset: 0.6 })).toBeCloseTo(CURTAIN_ERODES_AT_PHASE, 6);
    expect(sectionPhase({ H: 3, Hb: 3, r: 1, tb: from + 0.3, until: 0, psi: 0.06, periodS: 15, x: 0, z: 0 }, { ribbonOnset: 0.6 })).toBeGreaterThan(CURTAIN_ERODES_AT_PHASE);
  });
});

// Piece 1 (2026-10-16, Andrew's 1792126619: a dark glassy roof with white blotches over his white bore): once a station's
// tube hold has ended (sinceLand >= 0) its curtain (the samples departing from the sheet) hands over to the foam white within
// 0.3 s and stays white until the erosion removes the row; the standing lip and curtain (in the hold) keep the water.
describe('the landed curtain reads as white water (piece 1)', () => {
  it('a landed station\'s curtain foam weight >= 0.9 by 0.3 s after its hold ends; 0 added in the hold or on the sheet', async () => {
    const { curtainFoamAt, NOT_LANDED } = await import('./curlFoam');
    const { sinceLand, CURTAIN_ERODES_AT_PHASE } = await import('../breaker/BreakingRibbon');
    const { collapseSpan, flightTime, tubeHold } = await import('../breaker/wombSection');
    const st = (tb: number) => ({ H: 3, Hb: 3, tb } as never);
    const from = flightTime(3) + tubeHold(3, 15) + (CURTAIN_ERODES_AT_PHASE - 1) * collapseSpan(3, 15);
    const clean = -CLEAN_TUBE;  // the open tube's inside (curlFoamAt before the caving)
    // Landed + 0.3 s, on the curtain (constructed 1): white, and the clean tube no longer hides the sheet's foam.
    const landed = curtainFoamAt(clean, 1, sinceLand(st(from + 0.3), 15), 1);
    expect(landed.foam).toBeGreaterThanOrEqual(0.9);
    expect(landed.clean).toBeLessThanOrEqual(0.1 * CLEAN_TUBE);
    // ...and it stays white later (until the erosion removes the row).
    expect(curtainFoamAt(0, 1, sinceLand(st(from + 0.8), 15), 1).foam).toBeGreaterThanOrEqual(0.9);
    // In the hold (the standing curtain): the water, as before.
    const held = curtainFoamAt(clean, 1, sinceLand(st(from - 0.05), 15), 1);
    expect(sinceLand(st(from - 0.05), 15)).toBe(NOT_LANDED);
    expect(held.foam).toBe(0);
    expect(held.clean).toBeCloseTo(CLEAN_TUBE, 9);
    // On the sheet (constructed 0) the ribbon adds nothing: the sheet's own foam field shows.
    expect(curtainFoamAt(0, 1, sinceLand(st(from + 0.3), 15), 0).foam).toBe(0);
    // The caving lip's own foam is kept as it was.
    expect(curtainFoamAt(0.6, 0.5, NOT_LANDED, 1).foam).toBeCloseTo(0.3, 9);
  });
});

// Piece 1 (2026-10-16): the erosion's holes showed the sheet before its foam had risen (Andrew's 1792126619, after the
// landed curtain turned white: teal holes in a white roof). The sheet holds its own tube (breaking.lifecycle, TUBE_HOLD_S)
// and its foam reaches 0.9 0.89-2.0 s after the ribbon's hold ends (T 10-18 s, H 1-8 m; today the erosion starts 0.2 s
// after the hold, over a sheet foam of 0.00 at H 2-5 m, T 15). The curtain erodes only over a white sheet.
describe('the landed curtain erodes only over the sheet\'s white water (piece 1)', () => {
  it('at the erosion\'s start the sheet\'s foam under the station is >= 0.9 (T 10-18 s, H 1-8 m); the curtain is white by 0.3 s after its hold', async () => {
    const { curtainErosion, CURTAIN_EROSION_S, landedWhite } = await import('./curlFoam');
    const { sinceLand } = await import('../breaker/BreakingRibbon');
    const { DEFAULT_BREAK_PARAMS: P, lifecycle, FOAM_ONSET_COLLAPSE } = await import('../breaker/breaking');
    const { flightTime, tubeHold } = await import('../breaker/wombSection');
    const { smoothstep } = await import('../math/smoothstep');
    const bad: string[] = [];
    for (const T of [10, 12, 15, 18]) for (const H of [1, 1.5, 2, 3, 3.8, 5, 6, 8]) {
      const holdEnd = flightTime(H) + tubeHold(H, T);
      // The first tb at which the curtain erodes at all, by the station lane.
      let tb = holdEnd; while (curtainErosion(sinceLand({ H, Hb: H, tb } as never, T)) <= 0 && tb < holdEnd + 10) tb += 0.005;
      const sheetFoam = smoothstep(FOAM_ONSET_COLLAPSE, 1, lifecycle(1.2, tb, H, P, 1.2, 1.2, 1, 1).collapse);
      if (sheetFoam < 0.9) bad.push(`T ${T} H ${H}: erodes ${(tb - holdEnd).toFixed(2)} s after the hold, sheet foam ${sheetFoam.toFixed(2)}`);
      expect(landedWhite(sinceLand({ H, Hb: H, tb: holdEnd + 0.3 } as never, T), 1)).toBeGreaterThanOrEqual(0.9);
    }
    expect(CURTAIN_EROSION_S[0]).toBeGreaterThan(0);
    expect(bad).toEqual([]);
  });
});
