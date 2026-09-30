import { breakIntensity } from './breakIntensity';
import { type BreakParams, ONSET_RECORD_LENGTH, breakingRatio, landingEstimate, onsetStep, onsetTime } from './breaking';
import type { FieldSample } from './fieldSample';
import { HAND_BACK_S } from './lipProfile';
import { type ReefField, sampleField, sampleOnset } from './reefField';
import { type ActiveWave, TAPER_NEAR_M, type WaveContext, localHeight, phaseXi } from './setWaveModel';

/**
 * Crest stations for the breaking ribbon (breaking-ribbon spec §5): each set wave's crest line (ξ = 0) traced across
 * the reef into stations, spaced by distance from the camera, each carrying what its cross-section needs. Pure CPU,
 * per frame; BreakingRibbon uploads the result.
 */

/** Station spacing: SPACING_PER_M × distance to the camera, clamped (spec R1). */
export const SPACING_PER_M = 0.012;
export const MIN_SPACING_M = 0.08;
export const MAX_SPACING_M = 4;
export const MAX_STATIONS = 2048;
/** A side of the trace ends after this much crest (m) below the ribbon's onset ratio. */
export const BELOW_ONSET_RUN_M = 20;
/** The time since onset is computed at key stations at most this far apart (m of crest) and interpolated between. */
export const KEY_SPACING_M = 3;
/** The CPU's culling margin over its landing-time estimate (s). */
export const LOOK_BACK_MARGIN_S = 0.5;
/** Newton projections onto ξ = 0 per step (the seed takes SEED_ITERATIONS). */
export const PROJECT_ITERATIONS = 2;
export const SEED_ITERATIONS = 8;
/** A seed or step whose |ξ| stays above this (s) after projecting has not found the crest: the side (or wave) ends. */
export const CREST_TOLERANCE_S = 0.01;
/** A step's projection moves at most this far (m); the seed's at most half a wavelength (maxStep 0). */
export const STEP_PROJECT_MAX_M = 5;

export interface Station {
  gap: false;
  /** Index of the wave in the `waves` passed to traceStations. */
  wave: number;
  /** Crest position (undisplaced world xz). */
  x: number;
  z: number;
  /** Arc length along this wave's crest from its seed (m; negative on the second side). */
  arc: number;
  /** Unit normal to the crest line, in the wave's travel direction: the profile's u axis. */
  nx: number;
  nz: number;
  /** Local wave height (m), as the sheet's (setWaveModel.localHeight). */
  H: number;
  /** Crest speed ω/k (m/s). */
  c: number;
  /** Breaking ratio at the crest (uncapped H). */
  r: number;
  /** Time since onset (s): null before breaking, Infinity once past the hand-back. */
  tb: number | null;
  /** The crest's break intensity (breakIntensity), as the sheet's crest there (setWaveModel.crestAt): the lip's shape. */
  intensity: number;
}

export type StationEntry = Station | { gap: true };

export interface TraceInput {
  cameraX: number;
  cameraZ: number;
  params: BreakParams;
  /** Waves no taller than this (m) are skipped (they never reach the ribbon's onset ratio); see minRibbonHeight. */
  minHeightM: number;
  /** A fixed station spacing (m), in place of the camera-distance rule: the same stations wherever the camera is (the spray's emitters, offshore-spray plan S1). */
  spacingM?: number;
  /** The wind's offshore speed (m/s; absent 0). */
  offshoreMs?: number;
}

const inGrid = (f: ReefField, x: number, z: number): boolean => {
  const g = f.grid;
  return x >= g.x0 && z >= g.z0 && x <= g.x0 + (g.nx - 1) * g.cellM && z <= g.z0 + (g.nz - 1) * g.cellM;
};

/** The crest-line normal at a field sample: ∇ξ points against (dir + w − mean). Returns it unit, with |∇ξ| (s/m). */
function crestNormal(w: ActiveWave, f: FieldSample, ctx: WaveContext): { nx: number; nz: number; grad: number } {
  const ax = f.dirX + w.travelX - ctx.travelX, az = f.dirZ + w.travelZ - ctx.travelZ;
  const len = Math.hypot(ax, az) || 1;
  return { nx: ax / len, nz: az / len, grad: (f.k / ctx.omega) * len };
}

