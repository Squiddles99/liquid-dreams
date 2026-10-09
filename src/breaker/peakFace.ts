import type { WaveEvent } from '../swell/sets';
import { TIP } from '../seabed/wombReef';
import { type BreakParams, breakingRatio, breakingStage, faceHeight } from './breaking';
import { type ReefField, sampleField } from './reefField';
import { psiStateLabel } from './overturn';
import { breakOptions, crestAt, localHeight, toActiveWave } from './setWaveModel';

const M_PER_FT = 0.3048;

export interface PeakFace {
  /** Crest to drained trough (m) as the wave's crest passes the peak. */
  faceM: number;
  /** The crest's breaking stage at the peak. */
  stage: number;
}

/**
 * The wave at the peak now (its crest within half a period of it) and its face there: the surfer-feet calibration
 * readout (spec §3.7). Null with no field yet or no wave at the peak.
 */
export function peakFace(field: ReefField | null, events: readonly WaveEvent[], t: number, p: BreakParams): PeakFace | null {
  if (!field) return null;
  const e = events.find((w) => Math.abs(w.arrivalS - t) <= w.periodS / 2);
  if (!e) return null;
  const f = sampleField(field, TIP[0], TIP[1]);
  const w = toActiveWave(e);
  const r = p.enabled ? breakingRatio(w.heightM * f.amp, f.hminBreak, p) : 0;
  const stage = breakingStage(r, p);
  return { faceM: faceHeight(localHeight(w, f), r, p), stage };
}

/** "4.3 m (14 ft) face, breaking" for the Sets folder. */
export function formatPeakFace(face: PeakFace | null, hasField: boolean): string {
  if (!hasField) return 'waiting for the reef field';
  if (!face) return 'no wave at the peak';
  return `${face.faceM.toFixed(1)} m (${Math.round(face.faceM / M_PER_FT)} ft) face, ${face.stage > 0 ? 'breaking' : 'not breaking'}`;
}

/** The ψ of the wave at the peak now (its crest within half a period of it), as the sheet reads it; null if none. */
export function peakPsi(field: ReefField | null, events: readonly WaveEvent[], t: number, p: BreakParams, offshoreMs: number): number | null {
  if (!field || !p.enabled) return null;
  const e = events.find((w) => Math.abs(w.arrivalS - t) <= w.periodS / 2);
  if (!e) return null;
  const w = toActiveWave(e), ctx = { omega: field.omega, travelX: field.far.dirX, travelZ: field.far.dirZ };
  return crestAt(TIP[0], TIP[1], t, sampleField(field, TIP[0], TIP[1]), w, ctx, breakOptions(field, p, offshoreMs))?.psi ?? null;
}

/** "ψ 0.065, cylinder (5)" for the Sets folder. */
export function formatPeakPsi(psi: number | null, hasField: boolean): string {
  if (!hasField) return 'waiting for the reef field';
  if (psi === null) return 'no wave at the peak';
  return `ψ ${psi.toFixed(3)}, ${psiStateLabel(psi)}`;
}
