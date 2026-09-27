/**
 * The particle system's kinds (spec 2026-09-28-impact-explosion-design.md §3.1): the 3b offshore spray (mist) and the 3c
 * impact explosion (dense, heavy water). One pool, schedule and material per system; only these numbers differ.
 */
export interface ParticleKind {
  /** The wind takes a puff over with this time constant (s). */
  dragTauS: number;
  /** Downward acceleration (m/s²): mist settles, thrown water falls. */
  gravityMs2: number;
  /** Size (m) at birth and at death. */
  sizeM: readonly [number, number];
  /** Per-puff opacity at strength 1. */
  opacity: number;
  /** The phase function's isotropic share (dense water scatters more evenly). */
  isotropic: number;
}

/** 3b's offshore spray, exactly. */
export const SPRAY_KIND: Readonly<ParticleKind> = { dragTauS: 0.45, gravityMs2: 1.2, sizeM: [0.3, 2], opacity: 0.08, isotropic: 0.3 };
/** 3c's impact explosion: heavier (falls back within about a second and a half), bigger, denser, whiter side-on. */
export const IMPACT_KIND: Readonly<ParticleKind> = { dragTauS: 1.1, gravityMs2: 7, sizeM: [0.5, 2.5], opacity: 0.2, isotropic: 0.6 };
