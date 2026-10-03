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
  /** Diffuse skylight through a thin lip, seen from beneath it (the tube's ceiling), as a fraction of the transmission's
   * scale (the sun-backlit part is 1). */
  lipSkyTransmission: number;
  /** Diffuse skylight through the lip seen from the side (the lineup, down the line), as a fraction of the transmission's
   * scale; from beneath it is lipSkyTransmission. */
  lipSideSkylight: number;
  /** The thrown lip's bubbles (1/m): of the light entering it, 1 − exp(−lipBubbleScatter × thickness) scatters back out,
   * on any side (spec 2026-10-03 lip-and-tube-look §4; tuned against Andrew's image10). */
  lipBubbleScatter: number;
  baseRoughness: number;
  foamAlbedo: number;
}

export const DEFAULT_WATER_OPTICS: WaterOpticsParams = {
  absorptionPerM: [0.45, 0.07, 0.02],
  backscatterPerM: [0.0004, 0.001, 0.0024],
  bodyScale: 1,
  transmissionThicknessM: 2,
  transmissionIntensity: 0.6,
  lipSkyTransmission: 0.5,
  lipSideSkylight: 0.6,
  lipBubbleScatter: 0.5,
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

/** The lip thickness (m) at which the light through it has come transmissionThicknessM through the water. */
export const LIP_REFERENCE_THICKNESS_M = 0.3;

/** The colour of light through a lip `thicknessM` thick: exp(−a·transmissionThicknessM·thickness / LIP_REFERENCE_THICKNESS_M). */
export function lipTransmissionColour(p: WaterOpticsParams, thicknessM: number): Rgb {
  const path = (p.transmissionThicknessM * Math.max(thicknessM, 0)) / LIP_REFERENCE_THICKNESS_M;
  return [0, 1, 2].map((i) => Math.exp(-p.absorptionPerM[i] * path)) as Rgb;
}

/** Slope variance of cascades whose normals have faded at this distance (widens the sun glitter instead). */
export function unresolvedSlopeVariance(distance: number, slopeVariance: readonly number[], fades: readonly CascadeFade[] = CASCADE_FADES): number {
  return slopeVariance.reduce((sum, v, c) => sum + (1 - fadeWeight(distance, fades[c].normals)) * v, 0);
}

/** The share of the light entering a lip `thicknessM` thick that its bubbles scatter back out. */
export function lipScatterShare(p: WaterOpticsParams, thicknessM: number): number {
  return 1 - Math.exp(-p.lipBubbleScatter * Math.max(thicknessM, 0));
}

/**
 * The lip's glow (shadeWater's mirror): sun (× |cos| to the lip's surface: it enters through whichever face it lights) and
 * sky entering the lip, scattered out by its bubbles, coloured by the water crossed (lipTransmissionColour). Radiance.
 */
export function lipGlow(p: WaterOpticsParams, thicknessM: number, sunCos: number, sun: Rgb, sky: Rgb): Rgb {
  const c = lipTransmissionColour(p, thicknessM), share = lipScatterShare(p, thicknessM), cos = Math.abs(sunCos);
  return [0, 1, 2].map((i) => (c[i] * (sun[i] * cos + sky[i]) * share) / Math.PI) as Rgb;
}

/** The light straight through the lip (shadeWater's `transmitted`, lip mask 1): the sun from behind it (backCos =
 * dot(−view, sun)) and the skylight through it from beneath and the side. Radiance. */
export function lipThroughLight(p: WaterOpticsParams, thicknessM: number, backCos: number, underside: number, sun: Rgb, sky: Rgb): Rgb {
  const c = lipTransmissionColour(p, thicknessM), back = Math.max(backCos, 0) ** 4, side = Math.max(underside, p.lipSideSkylight);
  return [0, 1, 2].map((i) => (c[i] * (sun[i] * back + sky[i] * p.lipSkyTransmission * side) * p.transmissionIntensity) / Math.PI) as Rgb;
}

/** The deep water's own light lit from straight up (shadeWater's upwelling, no tube): albedo × (sky + sun × sunY) / π. */
export function deepUpwelling(p: WaterOpticsParams, sunY: number, sun: Rgb, sky: Rgb): Rgb {
  const a = waterAlbedo(p);
  return [0, 1, 2].map((i) => (a[i] * (sky[i] + sun[i] * Math.max(sunY, 0)) * p.bodyScale) / Math.PI) as Rgb;
}

/** The tube's light (shadeWater's mirror, spec 2026-10-03 lip-and-tube-look R3.4): the sun's factor (direct + through the
 * lip, tinted), the sky's (open + through the lip, tinted and dimmed) and the glitter's (the direct sun only). */
export function tubeLightFactors(p: WaterOpticsParams, sLip: number, sBody: number, o: number, tLip: number): { sun: Rgb; sky: Rgb; glitter: number } {
  const c = lipTransmissionColour(p, tLip), direct = Math.max(0, 1 - sLip - sBody);
  return {
    sun: [0, 1, 2].map((i) => direct + sLip * c[i]) as Rgb,
    sky: [0, 1, 2].map((i) => o + (1 - o) * c[i] * p.lipSkyTransmission) as Rgb,
    glitter: direct,
  };
}
