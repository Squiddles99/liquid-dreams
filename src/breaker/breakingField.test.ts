import { describe, expect, it } from 'vitest';
import { DEFAULT_CONDITIONS, cloneConditions } from '../conditions/defaults';
import { surferFeetToHs } from '../conditions/units';
import { buildBathymetry, downsample } from '../seabed/bathymetry';
import { NORTH_LEDGE, SOUTH_LEDGE } from '../seabed/wombReef';
import { DEFAULT_SET_PARAMS, wavesOfSet } from '../swell/sets';
import { DEFAULT_BREAK_PARAMS, breakingHeightThreshold, stageCurves, steepening, steepeningStart } from './breaking';
import { type Station, traceStations } from './crestTrace';
import { waveNumber } from './dispersion';
import type { FieldSample } from './fieldSample';
import { type ReefField, computeReefField, sampleField } from './reefField';
import {
  type ActiveWave, type BreakOptions, breakOptions, SEABED_CLEARANCE_M, type WaveContext, crestAt, crestStage, fieldBreakingHeight, fieldSteepeningHeight, localHeight,
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
      expect(hs).toBeCloseTo(steepeningStart(p) * fieldBreakingHeight(field, p), 12);
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
  it('while the wave throws, its crest is its highest water: nothing behind it stands above it', () => {
    // Each point's own height, capped by the depth under it, left the back of the wave over the ledge (5 m) taller than
    // its crest over the reef top (3 m): the highest water stayed behind as a hump (Andrew's "it passes by"). From onset
    // to where the curl collapses, at the peak: the water 3–20 m behind the crest (ξ = 0) stays below the crest.
    const w = testWave(REF_BIGGEST.heightM);
    const line = ray(0, 0, 40, 60);
    let checked = 0;
    for (let t = 0; t <= 1.5 + 1e-9; t += 0.25) {
      const j = line.findIndex((p) => p.tau >= t);
      const crestArc = (j - 1 + (t - line[j - 1].tau) / (line[j].tau - line[j - 1].tau)) * 0.5;
      const eta = line.map((p) => sumWaves(p.x, p.z, t, at(p.x, p.z), [w], ctx, sheet).eta);
      const crest = Math.max(eta[j - 1], eta[j]);
      const behind = Math.max(...line.map((_, i) => (crestArc - i * 0.5 >= 3 && crestArc - i * 0.5 <= 20 ? eta[i] : -Infinity)));
      expect(behind, `${t.toFixed(2)} s after onset: the water behind the crest (crest ${crest.toFixed(2)} m)`).toBeLessThan(crest);
      checked++;
    }
    expect(checked).toBe(7);
  });
  it('through the break the highest water moves with the wave: it neither stalls nor hands on to a second crest (Andrew)', { timeout: 120_000 }, () => {
    // Along each ledge ray, from half a second before the crest reaches the ledge to 6 s after: every 0.25 s the highest
    // water within 20 m of the crest (ξ = 0), and how fast it moved. When the stage and collapse followed the depth under
    // the crest and each point kept its own height, it stood still for up to 2 s over the ledge while its crest shrank,
    // then jumped 10–15 m to a second crest that grew and broke inshore (26 m/s at the north ledge 60 m from the peak).
    // A crest collapsing into whitewater may pause for a step as its top falls; it may not stand, and it may not jump.
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
        let top = -1;
        for (let i = 0; i < line.length; i++) if (Math.abs(i - j) * 0.5 <= 20 && (top < 0 || eta[i] > eta[top])) top = i;
        if (!(eta[top] > 0.3)) { prev = null; continue; }
        if (prev !== null) {
          const v = ((top - prev) * 0.5) / 0.25;
          stand = v < 2 ? stand + 1 : 0;
          worstStand = Math.max(worstStand, stand);
          worstJump = Math.max(worstJump, v);
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
