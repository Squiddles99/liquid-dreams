/** Metres of Hs per surfer foot at DIAL_ANCHOR_FT (the provisional Phase 0 mapping, kept there). */
export const SURFER_FT_TO_HS_M = 0.4;
/**
 * The dial set by the breaking face (Andrew, 2026-10-02; the first-light spec's Phase 2 calibration): on the reef build's
 * steep face the smaller sizes rode up onto the 6 m ledge and stood up before breaking, while 12 ft broke at the face's
 * foot, so with Hs linear in feet 12 ft's face was only 1.8× 6 ft's (11.2 m against 6.3 m; 4 ft 4.3 m). Hs ∝
 * (ft/12)^DIAL_EXPONENT, 12 ft as it was, puts the faces in proportion to the feet: 3.8, 5.6, 8.0 and 11.2 m at 4, 6, 8
 * and 12 ft (mid tide, the biggest set wave as it breaks).
 */
export const DIAL_ANCHOR_FT = 12;
export const DIAL_EXPONENT = 1.15;

export function surferFeetToHs(sizeFt: number): number {
  const ft = Math.max(0, sizeFt);
  return SURFER_FT_TO_HS_M * DIAL_ANCHOR_FT * (ft / DIAL_ANCHOR_FT) ** DIAL_EXPONENT;
}

const KMH_PER_MS = 3.6;

/** Wind speed is stored in m/s (canonical); the panel edits it in km/h through a proxy. */
export function msToKmh(ms: number): number {
  return ms * KMH_PER_MS;
}

export function kmhToMs(kmh: number): number {
  return kmh / KMH_PER_MS;
}
