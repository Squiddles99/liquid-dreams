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
export const IMPACT_KIND: Readonly<ParticleKind> = { dragTauS: 1.1, gravityMs2: 7, sizeM: [0.8, 3.5], opacity: 0.32, isotropic: 0.6 };
/** The plume (whitewater §4.1): spray blown up and back over a pitching lip by an offshore wind: fewer, bigger (2 → 6 m),
 * longer-lived puffs, slow to settle, glowing backlit without going grey side-on. */
export const PLUME_KIND: Readonly<ParticleKind> = { dragTauS: 2.0, gravityMs2: 0.3, sizeM: [3, 10], opacity: 0.3, isotropic: 0.7 };
/** The tube's spit (§4.3): a denser, wider blast, held back or blown on by the wind. Its opacity is the spec's "0.3 → 0.5"
 * on the old per-puff scale (SPIT_OPACITY 0.3 × the impact kind's 0.32 drew 0.096; now 0.5 × 0.32). */
export const SPIT_KIND: Readonly<ParticleKind> = { dragTauS: 0.8, gravityMs2: 3, sizeM: [1, 4], opacity: 0.5 * IMPACT_KIND.opacity, isotropic: 0.6 };
/** Crest feathering (whitewater §4.2, 7b S2): mist off a standing crest, big and faint enough to read as a pale haze along
 * the line from the lookout (the spray kind's 0.3–2 m puffs were sub-pixel there), slower to settle than the veil. */
export const FEATHER_KIND: Readonly<ParticleKind> = { dragTauS: 0.8, gravityMs2: 0.5, sizeM: [1, 4], opacity: 0.2, isotropic: 0.6 };
/** A particle's kind (meta.y): one pool draws every kind; a pool's constructor kind is its births' default. */
export const KIND_INDEX = { spray: 0, plume: 1, impact: 2, spit: 3, feather: 4 } as const;
export const PARTICLE_KINDS: readonly Readonly<ParticleKind>[] = [SPRAY_KIND, PLUME_KIND, IMPACT_KIND, SPIT_KIND, FEATHER_KIND];
/** Plume and spit puffs dissolve by an animated noise threshold with age (whitewater §4.1), not a uniform fade. */
export const ERODING_KINDS: readonly number[] = [KIND_INDEX.plume, KIND_INDEX.spit];
/** The kind's index in PARTICLE_KINDS (by identity; an unknown kind is the spray). */
export const kindIndexOf = (k: Readonly<ParticleKind>): number => Math.max(0, PARTICLE_KINDS.indexOf(k));
