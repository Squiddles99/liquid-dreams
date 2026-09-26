import { describe, expect, it } from 'vitest';
import { smoothstep } from '../math/smoothstep';
import {
  type BreakParams, DEFAULT_BREAK_PARAMS, MIN_STAGE_SPAN, boreHeight, boreScale, breakPoint, breakingRatio, breakingStage,
  FOAM_LIP_TOLERANCE, LIP_BACK_REACH, drainDepth, drainShape, faceHeight, foamWeight, lipWeight, normalizeBreakParams, sharpenDrop, stageCurves,
} from './breaking';
import { waveNumber } from './dispersion';

const P = DEFAULT_BREAK_PARAMS;
type Pt = [number, number];

/** Per point of a section: its foam, its unbroken distance ahead of the crest (m), its phase θ, and how far it is still
 * turned (φ / Θmax: 0 on the water, up to 1 on the thrown lip). */
interface PointInfo { foam: number; ahead: number; theta: number; unlanded: number }

/**
 * One wave's cross-section along its travel, built from the Phase 1 formulas (setWaveModel.waveAt with lateral = 1)
 * plus breakPoint at stage s. Returns (along-travel position, height) points from behind the crest to ahead of it,
 * the index of the crest point (the lip tip once it curls), and each point's PointInfo.
 */
function section(s: number, H: number, hmin: number, periodS: number, includeCurl = true, p: BreakParams = P): { pts: Pt[]; tip: number; info: PointInfo[] } {
  const omega = (2 * Math.PI) / periodS, k = waveNumber(omega, hmin), c = omega / k;
  const A = H / 2, sigma = Math.max(Math.tanh(k * hmin), 0.05);
  const B = Math.min(0.35, (k * A * (3 - sigma * sigma)) / (4 * sigma ** 3));
  const width = (0.8 * 2 * Math.PI) / omega;
  const nearBreaking = smoothstep(0.3, 0.78, H / hmin);
  const pitchOf = (aE: number) => Math.min(0.3 * nearBreaking, 0.12 / Math.max(k * aE, 1e-4));
  const etaCrest = A * (1 + B), uCrest = pitchOf(A) * etaCrest;
  const quarter = Math.PI / (2 * k), dv = quarter / 200;
  const pts: Pt[] = [];
  const info: PointInfo[] = [];
  const cv = stageCurves(s, p);
  let tip = 0;
  for (let v0 = -3 * quarter; v0 <= 3 * quarter + 1e-9; v0 += dv) {
    const xi = -v0 / c, theta = omega * xi, env = Math.exp(-((xi / width) ** 2));
    const aE = A * env, eta = aE * (Math.cos(theta) + B * Math.cos(2 * theta));
    const dh = Math.min(aE, 0.6 / k) * Math.sin(theta) + pitchOf(aE) * eta;
    const b = breakPoint({ theta, env, uUnbroken: v0 + dh, eta, uCrest, etaCrest, H, k, hmin }, s, p, includeCurl);
    if (Math.abs(v0) < dv / 2) tip = pts.length;
    pts.push([v0 + dh + b.du, b.eta]);
    // breakPoint's own lip weight for the point (the height it curls from: sharpened and drained, as breakPoint does).
    const ahead = v0 + dh - uCrest;
    const sharpened = includeCurl ? eta - sharpenDrop(ahead, eta, etaCrest, H, k, cv.steep, p) : eta;
    const drained = sharpened - drainDepth(H, cv.drain, p) * drainShape(theta) * env;
    info.push({ foam: b.foam, ahead, theta, unlanded: cv.curl * lipWeight(ahead, drained, etaCrest, H, p) * (1 - cv.collapse) });
  }
  return { pts, tip, info };
}

/** For each point, whether the vertical line through it crosses the curve 3 or more times: under the lip, the lip
 * itself, and the tube's inside (the face and trough the lip overhangs). */
function inOverhang(pts: Pt[]): boolean[] {
  return pts.map(([u]) => {
    let n = 0;
    for (let j = 0; j + 1 < pts.length; j++) {
      const [u1] = pts[j], [u2] = pts[j + 1];
      if (u1 !== u2 && (u1 - u) * (u2 - u) <= 0) n++;
    }
    return n >= 3;
  });
}

/** True if two non-adjacent segments of the polyline properly cross. */
function selfIntersects(pts: Pt[]): boolean {
  const cross = (ax: number, ay: number, bx: number, by: number) => ax * by - ay * bx;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
    for (let j = i + 2; j + 1 < pts.length; j++) {
      const [x3, y3] = pts[j], [x4, y4] = pts[j + 1];
      if (Math.max(x3, x4) < Math.min(x1, x2) || Math.min(x3, x4) > Math.max(x1, x2)) continue;
      if (Math.max(y3, y4) < Math.min(y1, y2) || Math.min(y3, y4) > Math.max(y1, y2)) continue;
      const d1 = cross(x2 - x1, y2 - y1, x3 - x1, y3 - y1), d2 = cross(x2 - x1, y2 - y1, x4 - x1, y4 - y1);
      const d3 = cross(x4 - x3, y4 - y3, x1 - x3, y1 - y3), d4 = cross(x4 - x3, y4 - y3, x2 - x3, y2 - y3);
      if (d1 * d2 < 0 && d3 * d4 < 0) return true;
    }
  }
  return false;
}

