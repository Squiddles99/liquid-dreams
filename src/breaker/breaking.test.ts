import { describe, expect, it } from 'vitest';
import { smoothstep } from '../math/smoothstep';
import {
  type BreakParams, type BreakPointInput, COLLAPSE_END, DEFAULT_BREAK_PARAMS, SHARPEN_DEPTH, MIN_STAGE_SPAN, boreHeight, boreScale, breakPoint, breakingHeightThreshold,
  FOAM_DENSE_BEHIND_H, FOAM_ONSET_COLLAPSE, FOAM_SETTLE_COLLAPSE, FOAM_TRAIL_H, breakingDepth, breakingRatio, breakingStage, drainDepth, faceHeight, foamWeight, landingEstimate, landingTime, lifecycle, normalizeBreakParams, ONSET_LEVELS, ONSET_LEVEL_Q, ONSET_LEVEL_RATIO, ONSET_RECORD_LENGTH, onsetHeight, onsetGain, PILE_RISE_S, PILE_SPEED_MS, SURGE_RISE_S, SURGE_FALL_S, smoothMax, pileShape, pileTop, settledCrestTop, type Lifecycle, PILE_LAND_H, onsetTime, settleSpan, sharpenDrop, stageCurves, steepening, steepeningStart,
} from './breaking';
import { waveNumber } from './dispersion';

const P = DEFAULT_BREAK_PARAMS;
type Pt = [number, number];

/**
 * One wave at one point of its cross-section, built from the Phase 1 formulas (setWaveModel.waveAt with lateral = 1),
 * with the derivatives breakPoint needs along travel. `v0` is the undisplaced distance ahead of the crest's spot (m).
 * With `rigid`, the point sits at uUnbroken = uCrest + v0 with no Phase 1 horizontal displacement, so a step d in v0 is a
 * step d ahead and θ changes by −k·d (the derivative test); otherwise it carries Phase 1's displacement, as the model's.
 */
function wavePoint(v0: number, H: number, hmin: number, periodS: number, rigid = false): BreakPointInput {
  const omega = (2 * Math.PI) / periodS, k = waveNumber(omega, hmin), c = omega / k;
  const A = H / 2, sigma = Math.max(Math.tanh(k * hmin), 0.05);
  const B = Math.min(0.35, (k * A * (3 - sigma * sigma)) / (4 * sigma ** 3));
  const width = (0.8 * 2 * Math.PI) / omega;
  const nearBreaking = smoothstep(0.3, 0.78, H / hmin);
  const pitchOf = (aE: number) => Math.min(0.3 * nearBreaking, 0.12 / Math.max(k * aE, 1e-4));
  const etaCrest = A * (1 + B), uCrest = pitchOf(A) * etaCrest;
  const xi = -v0 / c, theta = omega * xi, env = Math.exp(-((xi / width) ** 2));
  const dEnvDXi = ((-2 * xi) / (width * width)) * env;
  const shape = Math.cos(theta) + B * Math.cos(2 * theta);
  const aE = A * env, eta = aE * shape;
  const dEtaDXi = A * (dEnvDXi * shape - env * omega * (Math.sin(theta) + 2 * B * Math.sin(2 * theta)));
  const dXiDs = -1 / c;
  const dh = rigid ? 0 : Math.min(aE, 0.6 / k) * Math.sin(theta) + pitchOf(aE) * eta;
  return {
    theta, env, uUnbroken: (rigid ? uCrest : 0) + v0 + dh, eta, uCrest, etaCrest, H, k, hmin, boreH: H,
    slope: dEtaDXi * dXiDs, dThetaDAhead: omega * dXiDs, dEnvDAhead: dEnvDXi * dXiDs, crestConfidence: 1, lipTop: 0, lipHeight: 0, lateral: 1,
  };
}

/** The quarter wavelength (m) of a case, the section's sampling scale. */
const quarterOf = (hmin: number, periodS: number) => Math.PI / (2 * waveNumber((2 * Math.PI) / periodS, hmin));

/**
 * One wave's cross-section along its travel through breakPoint at crest stage s and breaking ratio r: (along-travel
 * position, height) points from behind the crest to ahead of it, with each point's foam, distance ahead and phase.
 */
function section(s: number, r: number, H: number, hmin: number, periodS: number, p: BreakParams = P): { pts: Pt[]; info: { foam: number; ahead: number; theta: number }[] } {
  const quarter = quarterOf(hmin, periodS), dv = quarter / 200;
  const pts: Pt[] = [];
  const info: { foam: number; ahead: number; theta: number }[] = [];
  for (let v0 = -3 * quarter; v0 <= 3 * quarter + 1e-9; v0 += dv) {
    const i = wavePoint(v0, H, hmin, periodS);
    const b = breakPoint(i, lifecycle(r, undefined, 1, p), p);
    pts.push([i.uUnbroken, b.eta]);
    info.push({ foam: b.foam, ahead: i.uUnbroken - i.uCrest, theta: i.theta });
  }
  return { pts, info };
}

