import { DEFAULT_CONDITIONS, cloneConditions } from '../conditions/defaults';
import { type Bathymetry, bedHeightAt, ledgeSignedDistance } from '../seabed/bathymetry';
import { NORTH_LEDGE } from '../seabed/wombReef';
import { DEFAULT_SET_PARAMS, wavesOfSet } from '../swell/sets';
import { type BreakParams, DEFAULT_BREAK_PARAMS, onsetPsi, onsetTime } from './breaking';
import { type PsiState, drainFactor, effectivePsi, psiState } from './overturn';
import { type ReefField, sampleField, sampleOnset } from './reefField';

/**
 * The reef's criteria measured from a reef field (spec 2026-10-02-womb-reef-design §2): where a set wave first breaks,
 * how the left peels, and the tube's state where it breaks. The criteria tests, the tuning search and the drawings for
 * Andrew all read the reef through this one module.
 */

export type Tide = 'low' | 'mid' | 'high';
export const TIDES: Readonly<Record<Tide, number>> = { low: -1.5, mid: 0, high: 1.5 };
const TIDE_NAMES = Object.keys(TIDES) as Tide[];
/** Spec §2.1: the first break is at the take-off spot or within this far (m) seaward of it. */
export const BREAK_NEAR_PEAK_M = 30;
/** Spec §2.2: the left's peel speed band (m/s). */
export const PEEL_BAND: readonly [number, number] = [8, 20];
/** A stretch of line that breaks within this many seconds has closed out (the right's rule, breakingField.test). */
export const CLOSEOUT_SPREAD_S = 1.5;
/** The north ledge's first PEEL_SPAN_M from the peak is where the left must peel from (spec §2.2). */
export const PEEL_SPAN_M = 40;
export const CRITERIA_SIZES_FT = [4, 6, 8, 10, 12] as const;
export const PEEL_SIZES_FT = [4, 6, 8] as const;
/** 12 ft at low tide may break this far (m) seaward of the ledges (Andrew, 2026-10-02: too big for low tide). */
export const LOW_TIDE_12FT_REACH_M = 40;
/** 12 ft's ideal day: at least this ψ (the biggest cylinder, on the line to thrown out; Andrew accepted 0.079, 2026-10-02). */
export const THROWN_12_PSI = 0.075;
const STEP_M = 0.5;
const INSHORE_REACH_M = 60;
const SEAWARD_REACH_M = 300;
const LEDGE_READ_INSHORE_M = 40;

type Gd = Pick<BreakParams, 'gamma' | 'delta'>;

/** The biggest wave of the first set at sizeFt (the default swell otherwise): the set wave the criteria read. */
export function setWaveHeight(sizeFt: number): number {
  const c = cloneConditions(DEFAULT_CONDITIONS);
  c.swell.sizeFt = sizeFt;
  return wavesOfSet(1, c, DEFAULT_SET_PARAMS).reduce((a, b) => Math.max(a, b.heightM), 0);
}

function onsetAt(f: ReefField, x: number, z: number, H: number, p: Gd): number | null {
  const r = sampleOnset(f, x, z);
  return r ? onsetTime(r, 0, H, p) : null;
}

/**
 * Where H first breaks on the peak's traced ray: d metres seaward of the peak (0, 0) (negative: inshore of it) and the
 * point. The onset record is a running maximum along the ray, so the seaward-most broken point is the first break.
 * Null when it hasn't broken within INSHORE_REACH_M inshore of the peak.
 */
export function firstBreak(f: ReefField, H: number, p: Gd = DEFAULT_BREAK_PARAMS): { d: number; x: number; z: number } | null {
  let x = 0, z = 0;
  if (onsetAt(f, 0, 0, H, p) !== null) {
    let d = 0;
    while (d < SEAWARD_REACH_M) {
      const s = sampleField(f, x, z), nx = x - s.dirX * STEP_M, nz = z - s.dirZ * STEP_M;
      if (onsetAt(f, nx, nz, H, p) === null) break;
      x = nx; z = nz; d += STEP_M;
    }
    return { d, x, z };
  }
  for (let d = STEP_M; d <= INSHORE_REACH_M + 1e-9; d += STEP_M) {
    const s = sampleField(f, x, z);
    x += s.dirX * STEP_M; z += s.dirZ * STEP_M;
    if (onsetAt(f, x, z, H, p) !== null) return { d: -d, x, z };
  }
  return null;
}

export const firstBreakSeaward = (f: ReefField, H: number, p: Gd = DEFAULT_BREAK_PARAMS): number => firstBreak(f, H, p)?.d ?? -Infinity;

/**
 * The broken node furthest seaward of the ledge lines (v m, unwarped: the reef's warp moves the lines up to 7 m) on the
 * reef's seaward side (x ≤ 40 m, z ∈ [−300, 120], every 2 m); null if H breaks nowhere seaward of them.
 */
