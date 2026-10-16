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

  // Overnight fix 2026-10-16 T6: the lane's clock starts at the tube caving in (CURTAIN_ERODES_AT_PHASE), not the lip's
  // landing: the erosion discards the whole row, and from the landing it took the lip and the tube through their hold.
  it('the station lane: the time since its tube caves in (CURTAIN_ERODES_AT_PHASE on its own clock), NOT_LANDED before', async () => {
    const { sinceLand, CURTAIN_ERODES_AT_PHASE } = await import('../breaker/BreakingRibbon');
    const { collapseSpan, flightTime, sectionPhase, tubeHold } = await import('../breaker/wombSection');
    const { NOT_LANDED } = await import('./curlFoam');
    const st = (tb: number | null) => ({ H: 3, Hb: 3, tb } as never);
    const from = flightTime(3) + tubeHold(3, 15) + 0.5 * collapseSpan(3, 15);
    expect(sinceLand(st(null), 15)).toBe(NOT_LANDED);
    expect(sinceLand(st(flightTime(3) + 0.4), 15)).toBe(NOT_LANDED);
    expect(sinceLand(st(from - 0.01), 15)).toBe(NOT_LANDED);
    expect(sinceLand(st(from + 0.4), 15)).toBeCloseTo(0.4, 9);
    expect(sectionPhase({ H: 3, Hb: 3, r: 1, tb: from, until: 0, psi: 0.06, periodS: 15, x: 0, z: 0 }, { ribbonOnset: 0.6 })).toBeCloseTo(CURTAIN_ERODES_AT_PHASE, 6);
  });
});
