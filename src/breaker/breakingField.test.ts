import { describe, expect, it } from 'vitest';
import { DEFAULT_CONDITIONS, cloneConditions } from '../conditions/defaults';
import { surferFeetToHs } from '../conditions/units';
import { buildBathymetry, downsample } from '../seabed/bathymetry';
import { NORTH_LEDGE, SOUTH_LEDGE } from '../seabed/wombReef';
import { DEFAULT_SET_PARAMS, wavesOfSet } from '../swell/sets';
import { DEFAULT_BREAK_PARAMS } from './breaking';
import type { FieldSample } from './fieldSample';
import { type ReefField, computeReefField, sampleField } from './reefField';
import {
  type ActiveWave, type BreakOptions, SEABED_CLEARANCE_M, type WaveContext, crestStage, localHeight, sumWaves, sumWavesWithNormal, toActiveWave,
  waveAt,
} from './setWaveModel';

// The app's field: 1 m cells, default swell and tide (~1 s to solve), shared by every test here.
const reef05 = buildBathymetry();
const field = computeReefField({ bed: downsample(reef05, 2), periodS: 15, fromDeg: 225, tideM: 0 });
const ctxOf = (f: ReefField): WaveContext => ({ omega: f.omega, travelX: f.far.dirX, travelZ: f.far.dirZ });
const ctx = ctxOf(field);
const optsFor = (f: ReefField, includeCurl = true, params = DEFAULT_BREAK_PARAMS): BreakOptions => ({ sample: (x, z) => sampleField(f, x, z), params, includeCurl });
const render = optsFor(field);
const probe = optsFor(field, false);
const HS = surferFeetToHs(DEFAULT_CONDITIONS.swell.sizeFt);
const REF_SET = wavesOfSet(1, DEFAULT_CONDITIONS, DEFAULT_SET_PARAMS);
const REF_BIGGEST = REF_SET.reduce((a, b) => (b.heightM > a.heightM ? b : a));
/** A wave on the field's own period and direction, reaching the peak at t = 0: its crest is at (x, z) at t = τ(x, z). */
const testWave = (heightM: number): ActiveWave => ({ arrivalS: 0, heightM, omega: ctx.omega, travelX: ctx.travelX, travelZ: ctx.travelZ, crestLengthM: 400, crestOffsetM: 0 });
const at = (x: number, z: number): FieldSample => sampleField(field, x, z);
/** The stage a wave's crest has when it is at (x, z). */
const stageWhenCrestAt = (x: number, z: number, w: ActiveWave): number => crestStage(x, z, at(x, z).tau, at(x, z), w, ctx, render);

/** Points along the ray through (px, pz), from `backM` seaward to `aheadM` shoreward, 0.5 m apart. */
function ray(px: number, pz: number, backM: number, aheadM: number): { x: number; z: number; tau: number }[] {
  const step = 0.5;
  let x = px, z = pz;
  for (let d = 0; d < backM; d += step) { const s = at(x, z); x -= s.dirX * step; z -= s.dirZ * step; }
  const out: { x: number; z: number; tau: number }[] = [];
  for (let d = 0; d <= backM + aheadM + 1e-9; d += step) { const s = at(x, z); out.push({ x, z, tau: s.tau }); x += s.dirX * step; z += s.dirZ * step; }
  return out;
}
const along = (line: readonly (readonly [number, number])[], metres: number, step: number): [number, number][] => {
  const [a, b] = [line[0], line[1]];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const out: [number, number][] = [];
  for (let s = 0; s <= metres + 1e-9; s += step) out.push([a[0] + ((b[0] - a[0]) * s) / len, a[1] + ((b[1] - a[1]) * s) / len]);
  return out;
};
/** When the crest first breaks (s > 0) on the ray through a ledge point, as arrival time τ (s); Infinity if it doesn't within ±40 m. */
const onsetTau = (px: number, pz: number, w: ActiveWave): number =>
  Math.min(...ray(px, pz, 40, 40).filter((p) => stageWhenCrestAt(p.x, p.z, w) > 0).map((p) => p.tau));

