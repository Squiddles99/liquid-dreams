/** What the set-wave model needs to know about the water at one point, for the field's mean swell. */
export interface FieldSample {
  /** Arrival time (s) relative to the peak: a crest that reaches the peak at t0 is here at t0 + tau. */
  tau: number;
  /** Height amplification relative to the 30 m reference water (shoaling × refraction). */
  amp: number;
  /** Shallowest still-water depth (m) met on the way here (for the breaking-depth cap). */
  hmin: number;
  /**
   * The breaking depth (m): amp over amp/hmin smoothed along the crest (reefField.BREAK_SMOOTHING_M), so the breaking
   * ratio, ∝ amp/hminBreak, is the along-crest average of the unsmoothed one. The ratio, the stage and the bore read it,
   * so a section's breaking fades in and out over a few wave heights of crest instead of switching where one ray passed
   * the reef's edge and its neighbour didn't; the Phase 1 height cap reads hmin.
   */
  hminBreak: number;
  /** Local wavenumber (rad/m) for the mean period. */
  k: number;
  /** Unit travel direction. */
  dirX: number;
  dirZ: number;
  /** Still-water depth (m) here, including the tide. */
  depth: number;
}