export function furthestBreak(f: ReefField, H: number, p: Gd = DEFAULT_BREAK_PARAMS): { x: number; z: number; v: number } | null {
  let worst: { x: number; z: number; v: number } | null = null;
  for (let x = -398; x <= 40; x += 2) for (let z = -300; z <= 120; z += 2) {
    const sd = ledgeSignedDistance(x, z);
    if (sd >= 0 || (worst && -sd <= worst.v)) continue;
    if (onsetAt(f, x, z, H, p) !== null) worst = { x, z, v: -sd };
  }
  return worst;
}

/**
 * When each section along the north ledge's first `metres` from the peak broke (s; the crest reaches the peak at 0):
 * τ less the time since onset, read on the ledge or, where that section hasn't broken yet, at the first broken point up
 * to 40 m inshore along its ray. NaN where it doesn't break within that.
 */
export function northLedgeBreakTimes(f: ReefField, H: number, metres = PEEL_SPAN_M, stepM = 5, p: Gd = DEFAULT_BREAK_PARAMS): number[] {
  const [a, b] = [NORTH_LEDGE[0], NORTH_LEDGE[1]], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const out: number[] = [];
  for (let s = 0; s <= metres + 1e-9; s += stepM) {
    let x = a[0] + ((b[0] - a[0]) * s) / len, z = a[1] + ((b[1] - a[1]) * s) / len, t = NaN;
    for (let d = 0; d <= LEDGE_READ_INSHORE_M + 1e-9; d += STEP_M) {
      const tb = onsetAt(f, x, z, H, p), sf = sampleField(f, x, z);
      if (tb !== null) { t = sf.tau - tb; break; }
      x += sf.dirX * STEP_M; z += sf.dirZ * STEP_M;
    }
    out.push(t);
  }
  return out;
}

/** The peel speed (m/s) over break times stepM apart: the span over the time from the first to the last. */
export const peelSpeed = (times: readonly number[], stepM = 5): number => ((times.length - 1) * stepM) / (times[times.length - 1] - times[0]);

/**
 * The crest's ψ where H first breaks on the peak's ray (spec §2.3): the record's ψ₀ there with the drain (after a lull
 * drainFactor(Infinity, T); a wave inside a set 1), no dial draw. NaN if it doesn't break.
 */
export function peakPsi(f: ReefField, H: number, lull: boolean, p: BreakParams = DEFAULT_BREAK_PARAMS): number {
  const at = firstBreak(f, H, p);
  if (!at) return NaN;
  const r = sampleOnset(f, at.x, at.z);
  if (!r) return NaN;
  return effectivePsi(onsetPsi(r, 0, H, p), { drain: lull ? drainFactor(Infinity, f.periodS) : 1, draw: 0 }, p);
}

export interface ReefCard {
  /** Metres seaward of the peak, by CRITERIA_SIZES_FT. */
  firstBreak: Record<Tide, number[]>;
  furthest12: Record<Tide, { x: number; z: number; v: number } | null>;
  /** Mid tide, by PEEL_SIZES_FT. */
  peel: number[];
  peelMonotonic: boolean[];
  psi: Record<Tide, { set: number; lull: number }[]>;
  ideal12: { tide: Tide; psi: number; state: PsiState; peel: number };
  /** Mid tide, a wave inside a set: the north ledge's first 40 m break spread (s). */
  ordinary12Spread: number;
  passes: Record<'breakNearPeak' | 'nothingOutside' | 'peelFromPeak' | 'thrown12' | 'closeout12' | 'smallDays', boolean>;
}

