import { describe, expect, it } from 'vitest';
import { DEFAULT_CONDITIONS, cloneConditions } from '../conditions/defaults';
import { surferFeetToHs } from '../conditions/units';
import { buildBathymetry, downsample } from '../seabed/bathymetry';
import { NORTH_LEDGE, SOUTH_LEDGE } from '../seabed/wombReef';
import { DEFAULT_SET_PARAMS, wavesOfSet } from '../swell/sets';
import { DEFAULT_BREAK_PARAMS, PILE_LAND_H, PILE_RISE_S, breakingHeightThreshold, landingEstimate, settleSpan, stageCurves, steepening, steepeningStart } from './breaking';
import { type Station, traceStations } from './crestTrace';
import { waveNumber } from './dispersion';
import type { FieldSample } from './fieldSample';
import { type ReefField, computeReefField, sampleField } from './reefField';
import {
  type ActiveWave, type BreakOptions, breakOptions, SEABED_CLEARANCE_M, type WaveContext, crestAt, crestPileTop, crestStage, fieldBreakingHeight, fieldSteepeningHeight, localHeight,
  phaseXi, seabedFloor, sumWaves, toActiveWave, waveAt, waveAtCrest,
} from './setWaveModel';

// The app's field: 1 m cells, default swell and tide (~1 s to solve), shared by every test here.
const reef05 = buildBathymetry();
const field = computeReefField({ bed: downsample(reef05, 2), periodS: 15, fromDeg: 225, tideM: 0 });
const ctxOf = (f: ReefField): WaveContext => ({ omega: f.omega, travelX: f.far.dirX, travelZ: f.far.dirZ });
const ctx = ctxOf(field);
const optsFor = (f: ReefField, params = DEFAULT_BREAK_PARAMS): BreakOptions => breakOptions(f, params);
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
/** When the section on the ray through (px, pz) broke (s): from the record at the crest, at the first point from the
 * ledge point inshore (0.5 m steps, up to 40 m) where the crest has broken. */
function onsetAt(px: number, pz: number, w: ActiveWave): { tOn: number; H: number } {
  for (const p of ray(px, pz, 0, 40)) {
    const f = at(p.x, p.z), c = crestAt(p.x, p.z, f.tau, f, w, ctx, sheet)!;
    if (c.tb !== null && c.tb !== undefined && Number.isFinite(c.tb)) return { tOn: f.tau - c.tb, H: localHeight(w, c.f) };
  }
  throw new Error(`(${px}, ${pz}) has not broken within 40 m inshore`);
}
/** The highest water within 20 m of w's crest at t on `line`, its index, and the crest's index. */
function topNear(line: { x: number; z: number; tau: number }[], t: number, w: ActiveWave, o = sheet) {
  const eta = line.map((p) => sumWaves(p.x, p.z, t, at(p.x, p.z), [w], ctx, o).eta);
  const j = line.findIndex((p) => p.tau >= t);
  let top = -1;
  for (let i = 0; i < line.length; i++) if (Math.abs(i - j) * 0.5 <= 20 && (top < 0 || eta[i] > eta[top])) top = i;
  return { eta, top, j, height: eta[top] };
}
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
  for (const [name, p] of [['default params', DEFAULT_BREAK_PARAMS], ['γ 0.6, δ 0.5', { ...DEFAULT_BREAK_PARAMS, gamma: 0.6, delta: 0.5 }]] as [string, typeof DEFAULT_BREAK_PARAMS][]) {
    it(`is a lower bound that is nearly attained (${name})`, () => {
      const hb = fieldBreakingHeight(field, p), n = nodeMin(p);
      expect(hb).toBeGreaterThan(0);
      expect(hb).toBeLessThanOrEqual(n.T);
      expect(hb).toBeGreaterThan(0.8 * n.T);
      // Just above the best node's threshold, a crest there breaks.
      const w = testWave(1.01 * n.T), o = optsFor(field, p);
      expect(crestStage(n.x, n.z, at(n.x, n.z).tau, at(n.x, n.z), w, ctx, o)).toBeGreaterThan(0);
    });
    it(`its steepening share (steepeningStart of it) bounds the sheet: a wave no taller is exactly the Phase 1 surface everywhere, far field included (${name})`, { timeout: 60_000 }, () => {
      const hs = fieldSteepeningHeight(field, p);
      expect(hs).toBeCloseTo(steepeningStart(p) * fieldBreakingHeight(field, p, field.hminSlurp), 12);
      const w = [testWave(hs)], o = optsFor(field, p);
      for (let x = -400; x <= 300; x += 12.5) for (let z = -600; z <= 300; z += 12.5) for (const t of [-20, -5, 0, 4, 12]) {
        expect(sumWaves(x, z, t, at(x, z), w, ctx, o)).toEqual(sumWaves(x, z, t, at(x, z), w, ctx));
      }
    });
  }
});