/** How far the curve doubles back along travel: 0 for a single-valued surface. */
function overhang(pts: Pt[]): number {
  let front = -Infinity, back = 0;
  for (const [u] of pts) { front = Math.max(front, u); back = Math.max(back, front - u); }
  return back;
}

// Height, hmin, period: the default biggest wave at the peak, the onset height, big and small, shelf, extremes.
const CASES: [number, number, number][] = [[3.16, 6.02, 15], [2.64, 6, 15], [4.5, 6, 18], [3, 4, 12], [1.5, 2, 8], [8.6, 12, 25], [0.8, 1.5, 6]];
const STAGES = Array.from({ length: 21 }, (_, i) => i / 20);
/** A crest breaking ratio at progress s ∈ (0, 1] through the break (s = 1: settled to the bore, ρ = 1 + COLLAPSE_END·Δ);
 * at s = 0, a steepening but unbroken ρ. */
const ratioFor = (s: number): number => (s > 0 ? 1 + COLLAPSE_END * P.stageSpan * s : 0.9);
/** Stages where the lip is still in the air (foam waits for the collapse to reach FOAM_ONSET_COLLAPSE)… */
const AIRBORNE = STAGES.filter((s) => stageCurves(ratioFor(s), P).collapse <= FOAM_ONSET_COLLAPSE);
/** …and where it has landed but the tube is still open (the collapse short of FOAM_SETTLE_COLLAPSE). */
const LANDED_OPEN = STAGES.filter((s) => { const c = stageCurves(ratioFor(s), P).collapse; return c > FOAM_ONSET_COLLAPSE + 0.02 && c < FOAM_SETTLE_COLLAPSE; });

describe('breaking criterion and stage', () => {
  it('breaks once H ≥ 0.44·hmin (γ = 0.78, δ = 1): about 2.6 m over the 6 m ledge', () => {
    expect(breakingRatio(0.43 * 6, 6, P)).toBeLessThan(1);
    expect(breakingRatio(0.45 * 6, 6, P)).toBeGreaterThan(1);
  });
  it('breakingHeightThreshold: r > 1 exactly above it, on both sides of the depth floor', () => {
    for (const p of [P, { ...P, gamma: 0.6, delta: 0.3, hFloorM: 1 }]) for (const amp of [0.3, 1, 2.2]) for (const hmin of [0.05, 0.3, 0.6, 1.5, 6, 30]) {
      const T = breakingHeightThreshold(amp, hmin, p);
      expect(breakingRatio(T * amp * (1 - 1e-9), hmin, p), `amp ${amp} hmin ${hmin}`).toBeLessThanOrEqual(1);
      expect(breakingRatio(T * amp * (1 + 1e-6), hmin, p), `amp ${amp} hmin ${hmin}`).toBeGreaterThan(1);
    }
    expect(breakingHeightThreshold(0, 6, P)).toBe(Infinity);
  });
  it('the breaking depth is hmin on the reef and deeper over deep water (a 6 m wave does not break over the 13 m shelf)', () => {
    for (const h of [3, 4, 6, 7]) expect(breakingDepth(h)).toBeCloseTo(h, 12);
    expect(breakingDepth(0.6)).toBe(3); // the reef flat: long broken either way
    expect(breakingDepth(13)).toBeGreaterThan(20);
    expect(breakingRatio(6, breakingDepth(13), P)).toBeLessThan(0.65);
    let prev = 0;
    for (let h = 0.5; h <= 60; h += 0.25) { const d = breakingDepth(h); expect(d).toBeGreaterThanOrEqual(prev); prev = d; }
  });
  it('floors the drained depth, so a wave taller than the water stays finite', () => {
    expect(breakingRatio(5, 0.4, P)).toBeCloseTo(5 / (0.78 * 0.3), 9);
    expect(breakingRatio(0, 6, P)).toBe(0);
  });
  it('is proportional to the height and to 1/hmin above the floor (no blow-up as the drained depth nears it)', () => {
    for (const hmin of [2, 6, 12]) for (const H of [0.5, 2, 4]) {
      expect(breakingRatio(2 * H, hmin, P)).toBeCloseTo(2 * breakingRatio(H, hmin, P), 12);
      expect(breakingRatio(H, hmin / 2, P)).toBeCloseTo(2 * breakingRatio(H, hmin, P), 12);
    }
    // A wave twice its breaking height (the old ratio: ~2.7e1 at the floor) reads 2.
    expect(breakingRatio(2 * 0.78 * 6 / 1.78, 6, P)).toBeCloseTo(2, 12);
  });
  it('stage is 0 below r = 1, 1 from r = 1 + Δ, and never decreases as r grows', () => {
    expect(breakingStage(0.99, P)).toBe(0);
    expect(breakingStage(1 + P.stageSpan, P)).toBe(1);
    let prev = 0;
    for (let r = 0; r <= 4; r += 0.01) { const s = breakingStage(r, P); expect(s).toBeGreaterThanOrEqual(prev); prev = s; }
  });
  it('a stage span dragged to 0 (or NaN r) stays finite', () => {
    const p = { ...P, stageSpan: 0 };
    for (const r of [0.5, 1, 1.01, 1.04, 2, Number.NaN, Infinity]) expect(Number.isFinite(breakingStage(r, p))).toBe(true);
    expect(breakingStage(1 + MIN_STAGE_SPAN, p)).toBe(1);
  });
  it('stage curves run in order: the drain first (from the steepening, before the break), then the collapse', () => {
    const at = (r: number) => stageCurves(r, P);
    const from = steepeningStart(P);
    expect(at(from)).toEqual({ drain: 0, collapse: 0 });
    expect(at(0.95).drain).toBeGreaterThan(0); // draining before it breaks…
    expect(at(0.95).collapse).toBe(0);
    expect(at(1 + P.drainEnd * P.stageSpan).drain).toBe(1); // …full at 1 + drainEnd·Δ…
    expect(at(1 + P.drainEnd * P.stageSpan).collapse).toBeLessThan(0.05); // …before the collapse has got going
    expect(at(1 + P.stageSpan).collapse, 'still settling when the stage is done').toBeLessThan(0.5);
    expect(at(1 + COLLAPSE_END * P.stageSpan)).toEqual({ drain: 1, collapse: 1 });
    let prev = { drain: 0, collapse: 0 };
    for (let r = 0; r <= 3; r += 0.01) {
      const c = at(r);
      expect(c.drain).toBeGreaterThanOrEqual(prev.drain);
      expect(c.collapse).toBeGreaterThanOrEqual(prev.collapse);
      prev = c;
    }
  });
  it('steepening ramps from steepeningStart (0.65 at the defaults) to ρ = 1', () => {
    const from = steepeningStart(P);
    expect(from).toBeCloseTo(0.65, 12);
    expect(steepening(from - 0.01, P)).toBe(0);
    expect(steepening(1, P)).toBe(1);
    expect(steepening((from + 1) / 2, P)).toBeCloseTo(0.5, 12);
    expect(steepening(3, P)).toBe(1);
    // An onset dragged to the slider's top still ramps up (0 below, 1 from r = 1), never inverted.
    const late = { ribbonOnset: 0.9 };
    expect(steepening(steepeningStart(late), late)).toBe(0);
    expect(steepening(1, late)).toBe(1);
    let prev = 0;
    for (let r = 0; r <= 1.2; r += 0.01) { const v = steepening(r, late); expect(v).toBeGreaterThanOrEqual(prev); prev = v; }
  });
});

