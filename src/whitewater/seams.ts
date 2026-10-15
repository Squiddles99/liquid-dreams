import { flightTime, sectionEnd } from '../breaker/wombSection';
import { CURTAIN_EROSION_S, curtainErosion } from './curlFoam';
import { boilFreshness, solidBoil } from './pileChurn';
import { IMPACT_DELAY_S, IMPACT_WINDOW_S } from './sprayEmitters';

/**
 * The seams (breaking-look item 6): one timeline per station, from the lip's landing to the hand-back, each look's weight
 * (overlaps, never gaps). Times are seconds after the landing (τ_land = flightTime(H)).
 *
 * | look | in | out |
 * |---|---|---|
 * | lip chop (BreakingRibbon LIP_CHOP_SHARE) | 1 on the face | 0.6 on the lip, by lipness |
 * | the landed curtain (curlFoam.curtainErosion) | landing | eroded over CURTAIN_EROSION_S = [0.2, 0.85] |
 * | the impact (sprayEmitters.inImpactWindow) | 0.2 | 0.55 |
 * | the solid boil, the white-water volume (pileChurn.boilFreshness) | rises over 0.5 | fades over FRESH_FADE_S after sectionEnd |
 * | the lace (the sheet's map foam) | as the solid boil fades | its own decay (FoamField) |
 */
export const SEAM_TABLE = {
  curtain: CURTAIN_EROSION_S,
  impact: [IMPACT_DELAY_S, IMPACT_DELAY_S + IMPACT_WINDOW_S] as const,
} as const;

export interface LookWeights { curtain: number; impact: number; solid: number; lace: number }

/** Each look's weight at `sinceLandS` after a station of height H lands (wave period periodS). The lace is the map's foam
 * where the solid boil has faded (the sheet's lace under it: 1 − solid while the bore's foam lasts). */
export function lookWeights(sinceLandS: number, H: number, periodS: number): LookWeights {
  const tb = flightTime(H) + sinceLandS;
  const solid = solidBoil(boilFreshness(tb, H, periodS), 1);
  const impact = sinceLandS >= SEAM_TABLE.impact[0] && sinceLandS < SEAM_TABLE.impact[1] ? 1 : 0;
  return { curtain: sinceLandS >= 0 ? 1 - curtainErosion(sinceLandS) : 0, impact, solid, lace: sinceLandS >= 0 ? 1 - solid : 0 };
}

/** The station's span from its landing to the hand-back (s after landing): the solid boil gone (sectionEnd + its fade). */
export function seamSpanS(H: number, periodS: number, fadeS = 2): number {
  return sectionEnd(H, periodS) + fadeS - flightTime(H);
}
