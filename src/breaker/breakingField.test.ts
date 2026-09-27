import { describe, expect, it } from 'vitest';
import { DEFAULT_CONDITIONS, cloneConditions } from '../conditions/defaults';
import { surferFeetToHs } from '../conditions/units';
import { buildBathymetry, downsample } from '../seabed/bathymetry';
import { NORTH_LEDGE, SOUTH_LEDGE } from '../seabed/wombReef';
import { DEFAULT_SET_PARAMS, wavesOfSet } from '../swell/sets';
import { DEFAULT_BREAK_PARAMS, RIBBON_FULL_OFFSET, boreScale, breakingHeightThreshold, stageCurves, steepening } from './breaking';
import { type Station, traceStations } from './crestTrace';
import { waveNumber } from './dispersion';
import type { FieldSample } from './fieldSample';
import { type ReefField, computeReefField, sampleField } from './reefField';
import {
  type ActiveWave, type BreakOptions, SEABED_CLEARANCE_M, type WaveContext, crestAt, crestStage, fieldBreakingHeight, fieldSteepeningHeight, localHeight,
  seabedFloor, sumWaves, toActiveWave, waveAt, waveAtCrest,
} from './setWaveModel';

// The app's field: 1 m cells, default swell and tide (~1 s to solve), shared by every test here.
const reef05 = buildBathymetry();
const field = computeReefField({ bed: downsample(reef05, 2), periodS: 15, fromDeg: 225, tideM: 0 });
const ctxOf = (f: ReefField): WaveContext => ({ omega: f.omega, travelX: f.far.dirX, travelZ: f.far.dirZ });
const ctx = ctxOf(field);
const optsFor = (f: ReefField, params = DEFAULT_BREAK_PARAMS): BreakOptions => ({ sample: (x, z) => sampleField(f, x, z), params });
/** The one breaking surface: the sheet the render draws and the probe reads. */
const sheet = optsFor(field);
const HS = surferFeetToHs(DEFAULT_CONDITIONS.swell.sizeFt);
const REF_SET = wavesOfSet(1, DEFAULT_CONDITIONS, DEFAULT_SET_PARAMS);
const REF_BIGGEST = REF_SET.reduce((a, b) => (b.heightM > a.heightM ? b : a));
/** A wave on the field's own period and direction, reaching the peak at t = 0: its crest is at (x, z) at t = τ(x, z). */
const testWave = (heightM: number): ActiveWave => ({ arrivalS: 0, heightM, omega: ctx.omega, travelX: ctx.travelX, travelZ: ctx.travelZ, crestLengthM: 400, crestOffsetM: 0 });
const at = (x: number, z: number): FieldSample => sampleField(field, x, z);
/** The stage a wave's crest has when it is at (x, z). */
const stageWhenCrestAt = (x: number, z: number, w: ActiveWave): number => crestStage(x, z, at(x, z).tau, at(x, z), w, ctx, sheet);

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
      expect(sumWaves(x, z, t, at(x, z), tiny, ctx, sheet)).toEqual(sumWaves(x, z, t, at(x, z), tiny, ctx));
    }
  });
  it('a lone wave in deep water, before it reaches the ledge, is exactly the Phase 1 wave', () => {
    const w = testWave(REF_BIGGEST.heightM);
    const crest = ray(0, 0, 100, 0)[0]; // 100 m seaward of the peak, on its ray
    for (let du = -50; du <= 50; du += 5) for (const side of [-30, 0, 30]) {
      const x = crest.x + at(0, 0).dirX * du - at(0, 0).dirZ * side, z = crest.z + at(0, 0).dirZ * du + at(0, 0).dirX * side;
      expect(waveAt(x, z, crest.tau, at(x, z), w, ctx, sheet)).toEqual(waveAt(x, z, crest.tau, at(x, z), w, ctx));
    }
  });
  it('breaking switched off is exactly the Phase 1 surface, even mid-barrel', () => {
    const off = optsFor(field, { ...DEFAULT_BREAK_PARAMS, enabled: false });
    const waves = REF_SET.map(toActiveWave);
    for (const [x, z] of grid) for (const dt of [-1, 0, 1, 2]) {
      const t = REF_BIGGEST.arrivalS + dt;
      expect(sumWaves(x, z, t, at(x, z), waves, ctx, off)).toEqual(sumWaves(x, z, t, at(x, z), waves, ctx));
    }
  });
});