describe('the sheet shape (sampled cross-sections)', () => {
  it('sharpenDrop is zero behind the crest and unchanged ahead', () => {
    const H = 3, k = 0.055, eta = 1.2, etaCrest = 1.8, steep = 0.7;
    for (const ahead of [-10, -1, -0.01]) expect(sharpenDrop(ahead, eta, etaCrest, H, k, steep, P)).toBe(0);
    const w = P.faceWidth * H, quarter = Math.PI / (2 * k);
    for (const ahead of [0.5, 2]) {
      const expected = steep * (1 - Math.exp(-((ahead / w) ** 2))) * smoothstep(2 * quarter, quarter, ahead) * Math.max(eta - (etaCrest - SHARPEN_DEPTH * H), 0);
      expect(sharpenDrop(ahead, eta, etaCrest, H, k, steep, P)).toBeCloseTo(expected, 12);
    }
  });
  it('breakPoint keeps the Phase 1 point when neither steep nor breaking', () => {
    const i = wavePoint(3.4, 3, 6, 15);
    expect(breakPoint(i, lifecycle(0.5, undefined, 1, P), P)).toEqual({ eta: i.eta, foam: 0, dEtaDAhead: 0, pile: 0 });
  });
  it("breakPoint's dEtaDAhead matches a central difference of its eta along ahead", () => {
    const d = 1e-4;
    for (const [H, hmin, T] of CASES) for (const [s, r] of [[0, 0.8], [0, 0.95], [0.2, 1.2], [0.5, 1.5], [0.85, 1.85], [1, 2.5]]) {
      const k = Math.PI / (2 * quarterOf(hmin, T));
      // θ from −π to π: v0 from π/k behind the crest to π/k ahead. The breaking change (breakPoint's η − the Phase 1 η)
      // is what dEtaDAhead differentiates.
      const change = (q: BreakPointInput) => breakPoint(q, lifecycle(r, undefined, 1, P), P).eta - q.eta;
      const rows: { a: number; analytic: number; numeric: number }[] = [];
      for (let j = 0; j <= 400; j++) {
        const v0 = -Math.PI / k + (j * 2 * Math.PI) / k / 400;
        if (Math.abs(v0) < 0.05) continue;
        const numeric = (change(wavePoint(v0 + d, H, hmin, T, true)) - change(wavePoint(v0 - d, H, hmin, T, true))) / (2 * d);
        rows.push({ a: v0, analytic: breakPoint(wavePoint(v0, H, hmin, T, true), lifecycle(r, undefined, 1, P), P).dEtaDAhead, numeric });
      }
      const maxSlope = Math.max(...rows.map((q) => Math.abs(q.numeric)));
      for (const q of rows) {
        expect(Math.abs(q.analytic - q.numeric), `H ${H} hmin ${hmin} T ${T} s ${s} r ${r} ahead ${q.a.toFixed(2)}`).toBeLessThan(0.02 * maxSlope + 1e-4);
      }
    }
  });
  it('the front stands up and the back keeps its unbroken shape (ρ = 0.9, s = 0)', () => {
    for (const [H, hmin, T] of CASES) {
      const { pts, info } = section(0, 0.9, H, hmin, T), unbroken = section(0, 0.5, H, hmin, T).pts;
      info.forEach((q, j) => {
        if (q.ahead < 0) expect(pts[j][1]).toBe(unbroken[j][1]);
        if (q.ahead > P.faceWidth * H && q.ahead < 2 * P.faceWidth * H) expect(unbroken[j][1] - pts[j][1]).toBeGreaterThan(0.1 * H);
      });
    }
  });
  it('the sheet stays single-valued at every stage', () => {
    for (const [H, hmin, T] of CASES) for (const s of STAGES) expect(overhang(section(s, ratioFor(s), H, hmin, T).pts)).toBe(0);
  });
  it('collapses to a low bore at s = 1: crest to trough within the drained bore height', () => {
    for (const [H, hmin, T] of CASES) {
      const { pts } = section(1, ratioFor(1), H, hmin, T);
      const range = Math.max(...pts.map(([, e]) => e)) - Math.min(...pts.map(([, e]) => e));
      expect(range).toBeLessThanOrEqual(Math.min(H, boreHeight(hmin, P)) * (1 + P.troughDrain * P.delta));
    }
  });
  it('foam waits for the lip to land, then whitens the collapsed crest and the bore behind it, never the face ahead while the tube is open', () => {
    for (const [H, hmin, T] of CASES) {
      const label = `H ${H} hmin ${hmin} T ${T}`;
      for (const s of AIRBORNE) for (const q of section(s, ratioFor(s), H, hmin, T).info) expect(q.foam, `${label} s ${s}`).toBe(0);
      // Landing, the tube still open (the collapse short of FOAM_SETTLE_COLLAPSE): foam behind the crest only.
      expect(LANDED_OPEN.length).toBeGreaterThan(0);
      for (const s of LANDED_OPEN) {
        const { info } = section(s, ratioFor(s), H, hmin, T);
        for (const q of info) if (q.ahead >= 0) expect(q.foam, `${label} s ${s}`).toBe(0);
        expect(Math.max(...info.map((q) => q.foam)), `${label} s ${s}: foam has begun behind the crest`).toBeGreaterThan(0);
      }
      // Collapsed: dense at the crest and just behind it, gone FOAM_TRAIL_H·H behind (and beyond half a wavelength).
      const done = section(1, ratioFor(1), H, hmin, T).info;
      const Hb = Math.min(H, boreHeight(hmin, P));
      const dense = done.filter((x) => x.theta >= 0 && x.theta <= Math.PI / 2 && x.ahead <= 0 && -x.ahead <= FOAM_DENSE_BEHIND_H * Hb);
      expect(dense.length, label).toBeGreaterThan(0);
      for (const q of dense) expect(q.foam, label).toBeGreaterThan(0.5);
      for (const q of done.filter((x) => x.theta >= Math.PI || -x.ahead >= FOAM_TRAIL_H * H)) expect(q.foam, label).toBe(0);
    }
  });
});