describe('breaking reduces to Phase 1', () => {
  const grid: [number, number][] = [];
  for (let x = -120; x <= 100; x += 20) for (let z = -160; z <= 80; z += 20) grid.push([x, z]);
  it('a 5 cm swell never breaks at mid tide (the shallowest water is 1.5 m): exactly the Phase 1 surface', () => {
    const tiny = [testWave(0.05)];
    for (const [x, z] of grid) for (const t of [-5, 0, 3, 8]) {
      expect(sumWaves(x, z, t, at(x, z), tiny, ctx, render)).toEqual(sumWaves(x, z, t, at(x, z), tiny, ctx));
    }
  });
  it('a lone wave in deep water, before it reaches the ledge, is exactly the Phase 1 wave', () => {
    const w = testWave(REF_BIGGEST.heightM);
    const crest = ray(0, 0, 100, 0)[0]; // 100 m seaward of the peak, on its ray
    for (let du = -50; du <= 50; du += 5) for (const side of [-30, 0, 30]) {
      const x = crest.x + at(0, 0).dirX * du - at(0, 0).dirZ * side, z = crest.z + at(0, 0).dirZ * du + at(0, 0).dirX * side;
      expect(waveAt(x, z, crest.tau, at(x, z), w, ctx, render)).toEqual(waveAt(x, z, crest.tau, at(x, z), w, ctx));
    }
  });
  it('breaking switched off is exactly the Phase 1 surface, even mid-barrel', () => {
    const off = optsFor(field, true, { ...DEFAULT_BREAK_PARAMS, enabled: false });
    const waves = REF_SET.map(toActiveWave);
    for (const [x, z] of grid) for (const dt of [-1, 0, 1, 2]) {
      const t = REF_BIGGEST.arrivalS + dt;
      expect(sumWaves(x, z, t, at(x, z), waves, ctx, off)).toEqual(sumWaves(x, z, t, at(x, z), waves, ctx));
    }
  });
});

describe('where and when the A-frame breaks (default swell, mid tide)', () => {
  it('a 1.1·Hs wave does not break at the ledge (peak, north and south ledges); 1.3·Hs and 1.8·Hs waves do, at the peak', () => {
    const ledgePoints: [number, number][] = [[0, 0], ...along(NORTH_LEDGE, 100, 10), ...along(SOUTH_LEDGE, 40, 5)];
    for (const [px, pz] of ledgePoints) {
      const seaward = ray(px, pz, 40, 0);
      const worst = Math.max(...seaward.map((p) => stageWhenCrestAt(p.x, p.z, testWave(1.1 * HS))));
      expect(worst, `seaward of ledge point (${px.toFixed(1)}, ${pz.toFixed(1)})`).toBe(0);
    }
    expect(stageWhenCrestAt(0, 0, testWave(1.3 * HS))).toBeGreaterThan(0);
    expect(stageWhenCrestAt(0, 0, testWave(1.8 * HS))).toBeGreaterThan(0);
  });
  it('the left peels north along the ledge at the field rate, 8–20 m/s (the biggest set factor, 1.8·Hs)', () => {
    const w = testWave(1.8 * HS);
    const onset = along(NORTH_LEDGE, 100, 10).map(([x, z]) => onsetTau(x, z, w));
    for (let i = 1; i < onset.length; i++) expect(onset[i]).toBeGreaterThan(onset[i - 1]);
    const rate = 100 / (onset[onset.length - 1] - onset[0]);
    expect(rate).toBeGreaterThanOrEqual(8);
    expect(rate).toBeLessThanOrEqual(20);
  });
  it('the right closes out: the south ledge’s first 40 m breaks within 1.5 s', () => {
    for (const w of [testWave(REF_BIGGEST.heightM), testWave(1.8 * HS)]) {
      const onset = along(SOUTH_LEDGE, 40, 5).map(([x, z]) => onsetTau(x, z, w));
      expect(Math.max(...onset) - Math.min(...onset)).toBeLessThanOrEqual(1.5);
    }
  });
  it('the biggest default wave takes 0.6–1.5 s from onset to tube closure at the peak (spec §3.1)', () => {
    const w = testWave(REF_BIGGEST.heightM);
    const path = ray(0, 0, 60, 60).map((p) => ({ ...p, s: stageWhenCrestAt(p.x, p.z, w) }));
    const onset = path.find((p) => p.s > 0)!, closed = path.find((p) => p.s >= 0.75)!;
    expect(closed.tau - onset.tau).toBeGreaterThanOrEqual(0.6);
    expect(closed.tau - onset.tau).toBeLessThanOrEqual(1.5);
  });
  it('the tide moves the break: at low tide the biggest wave breaks earlier, at high tide later', { timeout: 30_000 }, () => {
    const onsetAtPeak = (tideM: number): number => {
      const f = tideM === 0 ? field : computeReefField({ bed: downsample(reef05, 2), periodS: 15, fromDeg: 225, tideM });
      const o = optsFor(f), cx = ctxOf(f), w = testWave(REF_BIGGEST.heightM);
      let x = 0, z = 0;
      for (let d = 0; d < 40; d += 0.5) { const s = sampleField(f, x, z); x -= s.dirX * 0.5; z -= s.dirZ * 0.5; }
      for (let d = 0; d <= 80; d += 0.5) {
        const s = sampleField(f, x, z);
        if (crestStage(x, z, s.tau, s, w, cx, o) > 0) return s.tau;
        x += s.dirX * 0.5; z += s.dirZ * 0.5;
      }
      return Infinity;
    };
    const low = onsetAtPeak(-1.5), mid = onsetAtPeak(0), high = onsetAtPeak(1.5);
    // Measured: −0.72, −0.32 and +0.59 s. At least 0.2 s apart, so a tide that barely moved the break would fail.
    expect(mid - low).toBeGreaterThanOrEqual(0.2);
    expect(high - mid).toBeGreaterThanOrEqual(0.2);
  });
  it('a section does not un-break in the barrel zone (40 m seaward to 20 m inside the ledges)', () => {
    const starts = [...along(NORTH_LEDGE, 100, 5), ...along(SOUTH_LEDGE, 40, 5)];
    for (const w of [testWave(REF_BIGGEST.heightM), testWave(1.8 * HS)]) for (const [px, pz] of starts) {
      let prev = 0, total = 0;
      for (const p of ray(px, pz, 40, 20)) {
        const s = stageWhenCrestAt(p.x, p.z, w);
        expect(prev - s).toBeLessThanOrEqual(0.03);
        total += Math.max(0, prev - s);
        prev = s;
      }
      expect(total).toBeLessThanOrEqual(0.1);
    }
  });
});

