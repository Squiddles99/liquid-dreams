import { type BreakParams, ONSET_RECORD_LENGTH, TUBE_HOLD_S, breakingRatio, landingEstimate, onsetHeight, onsetPsi, onsetDelay, onsetTime, peelRatio } from './breaking';
import type { FieldSample } from './fieldSample';
import { smoothstep } from '../math/smoothstep';
import { type SectionNumbers, sectionNumbers } from './wombSection';
import { HAND_BACK_S } from './lipProfile';
import { PSI_NORMAL, effectivePsi } from './overturn';
import { type ReefField, psiEdgeFade, sampleField, sampleOnset } from './reefField';
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
  /** While the peel stretch holds the section for its turn: how long until its turn (s); null otherwise. */
  wait: number | null;
  /** The crest's ψ, as the sheet's crest there (setWaveModel.crestAt): the lip's shape. */
  psi: number;
  /** The height (m) the section stood at as it threw its lip, as the sheet's crest there (setWaveModel.Crest.lipH): the
   * tube hangs from the crest it stood at then. null before breaking or off the record. */
  lipH: number | null;
  /** The cross-section's numbers (wombSection: scale A, phase, hollowness, ρ), smoothed along the crest
   * (SECTION_SMOOTHING_M): what the ribbon, the ride and the spray all draw the section from. */
  section: SectionNumbers;
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
 * broken (or the point is off the record), or while the section waits its turn (the peel stretch); Infinity once the
 * record's reach is past (the section is long handed back).
 */
export function timeSinceOnset(field: ReefField, w: ActiveWave, x: number, z: number, _ctx: WaveContext, p: BreakParams): number | null {
  const rec = sampleOnset(field, x, z, onsetScratch);
  const tb = rec ? onsetTime(rec, 0, w.heightM, p) : null;
  // Held by the peel stretch (spec 2026-10-04 §4): unbroken to the ribbon, the spray and the sound until its turn.
  return tb !== null && tb < 0 ? null : tb;
}

/**
 * A station's time since onset and ratio from the onset record: as timeSinceOnset (null while the section waits its turn),
 * with its ratio as the sheet stands it (breaking.peelRatio: held at 1, fading in after its turn), so the ribbon's lip
 * stands as the water under it does (spec 2026-10-04 §3-4).
 */
export function stationOnset(field: ReefField, w: ActiveWave, s: Pick<Station, 'x' | 'z' | 'H' | 'r' | 'tb' | 'wait'>, p: BreakParams): void {
  const rec = sampleOnset(field, s.x, s.z, onsetScratch);
  const tb = rec ? onsetTime(rec, 0, w.heightM, p) : null;
  if (tb !== null) s.r = peelRatio(s.r, tb, onsetDelay(rec!, 0, w.heightM, p), landingEstimate(s.H, p));
  s.tb = tb !== null && tb < 0 ? null : tb;
  s.wait = tb !== null && tb < 0 ? -tb : null;
}

/** The station's ψ: the onset record's ψ₀ there with the game rules, as setWaveModel.crestAt reads it; PSI_NORMAL off the record. */
export function stationPsi(field: ReefField, w: ActiveWave, x: number, z: number, input: TraceInput): number {
  const rec = sampleOnset(field, x, z, onsetScratch);
  if (!rec) return PSI_NORMAL;
  const psi = effectivePsi(onsetPsi(rec, 0, w.heightM, input.params), { drain: w.drainFactor ?? 1, draw: w.throwDraw ?? 0 }, input.params);
  return PSI_NORMAL + (psi - PSI_NORMAL) * psiEdgeFade(field.grid, x, z);
}

/** The station's throw height: the onset record's there (breaking.onsetHeight), as setWaveModel.crestAt reads it. */
export function stationLipH(field: ReefField, w: ActiveWave, x: number, z: number, p: BreakParams): number | null {
  const rec = sampleOnset(field, x, z, onsetScratch);
  return rec ? onsetHeight(rec, 0, w.heightM, p) : null;
}

/** A station draws while its section has any weight (its smoothed ρ): from standing up out of the sheet to the hand-back
 * after the white-water wall (wombSection.sectionWeight). */