describe('drain, bore, foam and face height', () => {
  it('the drain is finite, bounded by troughDrain·δ·H, and zero before the wave breaks', () => {
    expect(drainDepth(3, 0, P)).toBe(0);
    expect(drainDepth(3, 1, P)).toBeCloseTo(P.troughDrain * P.delta * 3, 12);
  });
  it('the bore height is β·hmin and never grows a wave', () => {
    expect(boreHeight(4, P)).toBeCloseTo(1.6, 12);
    expect(boreScale(3, 4, 1, P)).toBeCloseTo(1.6 / 3, 12);
    expect(boreScale(1, 12, 1, P)).toBe(1);
    expect(boreScale(3, 4, 0, P)).toBe(1);
    expect(boreScale(3, -1, 1, P)).toBe(0);
  });
  it('foam waits for the lip to land, then covers the collapsed crest and trails behind it, not far ahead', () => {
    const H = 3;
    const at = (s: number, theta: number, ahead: number) => foamWeight(theta, ahead, H, 1, stageCurves(ratioFor(s), P), P);
    for (const s of AIRBORNE) expect(at(s, 0.5, -2)).toBe(0); // the lip is still in the air or landing
    expect(at(1, 0.5, -2)).toBe(1); // collapsed, behind the crest
    expect(at(1, 0, 0)).toBe(1); // collapsed, at the crest
    expect(at(1, -0.1, P.faceWidth * H)).toBe(0); // down the bore's face, past its front edge
    expect(at(1, 4, -40)).toBe(0); // more than half a wavelength behind
    expect(at(1, 0.3, -FOAM_DENSE_BEHIND_H * H)).toBe(1); // dense to FOAM_DENSE_BEHIND_H·H behind the crest…
    expect(at(1, 0.4, -2 * H)).toBeGreaterThan(0); // …thinning…
    expect(at(1, 0.4, -2 * H)).toBeLessThan(1);
    expect(at(1, 0.6, -FOAM_TRAIL_H * H)).toBe(0); // …and gone FOAM_TRAIL_H·H behind (not half a wavelength)
    for (const s of LANDED_OPEN) expect(at(s, -0.02, 0.3)).toBe(0); // the tube still open: nothing ahead of the crest (the tube's inside)
  });
  it('face height is H unstood and H·(1 + troughDrain·δ) once drained', () => {
    expect(faceHeight(3, 0.5, P)).toBe(3);
    expect(faceHeight(3, 1 + P.drainEnd * P.stageSpan, P)).toBeCloseTo(3 * (1 + P.troughDrain * P.delta), 12);
  });
  it('every output stays finite for extreme inputs', () => {
    for (const [H, hmin, T] of [[0.001, 0.05, 4], [8.6, 0.05, 25], [0.2, 30, 25]] as const) for (const s of STAGES) {
      for (const r of [0.8, ratioFor(s)]) for (let v0 = -30; v0 <= 30; v0 += 0.5) {
        const b = breakPoint(wavePoint(v0, H, hmin, T), lifecycle(r, undefined, 1, P), P);
        for (const v of [b.eta, b.foam, b.dEtaDAhead]) expect(Number.isFinite(v)).toBe(true);
      }
    }
  });
});

