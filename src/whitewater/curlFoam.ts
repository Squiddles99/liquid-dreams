import { float, max, smoothstep } from 'three/tsl';
import { LIP_PHASES } from '../breaker/wombSection';
import { smoothstep as smoothstepCpu } from '../math/smoothstep';

type N = any;

/**
 * The curl's own foam with photo 5's timing (whitewater spec §3.4): the lip clean and translucent to its tip while it is
 * thrown, only the tip's edge a thin white band that tracks down the curtain (tipFringeAt: its own solid band, not the
 * sheet's lace, F2); the lip's face and the tube's inside clean until the tube caves in, then foam climbing from the tip
 * (curlFoamAt, through the lace). CPU references; the nodes mirror them (same constants).
 */
export const FRINGE_WIDTH = 0.02;      // of the lip's reach (tip → crest), the white edge (breaking-look item 4: a torn edge, not a hose; F2 had 0.06)
export const FACE_FOAM_PHASE: readonly [number, number] = [1.2, 1.5];  // foam climbs the lip's face as the tube caves in
export const CLEAN_TUBE = 0.8;         // how much of the sheet's foam the open tube's inside hides (negative zone)

/** The lip thrown (in over LIP_PHASES 0–1, out over 2–3): the ribbon's lipness window. */
const thrownCpu = (phase: number): number => smoothstepCpu(LIP_PHASES[0], LIP_PHASES[1], phase) * (1 - smoothstepCpu(LIP_PHASES[2], LIP_PHASES[3], phase));

/** Signed foam at a ribbon sample, through the lace: + the caving lip's foam, − the clean tube's share.
 *  offOverReach = |j − tip| / reach; inside = 1 on the tube's inside samples (j past the tip toward the floor), else 0. */
export function curlFoamAt(phase: number, offOverReach: number, inside: number, curl: number): number {
  const caving = smoothstepCpu(FACE_FOAM_PHASE[0], FACE_FOAM_PHASE[1], phase);
  const face = caving * (1 - smoothstepCpu(0, 1, offOverReach)) * (1 - inside);
  const clean = -CLEAN_TUBE * inside * (1 - caving);
  return (face + clean) * curl;
}

/** The tip's fringe [0, 1] at a ribbon sample: solid over the FRINGE_WIDTH of the reach nearest the tip while the lip is
 *  thrown, on the lip's own samples only (onLip = 1 from the tip toward the crest). */
export function tipFringeAt(phase: number, offOverReach: number, onLip: number): number {
  return (1 - smoothstepCpu(0, FRINGE_WIDTH, offOverReach)) * thrownCpu(phase) * onLip;
}

export function curlFoamNode(phase: N, offOverReach: N, inside: N, curl: N): N {
  const caving = smoothstep(FACE_FOAM_PHASE[0], FACE_FOAM_PHASE[1], phase);
  const face = caving.mul(float(1.0).sub(smoothstep(0.0, 1.0, offOverReach))).mul(float(1.0).sub(inside));
  const clean = inside.mul(float(1.0).sub(caving)).mul(-CLEAN_TUBE);
  return face.add(clean).mul(curl);
}

export function tipFringeNode(phase: N, offOverReach: N, onLip: N): N {
  const thrown = smoothstep(LIP_PHASES[0], LIP_PHASES[1], phase).mul(float(1.0).sub(smoothstep(LIP_PHASES[2], LIP_PHASES[3], phase)));
  return float(1.0).sub(smoothstep(0.0, FRINGE_WIDTH, offOverReach)).mul(thrown).mul(onLip);
}

/**
 * The fringe rides in the ribbon's normal buffer .w beside the inner flag (0 or 1, read as > 0.5 by the footprint):
 * inner × (1 + fringe). The tip is always far inside the section's edges (inner 1), so no fringe is lost; next to an
 * outer vertex (w 0) the fringe is 0, so the flag interpolates as it did.
 */
