/** What the set-wave model needs to know about the water at one point, for the field's mean swell. */
export interface FieldSample {
  /** Arrival time (s) relative to the peak: a crest that reaches the peak at t0 is here at t0 + tau. */
  tau: number;
  /** Height amplification relative to the 30 m reference water (shoaling × refraction). */
  amp: number;
  /** Shallowest still-water depth (m) met on the way here (for the breaking-depth cap). */
  hmin: number;
  /** Local wavenumber (rad/m) for the mean period. */
  k: number;
  /** Unit travel direction. */
  dirX: number;
  dirZ: number;
  /** Still-water depth (m) here, including the tide. */
  depth: number;
}