describe('normalizeBreakParams', () => {
  it('repairs out-of-range and non-finite values', () => {
    const p = { ...P, stageSpan: 0, gamma: Number.NaN, faceWidth: 0 } as BreakParams;
    normalizeBreakParams(p);
    expect(p.stageSpan).toBe(MIN_STAGE_SPAN);
    expect(p.gamma).toBe(P.gamma);
    expect(p.faceWidth).toBeGreaterThan(0);
  });
  it('clamps the new fields and repairs non-finite ones', () => {
    const high = { ...P, collapseTime: 10, ribbonOnset: 2 };
    normalizeBreakParams(high);
    expect([high.collapseTime, high.ribbonOnset]).toEqual([3, 0.9]);
    const low = { ...P, collapseTime: 0, ribbonOnset: 0 };
    normalizeBreakParams(low);
    expect([low.collapseTime, low.ribbonOnset]).toEqual([0.3, 0.3]);
    const bad = { ...P, collapseTime: -Infinity, ribbonOnset: Number.NaN };
    normalizeBreakParams(bad);
    expect([bad.collapseTime, bad.ribbonOnset]).toEqual([1.8, 0.7]);
  });
  it('fills the pile and churn fields a saved setting from before them lacks, and clamps them', () => {
    const old = { ...P } as Partial<BreakParams>;
    delete old.pileHalfM; delete old.pileSurge; delete old.churnSize; delete old.churnSpeed;
    normalizeBreakParams(old as BreakParams);
    expect([old.pileHalfM, old.pileSurge, old.churnSize, old.churnSpeed]).toEqual([50, 0.3, 0.2, 1]);
    const wild = { ...P, pileHalfM: 1, pileSurge: 9, churnSize: -1, churnSpeed: 99 };
    normalizeBreakParams(wild);
    expect([wild.pileHalfM, wild.pileSurge, wild.churnSize, wild.churnSpeed]).toEqual([10, 0.6, 0, 3]);
  });
  it('leaves the defaults unchanged', () => {
    const p = { ...P };
    normalizeBreakParams(p);
    expect(p).toEqual(P);
    expect([P.collapseTime, P.ribbonOnset]).toEqual([1.8, 0.7]);
  });
});

