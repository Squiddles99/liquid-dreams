import { DEFAULT_CONDITIONS, cloneConditions } from '../conditions/defaults';
import { buildBathymetry, downsample } from '../seabed/bathymetry';
import { DEFAULT_SET_PARAMS, wavesOfSet } from '../swell/sets';
import { DEFAULT_BREAK_PARAMS, breakingRatio, onsetHeight, onsetTime } from './breaking';
import { type ProfileInput, type Vec2, profileFrame } from './lipProfile';
import { withSheetShape } from './overturn';
import { type ReefField, computeReefField, sampleField, sampleOnset } from './reefField';
import { type ActiveWave, type BreakOptions, breakOptions, localHeight, sumWaves } from './setWaveModel';

/**
 * Stations on the peak's ray for tests and the drawings (not a test file itself, so importing it doesn't rerun tests):
 * the biggest set wave at a size and tide, every crest forced to one ψ, the sheet and the lip on one clock.
 */
export function peakSetup(sizeFt = 12, tideM = 0): { field: ReefField; wave: ActiveWave; ctx: { omega: number; travelX: number; travelZ: number } } {
  const field = computeReefField({ bed: downsample(buildBathymetry(), 2), periodS: 15, fromDeg: 225, tideM });
  const ctx = { omega: field.omega, travelX: field.far.dirX, travelZ: field.far.dirZ };
  const c = cloneConditions(DEFAULT_CONDITIONS); c.swell.sizeFt = sizeFt;
  const big = wavesOfSet(1, c, DEFAULT_SET_PARAMS).reduce((a, b) => (b.heightM > a.heightM ? b : a));
  const wave: ActiveWave = { arrivalS: 0, heightM: big.heightM, omega: ctx.omega, travelX: ctx.travelX, travelZ: ctx.travelZ, crestLengthM: 400, crestOffsetM: 0 };
  return { field, wave, ctx };
}
const MID12 = peakSetup();
export const { field, wave, ctx } = MID12;

const P = DEFAULT_BREAK_PARAMS;
/** The station on the peak's ray whose section has been broken tb seconds (null: 40 m up the ray, unbroken), at ψ. The search
 * reaches 220 m seaward: on the softened ramp a 12 ft set breaks ~130 m out. */
export function peakStation(psi: number, tb: number | null, o: { setup?: ReturnType<typeof peakSetup>; offshoreMs?: number } = {}) {
  const { field: f, wave: w, ctx: cx } = o.setup ?? MID12;
  const f00 = sampleField(f, 0, 0);
  const onRay = (s: number) => ({ x: f00.dirX * s, z: f00.dirZ * s });
  const tbAlong = (s: number): number | null => { const p = onRay(s); const rec = sampleOnset(f, p.x, p.z); return rec ? onsetTime(rec, 0, w.heightM, P) : null; };
  let s0 = -40;
  if (tb !== null) { let lo = -220, hi = 60; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2, v = tbAlong(m); if (v === null || v < tb) lo = m; else hi = m; } s0 = (lo + hi) / 2; }
  const p0 = onRay(s0), f0 = sampleField(f, p0.x, p0.z), t = f0.tau;
  const sheet: BreakOptions = { ...breakOptions(f, P, o.offshoreMs ?? 0), force: { psi } };
  const along = (opt: BreakOptions) => (u: number): Vec2 => {
    const x = p0.x + f0.dirX * u, z = p0.z + f0.dirZ * u, r = sumWaves(x, z, t, sampleField(f, x, z), [w], cx, opt);
    return [u + r.dx * f0.dirX + r.dz * f0.dirZ, r.eta];
  };
  const rec = sampleOnset(f, p0.x, p0.z), lipH = rec && tb !== null ? onsetHeight(rec, 0, w.heightM, P) : null;
  const input: ProfileInput = { H: localHeight(w, f0), c: cx.omega / f0.k, r: breakingRatio(w.heightM * f0.amp, f0.hminBreak, P), tb: tb === null ? null : tbAlong(s0), psi, offshoreMs: o.offshoreMs ?? 0, lipH };
  return { base: along(sheet), frameBase: along({ ...sheet, pile: false }), input, lip: withSheetShape(P, psi), s0 };
}
/** The lip's landing time at ψ: the station where tb equals its own τ_land (three fixed-point steps from 1 s). */
export function peakLanding(psi: number, o: { setup?: ReturnType<typeof peakSetup>; offshoreMs?: number } = {}): number {
  let tb = 1;
  for (let i = 0; i < 3; i++) { const st = peakStation(psi, tb, o); tb = profileFrame(st.frameBase, st.input, st.lip).tauLand; }
  return tb;
}