export const ALIVE_RHO = 1e-3;
function alive(s: Station): boolean {
  return s.section.rho > ALIVE_RHO;
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
        side.push({ gap: false, wave, x, z, arc, nx: nrm.nx, nz: nrm.nz, H: localHeight(w, f), c: ctx.omega / f.k, r: breakingRatio(w.heightM * f.amp, f.hminBreak, p), tb: null, wait: null, psi: PSI_NORMAL, lipH: null, section: { A: 0, phase: 0, hollow: 0, rho: 0 } });
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

/** Fills each station's time since onset and ψ, each exactly from the onset record (a lookup). Interpolating between key
 * stations 3 m apart (from when this was a march up the ray per station) put the lip up to 0.31 s off the sheet where the
 * onset creeps unevenly along the crest (the softened ramp, plan 2026-09-30-barrel-from-maths Task 5). */
function fillTimes(field: ReefField, w: ActiveWave, line: Station[], _ctx: WaveContext, input: TraceInput): void {
  for (const s of line) {
    stationOnset(field, w, s, input.params);
    s.psi = stationPsi(field, w, s.x, s.z, input);
    s.lipH = stationLipH(field, w, s.x, s.z, input.params);
  }
}

/**
 * Down the line past a section held for its turn (the peel stretch), the crest waits too: from the curl outward, each
 * unbroken station beyond a held one takes the held one's wait. The record knows a hold only where the reef has broken the
 * wave already; further down the line, where the wave is still steepening toward its break, the ratio alone stood the
 * ribbon up, so a second breaking section stood 60–80 m down the line with a held stretch of sheet between them (on
 * Andrew's satellite reef, 2026-10-05).
 */
export function holdDownTheLine(line: Station[]): void {
  for (const order of [line, [...line].reverse()]) {
    let carry: number | null = null;
    for (const s of order) {
      if (s.wait !== null) carry = Math.max(carry ?? 0, s.wait);
      else if (s.tb !== null) carry = null;
      else if (carry !== null) s.wait = carry;
    }
  }
}

/**
 * The cross-section's numbers are smoothed along the crest by a Gaussian of this σ (m of arc): read station by station from
 * the reef's record, they jump between neighbours over reef heads (a height of 0.6 m beside 1.7 m 2 m along, a barrel
 * beside a wall still standing: spec 2026-10-05-womb-profile-design §2, "neighbouring slices never jump"; the ribbon
 * self-test's sliced back edges, 2026-10-05).
 */
export const SECTION_SMOOTHING_M = 4;
/**
 * Over this much crest (m of arc) at each end of a traced line the section's weight ρ fades to 0: the trace can stop where
 * the wave is still drawn breaking (its crest lookup lost, the grid's edge), and a ribbon ending there at full weight stood
 * its cut cross-section as a wall beside the sheet. Faded, it ends on the sheet.
 */
export const LINE_END_FADE_M = 6;

/**
 * Each station's section numbers (wombSection.sectionNumbers), then smoothed along the line by arc (SECTION_SMOOTHING_M);
 * its normal too: over reef heads the crest's own normal swings ±17° between stations 2 m apart, and the sections, reaching
 * 7 A behind the crest, crossed each other there (the ribbon folded behind the wave: Andrew's GPU run, 2026-10-05).
 */
export function fillSections(line: Station[], periodS: number, p: Pick<BreakParams, 'ribbonOnset'>): void {
  const normals = line.map((s) => [s.nx, s.nz]);
  const raw = line.map((s) => sectionNumbers({ H: s.H, r: s.r, tb: s.tb, wait: s.wait, psi: s.psi, periodS }, { ribbonOnset: p.ribbonOnset }));
  const reach = 3 * SECTION_SMOOTHING_M, inv = 1 / (2 * SECTION_SMOOTHING_M * SECTION_SMOOTHING_M);
  let lo = 0;
  line.forEach((s, i) => {
    while (line[lo].arc < s.arc - reach) lo++;
    let w = 0, A = 0, phase = 0, hollow = 0, rho = 0, nx = 0, nz = 0;
    for (let k = lo; k < line.length && line[k].arc <= s.arc + reach; k++) {
      const g = Math.exp(-((line[k].arc - s.arc) ** 2) * inv);
      w += g; A += g * raw[k].A; phase += g * raw[k].phase; hollow += g * raw[k].hollow; rho += g * raw[k].rho;
      nx += g * normals[k][0]; nz += g * normals[k][1];
    }
    const end = Math.min(s.arc - line[0].arc, line[line.length - 1].arc - s.arc);
    s.section = { A: A / w, phase: phase / w, hollow: hollow / w, rho: (rho / w) * smoothstep(0, LINE_END_FADE_M, end) };
    const l = Math.hypot(nx, nz);
    if (l > 1e-9) { s.nx = nx / l; s.nz = nz / l; }
  });
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
      holdDownTheLine(line);
      fillSections(line, field.periodS, input.params);
      for (const s of line) {
        if (alive(s)) out.push(s);
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