describe('one clock: the onset record and the lifecycle', () => {
  /** A record sample: the running maximum `run`, then per level its time since onset and the amplification there. */
  const recOf = (run: number, tb: (q: number, k: number) => number, amp: (q: number, k: number) => number): Float32Array => {
    const r = new Float32Array(ONSET_RECORD_LENGTH);
    r[0] = run;
    ONSET_LEVEL_Q.forEach((q, k) => { r[1 + 2 * k] = q <= run ? tb(q, k) : 0; r[2 + 2 * k] = amp(q, k); });
    return r;
  };
  /** The deep-water height whose breaking level is q (ρ = height·onsetGain·q = 1). */
  const heightFor = (q: number): number => 1 / (q * onsetGain(P));
  const k = 5, qk = ONSET_LEVEL_Q[k], qMid = qk * Math.sqrt(ONSET_LEVEL_RATIO);
  it('onsetTime: null below the breaking level, the level\'s own time on a level, log-linear between levels', () => {
    const rec = recOf(1.3, (_, j) => 10 - j, (_, j) => 2 + 0.1 * j);
    expect(onsetTime(recOf(0.2, () => 1, () => 1), 0, heightFor(0.3), P)).toBeNull();
    expect(onsetTime(rec, 0, heightFor(qk), P)).toBeCloseTo(10 - k, 5);
    // Halfway (in log q) between levels k and k + 1.
    expect(onsetTime(rec, 0, heightFor(qMid), P)).toBeCloseTo(10 - k - 0.5, 5);
    // From an offset (the record is interleaved per node).
    expect(onsetTime(Float32Array.from([9, 9, ...rec]), 2, heightFor(qMid), P)).toBeCloseTo(10 - k - 0.5, 5);
  });
  it('onsetTime: just broken (the next level above the running maximum) runs to 0 at the running maximum', () => {
    // Level k broke 2 s ago; the section's running maximum is halfway (in log q) to level k + 1: a wave at the running
    // maximum breaks now (0 s), one at level k broke 2 s ago, between them log-linearly.
    const run = qMid;
    const rec = recOf(run, (_, j) => (j === k ? 2 : 5), () => 1);
    expect(onsetTime(rec, 0, heightFor(qk), P)).toBeCloseTo(2, 5);
    expect(onsetTime(rec, 0, heightFor(run), P)).toBeCloseTo(0, 5);
    expect(onsetTime(rec, 0, heightFor(qk * ONSET_LEVEL_RATIO ** 0.25), P)).toBeCloseTo(1, 5);
  });
  it("onsetHeight: the wave's height where its level broke, interpolated as the time is", () => {
    const rec = recOf(1.3, (_, j) => 10 - j, (_, j) => 2 + 0.1 * j);
    expect(onsetHeight(rec, 0, heightFor(qk), P)).toBeCloseTo(heightFor(qk) * (2 + 0.1 * k), 5);
    expect(onsetHeight(rec, 0, heightFor(qMid), P)).toBeCloseTo(heightFor(qMid) * (2 + 0.1 * k + 0.05), 5);
    expect(onsetHeight(recOf(0.2, () => 1, () => 1), 0, heightFor(0.3), P)).toBeNull();
    expect(ONSET_LEVELS).toBe(12);
    expect(ONSET_LEVEL_Q[ONSET_LEVELS - 1]).toBeGreaterThanOrEqual(1.34); // the field's largest running ratio
  });
  it('lifecycle without a record is the ratio alone (the curves as before)', () => {
    for (const r of [0.5, 0.8, 1, 1.3, 2, 5]) {
      const c = stageCurves(r, P);
      expect(lifecycle(r, undefined, 3, P)).toEqual({ steep: steepening(r, P), stage: breakingStage(r, P), drain: c.drain, collapse: c.collapse, pile: 0, pileReach: 0, surge: 1, decay: 1 });
    }
  });
  it('lifecycle is continuous across the onset, and from there only runs forward', () => {
    // A section that stood well past breaking (rMax 3; the peak reaches 3.4), whatever the ratio at the crest now.
    const H = 3, rMax = 3;
    for (const r of [0.7, 0.95, 1, 1.4, 3]) {
      const before = lifecycle(r, null, H, P, rMax), at0 = lifecycle(r, 0, H, P, rMax);
      if (r < 1) for (const k of ['steep', 'stage', 'drain'] as const) expect(at0[k], `${k} at r ${r}`).toBeCloseTo(before[k], 12);
      expect(at0.collapse).toBe(0);
      let prev = at0;
      for (let tb = 0.05; tb <= 6; tb += 0.05) {
        const lc = lifecycle(r, tb, H, P, rMax);
        for (const k of ['steep', 'stage', 'drain', 'collapse', 'pile', 'pileReach'] as const) expect(lc[k], `${k} at r ${r}, tb ${tb.toFixed(2)}`).toBeGreaterThanOrEqual(prev[k] - 1e-12);
        prev = lc;
      }
      expect(prev).toEqual({ steep: 1, stage: 1, drain: 1, collapse: 1, pile: 1, pileReach: 1, surge: 1, decay: prev.decay });
      expect(prev.decay, 'the pile has started to decay 6 s on').toBeLessThan(1);
    }
  });
  it('the pile rises over PILE_RISE_S from the landing, partial on a section that broke only a little', () => {
    const H = 3, land = landingEstimate(H, P);
    expect(lifecycle(3, land, H, P, 3).pile).toBe(0);
    expect(lifecycle(3, land + PILE_RISE_S, H, P, 3).pile).toBeCloseTo(breakingStage(3, P), 12);
    expect(lifecycle(1.1, land + PILE_RISE_S, H, P, 1.1).pile).toBeCloseTo(breakingStage(1.1, P), 12);
    expect(lifecycle(1.1, land + PILE_RISE_S, H, P, 1.1).pile).toBeLessThan(0.5);
    expect(lifecycle(0.9, null, H, P).pile).toBe(0);
  });
  it("the pile's top moves from the crest to the landing spot as the curl collapses (pileReach)", () => {
    const H = 3, land = landingEstimate(H, P), span = settleSpan(H, P);
    expect(lifecycle(3, land, H, P, 3).pileReach).toBe(0);
    expect(lifecycle(3, land + span / 2, H, P, 3).pileReach).toBeCloseTo(0.5, 12);
    expect(lifecycle(3, land + span, H, P, 3).pileReach).toBe(1);
  });
  it('the surge lifts the pile above the lip on the heaviest breaks only, then eases back', () => {
    const H = 3, land = landingEstimate(H, P);
    expect(lifecycle(3.4, land + SURGE_RISE_S, H, P, 3.4).surge).toBeCloseTo(1 + P.pileSurge, 12);
    expect(lifecycle(1.05, land + SURGE_RISE_S, H, P, 1.05).surge).toBeLessThan(1.001);
    expect(lifecycle(3.4, land + SURGE_RISE_S + SURGE_FALL_S, H, P, 3.4).surge).toBe(1);
    expect(lifecycle(3.4, land, H, P, 3.4).surge).toBe(1);
  });
  it('the pile halves every pileHalfM it rolls past the landing, and stays finite however long ago it broke', () => {
    const H = 3, land = landingEstimate(H, P);
    // The pile stands at the lip's height until it has risen; then it rolls on and decays.
    expect(lifecycle(3, land + PILE_RISE_S, H, P, 3).decay).toBe(1);
    expect(lifecycle(3, land + PILE_RISE_S + P.pileHalfM / PILE_SPEED_MS, H, P, 3).decay).toBeCloseTo(0.5, 12);
    for (const tb of [60, 1e6, Infinity]) { const d = lifecycle(3, tb, H, P, 3).decay; expect(Number.isFinite(d)).toBe(true); expect(d).toBeGreaterThanOrEqual(0); }
    let prev = 2;
    for (let tb = 0; tb <= 20; tb += 0.1) { const d = lifecycle(3, tb, H, P, 3).decay; expect(d).toBeLessThanOrEqual(prev); prev = d; }
  });
  it('lifecycle: the lip lands and the wave settles on time, whatever the reef does under the crest', () => {
    const H = 3, land = landingEstimate(H, P), span = settleSpan(H, P);
    for (const r of [0.2, 1, 4]) {
      expect(lifecycle(r, land, H, P, 3).collapse, 'nothing collapses before the lip lands').toBe(0);
      expect(lifecycle(r, land, H, P, 3).steep).toBe(1);
      expect(lifecycle(r, land + span, H, P, 3).collapse).toBe(1);
      expect(lifecycle(r, land + span / 2, H, P, 3).collapse).toBeCloseTo(0.5, 12);
    }
    // r ≥ 1 counts as broken where the record lags it: tb 0, continuous with the ratio.
    expect(lifecycle(1.2, null, H, P)).toEqual(lifecycle(1.2, 0, H, P));
    // How far it settles is how far the section got into its breaking stage: a shoulder that only just broke spills a
    // little and runs on; continuous in rMax, so a record that dips back under the level nudges it, never pops it.
    const settled = (rMax: number): number => lifecycle(1, land + span, H, P, rMax).collapse;
    expect(settled(1)).toBe(0);
    expect(settled(1 + P.stageSpan)).toBe(1);
    expect(settled(1 + P.stageSpan / 2)).toBeCloseTo(0.5, 12);
    for (let x = 1; x < 2; x += 0.01) expect(Math.abs(settled(x + 0.01) - settled(x))).toBeLessThan(0.03);
    // The ribbon's settle span and the sheet's are one function.
    expect(span).toBeCloseTo(P.collapseTime * landingTime(H * (1 + P.troughDrain * P.delta)), 12);
  });
});

