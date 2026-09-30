import { describe, expect, it } from 'vitest';
import { DEFAULT_BREAK_PARAMS, steepeningStart } from './breaking';
import { PROFILE_SAMPLES, type ProfileFrame, SEGMENT_ID, type Vec2, profileFrame, sampleHome, sampleSegment } from './lipProfile';
import {
  FRAME_LAYOUT, FRAME_VEC4S, HOME_COEFFS, SAMPLE_S, SEGMENT_OF_SAMPLE, TB_INFINITY, TB_NULL, createLipUniforms, encodeTb, homeFromTable, packFrameCpu,
  sampleTableData, updateLipUniforms,
} from './lipProfileNodes';

/** A smooth synthetic cross-section (a crest at u = 0 falling to a trough ahead), enough to give a frame with every field set. */
const base = (u: number): Vec2 => [u + 0.3 * Math.sin(u * 0.2), 1.6 * Math.exp(-((u / 4) ** 2)) - 0.8];
const frames: ProfileFrame[] = [
  profileFrame(base, { H: 2.4, c: 9, r: 1.3, tb: 0.4 }, DEFAULT_BREAK_PARAMS),
  profileFrame(base, { H: 1.1, c: 6, r: 0.7, tb: null }, DEFAULT_BREAK_PARAMS),
  profileFrame(base, { H: 3.2, c: 11, r: 2, tb: Infinity }, { ...DEFAULT_BREAK_PARAMS, faceWidth: 1.4 }),
];

describe('lipProfileNodes sample tables', () => {
  it('the GPU sample tables reproduce sampleSegment and sampleHome', () => {
    expect(SEGMENT_OF_SAMPLE.length).toBe(PROFILE_SAMPLES);
    expect(SAMPLE_S.length).toBe(PROFILE_SAMPLES);
    expect(HOME_COEFFS.length).toBe(3 * PROFILE_SAMPLES);
    for (let j = 0; j < PROFILE_SAMPLES; j++) {
      const { seg, s } = sampleSegment(j);
      expect(SEGMENT_OF_SAMPLE[j]).toBe(SEGMENT_ID[seg]);
      expect(SAMPLE_S[j]).toBe(s);
      for (const f of frames) expect(Math.abs(homeFromTable(j, f) - sampleHome(j, f))).toBeLessThan(1e-12);
    }
    // The frames differ in every term the table weights (uFoot, uFront, uBack), so no coefficient hides behind another.
    expect(new Set(frames.map((f) => `${f.uFoot}|${f.uFront}|${f.uBack}`)).size).toBe(frames.length);
  });

  it('encodes tb for the GPU (null → −1, Infinity → 1e9) and lays the frame out in FRAME_LAYOUT order', () => {
    expect(encodeTb(null)).toBe(TB_NULL);
    expect(encodeTb(Infinity)).toBe(TB_INFINITY);
    expect(encodeTb(0.42)).toBe(0.42);
    expect(TB_NULL).toBeLessThan(0);
    expect(TB_INFINITY).toBeGreaterThanOrEqual(1e8);
    const f = frames[0];
    const packed = packFrameCpu(f);
    expect(packed.length).toBe(FRAME_LAYOUT.length);
    expect(FRAME_LAYOUT.length).toBeLessThanOrEqual(4 * FRAME_VEC4S);
    const read = (name: (typeof FRAME_LAYOUT)[number]): number => packed[FRAME_LAYOUT.indexOf(name)];
    expect([read('K.x'), read('K.y'), read('tF.x'), read('tF.y'), read('R.y'), read('W.x')]).toEqual([f.K[0], f.K[1], f.tF[0], f.tF[1], f.K[1] - f.tTop, f.P[0]]);
    expect([read('uFoot'), read('uFront'), read('uBack'), read('tauLand'), read('vj'), read('prog'), read('reach')]).toEqual([f.uFoot, f.uFront, f.uBack, f.tauLand, f.vj, f.prog, f.reach]);
    expect([read('eRoot'), read('weight'), read('collapse'), read('landing'), read('rho')]).toEqual([f.tTop, f.weight, f.collapse, f.landing, f.rho]);
  });

  it('lip uniforms mirror the normalized params, with the steepening start as the ratio it starts at', () => {
    const u = createLipUniforms(DEFAULT_BREAK_PARAMS);
    expect([u.collapseTime.value, u.ribbonOnset.value, u.faceWidth.value]).toEqual([
      DEFAULT_BREAK_PARAMS.collapseTime, DEFAULT_BREAK_PARAMS.ribbonOnset, DEFAULT_BREAK_PARAMS.faceWidth,
    ]);
    expect(u.steepFrom.value).toBe(steepeningStart(DEFAULT_BREAK_PARAMS));
    const bad = { ...DEFAULT_BREAK_PARAMS, collapseTime: 0, ribbonOnset: 5, faceWidth: Number.NaN };
    const copy = { ...bad };
    updateLipUniforms(u, bad);
    expect(bad).toEqual(copy);
    expect(u.collapseTime.value).toBeGreaterThan(0);
    expect(u.steepFrom.value).toBeLessThan(1);
    expect(u.faceWidth.value).toBe(DEFAULT_BREAK_PARAMS.faceWidth);
  });

  it('packs the tables for the GPU as vec4(a, b, c, s), vec4(segment, 0, 0, 0) per sample', () => {
    const d = sampleTableData();
    expect(d).toBeInstanceOf(Float32Array);
    expect(d.length).toBe(8 * PROFILE_SAMPLES);
    for (let j = 0; j < PROFILE_SAMPLES; j++) {
      for (let k = 0; k < 3; k++) expect(d[j * 8 + k]).toBe(Math.fround(HOME_COEFFS[j * 3 + k]));
      expect(d[j * 8 + 3]).toBe(Math.fround(SAMPLE_S[j]));
      expect(d[j * 8 + 4]).toBe(SEGMENT_OF_SAMPLE[j]);
      expect([d[j * 8 + 5], d[j * 8 + 6], d[j * 8 + 7]]).toEqual([0, 0, 0]);
    }
  });
});