/** The spec's §2.1–2.3 on fields at the three tides (default swell). */
export function evaluateReef(fields: Readonly<Record<Tide, ReefField>>, p: BreakParams = DEFAULT_BREAK_PARAMS): ReefCard {
  const H = CRITERIA_SIZES_FT.map(setWaveHeight), H12 = setWaveHeight(12), i12 = CRITERIA_SIZES_FT.indexOf(12);
  const firstBreakM = {} as ReefCard['firstBreak'], furthest12 = {} as ReefCard['furthest12'], psi = {} as ReefCard['psi'];
  for (const t of TIDE_NAMES) {
    firstBreakM[t] = H.map((h) => firstBreakSeaward(fields[t], h, p));
    furthest12[t] = furthestBreak(fields[t], H12, p);
    psi[t] = H.map((h) => ({ set: peakPsi(fields[t], h, false, p), lull: peakPsi(fields[t], h, true, p) }));
  }
  const times = PEEL_SIZES_FT.map((ft) => northLedgeBreakTimes(fields.mid, setWaveHeight(ft), PEEL_SPAN_M, 5, p));
  const peel = times.map((ts) => peelSpeed(ts));
  const peelMonotonic = times.map((ts) => ts.every((t, i) => Number.isFinite(t) && (i === 0 || t > ts[i - 1])));
  const idealTide = TIDE_NAMES.reduce((a, b) => (psi[b][i12].lull > psi[a][i12].lull ? b : a));
  const idealPsi = psi[idealTide][i12].lull;
  const ideal12 = { tide: idealTide, psi: idealPsi, state: psiState(idealPsi), peel: peelSpeed(northLedgeBreakTimes(fields[idealTide], H12, PEEL_SPAN_M, 5, p)) };
  const ord = northLedgeBreakTimes(fields.mid, H12, PEEL_SPAN_M, 5, p).filter(Number.isFinite);
  const ordinary12Spread = ord.length >= 7 ? Math.max(...ord) - Math.min(...ord) : NaN;
  const inBand = (v: number) => v >= PEEL_BAND[0] && v <= PEEL_BAND[1];
  const at = (ft: number) => CRITERIA_SIZES_FT.indexOf(ft as (typeof CRITERIA_SIZES_FT)[number]);
  const bestLull = (i: number) => Math.max(...TIDE_NAMES.map((t) => psi[t][i].lull));
  return {
    firstBreak: firstBreakM, furthest12, peel, peelMonotonic, psi, ideal12, ordinary12Spread,
    passes: {
      // Every size breaks no further out than 30 m; 6 ft and up break by 60 m inshore (at the take-off, not on the inner shelf).
      breakNearPeak: TIDE_NAMES.every((t) => firstBreakM[t].every((d, i) => d <= BREAK_NEAR_PEAK_M && (CRITERIA_SIZES_FT[i] < 6 || Number.isFinite(d)))),
      // 12 ft is too big for low tide (Andrew, 2026-10-01): there it may reach LOW_TIDE_12FT_REACH_M (his ruling, 2026-10-02).
      nothingOutside: TIDE_NAMES.every((t) => furthest12[t] === null || furthest12[t]!.v <= (t === 'low' ? LOW_TIDE_12FT_REACH_M : BREAK_NEAR_PEAK_M)),
      peelFromPeak: peel.every(inBand) && peelMonotonic.every(Boolean),
      // Spec §2.3 asks state 6 only: with the ideal tide also the ordinary one (mid), the peel can't differ (a lull leaves it).
      // Andrew accepted the game's 12 ft ideal right on the cylinder/thrown line (2026-10-02): THROWN_12_PSI and up.
      thrown12: ideal12.psi >= THROWN_12_PSI,
      closeout12: ordinary12Spread <= CLOSEOUT_SPREAD_S,
      // 6–8 ft's ideal day is the cylinder or just thrown out (Andrew approved 8 ft drawn thrown, and the game's 6 ft at 0.081).
      smallDays: [6, 8].every((ft) => ['oval', 'cylinder'].includes(psiState(psi.mid[at(ft)].set)))
        && [6, 8].every((ft) => ['cylinder', 'thrown'].includes(psiState(bestLull(at(ft)))))
        && TIDE_NAMES.every((t) => !['thrown', 'slab'].includes(psiState(psi[t][at(4)].set))),
    },
  };
}

/** The card as a plain-text table (the baseline file, the tuning log, the gate's numbers). */
export function formatCard(c: ReefCard): string {
  const f = (v: number, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : String(v));
  const rows = [`size  | ${TIDE_NAMES.map((t) => `${t}: first break m, ψ set/lull (state)`).join(' | ')}`];
  CRITERIA_SIZES_FT.forEach((ft, i) => rows.push(`${String(ft).padStart(2)} ft | ${TIDE_NAMES.map((t) => `${f(c.firstBreak[t][i])} m, ${f(c.psi[t][i].set, 3)}/${f(c.psi[t][i].lull, 3)} (${psiState(c.psi[t][i].set)}/${psiState(c.psi[t][i].lull)})`).join(' | ')}`));
  rows.push(`furthest 12 ft break seaward of the ledges: ${TIDE_NAMES.map((t) => `${t} ${c.furthest12[t] ? `${f(c.furthest12[t]!.v)} m at (${c.furthest12[t]!.x}, ${c.furthest12[t]!.z})` : 'none'}`).join(', ')}`);
  rows.push(`left peel from the peak, mid tide: ${PEEL_SIZES_FT.map((ft, i) => `${ft} ft ${f(c.peel[i])} m/s${c.peelMonotonic[i] ? '' : ' (not in order)'}`).join(', ')}`);
  rows.push(`12 ft ideal (${c.ideal12.tide} tide, after a lull): ψ ${f(c.ideal12.psi, 3)} ${c.ideal12.state}, peel ${f(c.ideal12.peel)} m/s; ordinary (mid, in a set): first 40 m break within ${f(c.ordinary12Spread, 2)} s`);
  rows.push(`passes: ${Object.entries(c.passes).map(([k, v]) => `${k} ${v ? 'yes' : 'NO'}`).join(', ')}`);
  return rows.join('\n');
}

/** Still-water depth (m) along the traced ray through (px, pz), 1 m apart: [s, depth], s from −inshoreM to +seawardM (seaward positive). */
export function rayProfile(bathy: Bathymetry, f: ReefField, px: number, pz: number, seawardM = 300, inshoreM = 60): [number, number][] {
  const out: [number, number][] = [];
  let x = px, z = pz;
  for (let s = 0; s <= seawardM; s++) {
    out.push([s, -bedHeightAt(bathy, x, z)]);
    const d = sampleField(f, x, z); x -= d.dirX; z -= d.dirZ;
  }
  x = px; z = pz;
  for (let s = 1; s <= inshoreM; s++) {
    const d = sampleField(f, x, z); x += d.dirX; z += d.dirZ;
    out.unshift([-s, -bedHeightAt(bathy, x, z)]);
  }
  return out;
}