/** Newton steps onto ξ = 0 along the crest normal, each at most `maxStep` m (the seed: half a wavelength). */
function project(field: ReefField, w: ActiveWave, t: number, ctx: WaveContext, x: number, z: number, iterations: number, maxStep = STEP_PROJECT_MAX_M): { x: number; z: number; xi: number; f: FieldSample } {
  for (let i = 0; i < iterations; i++) {
    const f = sampleField(field, x, z);
    const n = crestNormal(w, f, ctx);
    const cap = maxStep > 0 ? maxStep : Math.PI / f.k;
    const d = Math.max(-cap, Math.min(cap, phaseXi(x, z, t, f, w, ctx) / n.grad));
    x += n.nx * d;
    z += n.nz * d;
  }
  const f = sampleField(field, x, z);
  return { x, z, xi: phaseXi(x, z, t, f, w, ctx), f };
}

export { landingEstimate };

const onsetScratch = new Float32Array(ONSET_RECORD_LENGTH);

/**
 * How long ago (s) the crest at (x, z) first broke: the field's onset record there (breaking.onsetTime), the same
 * record the sheet reads, so the lip and the water under it agree on when each section broke. null if it hasn't
 * broken (or the point is off the record); Infinity once the record's reach is past (the section is long handed back).
 */
export function timeSinceOnset(field: ReefField, w: ActiveWave, x: number, z: number, _ctx: WaveContext, p: BreakParams): number | null {
  const rec = sampleOnset(field, x, z, onsetScratch);
  return rec ? onsetTime(rec, 0, w.heightM, p) : null;
}

/** The station's break intensity: the onset record's step there, as setWaveModel.crestAt reads it; 1 off the record. */
export function stationIntensity(field: ReefField, w: ActiveWave, x: number, z: number, input: TraceInput): number {
  const rec = sampleOnset(field, x, z, onsetScratch);
  if (!rec) return 1;
  return breakIntensity({ step: onsetStep(rec, 0, w.heightM, input.params), offshoreMs: input.offshoreMs ?? 0, periodS: (2 * Math.PI) / w.omega, waveBonus: w.drainBonus ?? 0, throwDraw: w.throwDraw ?? 0 }, input.params);
}

/** Whether a station still draws: before breaking, from the ribbon's onset ratio; after, until the (estimated) hand-back. */
function alive(s: Station, p: BreakParams): boolean {
  if (s.tb === null) return s.r >= p.ribbonOnset;
  return s.tb <= landingEstimate(s.H, p) * (1 + p.collapseTime) + HAND_BACK_S + LOOK_BACK_MARGIN_S;
}

/** One wave's crest, both ways from its seed, at `factor` × the spacing rule. Empty if the crest isn't on the reef. */
function traceWave(field: ReefField, w: ActiveWave, wave: number, t: number, ctx: WaveContext, input: TraceInput, factor: number): Station[][] {
  const p = input.params;
  const seed = project(field, w, t, ctx, 0, 0, SEED_ITERATIONS, 0);
  if (!(Math.abs(seed.xi) < CREST_TOLERANCE_S) || !inGrid(field, seed.x, seed.z)) return [];
  const sides: Station[][] = [];
  for (const sign of [1, -1]) {
    const side: Station[] = [];
    let { x, z, f } = seed;
    let arc = 0, below = 0;
    for (let n = 0; n < 20000; n++) {
      const nrm = crestNormal(w, f, ctx);
      if (sign > 0 || n > 0) {
        side.push({ gap: false, wave, x, z, arc, nx: nrm.nx, nz: nrm.nz, H: localHeight(w, f), c: ctx.omega / f.k, r: breakingRatio(w.heightM * f.amp, f.hminBreak, p), tb: null, intensity: 1 });
      }
      const ds = factor * (input.spacingM ?? Math.min(MAX_SPACING_M, Math.max(MIN_SPACING_M, SPACING_PER_M * Math.hypot(x - input.cameraX, z - input.cameraZ))));
      const next = project(field, w, t, ctx, x - nrm.nz * sign * ds, z + nrm.nx * sign * ds, PROJECT_ITERATIONS);
      if (!(Math.abs(next.xi) < CREST_TOLERANCE_S) || !inGrid(field, next.x, next.z) || Math.hypot(next.x, next.z) > TAPER_NEAR_M) break;
      arc += sign * Math.hypot(next.x - x, next.z - z);
      ({ x, z, f } = next);
      below = breakingRatio(w.heightM * f.amp, f.hminBreak, p) < p.ribbonOnset ? below + ds : 0;
      if (below > BELOW_ONSET_RUN_M) break;
    }
    sides.push(side);
  }
  return sides;
}