describe('the breaking surface on the real reef', () => {
  const waves = REF_SET.map(toActiveWave);
  const dir = at(0, 0);
  // The ray through the peak, 40 m either side, every 5 cm: a true cross-section, since every point on one ray finds
  // the same crest (a straight line would cut across the crest at an angle where the ray bends).
  const peakRay: { x: number; z: number; arc: number }[] = [];
  {
    let x = 0, z = 0;
    for (let d = 0; d < 40; d += 0.05) { const s = at(x, z); x -= s.dirX * 0.05; z -= s.dirZ * 0.05; }
    for (let arc = -40; arc <= 40 + 1e-9; arc += 0.05) { peakRay.push({ x, z, arc }); const s = at(x, z); x += s.dirX * 0.05; z += s.dirZ * 0.05; }
  }
  /** The surface along the peak ray at time t: (distance along the ray + displacement along it, height) points. */
  const crossSection = (t: number, o: BreakOptions, only: ActiveWave[] = waves): [number, number][] =>
    peakRay.map(({ x, z, arc }) => {
      const f = at(x, z), r = sumWaves(x, z, t, f, only, ctx, o);
      return [arc + r.dx * f.dirX + r.dz * f.dirZ, r.eta];
    });
  const overhang = (pts: [number, number][]) => { let front = -Infinity, back = 0; for (const [u] of pts) { front = Math.max(front, u); back = Math.max(back, front - u); } return back; };
  const selfIntersects = (pts: [number, number][]): boolean => {
    const cross = (ax: number, ay: number, bx: number, by: number) => ax * by - ay * bx;
    for (let i = 0; i + 1 < pts.length; i++) for (let j = i + 2; j + 1 < pts.length; j++) {
      const [x1, y1] = pts[i], [x2, y2] = pts[i + 1], [x3, y3] = pts[j], [x4, y4] = pts[j + 1];
      if (Math.max(x3, x4) < Math.min(x1, x2) || Math.min(x3, x4) > Math.max(x1, x2) || Math.max(y3, y4) < Math.min(y1, y2) || Math.min(y3, y4) > Math.max(y1, y2)) continue;
      if (cross(x2 - x1, y2 - y1, x3 - x1, y3 - y1) * cross(x2 - x1, y2 - y1, x4 - x1, y4 - y1) < 0 && cross(x4 - x3, y4 - y3, x1 - x3, y1 - y3) * cross(x4 - x3, y4 - y3, x2 - x3, y2 - y3) < 0) return true;
    }
    return false;
  };
  const times = [-0.5, 0, 0.3, 0.6, 0.9, 1.2, 1.5, 2.5, 4].map((dt) => REF_BIGGEST.arrivalS + dt);
  it('the biggest wave barrels through the peak without its surface crossing itself', { timeout: 60_000 }, () => {
    let deepest = 0;
    for (const t of times) {
      const pts = crossSection(t, render, [toActiveWave(REF_BIGGEST)]);
      expect(selfIntersects(pts), `t = arrival ${(t - REF_BIGGEST.arrivalS).toFixed(1)} s`).toBe(false);
      deepest = Math.max(deepest, overhang(pts));
    }
    expect(deepest).toBeGreaterThan(2);
  });
  it('the probe surface through the same barrel stays single-valued, with no lip', () => {
    for (const t of times) {
      expect(overhang(crossSection(t, probe))).toBe(0);
      for (let u = -20; u <= 20; u += 1) expect(sumWaves(dir.dirX * u, dir.dirZ * u, t, at(dir.dirX * u, dir.dirZ * u), waves, ctx, probe).lip).toBe(0);
    }
  });
  it('the normal is up on flat water, matches the height derivative on small waves, and faces down under the lip', () => {
    expect(sumWavesWithNormal(-300, 0, 0, at(-300, 0), [], ctx, render, 0.25).normal).toEqual([0, 1, 0]);
    const small = [testWave(0.1)];
    for (const x of [-200, -150]) {
      const f = at(x, 0), t = f.tau + 1.3;
      const n = sumWavesWithNormal(x, 0, t, f, small, ctx, render, 0.05).normal;
      const a = waveAt(x, 0, t, f, small[0], ctx);
      expect(Math.abs(-n[0] / n[1] - a.slopeX)).toBeLessThan(0.05 * Math.abs(a.slopeX) + 2e-4);
    }
    let lowest = 1;
    for (const t of times.slice(2, 7)) for (let u = -10; u <= 15; u += 0.25) {
      const x = dir.dirX * u, z = dir.dirZ * u;
      lowest = Math.min(lowest, sumWavesWithNormal(x, z, t, at(x, z), waves, ctx, render, 0.1).normal[1]);
    }
    expect(lowest).toBeLessThan(0);
  });
});

