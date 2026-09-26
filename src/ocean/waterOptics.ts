import type { Rgb } from '../sky/atmosphereParams';
import { CASCADE_FADES, type CascadeFade, fadeWeight } from './cascadeFades';

export interface WaterOpticsParams {
  /** Pure-water absorption (1/m), RGB. */
  absorptionPerM: Rgb;
  /** Backscattering (1/m) of very clear oceanic water, RGB. */
  backscatterPerM: Rgb;
  bodyScale: number;
  /** Path length through a crest for the transmission tint. */
  transmissionThicknessM: number;
  transmissionIntensity: number;
  baseRoughness: number;
  foamAlbedo: number;
}

export const DEFAULT_WATER_OPTICS: WaterOpticsParams = {
  absorptionPerM: [0.45, 0.07, 0.02],
  backscatterPerM: [0.0004, 0.001, 0.0024],
  bodyScale: 1,
  transmissionThicknessM: 2,
  transmissionIntensity: 0.6,
  baseRoughness: 0.02,
  foamAlbedo: 0.85,
};

/** Single-scattering albedo of the deep water column: bb / (a + bb). */
export function waterAlbedo(p: WaterOpticsParams): Rgb {
  return [0, 1, 2].map((i) => p.backscatterPerM[i] / (p.absorptionPerM[i] + p.backscatterPerM[i])) as Rgb;
}

/** Colour of sunlight after passing through a crest: exp(−a·thickness). */
export function transmissionColour(p: WaterOpticsParams): Rgb {
  return [0, 1, 2].map((i) => Math.exp(-p.absorptionPerM[i] * p.transmissionThicknessM)) as Rgb;
}

/** Slope variance of cascades whose normals have faded at this distance (widens the sun glitter instead). */
export function unresolvedSlopeVariance(distance: number, slopeVariance: readonly number[], fades: readonly CascadeFade[] = CASCADE_FADES): number {
  return slopeVariance.reduce((sum, v, c) => sum + (1 - fadeWeight(distance, fades[c].normals)) * v, 0);
}
