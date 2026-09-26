export type Rgb = [number, number, number];

export interface AtmosphereParams {
  groundRadiusKm: number;
  topRadiusKm: number;
  rayleighScatteringPerKm: Rgb;
  rayleighScaleHeightKm: number;
  mieScatteringPerKm: number;
  mieExtinctionPerKm: number;
  mieScaleHeightKm: number;
  mieG: number;
  ozoneAbsorptionPerKm: Rgb;
  ozoneCenterKm: number;
  ozoneHalfWidthKm: number;
  /** Multiplies aerosol (Mie) density: coastal sea haze. */
  hazeFactor: number;
  groundAlbedo: number;
  /** Sun illuminance at the top of the atmosphere, in scene units (exposure handles absolute scale). */
  sunIlluminance: number;
  /** Faint night-sky radiance (luminance) as a fraction of sun illuminance, tinted by NIGHT_FLOOR_TINT, so night isn't pure black. */
  nightFloor: number;
}

const NIGHT_FLOOR_NAVY: Rgb = [0.35, 0.5, 1.0];
const navyLuminance = 0.2126 * NIGHT_FLOOR_NAVY[0] + 0.7152 * NIGHT_FLOOR_NAVY[1] + 0.0722 * NIGHT_FLOOR_NAVY[2];
/** Navy tint for the night floor, scaled to unit (Rec. 709) luminance so `nightFloor` sets its brightness. */
export const NIGHT_FLOOR_TINT: Rgb = [
  NIGHT_FLOOR_NAVY[0] / navyLuminance,
  NIGHT_FLOOR_NAVY[1] / navyLuminance,
  NIGHT_FLOOR_NAVY[2] / navyLuminance,
];

/** Earth-like values from Hillaire 2020, with Mie raised for the Capes' sea haze. */
export const DEFAULT_ATMOSPHERE: AtmosphereParams = {
  groundRadiusKm: 6360,
  topRadiusKm: 6460,
  rayleighScatteringPerKm: [5.802e-3, 13.558e-3, 33.1e-3],
  rayleighScaleHeightKm: 8,
  mieScatteringPerKm: 3.996e-3,
  mieExtinctionPerKm: 4.44e-3,
  mieScaleHeightKm: 1.2,
  mieG: 0.8,
  ozoneAbsorptionPerKm: [0.65e-3, 1.881e-3, 0.085e-3],
  ozoneCenterKm: 25,
  ozoneHalfWidthKm: 15,
  hazeFactor: 2,
  groundAlbedo: 0.1,
  sunIlluminance: 20,
  nightFloor: 7e-7,
};

export function ozoneDensity(hKm: number, p: AtmosphereParams): number {
  return Math.max(0, 1 - Math.abs(hKm - p.ozoneCenterKm) / p.ozoneHalfWidthKm);
}

export function extinctionPerKm(hKm: number, p: AtmosphereParams): Rgb {
  const rayleigh = Math.exp(-hKm / p.rayleighScaleHeightKm);
  const mie = Math.exp(-hKm / p.mieScaleHeightKm) * p.mieExtinctionPerKm * p.hazeFactor;
  const ozone = ozoneDensity(hKm, p);
  return [0, 1, 2].map((i) => p.rayleighScatteringPerKm[i] * rayleigh + mie + p.ozoneAbsorptionPerKm[i] * ozone) as Rgb;
}