/** Fills each station's time since onset and intensity: exact at key stations ≤ KEY_SPACING_M apart, linear between two
 * finite keys, exact again wherever a neighbouring key is null (the onset boundary). */
function fillTimes(field: ReefField, w: ActiveWave, line: Station[], ctx: WaveContext, input: TraceInput): void {
  if (line.length === 0) return;
  const p = input.params;
  const keys: number[] = [0];
  for (let i = 1; i < line.length; i++) if (Math.abs(line[i].arc - line[keys[keys.length - 1]].arc) >= KEY_SPACING_M || i === line.length - 1) keys.push(i);
  for (const k of keys) {
    line[k].tb = timeSinceOnset(field, w, line[k].x, line[k].z, ctx, p);
    line[k].intensity = stationIntensity(field, w, line[k].x, line[k].z, input);
  }
  for (let q = 0; q + 1 < keys.length; q++) {
    const a = line[keys[q]], b = line[keys[q + 1]];
    for (let i = keys[q] + 1; i < keys[q + 1]; i++) {
      const s = line[i];
      s.intensity = a.intensity + ((b.intensity - a.intensity) * (s.arc - a.arc)) / (b.arc - a.arc);
      if (a.tb !== null && b.tb !== null && Number.isFinite(a.tb) && Number.isFinite(b.tb)) {
        s.tb = a.tb + ((b.tb - a.tb) * (s.arc - a.arc)) / (b.arc - a.arc);
      } else if (a.tb === Infinity && b.tb === Infinity) {
        s.tb = Infinity;
      } else if (a.tb === null && b.tb === null) {
        // Unbroken at both keys (3 m apart): the breaking depth, smoothed along the crest over metres, leaves no room
        // for a broken island between them. This skipped a full look-back march per station on every pre-break
        // stretch (37 stations per key interval near the camera; 25–35% of the trace's time).
        s.tb = null;
      } else {
        s.tb = timeSinceOnset(field, w, s.x, s.z, ctx, p);
        s.intensity = stationIntensity(field, w, s.x, s.z, input);
      }
    }
  }
}

/**
 * Every wave's stations, in drawing order: each wave's crest from one end to the other, runs of live stations
 * separated by a single gap entry (between waves, and where a stretch of crest isn't drawn). At most MAX_STATIONS
 * entries: if a trace would exceed it, the spacing grows by 1.5× and the trace is redone (up to four times, then cut).
 */
export function traceStations(field: ReefField, waves: readonly ActiveWave[], t: number, ctx: WaveContext, input: TraceInput): StationEntry[] {
  let out: StationEntry[] = [];
  for (let attempt = 0, factor = 1; attempt < 5; attempt++, factor *= 1.5) {
    out = [];
    waves.forEach((w, i) => {
      if (!(w.heightM > input.minHeightM)) return;
      const sides = traceWave(field, w, i, t, ctx, input, factor);
      if (sides.length === 0) return;
      const line = [...sides[1].reverse(), ...sides[0]];
      fillTimes(field, w, line, ctx, input);
      for (const s of line) {
        if (alive(s, input.params)) out.push(s);
        else if (out.length > 0 && !out[out.length - 1].gap) out.push({ gap: true });
      }
      if (out.length > 0 && !out[out.length - 1].gap) out.push({ gap: true });
    });
    if (out.length <= MAX_STATIONS) break;
  }
  while (out.length > 0 && out[out.length - 1].gap) out.pop();
  return out.slice(0, MAX_STATIONS);
}

/**
 * The height (m) below which a wave never reaches the ribbon's onset ratio anywhere: ribbonOnset × the field's breaking
 * height (setWaveModel.fieldBreakingHeight). ρ is proportional to the height, so a wave of this height has ρ <
 * ribbonOnset wherever a wave of the field's breaking height has ρ < 1, which is everywhere.
 */
export function minRibbonHeight(fieldBreakingHeightM: number, p: BreakParams): number {
  return p.ribbonOnset * fieldBreakingHeightM;
}