describe('the field breaking height (SetWaves skips the GPU breaking below its steepening share)', () => {
  const nodeMin = (p = DEFAULT_BREAK_PARAMS) => {
    let best = { T: Infinity, x: 0, z: 0 };
    const g = field.grid;
    for (let r = 0; r < g.nz; r++) for (let c = 0; c < g.nx; c++) {
      const i = r * g.nx + c, T = breakingHeightThreshold(field.amp[i], field.hminBreak[i], p);
      if (T < best.T) best = { T, x: g.x0 + c * g.cellM, z: g.z0 + r * g.cellM };
    }
    return best;
  };
  for (const [name, p] of [['default params', DEFAULT_BREAK_PARAMS], ['γ 0.6, δ 0.5', { ...DEFAULT_BREAK_PARAMS, gamma: 0.6, delta: 0.5 }]] as const) {
    it(`is a lower bound that is nearly attained (${name})`, () => {
      const hb = fieldBreakingHeight(field, p), n = nodeMin(p);
      expect(hb).toBeGreaterThan(0);
      expect(hb).toBeLessThanOrEqual(n.T);
      // Loose by up to ~30%: a cell's bound pairs its largest amp with its smallest breaking depth, and the breaking
      // depth grows with amp (it is amp over the smoothed amp/hmin), so no node has both.
      expect(hb).toBeGreaterThan(0.6 * n.T);
      // Just above the best node's threshold, a crest there breaks.
      const w = testWave(1.01 * n.T), o = optsFor(field, p);
      expect(crestStage(n.x, n.z, at(n.x, n.z).tau, at(n.x, n.z), w, ctx, o)).toBeGreaterThan(0);
    });
    it(`its steepening share (ribbonOnset + RIBBON_FULL_OFFSET of it) bounds the sheet: a wave no taller is exactly the Phase 1 surface everywhere, far field included (${name})`, { timeout: 60_000 }, () => {
      const hs = fieldSteepeningHeight(field, p);
      expect(hs).toBeCloseTo((p.ribbonOnset + RIBBON_FULL_OFFSET) * fieldBreakingHeight(field, p), 12);
      const w = [testWave(hs)], o = optsFor(field, p);
      for (let x = -400; x <= 300; x += 12.5) for (let z = -600; z <= 300; z += 12.5) for (const t of [-20, -5, 0, 4, 12]) {
        expect(sumWaves(x, z, t, at(x, z), w, ctx, o)).toEqual(sumWaves(x, z, t, at(x, z), w, ctx));
      }
    });
  }
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
  it('the breaking fades in and out along the crest over wave heights, not metres (no square channels, no right-angled bowl)', { timeout: 30_000 }, () => {
    // The sheet's three breaking weights along the crest of the biggest set wave, at 5 and 6.6 ft (Andrew's review), from
    // before the peak breaks to the right's closeout: the steepest change of each per wave height of crest, between
    // stations under 2 m apart. The old ratio gave 1.4–2.0 (sharpening), 2.4–5.0 (drain) and 2.7–8.3 (collapse): the
    // drain's walls and the collapse's step were a metre or two wide.
    const bounds = { steep: 1.0, drain: 0.7, collapse: 0.6 };
    const worst = { steep: 0, drain: 0, collapse: 0 };
    for (const sizeFt of [5, 6.6]) {
      const c = cloneConditions(DEFAULT_CONDITIONS);
      c.swell.sizeFt = sizeFt;
      const w = testWave(wavesOfSet(1, c, DEFAULT_SET_PARAMS).reduce((a, b) => (b.heightM > a.heightM ? b : a)).heightM);
      for (const t of [-0.5, 0, 0.75, 1.5, 3]) {
        const st = traceStations(field, [w], t, ctx, { cameraX: 12, cameraZ: -32, params: DEFAULT_BREAK_PARAMS, minHeightM: 0 })
          .filter((s): s is Station => !s.gap).sort((a, b) => a.arc - b.arc);
        const weights = st.map((s) => ({ steep: steepening(s.r, DEFAULT_BREAK_PARAMS), ...stageCurves(s.r, DEFAULT_BREAK_PARAMS) }));
        for (let i = 1; i < st.length; i++) {
          const d = st[i].arc - st[i - 1].arc;
          if (!(d > 0 && d < 2)) continue;
          for (const k of ['steep', 'drain', 'collapse'] as const) {
            worst[k] = Math.max(worst[k], (Math.abs(weights[i][k] - weights[i - 1][k]) / d) * st[i].H);
          }
        }
      }
    }
    for (const k of ['steep', 'drain', 'collapse'] as const) expect(worst[k], k).toBeLessThanOrEqual(bounds[k]);
    expect(worst.drain, 'the drain changes somewhere').toBeGreaterThan(0.1);
  });
});