/** How far the curve doubles back along travel: 0 for a single-valued surface, the tube's depth once it overhangs. */
function overhang(pts: Pt[]): number {
  let front = -Infinity, back = 0;
  for (const [u] of pts) { front = Math.max(front, u); back = Math.max(back, front - u); }
  return back;
}

/** Height of the lip tip above the nearest surface below it (Infinity if nothing is below). */
function gapBelowTip(pts: Pt[], tip: number): number {
  const [tu, te] = pts[tip];
  let below = -Infinity;
  for (let j = 0; j + 1 < pts.length; j++) {
    if (Math.abs(j - tip) < 3) continue;
    const [u1, e1] = pts[j], [u2, e2] = pts[j + 1];
    if ((u1 - tu) * (u2 - tu) > 0) continue;
    const e = u1 === u2 ? e1 : e1 + ((e2 - e1) * (tu - u1)) / (u2 - u1);
    if (e < te) below = Math.max(below, e);
  }
  return te - below;
}

// Height, hmin, period: the default biggest wave at the peak, the onset height, big and small, shelf, extremes.
const CASES: [number, number, number][] = [[3.16, 6.02, 15], [2.64, 6, 15], [4.5, 6, 18], [3, 4, 12], [1.5, 2, 8], [8.6, 12, 25], [0.8, 1.5, 6]];
const STAGES = Array.from({ length: 21 }, (_, i) => i / 20);