describe('the breaking surface has no seams across the crest', () => {
  // Each wave's crest is looked up along the wave's own travel direction (the same at every point), so neighbouring
  // points find neighbouring crests. Along each point's field ray instead, the lookup fanned out where the rays turn
  // just shoreward of the peak and cut ~1 m trenches along the crest (x 18–30, z −5…−9). A seam is a jump: it does not
  // shrink as the points close in. The breaking shape itself is steep there (the collapse front and the curl add
  // 0.4–3.5 m to a 0.5 m step, but only 2–8 cm to a 1 cm one), so the check is at 1 cm, where the old lookup's seams
  // stepped 0.19–0.38 m.
  it('1 cm apart, breaking adds at most 0.15 m to Phase 1’s height step (0.5 m grid, x 0…40, z −15…5; probe and render)', { timeout: 60_000 }, () => {
    const waves = REF_SET.map(toActiveWave);
    const h = 0.01;
    for (const dt of [0, 1]) for (const o of [probe, render]) {
      const t = REF_BIGGEST.arrivalS + dt;
      let worst = 0, where = '';
      for (let x = 0; x <= 40 + 1e-9; x += 0.5) for (let z = -15; z <= 5 + 1e-9; z += 0.5) {
        const f = at(x, z), a = sumWaves(x, z, t, f, waves, ctx, o).eta, a1 = sumWaves(x, z, t, f, waves, ctx).eta;
        for (const [qx, qz] of [[x + h, z], [x, z + h]]) {
          const fq = at(qx, qz), b = sumWaves(qx, qz, t, fq, waves, ctx, o).eta, b1 = sumWaves(qx, qz, t, fq, waves, ctx).eta;
          const excess = Math.abs(a - b) - Math.abs(a1 - b1);
          if (excess > worst) { worst = excess; where = `(${x}, ${z}) to (${qx}, ${qz})`; }
        }
      }
      expect(worst, `${o.includeCurl ? 'render' : 'probe'} at arrival + ${dt} s, worst ${where}`).toBeLessThanOrEqual(0.15);
    }
  });
});

