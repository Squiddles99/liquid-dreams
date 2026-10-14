import { type BreakParams, ONSET_RECORD_LENGTH, onsetTime } from './breaking';
import { type ReefField, sampleField, sampleOnset } from './reefField';
import type { ActiveWave } from './setWaveModel';
import { LEFT_BEARING_DEG, TIP } from '../seabed/wombReef';

/**
 * The curl's front down the left (womb-story Task 3d): how far along the left (wombReef.ledgeAlongM, m from the tip) the
 * wave's crest is broken at time t, for the shoulder's taper by distance (wombSection.shoulderFactor). Read from the onset
 * record: a point of the left is broken as the crest passes it when its record's time since onset is ≥ 0 there, and the
 * crest passes it at arrival + τ + the wave's own direction term (setWaveModel.phaseXi); the front is the furthest along
 * of those passed so far. Before any: 0 (the tip). Sampled over the left in the ledge's frame (FRONT_STEP_M: 4 m, ~11 ms a
 * table; 2 m took 45 ms, a frame's hitch as a new wave comes in), once per wave height and direction (the times the furthest
 * along so far grew, against it), read per frame between them linearly (no steps of FRONT_STEP_M in time).
 * The time until onset alone read the distance ahead badly where the line ends: past the fizzle the next break is the
 * shore's (5-11 s away), so the taper fell from the curl's to the floor between two stations.
 */
export const FRONT_STEP_M = 4;
/** The sampled left: along −10 to 460 m, 80 m seaward to 200 m inshore of the ledge (wombSection.shoulderRegion's reach). */
export const FRONT_ALONG_M: readonly [number, number] = [-10, 460];
export const FRONT_CROSS_M: readonly [number, number] = [-80, 200];

interface Table { t: Float64Array; along: Float64Array }
const tables = new WeakMap<ReefField, Map<string, Table>>();

function build(field: ReefField, w: ActiveWave, p: Pick<BreakParams, 'gamma' | 'delta'>): Table {
  const r = (LEFT_BEARING_DEG * Math.PI) / 180, s = Math.sin(r), c = Math.cos(r);
  const mx = field.far.dirX, mz = field.far.dirZ, ev: [number, number][] = [];
  const rec = new Float32Array(ONSET_RECORD_LENGTH);
  for (let a = FRONT_ALONG_M[0]; a <= FRONT_ALONG_M[1]; a += FRONT_STEP_M) {
    for (let v = FRONT_CROSS_M[0]; v <= FRONT_CROSS_M[1]; v += FRONT_STEP_M) {
      const x = TIP[0] + a * s + v * c, z = TIP[1] - a * c + v * s;
      const o = sampleOnset(field, x, z, rec);
      if (!o) continue;
      const tb = onsetTime(o, 0, w.heightM, p);
      if (tb === null || tb < 0) continue;
      const f = sampleField(field, x, z), cLocal = field.omega / f.k;
      const dTau = ((w.travelX - mx) * (x - TIP[0]) + (w.travelZ - mz) * (z - TIP[1])) / cLocal;
      ev.push([f.tau + dTau, a]);
    }
  }
  ev.sort((A, B) => A[0] - B[0]);
  const ts: number[] = [], as: number[] = [];
  let best = 0;
  for (const [ti, a] of ev) if (a > best || !ts.length) { best = Math.max(best, a); ts.push(ti); as.push(best); }
  return { t: Float64Array.from(ts), along: Float64Array.from(as) };
}

/** How far down the left (m along) w's crest is broken at time t (0 before it breaks: the tip). */
export function curlFrontAlong(field: ReefField, w: ActiveWave, t: number, p: Pick<BreakParams, 'gamma' | 'delta'>): number {
  let m = tables.get(field);
  if (!m) { m = new Map(); tables.set(field, m); }
  const key = `${w.heightM}|${w.travelX}|${w.travelZ}|${p.gamma}|${p.delta}`;
  let tab = m.get(key);
  if (!tab) { tab = build(field, w, p); m.set(key, tab); }
  const tr = t - w.arrivalS;
  let lo = 0, hi = tab.t.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (tab.t[mid] <= tr) lo = mid + 1; else hi = mid; }
  if (lo === 0) return 0;
  if (lo === tab.t.length) return tab.along[lo - 1];
  const a = lo - 1, k = (tr - tab.t[a]) / Math.max(1e-9, tab.t[lo] - tab.t[a]);
  return tab.along[a] + (tab.along[lo] - tab.along[a]) * k;
}