describe('the breaking sheet on the real reef', () => {
  const P = DEFAULT_BREAK_PARAMS;
  it('the back of a breaking wave is its unbroken back', () => {
    // The biggest default wave at the peak, 0.5 s after it arrives there (testWave: arrival 0, crest at τ = t).
    const w = testWave(REF_BIGGEST.heightM), t = 0.5;
    const line = ray(0, 0, 40, 40);
    const j = line.findIndex((p) => p.tau >= t);
    const crestArc = (j - 1 + (t - line[j - 1].tau) / (line[j].tau - line[j - 1].tau)) * 0.5;
    const crestHere = crestAt(line[j].x, line[j].z, t, at(line[j].x, line[j].z), w, ctx, sheet)!;
    expect(crestHere.s, 'the wave is breaking at the peak').toBeGreaterThan(0);
    let checked = 0;
    line.forEach((p, i) => {
      const behind = crestArc - i * 0.5;
      if (behind < 0.5 || behind > 20) return;
      const f = at(p.x, p.z), c = crestAt(p.x, p.z, t, f, w, ctx, sheet)!;
      // η = (Phase 1 η − drain × drainShape) × boreScale, and drainShape is 0 behind the crest: no sinking.
      const scale = boreScale(localHeight(w, c.f), c.f.hminBreak, stageCurves(c.r, P).collapse, P);
      const broken = sumWaves(p.x, p.z, t, f, [w], ctx, sheet).eta, unbroken = sumWaves(p.x, p.z, t, f, [w], ctx).eta;
      expect(Math.abs(broken - unbroken * scale), `${behind.toFixed(1)} m behind the crest`).toBeLessThan(1e-3);
      checked++;
    });
    expect(checked).toBeGreaterThanOrEqual(38);
  });
  it('a wave two or more periods from a point leaves it alone (its sharpening needs a found crest)', () => {
    // The reference set 0.3 s after the biggest wave's arrival, over the inside of the reef (shoreward of the peak), where
    // the later waves' crests are still one to five wavelengths seaward. Their crest lookups there don't converge (two
    // half-wavelength steps), and a wave's envelope is below 0.2% at 2 periods: breaking must add nothing visible.
    const t = REF_BIGGEST.arrivalS + 0.3;
    const waves = REF_SET.map(toActiveWave);
    let checked = 0, worst = 0, where = '';
    for (let x = 60; x <= 200; x += 10) for (let z = -120; z <= 40; z += 20) {
      const f = at(x, z);
      for (const w of waves) {
        const xi = t - w.arrivalS - f.tau - ((w.travelX - ctx.travelX) * x + (w.travelZ - ctx.travelZ) * z) / (ctx.omega / f.k);
        if (Math.abs(xi) < (2 * 2 * Math.PI) / w.omega) continue;
        const d = Math.abs(waveAt(x, z, t, f, w, ctx, sheet).eta - waveAt(x, z, t, f, w, ctx).eta);
        if (d > worst) { worst = d; where = `(${x}, ${z}) ξ ${xi.toFixed(1)} s`; }
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(100);
    expect(worst, where).toBeLessThan(5e-3);
  });
  it('the face stands up before it breaks', () => {
    // On the north ledge, where the crest's breaking ratio reaches 0.85 (unbroken, steepening), 2 m ahead of the crest.
    const w = testWave(REF_BIGGEST.heightM);
    const [px, pz] = along(NORTH_LEDGE, 100, 10)[3];
    const line = ray(px, pz, 60, 30);
    const crests = line.map((p) => crestAt(p.x, p.z, p.tau, at(p.x, p.z), w, ctx, sheet)!);
    const j = crests.findIndex((c) => c.r >= 0.85);
    expect(j, 'the crest reaches r = 0.85 on this ray').toBeGreaterThan(0);
    expect(crests[j].r).toBeLessThan(0.9);
    expect(crests[j].s).toBe(0);
    const t = line[j].tau, q = line[j + 4];
    const f = at(q.x, q.z), H = localHeight(w, at(line[j].x, line[j].z));
    const drop = sumWaves(q.x, q.z, t, f, [w], ctx).eta - sumWaves(q.x, q.z, t, f, [w], ctx, sheet).eta;
    expect(drop).toBeGreaterThanOrEqual(0.1 * H);
  });
  // The analytic slope against central differences. Differencing the live sheet on the real reef is not a valid test:
  // Phase 1's slope already omits the field's gradients (amp and the hmin cap change by up to 0.5 per m over reef heads
  // and the ledge), and the breaking derivative is taken at a fixed crest while the crest frame (r, s) varies along the
  // crest (the peel, the collapse). So the check is (A) the live sheet on a uniform field, where the model's assumptions
  // hold, and (A′) on the real reef, the sheet's own model: the field frozen per point and every crest held fixed.
  /**
   * The Eulerian slope (per metre of the displaced surface, as the render's normal needs) from central differences of
   * the displaced surface point P(x, z) = (x + dx, η, z + dz): Δη = sx·ΔX + sz·ΔZ over the x and z stencils, solved.
   */
  const differencedSlope = (P: (x: number, z: number) => number[], x: number, z: number, h: number): [number, number] => {
    const [xp, xm, zp, zm] = [P(x + h, z), P(x - h, z), P(x, z + h), P(x, z - h)];
    const [aX, aE, aZ] = [xp[0] - xm[0], xp[1] - xm[1], xp[2] - xm[2]], [bX, bE, bZ] = [zp[0] - zm[0], zp[1] - zm[1], zp[2] - zm[2]];
    const det = aX * bZ - aZ * bX;
    return [(aE * bZ - aZ * bE) / det, (aX * bE - aE * bX) / det];
  };
  it("the sheet's slope matches central differences of its height (uniform field)", () => {
    // Steepening (ρ 0.87), breaking (ρ 1.14, 1.29, 1.25) and collapsed (ρ 1.75), on a field uniform in everything but τ.
    const cases: [number, number, number, number][] = [[15, 7, 6, 2.3], [15, 7, 6, 3.0], [15, 7, 6, 3.4], [12, 5, 4, 2.2], [15, 7, 6, 4.6]]; // period, depth, hmin, height
    let worstJ = 0;
    const ratios: number[] = [];
    for (const [T, depth, hmin, height] of cases) {
      const omega = (2 * Math.PI) / T, k = waveNumber(omega, depth), c = omega / k;
      const dirX = Math.cos(0.4), dirZ = Math.sin(0.4);
      const fAt = (x: number, z: number): FieldSample => ({ tau: (x * dirX + z * dirZ) / c, amp: 1, hmin, hminBreak: hmin, k, dirX, dirZ, depth });
      const w: ActiveWave = { arrivalS: 0, heightM: height, omega, travelX: dirX, travelZ: dirZ, crestLengthM: 400, crestOffsetM: 0 };
      const cx: WaveContext = { omega, travelX: dirX, travelZ: dirZ };
      const o: BreakOptions = { sample: fAt, params: DEFAULT_BREAK_PARAMS };
      const P3 = (t: number) => (px: number, pz: number) => { const q = sumWaves(px, pz, t, fAt(px, pz), [w], cx, o); return [px + q.dx, q.eta, pz + q.dz]; };
      ratios.push(crestAt(0, 0, 0, fAt(0, 0), w, cx, o)!.r);
      const rows: { s0: number; t: number; ax: number; az: number; nx: number; nz: number }[] = [];
      for (const t of [0.3, 1.5]) for (let s0 = -40; s0 <= 40; s0 += 0.37) {
        const x = s0 * dirX + 3 * dirZ, z = s0 * dirZ - 3 * dirX, h = 0.01;
        const c0 = crestAt(x, z, t, fAt(x, z), w, cx, o)!;
        if (Math.abs((x - c0.x) * dirX + (z - c0.z) * dirZ) < 0.05) continue;
        const [nx, nz] = differencedSlope(P3(t), x, z, h);
        const r = sumWaves(x, z, t, fAt(x, z), [w], cx, o);
        rows.push({ s0, t, ax: r.slopeX, az: r.slopeZ, nx, nz });
        // How far the along-travel Jacobian is from 1 here: the Eulerian correction must be exercised.
        const along = (P3(t)(x + h * dirX, z + h * dirZ)[0] - P3(t)(x - h * dirX, z - h * dirZ)[0]) / (2 * h * dirX);
        worstJ = Math.max(worstJ, Math.abs(along - 1));
      }
      const maxSlope = Math.max(...rows.flatMap((q) => [Math.abs(q.nx), Math.abs(q.nz)]));
      for (const q of rows) {
        const label = `T ${T} height ${height} at ${q.s0.toFixed(2)} m, t ${q.t}`;
        expect(Math.abs(q.ax - q.nx), `slopeX ${label}`).toBeLessThan(0.03 * maxSlope + 2e-3);
        expect(Math.abs(q.az - q.nz), `slopeZ ${label}`).toBeLessThan(0.03 * maxSlope + 2e-3);
      }
    }
    expect(Math.min(...ratios), 'a steepening case').toBeLessThan(1);
    expect(Math.max(...ratios), 'a collapsed case').toBeGreaterThan(1 + DEFAULT_BREAK_PARAMS.stageSpan);
    expect(worstJ, 'J ≠ 1 somewhere').toBeGreaterThan(0.1);
  });
  it("the sheet's slope matches its own model's derivative on the real reef (field frozen, crests fixed)", () => {
    const waves = REF_SET.map(toActiveWave);
    let seed = 20260927;
    const rand = (): number => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
    const h = 0.02;
    const rows: { x: number; z: number; t: number; ax: number; az: number; nx: number; nz: number }[] = [];
    let nearCrest = 0, breakingPart = 0;
    while (rows.length + nearCrest < 300) {
      // Around the peak, up the north ledge and along the south ledge, through the biggest wave's break.
      const x = -30 + 90 * rand(), z = -110 + 150 * rand(), t = REF_BIGGEST.arrivalS - 1 + 4 * rand();
      const f0 = at(x, z);
      const crests = waves.map((w) => crestAt(x, z, t, f0, w, ctx, sheet));
      // Within 5 cm of a crest the stencil straddles ahead = 0, where the sharpening's one-sided definition begins.
      if (crests.some((c) => Math.abs((x - c!.x) * f0.dirX + (z - c!.z) * f0.dirZ) < 0.05)) {
        nearCrest++;
        continue;
      }
      // The field frozen at this point's sample, τ shifted to first order along its ray; every wave keeps this point's crest.
      const frozen = (px: number, pz: number): FieldSample => ({ ...f0, tau: f0.tau + (f0.k / ctx.omega) * (f0.dirX * (px - x) + f0.dirZ * (pz - z)) });
      const sum = (px: number, pz: number, o?: BreakOptions) => {
        const out = { eta: 0, dx: 0, dz: 0, slopeX: 0, slopeZ: 0 };
        waves.forEach((w, i) => {
          const r = waveAtCrest(px, pz, t, frozen(px, pz), w, ctx, o ? crests[i] : null, o);
          out.eta += r.eta; out.dx += r.dx; out.dz += r.dz; out.slopeX += r.slopeX; out.slopeZ += r.slopeZ;
        });
        if (out.eta < seabedFloor(f0)) { out.eta = seabedFloor(f0); out.slopeX = 0; out.slopeZ = 0; }
        return out;
      };
      const r = sum(x, z, sheet), unbroken = sum(x, z);
      // The frozen model at the point is the sheet itself.
      expect(r.eta).toBeCloseTo(sumWaves(x, z, t, f0, waves, ctx, sheet).eta, 9);
      breakingPart = Math.max(breakingPart, Math.abs(r.slopeX - unbroken.slopeX), Math.abs(r.slopeZ - unbroken.slopeZ));
      const [nx, nz] = differencedSlope((px, pz) => { const q = sum(px, pz, sheet); return [px + q.dx, q.eta, pz + q.dz]; }, x, z, h);
      rows.push({ x, z, t, ax: r.slopeX, az: r.slopeZ, nx, nz });
    }
    const maxSlope = Math.max(...rows.flatMap((q) => [Math.abs(q.nx), Math.abs(q.nz)]));
    expect(maxSlope, 'the sample reaches the steep face').toBeGreaterThan(0.3);
    expect(breakingPart, 'breaking changes the slope somewhere').toBeGreaterThan(0.3);
    for (const q of rows) {
      const where = `(${q.x.toFixed(2)}, ${q.z.toFixed(2)}) arrival + ${(q.t - REF_BIGGEST.arrivalS).toFixed(2)} s`;
      expect(Math.abs(q.ax - q.nx), `slopeX at ${where}`).toBeLessThan(0.05 * maxSlope + 2e-3);
      expect(Math.abs(q.az - q.nz), `slopeZ at ${where}`).toBeLessThan(0.05 * maxSlope + 2e-3);
    }
  });
  it("the probe's fixed-point search converges with the front sharpening", () => {
    // HeightProbe's loop (4 iterations of x0 ← x − d(x0)) at 50 lineup positions around the peak, through the break.
    const waves = REF_SET.map(toActiveWave);
    const positions: [number, number][] = [];
    for (let u = -20; u <= 25; u += 5) for (let side = -20; side <= 20; side += 10) {
      positions.push([at(0, 0).dirX * u - at(0, 0).dirZ * side, at(0, 0).dirZ * u + at(0, 0).dirX * side]);
    }
    expect(positions.length).toBe(50);
    for (const dt of [0, 0.5, 1, 2]) for (const [px, pz] of positions) {
      const t = REF_BIGGEST.arrivalS + dt;
      const disp = (x: number, z: number) => sumWaves(x, z, t, at(x, z), waves, ctx, sheet);
      let ox = px, oz = pz;
      for (let i = 0; i < 4; i++) { const d = disp(ox, oz); ox = px - d.dx; oz = pz - d.dz; }
      const d = disp(ox, oz);
      expect(Math.hypot(ox + d.dx - px, oz + d.dz - pz), `(${px.toFixed(1)}, ${pz.toFixed(1)}) arrival + ${dt} s`).toBeLessThan(0.01);
    }
  });
});

describe('the breaking surface has no seams across the crest', () => {
  // Each wave's crest is looked up along the wave's own travel direction (the same at every point), so neighbouring
  // points find neighbouring crests. Along each point's field ray instead, the lookup fanned out where the rays turn
  // just shoreward of the peak and cut ~1 m trenches along the crest (x 18–30, z −5…−9). A seam is a jump: it does not
  // shrink as the points close in. So the check is at 1 cm, where the old lookup's seams stepped 0.19–0.38 m, and on the
  // displaced surface's (dx, η, dz). And the power: a steep but continuous surface's excess shrinks with the spacing, a
  // seam's does not, so the worst pairs are re-measured a quarter as far apart and must shrink by at least 2× (the old
  // lookup's 0.18 m at 4 mm would fail this).
  it('1 cm apart, breaking adds at most 0.15 m to Phase 1’s 3D step, and the worst pairs shrink ≥ 2× at 2.5 mm', { timeout: 120_000 }, () => {
    const waves = REF_SET.map(toActiveWave);
    const h = 0.01;
    const pos = (x: number, z: number, t: number, o?: BreakOptions): [number, number, number] => {
      const r = sumWaves(x, z, t, at(x, z), waves, ctx, o);
      return [x + r.dx, r.eta, z + r.dz];
    };
    const gap = (a: number[], b: number[]): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    /** Breaking's addition to the distance between the surface points of (x, z) and (x, z) + d. */
    const excessAt = (x: number, z: number, dx: number, dz: number, t: number, o: BreakOptions): number =>
      gap(pos(x, z, t, o), pos(x + dx, z + dz, t, o)) - gap(pos(x, z, t), pos(x + dx, z + dz, t));
    for (const dt of [0, 1]) {
      const t = REF_BIGGEST.arrivalS + dt;
      const pairs: { x: number; z: number; dx: number; dz: number; e: number }[] = [];
      for (let x = 0; x <= 40 + 1e-9; x += 0.5) for (let z = -15; z <= 5 + 1e-9; z += 0.5) {
        for (const [dx, dz] of [[h, 0], [0, h]]) pairs.push({ x, z, dx, dz, e: excessAt(x, z, dx, dz, t, sheet) });
      }
      pairs.sort((p, q) => q.e - p.e);
      const w = pairs[0];
      expect(w.e, `arrival + ${dt} s, worst (${w.x}, ${w.z}) + (${w.dx}, ${w.dz})`).toBeLessThanOrEqual(0.15);
      for (const p of pairs.slice(0, 20).filter((q) => q.e > 0.005)) {
        const quarter = excessAt(p.x, p.z, p.dx / 4, p.dz / 4, t, sheet);
        expect(quarter, `arrival + ${dt} s, (${p.x}, ${p.z}): ${p.e.toFixed(4)} m at 1 cm`).toBeLessThanOrEqual(p.e / 2);
      }
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
        const r = sumWaves(x, z, peakT + dt, sampleField(f, x, z), set, cx, o);
        for (const v of Object.values(r)) expect(Number.isFinite(v)).toBe(true);
        expect(Math.abs(r.eta)).toBeLessThanOrEqual(1.2 * tallest);
        for (const v of [r.foam, r.stage]) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
      }
    }
  });
  it('the surface never goes below the seabed: η ≥ −(depth − 0.05) at 12 ft / 25 s / −1.5 m tide, flat where clamped', { timeout: 60_000 }, () => {
    const c = cloneConditions(DEFAULT_CONDITIONS);
    c.swell.sizeFt = 12; c.swell.periodS = 25; c.tideM = -1.5;
    const f = computeReefField({ bed: downsample(reef05, 4), periodS: 25, fromDeg: 225, tideM: -1.5 });
    const cx = ctxOf(f);
    const set = wavesOfSet(1, c, DEFAULT_SET_PARAMS).map(toActiveWave);
    const peakT = set.reduce((a, b) => (b.heightM > a.heightM ? b : a)).arrivalS;
    // (90, −140): 0.07 m of water beside a big crest, where the unclamped drain read η −2.87 m.
    const points: [number, number][] = [[90, -140]];
    for (let x = -60; x <= 110; x += 10) for (let z = -150; z <= 60; z += 10) points.push([x, z]);
    // Per variant: Phase 1 (breaking off), the sheet.
    const clamped = [0, 0];
    for (const [x, z] of points) for (let dt = -4; dt <= 6; dt += 0.5) {
      const fs = sampleField(f, x, z), floor = -(fs.depth - SEABED_CLEARANCE_M), t = peakT + dt;
      const variants = [sumWaves(x, z, t, fs, set, cx), sumWaves(x, z, t, fs, set, cx, optsFor(f))];
      variants.forEach((r, i) => {
        expect(r.eta, `variant ${i} at (${x}, ${z}), peak + ${dt} s, depth ${fs.depth.toFixed(3)}`).toBeGreaterThanOrEqual(floor - 1e-9);
        if (r.eta <= floor + 1e-9) {
          clamped[i]++;
          // Where the clamp holds the surface on the floor, the floor is flat: the slope is 0 there.
          expect([r.slopeX, r.slopeZ], `slope at clamped (${x}, ${z}), peak + ${dt} s`).toEqual([0, 0]);
        }
      });
    }
    // The sheet reaches the bed at this extreme: its clamp is exercised, not vacuous. Phase 1 does not (it reads 0 here):
    // its height is capped at 0.78·hmin, so its trough stays above the bed and the clamp there is a guard.
    expect(clamped[1]).toBeGreaterThan(0);
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
  it('the Break sliders at their ends keep the surface finite (γ, δ, Δ, β, trough drain, face width, ribbon onset)', () => {
    const waves = REF_SET.map(toActiveWave);
    const ends: Partial<typeof DEFAULT_BREAK_PARAMS>[] = [
      { gamma: 0.5 }, { gamma: 1.2 }, { delta: 0 }, { delta: 2 }, { stageSpan: 0.2 }, { stageSpan: 4 }, { beta: 0.1 }, { beta: 0.8 },
      { troughDrain: 0 }, { troughDrain: 1 }, { faceWidth: 0.1 }, { faceWidth: 3 }, { ribbonOnset: 0.3 }, { ribbonOnset: 0.9 },
    ];
    for (const end of ends) {
      const o = optsFor(field, { ...DEFAULT_BREAK_PARAMS, ...end });
      for (let u = -20; u <= 30; u += 2.5) for (const dt of [0, 0.5, 1, 3]) {
        const x = at(0, 0).dirX * u, z = at(0, 0).dirZ * u;
        const r = sumWaves(x, z, REF_BIGGEST.arrivalS + dt, at(x, z), waves, ctx, o);
        for (const v of Object.values(r)) expect(Number.isFinite(v), JSON.stringify(end)).toBe(true);
        expect(Math.abs(r.eta)).toBeLessThan(10);
      }
    }
  });
});