describe('breaking criterion and stage', () => {
  it('breaks once H ≥ 0.44·hmin (γ = 0.78, δ = 1): about 2.6 m over the 6 m ledge', () => {
    expect(breakingRatio(0.43 * 6, 6, P)).toBeLessThan(1);
    expect(breakingRatio(0.45 * 6, 6, P)).toBeGreaterThan(1);
  });
  it('floors the drained depth, so a wave taller than the water stays finite', () => {
    expect(breakingRatio(5, 2, P)).toBeCloseTo(5 / (0.78 * 0.3), 9);
    expect(breakingRatio(0, 6, P)).toBe(0);
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
  it('stage curves run in order: drain and steepening first, then curl, then collapse', () => {
    const at = (s: number) => stageCurves(s, P);
    expect(at(0)).toEqual({ steep: 0, drain: 0, curl: 0, collapse: 0 });
    expect(at(0.25).drain).toBe(1);
    expect(at(0.15).curl).toBe(0);
    expect(at(0.75).collapse).toBe(0);
    expect(at(1)).toEqual({ steep: 1, drain: 1, curl: 1, collapse: 1 });
  });
});

describe('breaking shape (sampled cross-sections)', () => {
  it('stage 0 is the Phase 1 point exactly', () => {
    const i = { theta: -0.2, env: 0.9, uUnbroken: 3.4, eta: 1.2, uCrest: 0.4, etaCrest: 1.8, H: 3, k: 0.055, hmin: 6 };
    expect(breakPoint(i, 0, P, true)).toEqual({ du: 0, eta: 1.2, foam: 0, lip: 0 });
  });
  it('never crosses itself at any stage', { timeout: 60_000 }, () => {
    for (const [H, hmin, T] of CASES) for (const s of STAGES) {
      // The spec allows the tube-closing contact near s = 0.75; the default shape doesn't need it.
      expect(selfIntersects(section(s, H, hmin, T).pts), `H ${H} hmin ${hmin} T ${T} s ${s}`).toBe(false);
    }
  });
  it('throws a lip that makes a tube (overhang ≥ H by s = 0.6) and nearly closes it at s = 0.75 (the tip within H/4 of the water below)', () => {
    for (const [H, hmin, T] of CASES) {
      expect(overhang(section(0.6, H, hmin, T).pts)).toBeGreaterThanOrEqual(H);
      const closing = section(0.75, H, hmin, T);
      expect(gapBelowTip(closing.pts, closing.tip)).toBeLessThanOrEqual(0.25 * H);
    }
  });
  it('collapses to a low bore at s = 1: little overhang, crest to trough within the drained bore height', () => {
    for (const [H, hmin, T] of CASES) {
      const { pts } = section(1, H, hmin, T);
      expect(overhang(pts)).toBeLessThanOrEqual(0.3 * H);
      const range = Math.max(...pts.map(([, e]) => e)) - Math.min(...pts.map(([, e]) => e));
      expect(range).toBeLessThanOrEqual(Math.min(H, boreHeight(hmin, P)) * (1 + P.troughDrain * P.delta));
    }
  });
  it('no foam on the curled lip (top or underside) or inside the tube; foam behind the crest once collapsed', { timeout: 60_000 }, () => {
    for (const [H, hmin, T] of CASES) {
      const label = `H ${H} hmin ${hmin} T ${T}`;
      // Until the lip lands (s ≤ 0.8), nothing at all: the curled lip at s = 0.6 included.
      for (const s of STAGES.filter((x) => x <= 0.8)) for (const q of section(s, H, hmin, T).info) expect(q.foam, `${label} s ${s}`).toBe(0);
      // Landing and unrolling (the tube still there): none on any point still turned, none in the overhang (the lip, its
      // underside and the tube's inside) and none ahead of the crest.
      for (const s of [0.83, 0.85, 0.88, 0.9]) {
        const { pts, info } = section(s, H, hmin, T);
        const over = inOverhang(pts);
        info.forEach((q, i) => {
          if (q.unlanded >= FOAM_LIP_TOLERANCE || over[i] || q.ahead >= 0) expect(q.foam, `${label} s ${s} point ${i}`).toBe(0);
        });
        expect(Math.max(...info.map((q) => q.foam)), `${label} s ${s}: foam has begun behind the crest`).toBeGreaterThan(0);
      }
      // Collapsed: white from the crest back over the bore (within the envelope), clear half a wavelength behind.
      const done = section(1, H, hmin, T).info;
      for (const q of done.filter((x) => x.theta >= 0 && x.theta <= Math.PI / 2 && x.ahead <= 0)) expect(q.foam, label).toBeGreaterThan(0.5);
      for (const q of done.filter((x) => x.theta >= Math.PI)) expect(q.foam, label).toBe(0);
    }
  });
  it("the lip is the crest's front: points more than LIP_BACK_REACH·H behind the crest never turn", () => {
    for (const [H, hmin, T] of CASES) for (const s of [0.45, 0.6, 0.75]) {
      for (const q of section(s, H, hmin, T).info) if (q.ahead <= -LIP_BACK_REACH * H) expect(q.unlanded).toBe(0);
    }
  });
  it('the probe variant (no curl) stays single-valued at every stage', () => {
    for (const [H, hmin, T] of CASES) for (const s of STAGES) expect(overhang(section(s, H, hmin, T, false).pts)).toBe(0);
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
    const at = (s: number, theta: number, ahead: number, w = 0) => foamWeight(theta, ahead, H, 1, w, stageCurves(s, P), P);
    for (const s of [0, 0.3, 0.6, 0.75, 0.8]) expect(at(s, 0.5, -2)).toBe(0); // the lip is still in the air or landing
    expect(at(1, 0.5, -2)).toBe(1); // collapsed, behind the crest
    expect(at(1, 0, 0)).toBe(1); // collapsed, at the crest
    expect(at(1, -0.1, P.faceWidth * H)).toBe(0); // down the bore's face, past its front edge
    expect(at(1, 4, -40)).toBe(0); // more than half a wavelength behind
    expect(at(0.88, -0.02, 0.3)).toBe(0); // the tube still open: nothing ahead of the crest (the tube's inside)
    expect(at(0.88, 0.2, -2, 1)).toBe(0); // the curled lip itself
  });
  it('face height is H unbroken and H·(1 + troughDrain·δ) once drained', () => {
    expect(faceHeight(3, 0, P)).toBe(3);
    expect(faceHeight(3, 0.5, P)).toBeCloseTo(3 * (1 + P.troughDrain * P.delta), 12);
  });
  it('every output stays finite for extreme inputs', () => {
    for (const [H, hmin, T] of [[0.001, 0.05, 4], [8.6, 0.05, 25], [0.2, 30, 25]] as const) for (const s of STAGES) {
      for (const [u, e] of section(s, H, hmin, T).pts) expect(Number.isFinite(u) && Number.isFinite(e)).toBe(true);
    }
  });
});

describe('normalizeBreakParams', () => {
  it('repairs out-of-range and non-finite values and orders the curl window', () => {
    const p = { ...P, stageSpan: 0, gamma: Number.NaN, thetaMaxDeg: 400, curlStart: 0.8, curlEnd: 0.5, lipZone: 0 } as BreakParams;
    normalizeBreakParams(p);
    expect(p.stageSpan).toBe(MIN_STAGE_SPAN);
    expect(p.gamma).toBe(P.gamma);
    expect(p.thetaMaxDeg).toBe(180);
    expect(p.curlEnd).toBeGreaterThan(p.curlStart);
    expect(p.lipZone).toBeGreaterThan(0);
  });
  it('leaves the defaults unchanged', () => {
    const p = { ...P };
    normalizeBreakParams(p);
    expect(p).toEqual(P);
  });
});