export const packInnerFringe = (inner: number, fringe: number): number => inner * (1 + fringe);
export const unpackInner = (w: number): number => (w > 0.5 ? 1 : 0);
export const unpackFringe = (w: number): number => Math.max(w - 1, 0);
export const packInnerFringeNode = (inner: N, fringe: N): N => inner.mul(float(fringe).add(1.0));
export const unpackFringeNode = (w: N): N => max(float(w).sub(1.0), 0.0);

/**
 * The landed curtain's erosion (breaking-look item 4, lever L5): from the impact's start (IMPACT_DELAY_S after the lip lands)
 * over the impact window + CURTAIN_EROSION_TAIL_S, the curtain's samples discard by a noise threshold rising linearly with the
 * time since landing (the sprites' erosion rule), so the impact and the white water take over and no tube of foam lies on
 * the sea. 0 before, 1 after. Constants mirror sprayEmitters.IMPACT_DELAY_S / IMPACT_WINDOW_S (curlFoam.test checks).
 */
export const CURTAIN_IMPACT_DELAY_S = 0.2, CURTAIN_IMPACT_WINDOW_S = 0.35, CURTAIN_EROSION_TAIL_S = 0.3;
export const CURTAIN_EROSION_S: readonly [number, number] = [CURTAIN_IMPACT_DELAY_S, CURTAIN_IMPACT_DELAY_S + CURTAIN_IMPACT_WINDOW_S + CURTAIN_EROSION_TAIL_S];
export function curtainErosion(sinceLandS: number): number {
  return Math.min(1, Math.max(0, (sinceLandS - CURTAIN_EROSION_S[0]) / (CURTAIN_EROSION_S[1] - CURTAIN_EROSION_S[0])));
}
export function curtainErosionNode(sinceLandS: N): N {
  return float(sinceLandS).sub(CURTAIN_EROSION_S[0]).div(CURTAIN_EROSION_S[1] - CURTAIN_EROSION_S[0]).clamp(0.0, 1.0);
}
/** The station's lane value before its lip lands (packStations): erosion 0. */
export const NOT_LANDED = -1e3;
/** The fringe's droplets: where the 0.25 m grain (∈ [0, 1]) is under FRINGE_DROPLET_SHARE the edge is torn open (~40 %). */
export const FRINGE_DROPLET_SHARE = 0.4;

/**
 * Piece 1 (2026-10-16, Andrew's 1792126619: a dark glassy roof with white blotches over his white bore): once a station's
 * tube hold has ended (its lane sinceLand >= 0, BreakingRibbon.sinceLand) its curtain hands over to the foam white over
 * LANDED_WHITE_S and stays white until the erosion removes the row. Only on the samples departing from the sheet
 * (constructed: the curtain, the roof); where the ribbon lies on the sheet the sheet's own foam field shows. The standing lip
 * and curtain (the hold, NOT_LANDED) keep the water. The white is the broken section's (the material's solid foam).
 */
export const LANDED_WHITE_S = 0.25;
export function landedWhite(sinceLandS: number, constructed: number): number {
  return Math.min(1, Math.max(0, sinceLandS / LANDED_WHITE_S)) * constructed;
}
/** The ribbon sample's foam weight and clean-tube share: the curl's own (curlFoamAt × ρ, the clean tube by ρ) with the landed
 *  curtain's white over it (the white fills the tube, so the clean share goes as it rises). */
export function curtainFoamAt(curlFoam: number, rho: number, sinceLandS: number, constructed: number): { foam: number; clean: number } {
  const white = landedWhite(sinceLandS, constructed);
  return { foam: Math.max(Math.min(1, Math.max(0, curlFoam)) * rho, white), clean: Math.min(1, Math.max(0, -curlFoam)) * rho * (1 - white) };
}
export function landedWhiteNode(sinceLandS: N, constructed: N): N {
  return float(sinceLandS).div(LANDED_WHITE_S).clamp(0.0, 1.0).mul(constructed);
}