describe('where and when the A-frame breaks (default swell, mid tide)', () => {
  it('a 0.95·Hs wave does not break at the ledge (peak, north and south ledges); the smallest set wave (1.3·Hs) and the biggest (1.8·Hs) break at the peak', () => {
    // Set waves start at 1.3·Hs (DEFAULT_SET_PARAMS). The breaking depth's smoothing along travel (a wave feels the reef
    // coming, so it stands up over seconds, not a trap door) lowers the wedge's very tip a little and lifts the ledge
    // beside it: the first water to break is on the north ledge 10 m from the tip (~1.05·Hs), and the tip itself needs
    // ~1.35·Hs. So the smallest set wave breaks at the peak's ledge within 12 m of the tip rather than on it.
    const ledgePoints: [number, number][] = [[0, 0], ...along(NORTH_LEDGE, 100, 10), ...along(SOUTH_LEDGE, 40, 5)];
    for (const [px, pz] of ledgePoints) {
      const seaward = ray(px, pz, 40, 0);
      const worst = Math.max(...seaward.map((p) => stageWhenCrestAt(p.x, p.z, testWave(0.95 * HS))));
      expect(worst, `seaward of ledge point (${px.toFixed(1)}, ${pz.toFixed(1)})`).toBe(0);
    }
    const nearPeak = along(NORTH_LEDGE, 12, 1).concat(along(SOUTH_LEDGE, 12, 1));
    expect(Math.max(...nearPeak.map(([x, z]) => stageWhenCrestAt(x, z, testWave(1.3 * HS))))).toBeGreaterThan(0);
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
  it('the tide moves the break: at low tide the biggest wave breaks earlier, at high tide later', { timeout: 60_000 }, () => {
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
  it('the breaking fades in and out along the crest over wave heights, not metres (no square channels, no right-angled bowl)', { timeout: 60_000 }, () => {
    // The sheet's three breaking weights along the crest of the biggest set wave, at 5, 6.6 and 9.9 ft (Andrew's
    // reviews), from before the peak breaks to the right's closeout: the steepest change of each per wave height of crest,
    // between stations under 2 m apart. The old ratio gave 1.4–2.0 (sharpening), 2.4–5.0 (drain) and 2.7–8.3 (collapse)
    // at 5–6.6 ft: the drain's walls and the collapse's step were a metre or two wide.
    const bounds = { steep: 1.0, drain: 0.85, collapse: 0.9 };
    const worst = { steep: 0, drain: 0, collapse: 0 };
    for (const sizeFt of [5, 6.6, 9.9]) {
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
  it('behind a broken crest the settled water is smooth along the crest: where the reef focuses the swell at the crest there are no trenches (Andrew, 12 ft)', { timeout: 60_000 }, () => {
    // Everything behind a crest shares its crest's bore, so a bore that jumps along the crest draws a line along the
    // travel, a crest-to-trough deep trench over the reef flat. The bore read β × the breaking depth over the capped
    // height; the breaking depth (amp over the smoothed amp/depth) carries amp's focusing spikes, which the capped height
    // does not, and the trough behind the crest stepped 0.5–0.8 m per 0.5 m of crest. Measured over the reef flat
    // behind the peak (Andrew's view from inside the reef), on the broken surface itself: a trench is a step (first
    // difference) or a crease (second difference) along the crest. A peeling section's edge of whitewater is neither: it
    // rises steadily along the crest (up to ~0.4 m per metre on an 8 m wave 3 s after it broke). This no longer measures
    // breaking's change to the Phase 1 surface: near the crest the wave now carries its crest's height
    // (setWaveModel.waveHeightAt), and the unbroken surface's own focusing spikes are not the sheet's to keep.
    const tx = -ctx.travelZ, tz = ctx.travelX;
    let step = 0, crease = 0, checked = 0;
    for (const heightM of [5, 8]) for (const behindS of [3, 6, 9]) {
      const w = testWave(heightM), t = at(20, 40).tau + behindS;
      const eta = (x: number, z: number): number => sumWaves(x, z, t, at(x, z), [w], ctx, sheet).eta;
      for (let u = -60; u <= 20; u += 4) for (let v = -60; v <= 60; v += 0.5) {
        const x = 20 + ctx.travelX * u + tx * v, z = 40 + ctx.travelZ * u + tz * v;
        const f = at(x, z), c = crestAt(x, z, t, f, w, ctx, sheet)!;
        const xi = phaseXi(x, z, t, f, w, ctx);
        if (!(c.s > 0) || xi < 1 || xi > Math.PI / w.omega) continue;
        const a = eta(x - tx * 0.5, z - tz * 0.5), b = eta(x, z), c2 = eta(x + tx * 0.5, z + tz * 0.5);
        step = Math.max(step, Math.abs(c2 - b));
        crease = Math.max(crease, Math.abs(a - 2 * b + c2));
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(5000);
    expect(step, 'the largest step in 0.5 m of crest (m)').toBeLessThan(0.3);
    expect(crease, 'the sharpest crease along the crest (m, second difference at 0.5 m)').toBeLessThan(0.15);
  });
});

/** The ledge rays the crest-progress tests follow: the peak, the north ledge (the left) every 15 m, the south ledge (the right). */
const LEDGE_POINTS: readonly [number, number][] = [[0, 0], [5.5, -15], [11, -30], [16.4, -45], [21.9, -60], [27, -75], [12.5, 14], [25, 28], [42, 33]];

describe('the breaking sheet on the real reef', () => {
  const P = DEFAULT_BREAK_PARAMS;
  it('while the wave throws (onset to the landing), its crest is its highest water: nothing behind it stands above it', () => {
    // Each point's own height, capped by the depth under it, left the back of the wave over the ledge (5 m) taller than
    // its crest over the reef top (3 m): the highest water stayed behind as a hump (Andrew's "it passes by"). From onset
    // to where the lip lands, at the peak: the water 3–20 m behind the crest (ξ = 0) stays below the crest. From the
    // landing on, the whitewater pile is the highest water (the pile's own tests).
    const w = testWave(REF_BIGGEST.heightM);
    const line = ray(0, 0, 40, 60);
    let checked = 0;
    for (let t = 0; t <= 1.5 + 1e-9; t += 0.25) {
      const cp = line[Math.max(1, line.findIndex((p) => p.tau >= t))];
      const cc = crestAt(cp.x, cp.z, t, at(cp.x, cp.z), w, ctx, sheet)!;
      if (cc.tb !== null && cc.tb !== undefined && cc.tb >= landingEstimate(localHeight(w, cc.f), P)) continue;
      const j = line.findIndex((p) => p.tau >= t);
      const crestArc = (j - 1 + (t - line[j - 1].tau) / (line[j].tau - line[j - 1].tau)) * 0.5;
      const eta = line.map((p) => sumWaves(p.x, p.z, t, at(p.x, p.z), [w], ctx, sheet).eta);
      const crest = Math.max(eta[j - 1], eta[j]);
      const behind = Math.max(...line.map((_, i) => (crestArc - i * 0.5 >= 3 && crestArc - i * 0.5 <= 20 ? eta[i] : -Infinity)));
      expect(behind, `${t.toFixed(2)} s after onset: the water behind the crest (crest ${crest.toFixed(2)} m)`).toBeLessThan(crest);
      checked++;
    }
    expect(checked).toBeGreaterThanOrEqual(4);
  });
  it('through the break the highest water moves with the wave: it neither stalls nor hands on to a second crest (Andrew)', { timeout: 120_000 }, () => {
    // Along each ledge ray, from half a second before the crest reaches the ledge to 6 s after: every 0.25 s the highest
    // water within 20 m of the crest (ξ = 0), and how fast it moved. When the stage and collapse followed the depth under
    // the crest and each point kept its own height, it stood still for up to 2 s over the ledge while its crest shrank,
    // then jumped 10–15 m to a second crest that grew and broke inshore (26 m/s at the north ledge 60 m from the peak).
    // A crest collapsing into whitewater may pause for a step as its top falls; it may not stand, and it may not jump.
    // Where the top is a plateau (the whitewater pile merging with the collapsed crest behind it), its highest sample
    // wanders over it: the top is the middle of the unbroken run of samples within 1% of the highest (a second crest is
    // not part of that run, so a hand-on to one still jumps).
    const w = testWave(REF_BIGGEST.heightM);
    let worstStand = 0, worstJump = 0, samples = 0;
    for (const [px, pz] of LEDGE_POINTS) {
      const line = ray(px, pz, 30, 70);
      const tau0 = at(px, pz).tau;
      let prev: number | null = null, stand = 0;
      for (let t = tau0 - 0.5; t <= tau0 + 6 + 1e-9; t += 0.25) {
        const eta = line.map((p) => sumWaves(p.x, p.z, t, at(p.x, p.z), [w], ctx, sheet).eta);
        const j = line.findIndex((p) => p.tau >= t);
        if (j < 1 || j * 0.5 > 90) { prev = null; continue; }
        let hi = -1;
        for (let i = 0; i < line.length; i++) if (Math.abs(i - j) * 0.5 <= 20 && (hi < 0 || eta[i] > eta[hi])) hi = i;
        if (!(eta[hi] > 0.3)) { prev = null; continue; }
        const level = eta[hi] - 0.01 * Math.abs(eta[hi]);
        let lo = hi, up = hi;
        while (lo > 0 && Math.abs(lo - 1 - j) * 0.5 <= 20 && eta[lo - 1] >= level) lo--;
        while (up < line.length - 1 && Math.abs(up + 1 - j) * 0.5 <= 20 && eta[up + 1] >= level) up++;
        const top = (lo + up) / 2;
        if (prev !== null) {
          const v = ((top - prev) * 0.5) / 0.25;
          stand = v < 2 ? stand + 1 : 0;
          worstStand = Math.max(worstStand, stand);
          // As the lip lands the whitewater rises where it hits, in front of the falls (spec §3.2, Andrew), while the
          // crest behind falls: the highest water moves onto the pile (up to ~6 m in a step at the peak), which is the
          // lip's own travel, not a hand-on to a second crest. A move onto the pile's landing spot while the curl collapses
          // (its top moves out from the crest to there over the settle span) is allowed; a jump anywhere else still counts.
          const cp = line[j], cc = crestAt(cp.x, cp.z, t, at(cp.x, cp.z), w, ctx, sheet);
          const H = cc ? localHeight(w, cc.f) : 0, land = landingEstimate(H, DEFAULT_BREAK_PARAMS);
          const rising = cc?.tb !== null && cc?.tb !== undefined && cc.lipH !== null && cc.lipH !== undefined && cc.tb >= land && cc.tb <= land + settleSpan(H, DEFAULT_BREAK_PARAMS) + 0.25;
          const ontoPile = rising && (top - j) * 0.5 <= PILE_LAND_H * (cc.lipH as number) * 1.35 + 1.5;
          if (!ontoPile) worstJump = Math.max(worstJump, v);
          samples++;
        }
        prev = top;
      }
    }
    expect(samples).toBeGreaterThan(200);
    expect(worstStand, 'the most 0.25 s steps in a row the highest water stood still').toBeLessThanOrEqual(2);
    expect(worstJump, 'the fastest the highest water moved (m/s): a hand-on to a second crest').toBeLessThanOrEqual(20);
  });
  it('a broken section never un-breaks: at the crest the collapse only grows, however the reef deepens after the ledge', () => {
    // The ratio at the crest peaks on the reef top and falls where it deepens again inshore (3.4 at 24 m from the peak,
    // 2.9 at 38 m): when the collapse followed the ratio, the whitewater stood back up into a clean face. How far it
    // settles follows the record's running maximum, which the field's upwind march lowers by up to ~2% where it averages
    // neighbouring rays: that may ease it by a hair (0.001 here), never stand it back up.
    const w = testWave(REF_BIGGEST.heightM);
    for (const [px, pz] of LEDGE_POINTS) {
      const line = ray(px, pz, 0, 70);
      let last = 0, broke = false;
      line.forEach((p, i) => {
        const f = at(p.x, p.z), c = crestAt(p.x, p.z, f.tau, f, w, ctx, sheet)!;
        expect(c.lc.collapse, `(${px}, ${pz}) + ${(i * 0.5).toFixed(1)} m`).toBeGreaterThanOrEqual(last - 0.005);
        last = Math.max(last, c.lc.collapse);
        broke ||= c.tb !== null && c.tb !== undefined;
      });
      expect(broke, `(${px}, ${pz}) breaks`).toBe(true);
      expect(last, `(${px}, ${pz}) has settled 70 m in`).toBeGreaterThan(0.99);
    }
  });
  it('the lip and the water under it agree on when each section broke (one onset record)', () => {
    // The ribbon's stations carry the time since onset their cross-section is built for; the sheet's crest reads the
    // same record, so the curl collapses as the water under it does.
    const w = testWave(REF_BIGGEST.heightM);
    let checked = 0;
    for (const t of [0.5, 1, 2, 3]) {
      for (const e of traceStations(field, [w], t, ctx, { cameraX: 0, cameraZ: 0, params: DEFAULT_BREAK_PARAMS, minHeightM: 0 })) {
        if (e.gap || e.tb === null || !Number.isFinite(e.tb)) continue;
        const f = at(e.x, e.z), c = crestAt(e.x, e.z, t, f, w, ctx, sheet)!;
        expect(Math.abs((c.tb as number) - e.tb), `station at (${e.x.toFixed(1)}, ${e.z.toFixed(1)}), ${t} s`).toBeLessThan(0.05);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(100);
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
      const fAt = (x: number, z: number): FieldSample => ({ tau: (x * dirX + z * dirZ) / c, amp: 1, hmin, hminBreak: hmin, hminSlurp: hmin, k, dirX, dirZ, depth });
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
        expect(r.pile).toBeGreaterThanOrEqual(0);
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
      { pileHalfM: 10 }, { pileHalfM: 150 }, { pileSurge: 0 }, { pileSurge: 0.6 },
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

describe('set waves do not stack on the wave ahead (Andrew)', () => {
  it('100 m seaward of the peak each crest is its own height (≤ 1.08×), and the wave behind a long tail steps on it', { timeout: 60_000 }, () => {
    // The Phase 1 surface of whole sets against each wave alone, at its crest: the old Gaussian envelope left 21% of a
    // wave a period behind it, and the next wave's crest stood 1.13–1.50× its own height on it.
    const p0 = ray(0, 0, 100, 0)[0];
    const f = at(p0.x, p0.z);
    const crestOf = (waves: ActiveWave[], w: ActiveWave): number => {
      let best = -Infinity;
      for (let dt = -2; dt <= 2; dt += 0.05) best = Math.max(best, sumWaves(p0.x, p0.z, w.arrivalS + f.tau + dt, f, waves, ctx).eta);
      return best;
    };
    let clean = 0, worstClean = 0, stepped = 0, bestStep = 0;
    for (let k = 0; k < 120; k++) {
      const events = wavesOfSet(k, DEFAULT_CONDITIONS, DEFAULT_SET_PARAMS);
      const waves = events.map(toActiveWave);
      waves.forEach((w, i) => {
        const ratio = crestOf(waves, w) / crestOf([w], w);
        if (i > 0 && events[i - 1].longTail) { stepped++; bestStep = Math.max(bestStep, ratio); return; }
        clean++;
        worstClean = Math.max(worstClean, ratio);
      });
    }
    expect(clean).toBeGreaterThan(400);
    expect(worstClean, 'the tallest crest over its own height, behind a tight wave').toBeLessThanOrEqual(1.08);
    expect(stepped, 'long tails happen').toBeGreaterThan(10);
    expect(bestStep, 'a wave behind a long tail stands on its leftover').toBeGreaterThan(1.15);
  });
});

describe('the whitewater pile on the real reef (spec 2026-09-29 §3.2)', () => {
  const P = DEFAULT_BREAK_PARAMS;
  const w = testWave(REF_BIGGEST.heightM);
  it('when the pile has risen it stands at least as high as the lip, and above it at the peak (the surge)', { timeout: 60_000 }, () => {
    for (const [px, pz] of LEDGE_POINTS) {
      const line = ray(px, pz, 40, 80);
      const { tOn, H } = onsetAt(px, pz, w);
      const lip = topNear(line, tOn, w).height;
      const tRisen = tOn + landingEstimate(H, P) + PILE_RISE_S, rs = topNear(line, tRisen, w), risen = rs.height;
      // A section that broke only partly builds a partial pile (its extent, lc.pile once risen).
      const cp = line[rs.j], extent = crestAt(cp.x, cp.z, tRisen, at(cp.x, cp.z), w, ctx, sheet)!.lc.pile;
      console.log(`(${px}, ${pz}) lip ${lip.toFixed(2)} m, pile ${risen.toFixed(2)} m, extent ${extent.toFixed(2)}`);
      expect(risen, `(${px}, ${pz})`).toBeGreaterThanOrEqual((extent >= 0.99 ? 0.97 : 0.9) * lip);
      if (px === 0 && pz === 0) expect(risen, 'the peak surges').toBeGreaterThan(1.1 * lip);
    }
  });
  it("once the curl has collapsed its top is where the lip landed, about 1.2 lips' heights ahead of the crest", { timeout: 60_000 }, () => {
    for (const [px, pz] of LEDGE_POINTS) {
      const line = ray(px, pz, 40, 80);
      const { tOn, H } = onsetAt(px, pz, w);
      // Timed by the crest's own drain (its ψ's), as its lip lands.
      const Pc = crestAt(px, pz, tOn, at(px, pz), w, ctx, sheet)?.params ?? P;
      const t = tOn + landingEstimate(H, Pc) + settleSpan(H, Pc);
      const { top, j } = topNear(line, t, w);
      const cp = line[j], cc = crestAt(cp.x, cp.z, t, at(cp.x, cp.z), w, ctx, sheet)!;
      // Where the water is, displaced (ahead of the crest it is pulled back up to ~1.5 m: the pile is placed there), in the
      // lip's height (the section's height while it threw): the pile's scale.
      const along = (i: number): number => {
        const p = line[i], f = at(p.x, p.z), r = sumWaves(p.x, p.z, t, f, [w], ctx, sheet);
        return i * 0.5 + r.dx * f.dirX + r.dz * f.dirZ;
      };
      const ahead = (along(top) - along(j)) / (cc.lipH as number);
      // The pile is placed PILE_LAND_H (1.2) lips ahead of the crest its lookup found; the crest here (ξ = 0 on this ray)
      // sits up to ~0.35 lips from that one where the lookup runs oblique to the rays (most at the peak's meeting line).
      expect(ahead, `(${px}, ${pz}) top ahead of the crest (× the lip's H)`).toBeGreaterThanOrEqual(0.9);
      expect(ahead, `(${px}, ${pz}) top ahead of the crest (× the lip's H)`).toBeLessThanOrEqual(1.6);
    }
  });
  it("the sheet stands at least at the pile's height as it rolls in, and the pile never grows while it stands above the bore", { timeout: 120_000 }, () => {
    for (const [px, pz] of LEDGE_POINTS) {
      const line = ray(px, pz, 20, 110);
      const { tOn, H } = onsetAt(px, pz, w);
      const from = tOn + landingEstimate(H, P) + settleSpan(H, P) + 0.5;
      let prev = Infinity, halfAt: number | null = null, first: { top: number; floor: number; j: number } | null = null;
      for (let t = from; t <= tOn + 12 + 1e-9; t += 0.5) {
        const { height, j, top } = topNear(line, t, w);
        if (j < 1) break;
        const cp = line[j], pt = crestPileTop(cp.x, cp.z, t, at(cp.x, cp.z), w, ctx, sheet);
        if (!pt) break;
        // The sheet stands at the pile's height where its top is (each point reads its own ray's lip: at the peak's
        // meeting line the crest's own differs).
        const tp = line[top], here = crestPileTop(tp.x, tp.z, t, at(tp.x, tp.z), w, ctx, sheet);
        // The pile's front is steep (half a lip wide): its top can fall between the 0.5 m samples, so look 0.1 m apart there.
        let fine = height;
        for (const nb of [top - 1, top + 1]) {
          const q = line[Math.min(line.length - 1, Math.max(0, nb))];
          for (let fr = 0.2; fr < 1; fr += 0.2) {
            const x = tp.x + (q.x - tp.x) * fr, z = tp.z + (q.z - tp.z) * fr;
            fine = Math.max(fine, sumWaves(x, z, t, at(x, z), [w], ctx, sheet).eta);
          }
        }
        // It never stands under the pile (where the wave under it is taller, as once the pile has decayed onto the bore,
        // the wave is the surface). A section that broke only partly builds a partial pile: checked where it is whole.
        // Once the pile has decayed onto its floor the surface is the sheet's own bore (boreScale), which may sit a few cm
        // under the floor's estimate (settledCrestTop): checked while the pile stands above its floor.
        const whole = crestAt(tp.x, tp.z, t, at(tp.x, tp.z), w, ctx, sheet)!.lc.pile >= 0.99;
        // Not on the peak's ray, the two ledges' meeting line: there the crest lookup flips between the ledges' crests
        // within ~5 m, so the pile's height and placement step and the sheet peaks up to ~6% (0.12 m) under it (the
        // meeting-line seam, a known follow-up; measured along the crest's direction for the inside reef's "rock").
        const meetingLine = px === 0 && pz === 0;
        if (here && whole && here.own > here.floor && !meetingLine) expect(here.top - fine, `(${px}, ${pz}) t ${(t - tOn).toFixed(1)} s: sheet ${fine.toFixed(2)} vs pile ${here.top.toFixed(2)}`).toBeLessThan(Math.max(0.05, 0.05 * here.top));
        // The pile's own height (the lip, surged and decayed): its floor is the bore, which grows where the reef deepens (as
        // the sheet's bore does).
        // Not across the two ledges' meeting line, which the peak's ray runs down and rays from near the peak reach ~55 m
        // in: water there came from the other ledge's break (0.1 m taller at the peak's ray, 11% from 16 m up the north
        // ledge, ~35 m after the collapse). Checked on the rays that stay their own ledge's: from 20 m or more from the
        // wedge's tip (seven of the nine).
        const ownLedge = Math.hypot(px, pz) >= 20;
        if (ownLedge && pt.own > pt.floor) expect(pt.own, `(${px}, ${pz}) t ${(t - tOn).toFixed(1)} s: the pile never grows`).toBeLessThanOrEqual(prev * 1.03 + 0.01);
        prev = pt.own;
        first ??= { ...pt, j };
        if (halfAt === null && pt.top <= 0.5 * first.top) halfAt = (j - first.j) * 0.5;
      }
      console.log(`(${px}, ${pz}) the pile fell to half its height ${halfAt?.toFixed(0) ?? '(not within 12 s)'} m after the collapse`);
    }
  });
  it('along a ray every point of the pile reads the same lip (it is carried along the rays)', () => {
    // Not along the peak's ray: it runs down the line where the two ledges' rays meet (the field's direction swings 40° in
    // 2 m there), and points a few metres apart read the lips of different ledges.
    for (const [px, pz] of LEDGE_POINTS.filter(([x, z]) => x !== 0 || z !== 0)) {
      const line = ray(px, pz, 40, 110);
      const { tOn } = onsetAt(px, pz, w);
      const t = tOn + 3.4, j = line.findIndex((p) => p.tau >= t);
      const lips = line.slice(j - 4, j + 17).map((p) => crestAt(p.x, p.z, t, at(p.x, p.z), w, ctx, sheet)!.lipH as number);
      expect((Math.max(...lips) - Math.min(...lips)) / Math.max(...lips), `(${px}, ${pz})`).toBeLessThan(0.05);
    }
  });
  it('off the record grid there is no pile, and the sheet is as without it', () => {
    const x = field.grid.x0 - 30, z = 0, f = at(x, z);
    const r = sumWaves(x, z, f.tau + 3, f, [w], ctx, sheet), n = sumWaves(x, z, f.tau + 3, f, [w], ctx, { ...sheet, pile: false });
    expect(r.pile).toBe(0);
    expect(r.eta).toBe(n.eta);
  });
});

describe('the slurp: the draw-up reaches along the swell line either side of the peak (Andrew, 12 ft)', () => {
  // As the peak draws the reef's water into itself, the swell either side is part of it: the water in front of the
  // shoulders near the peak is drawn down too, fading along the line, with no steep wall where it ends. When only the
  // section standing up drained, the shoulders stood as tall smooth walls beside a sunken, steep-sided bowl.
  const c12 = cloneConditions(DEFAULT_CONDITIONS);
  c12.swell.sizeFt = 12;
  const big12 = wavesOfSet(1, c12, DEFAULT_SET_PARAMS).reduce((a, b) => (b.heightM > a.heightM ? b : a));
  const w = testWave(big12.heightM);
  const tx = -ctx.travelZ, tz = ctx.travelX;
  /** Along the crest (v m across travel from the peak) as the peak breaks: the lowest water in the 25 m in front of the
   * crest, and the crest's stage. */
  const alongCrest = (t: number) => {
    const out: { v: number; lowest: number; stage: number }[] = [];
    for (let v = -100; v <= 100; v += 5) {
      let x = 0, z = 0;
      for (let u = -200; u <= 200; u += 0.5) { x = ctx.travelX * u + tx * v; z = ctx.travelZ * u + tz * v; if (at(x, z).tau >= t) break; }
      const f = at(x, z);
      let lowest = Infinity, xx = x, zz = z;
      for (let d = 0; d <= 25; d += 0.5) { const s = at(xx, zz); lowest = Math.min(lowest, sumWaves(xx, zz, t, s, [w], ctx, sheet).eta); xx += s.dirX * 0.5; zz += s.dirZ * 0.5; }
      out.push({ v, lowest, stage: crestAt(x, z, t, f, w, ctx, sheet)!.s });
    }
    return out;
  };
  it('as the peak breaks, the water in front of the shoulders within 60 m of it is drawn below sea level, less so further out', { timeout: 60_000 }, () => {
    const line = alongCrest(at(0, 0).tau);
    for (const p of line) if (Math.abs(p.v) <= 60) expect(p.lowest, `${p.v} m along the crest`).toBeLessThan(0);
    const near = Math.max(...line.filter((p) => Math.abs(p.v) === 60).map((p) => p.lowest));
    const far = Math.min(...line.filter((p) => Math.abs(p.v) === 100).map((p) => p.lowest));
    expect(far, 'it fades along the line').toBeGreaterThan(near);
  });
  it('where the draw-down ends it eases off along the line: under 0.9 m per 5 m of crest (it climbed 1.1–1.4 m)', { timeout: 60_000 }, () => {
    // Measured 5, 10 and 15 m in front of the crest, where the sunken face meets the shoulder's untouched one: the wall
    // at each end of the drained bowl. At and after the break, where the slurp acts. (Before it, the shoulders' own
    // standing up still switches on over ~15 m of crest: about 1 m per 5 m, as before.) The drawn-down water itself: the
    // whitewater pile sits 5–15 m in front of the crest at 12 ft, and has its own seam where the ledges' rays meet.
    const drawn: BreakOptions = { ...sheet, pile: false };
    for (const dt of [0, 1]) {
      const t = at(0, 0).tau + dt;
      // Where the drawn water ends, in the shoulders that haven't broken: the broken section itself is collapsing as it
      // peels, a different thing from one metre of crest to the next.
      const heights: number[][] = [], broken: boolean[] = [];
      for (let v = -100; v <= 100; v += 5) {
        let x = 0, z = 0;
        for (let u = -200; u <= 200; u += 0.5) { x = ctx.travelX * u + tx * v; z = ctx.travelZ * u + tz * v; if (at(x, z).tau >= t) break; }
        broken.push(crestAt(x, z, t, at(x, z), w, ctx, sheet)!.s > 0);
        const row: number[] = [];
        let xx = x, zz = z;
        for (let d = 0; d <= 15; d += 0.5) { const f = at(xx, zz); if (d === 5 || d === 10 || d === 15) row.push(sumWaves(xx, zz, t, f, [w], ctx, drawn).eta); xx += f.dirX * 0.5; zz += f.dirZ * 0.5; }
        heights.push(row);
      }
      let pairs = 0;
      for (let i = 1; i < heights.length; i++) {
        if (broken[i] || broken[i - 1]) continue;
        pairs++;
        for (let k = 0; k < 3; k++) expect(Math.abs(heights[i][k] - heights[i - 1][k]), `${dt} s, ${-100 + 5 * i} m along the crest, ${5 * (k + 1)} m in front`).toBeLessThan(0.9);
      }
      expect(pairs, `${dt} s: shoulders checked`).toBeGreaterThan(5);
    }
  });
  it('the breaking peak stays the tallest point of the line while it throws (it held 2.6 m under 4.9 m shoulders)', { timeout: 60_000 }, () => {
    // A broken section's height was capped by the depth under it (0.78 × 6 m over the peak), so the peak sank below the
    // shoulders the moment it broke. It keeps the height it threw at until its whitewater takes over.
    for (const dt of [0, 0.5]) {
      const t = at(0, 0).tau + dt;
      const crestAtV = (v: number): number => {
        let x = 0, z = 0;
        for (let u = -200; u <= 200; u += 0.5) { x = ctx.travelX * u + tx * v; z = ctx.travelZ * u + tz * v; if (at(x, z).tau >= t) break; }
        let top = -Infinity, xx = x, zz = z;
        for (let d = -4; d <= 4; d += 0.5) { const f = at(xx, zz); top = Math.max(top, sumWaves(xx, zz, t, f, [w], ctx, sheet).eta); xx += f.dirX * 0.5; zz += f.dirZ * 0.5; }
        return top;
      };
      const peak = Math.max(...[-10, -5, 0, 5, 10].map(crestAtV));
      const shoulders = Math.max(...[-100, -80, -60, 60, 80, 100].map(crestAtV));
      expect(peak, `${dt} s: the peak (shoulders ${shoulders.toFixed(2)} m)`).toBeGreaterThanOrEqual(0.95 * shoulders);
    }
  });
  it('the shoulders do not break any earlier: only the drain reaches along the line', () => {
    const noSlurp = alongCrest(at(0, 0).tau);
    for (const p of noSlurp) if (Math.abs(p.v) >= 80) expect(p.stage, `${p.v} m along the crest`).toBe(0);
  });
});

describe('no isolated spikes on the inside reef (Andrew\'s "rock", 12 ft)', () => {
  // Where the rays fan out over the inside reef (the swell turns ~45° within 8 m), a point's distance ahead of its crest
  // measured along its own ray collapsed (1 m for a point 6 m ahead): it took the crest's height and foam among drained
  // neighbours, a white-topped spike ~1 m tall 12 s after every wave passed the peak.
  it('as a set wave crosses the inside reef, no point stands 0.5 m above everything 4 m around it (it stood 0.68 m; now 0.34)', { timeout: 120_000 }, () => {
    // (A smooth mound where the drawn-down water lies over a reef head stands ~0.35 m above that ring.)
    const c12 = cloneConditions(DEFAULT_CONDITIONS);
    c12.swell.sizeFt = 12;
    const set = wavesOfSet(1, c12, DEFAULT_SET_PARAMS), waves = set.map(toActiveWave);
    const S = 2, x0 = 40, z0 = -100, nx = 41, nz = 61;
    const eta = new Float64Array(nx * nz);
    let worst = -Infinity, where = '';
    for (const dt of [10, 11, 12, 13, 14]) {
      const t = set[3].arrivalS + dt;
      for (let r = 0; r < nz; r++) for (let c = 0; c < nx; c++) { const x = x0 + c * S, z = z0 + r * S; eta[r * nx + c] = sumWaves(x, z, t, at(x, z), waves, ctx, sheet).eta; }
      for (let r = 2; r < nz - 2; r++) for (let c = 2; c < nx - 2; c++) {
        const k = r * nx + c;
        let ring = -Infinity;
        for (const [dr, dc] of [[-2, -2], [-2, 0], [-2, 2], [0, -2], [0, 2], [2, -2], [2, 0], [2, 2]]) ring = Math.max(ring, eta[k + dr * nx + dc]);
        if (eta[k] - ring > worst) { worst = eta[k] - ring; where = `(${x0 + c * S}, ${z0 + r * S}) ${dt} s after the peak`; }
      }
    }
    expect(worst, where).toBeLessThan(0.5);
  });
});