describe('the whitewater pile (spec 2026-09-29 §3.2)', () => {
  it('smoothMax is max where a and b differ by k or more, C1 between, with ∂/∂a = dA', () => {
    expect(smoothMax(3, 1, 0.5)).toEqual({ value: 3, dA: 1 });
    expect(smoothMax(1, 3, 0.5)).toEqual({ value: 3, dA: 0 });
    for (const a of [-0.3, -0.1, 0, 0.1, 0.24]) {
      const h = 1e-6, num = (smoothMax(a + h, 0, 0.5).value - smoothMax(a - h, 0, 0.5).value) / (2 * h);
      expect(smoothMax(a, 0, 0.5).dA).toBeCloseTo(num, 5);
      expect(smoothMax(a, 0, 0.5).value).toBeGreaterThanOrEqual(Math.max(a, 0));
    }
  });
  it("the pile's floor is the bore's crest (β × the breaking depth, the crest's shape), whatever the crest's own height", () => {
    // The crest's height spikes along the crest where the reef focuses it; the floor must not (it drew steps in the pile).
    expect(settledCrestTop(1.5, 3, 4, 1, P)).toBeCloseTo(0.5 * P.beta * 4, 12);
    expect(settledCrestTop(2.0, 4, 4, 1, P)).toBeCloseTo(settledCrestTop(1.5, 3, 4, 1, P), 12);
    expect(settledCrestTop(1.5, 3, 4, 0.5, P)).toBeCloseTo(0.5 * settledCrestTop(1.5, 3, 4, 1, P), 12);
  });
  it("the pile's top is the lip's height, surged, halving every pileHalfM rolled, never below its floor", () => {
    const lc = (surge: number, decay: number): Lifecycle => ({ steep: 1, stage: 1, drain: 1, collapse: 1, pile: 1, pileReach: 1, surge, decay });
    expect(pileTop(2, 0.8, lc(1.3, 1))).toBeCloseTo(2.6, 12);
    expect(pileTop(2, 0.8, lc(1, 0.5))).toBeCloseTo(1, 12); // half the lip's height, pileHalfM on
    expect(pileTop(2, 0.8, lc(1, 0.25))).toBeCloseTo(0.8, 12); // decayed onto the bore
  });
  it('pileShape: 1 at its top, steep in front, a long back, slope continuous at the top', () => {
    const H = 3;
    expect(pileShape(0, H).g).toBe(1);
    expect(Math.abs(pileShape(0, H).dg)).toBe(0);
    expect(pileShape(H, H).g).toBeLessThan(pileShape(-H, H).g);
    for (const v of [-4, -1, 0.5, 2]) {
      const h = 1e-6;
      expect(pileShape(v, H).dg).toBeCloseTo((pileShape(v + h, H).g - pileShape(v - h, H).g) / (2 * h), 6);
    }
  });
  const lcFull: Lifecycle = { steep: 1, stage: 1, drain: 1, collapse: 1, pile: 1, pileReach: 1, surge: 1, decay: 1 };
  // A synthetic cross-section: η = 1.5·cos(0.1·a), the crest at a = 0, H 3.
  const inputAt = (a: number, lipTop = 2): BreakPointInput => ({
    theta: -0.1 * a, env: 1, uUnbroken: a, eta: 1.5 * Math.cos(0.1 * a), uCrest: 0, etaCrest: 1.5, H: 3, k: 0.1, hmin: 4, boreH: 3,
    slope: -0.15 * Math.sin(0.1 * a), dThetaDAhead: -0.1, dEnvDAhead: 0, crestConfidence: 1, lipTop, lipHeight: 3, lateral: 1,
  });
  it("at its top (PILE_LAND_H·H ahead once the curl has collapsed) the sheet stands at the pile's height, fully foamed", () => {
    const top = pileTop(2, settledCrestTop(1.5, 3, 4, 1, P), lcFull);
    expect(top).toBeCloseTo(2, 12); // decay 1, surge 1: the lip's own height
    const b = breakPoint(inputAt(PILE_LAND_H * 3), lcFull, P);
    expect(b.eta).toBeCloseTo(top, 6);
    expect(b.pile).toBeCloseTo(top, 6);
    expect(b.foam).toBeGreaterThan(0.99);
  });
  it("the pile fades a quarter period from its crest, as the crest's height does (the lookup is unreliable out there)", () => {
    // θ = ω·ξ: an eighth of a period behind the crest is θ = π/4, a quarter π/2.
    const at = (theta: number) => breakPoint({ ...inputAt(-3), theta }, lcFull, P);
    const none = (theta: number) => breakPoint({ ...inputAt(-3, 0), theta }, lcFull, P);
    expect(at(Math.PI / 5).pile).toBeGreaterThan(0);
    expect(at(Math.PI / 2 + 0.01).eta).toBe(none(Math.PI / 2 + 0.01).eta);
    expect(at(-Math.PI / 2 - 0.01).pile).toBe(0);
  });
  it('no pile where the floor is at or above the lip: the sheet is exactly as without it (a small wave in deep water)', () => {
    const floor = settledCrestTop(1.5, 3, 4, 1, P);
    for (const a of [-6, 0, 2, 3.6, 8]) {
      const low = breakPoint(inputAt(a, floor * 0.99), lcFull, P), none = breakPoint(inputAt(a, 0), lcFull, P);
      expect(low.eta).toBe(none.eta);
      expect(low.pile).toBe(0);
    }
  });
  it("breakPoint's slope with the pile matches central differences of its height", () => {
    const lc: Lifecycle = { steep: 1, stage: 1, drain: 1, collapse: 0.5, pile: 0.8, pileReach: 0.6, surge: 1.1, decay: 0.9 };
    // A 3 m lip, and a 12 m one whose back reaches the fade a quarter period behind the crest.
    for (const lipHeight of [3, 12]) {
      const inp = (a: number): BreakPointInput => ({ ...inputAt(a, lipHeight * 0.66), lipHeight });
      let worst = 0;
      for (let a = -20.03; a <= 20; a += 0.37) {
        const h = 1e-5;
        const num = (breakPoint(inp(a + h), lc, P).eta - breakPoint(inp(a - h), lc, P).eta) / (2 * h) - inp(a).slope;
        worst = Math.max(worst, Math.abs(num - breakPoint(inp(a), lc, P).dEtaDAhead));
      }
      expect(worst, `lip ${lipHeight} m`).toBeLessThan(2e-3);
    }
  });
});