describe('breaking stays finite and bounded', () => {
  it('extremes: 12 ft / 25 s at −1.5 m tide, and 0.5 ft', { timeout: 60_000 }, () => {
    for (const [sizeFt, periodS, tideM] of [[12, 25, -1.5], [0.5, 15, 0]] as const) {
      const c = cloneConditions(DEFAULT_CONDITIONS);
      c.swell.sizeFt = sizeFt; c.swell.periodS = periodS; c.tideM = tideM;
      const f = computeReefField({ bed: downsample(reef05, 4), periodS, fromDeg: 225, tideM });
      const o = optsFor(f), cx = ctxOf(f);
      const set = wavesOfSet(1, c, DEFAULT_SET_PARAMS).map(toActiveWave);
      const peakT = set.reduce((a, b) => (b.heightM > a.heightM ? b : a)).arrivalS;
      // No point strays from still water by more than 1.2 × the tallest local wave anywhere on the grid (measured: 0.83
      // and 0.81 of it), so a surface counted twice (about 1.6×) fails.
      let tallest = 0;
      for (let x = -60; x <= 110; x += 10) for (let z = -150; z <= 60; z += 10) {
        for (const w of set) tallest = Math.max(tallest, localHeight(w, sampleField(f, x, z)));
      }
      for (let x = -60; x <= 110; x += 10) for (let z = -150; z <= 60; z += 10) for (let dt = -10; dt <= 10; dt += 2.5) {
        const r = sumWavesWithNormal(x, z, peakT + dt, sampleField(f, x, z), set, cx, o, 0.25);
        for (const v of [r.eta, r.dx, r.dz, r.foam, r.lip, r.stage, ...r.normal]) expect(Number.isFinite(v)).toBe(true);
        expect(Math.abs(r.eta)).toBeLessThanOrEqual(1.2 * tallest);
        for (const v of [r.foam, r.lip, r.stage]) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
      }
    }
  });
  it('the surface never goes below the seabed: η ≥ −(depth − 0.05) at 12 ft / 25 s / −1.5 m tide', { timeout: 60_000 }, () => {
    const c = cloneConditions(DEFAULT_CONDITIONS);
    c.swell.sizeFt = 12; c.swell.periodS = 25; c.tideM = -1.5;
    const f = computeReefField({ bed: downsample(reef05, 4), periodS: 25, fromDeg: 225, tideM: -1.5 });
    const cx = ctxOf(f);
    const set = wavesOfSet(1, c, DEFAULT_SET_PARAMS).map(toActiveWave);
    const peakT = set.reduce((a, b) => (b.heightM > a.heightM ? b : a)).arrivalS;
    // (90, −140): 0.07 m of water beside a big crest, where the unclamped drain read η −2.87 m.
    const points: [number, number][] = [[90, -140]];
    for (let x = -60; x <= 110; x += 10) for (let z = -150; z <= 60; z += 10) points.push([x, z]);
    // Per variant: Phase 1 (breaking off), the probe, the render.
    const clamped = [0, 0, 0];
    let flat = 0;
    for (const [x, z] of points) for (let dt = -4; dt <= 6; dt += 0.5) {
      const fs = sampleField(f, x, z), floor = -(fs.depth - SEABED_CLEARANCE_M), t = peakT + dt;
      const render = sumWavesWithNormal(x, z, t, fs, set, cx, optsFor(f), 0.25);
      const variants = [sumWaves(x, z, t, fs, set, cx), sumWaves(x, z, t, fs, set, cx, optsFor(f, false)), render];
      variants.forEach((r, i) => {
        expect(r.eta, `variant ${i} at (${x}, ${z}), peak + ${dt} s, depth ${fs.depth.toFixed(3)}`).toBeGreaterThanOrEqual(floor - 1e-9);
        if (r.eta <= floor + 1e-9) clamped[i]++;
      });
      if (render.eta <= floor + 1e-9) {
        // A clamped point's normal is finite, unit and faces up; where its neighbours are clamped too it is exactly flat.
        const [nx, ny, nz] = render.normal;
        expect(Number.isFinite(nx) && Number.isFinite(ny) && Number.isFinite(nz)).toBe(true);
        expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1, 9);
        expect(ny, `normal at clamped (${x}, ${z}), peak + ${dt} s`).toBeGreaterThan(0);
        if (ny > 1 - 1e-9) flat++;
      }
    }
    // The breaking variants reach the bed at this extreme: their clamps are exercised, not vacuous. Phase 1 does not (it
    // reads 0 here): its height is capped at 0.78·hmin, so its trough stays above the bed and the clamp there is a guard.
    expect(clamped[1]).toBeGreaterThan(0);
    expect(clamped[2]).toBeGreaterThan(0);
    expect(flat).toBeGreaterThan(0);
  });
  it('unusual swell directions (from the land, along the coast) stay finite with breaking on', { timeout: 60_000 }, () => {
    for (const fromDeg of [0, 90, 180, 270]) {
      const f = computeReefField({ bed: downsample(reef05, 4), periodS: 15, fromDeg, tideM: 0 });
      const c = cloneConditions(DEFAULT_CONDITIONS);
      c.swell.directionDeg = fromDeg;
      const set = wavesOfSet(1, c, DEFAULT_SET_PARAMS).map(toActiveWave);
      for (let x = -80; x <= 100; x += 20) for (let z = -120; z <= 60; z += 20) for (const dt of [-3, 0, 3]) {
        const r = sumWaves(x, z, set[2].arrivalS + dt, sampleField(f, x, z), set, ctxOf(f), optsFor(f));
        for (const v of Object.values(r)) expect(Number.isFinite(v)).toBe(true);
      }
    }
  });
  it('the Break sliders at their ends keep the surface finite (γ, δ, Δ, Θmax, β, trough drain)', () => {
    const waves = REF_SET.map(toActiveWave);
    const ends: Partial<typeof DEFAULT_BREAK_PARAMS>[] = [
      { gamma: 0.5 }, { gamma: 1.2 }, { delta: 0 }, { delta: 2 }, { stageSpan: 0.2 }, { stageSpan: 4 },
      { thetaMaxDeg: 0 }, { thetaMaxDeg: 180 }, { beta: 0.1 }, { beta: 0.8 }, { troughDrain: 0 }, { troughDrain: 1 },
    ];
    for (const end of ends) {
      const o = optsFor(field, true, { ...DEFAULT_BREAK_PARAMS, ...end });
      for (let u = -20; u <= 30; u += 2.5) for (const dt of [0, 0.5, 1, 3]) {
        const x = at(0, 0).dirX * u, z = at(0, 0).dirZ * u;
        const r = sumWavesWithNormal(x, z, REF_BIGGEST.arrivalS + dt, at(x, z), waves, ctx, o, 0.25);
        for (const v of [r.eta, r.dx, r.dz, r.foam, r.lip, r.stage, ...r.normal]) expect(Number.isFinite(v), JSON.stringify(end)).toBe(true);
        expect(Math.abs(r.eta)).toBeLessThan(10);
      }
    }
  });
  it('the probe’s fixed-point search converges on a breaking wave (4 iterations, as HeightProbe runs)', () => {
    const waves = REF_SET.map(toActiveWave);
    for (const dt of [0, 0.5, 1, 2]) for (let u = -15; u <= 15; u += 2.5) for (const side of [-10, 0, 10]) {
      const t = REF_BIGGEST.arrivalS + dt;
      const px = at(0, 0).dirX * u - at(0, 0).dirZ * side, pz = at(0, 0).dirZ * u + at(0, 0).dirX * side;
      const disp = (x: number, z: number) => sumWaves(x, z, t, at(x, z), waves, ctx, probe);
      let ox = px, oz = pz;
      for (let i = 0; i < 4; i++) { const d = disp(ox, oz); ox = px - d.dx; oz = pz - d.dz; }
      const d = disp(ox, oz);
      expect(Math.hypot(ox + d.dx - px, oz + d.dz - pz)).toBeLessThan(0.05);
    }
  });
});
