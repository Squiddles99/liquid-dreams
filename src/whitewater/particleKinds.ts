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
  /** The share of the wind a puff is dragged toward (womb-realism Task 5: the spit's jet is not blown back). */
  backDriftShare: number;
}

/**
 * The four airborne looks (womb-realism Task 5, spec 3.3), per kind: size (m, birth → death), per-puff opacity, life (s),
 * drag (a rate, 1/s: dragTauS = 1 / drag), the most a puff rises above its birth (× its section's A; capped at launch:
 * vy₀ ≤ liftA × A × drag, as the drag takes vy to 0 and the wind has no vertical part) and its share of the wind's drift.
 * Feather: thin, small, short-lived, blown straight back off the crest. Plume: dense, rises to 2 A, drifts back over the
 * wave. Spit: a low, fast, horizontal burst out of the mouth, not blown back. Impact: unchanged (1.5 A). The veil (spray)
 * keeps 3b's numbers and no lift cap.
 */
export interface KindLook {
  sizeM: readonly [number, number];
  alpha: number;
  lifeS: readonly [number, number];
  drag: number;
  liftA: number;
  backDriftShare: number;
}
export const KIND_LOOK: Readonly<Record<'spray' | 'plume' | 'impact' | 'spit' | 'feather', Readonly<KindLook>>> = {
  spray: { sizeM: [0.3, 2], alpha: 0.08, lifeS: [1.2, 2.4], drag: 1 / 0.45, liftA: Infinity, backDriftShare: 1 },
  plume: { sizeM: [1.0, 2.5], alpha: 0.8, lifeS: [3, 5], drag: 0.8, liftA: 2.0, backDriftShare: 0.7 },
  impact: { sizeM: [0.8, 3.5], alpha: 0.32, lifeS: [1.3, 2.4], drag: 1 / 1.1, liftA: 1.5, backDriftShare: 1 },
  spit: { sizeM: [0.4, 1.0], alpha: 0.7, lifeS: [0.5, 0.9], drag: 1.5, liftA: 0.2, backDriftShare: 0.0 },
  // womb-story Task 5 (spec 3.5): a mist on the lip: small, faint, short-lived (was [0.3, 0.8] m, 0.35, [0.6, 1.2] s).
  feather: { sizeM: [0.15, 0.4], alpha: 0.25, lifeS: [0.4, 0.9], drag: 2.0, liftA: 1.0, backDriftShare: 1.0 },
};
/** The most a puff of `look` may climb at launch (m/s) for a section of size A (m). */
export const liftSpeed = (look: Readonly<KindLook>, A: number): number => look.liftA * A * look.drag;
const fromLook = (l: Readonly<KindLook>, gravityMs2: number, isotropic: number): ParticleKind =>
  ({ dragTauS: 1 / l.drag, gravityMs2, sizeM: l.sizeM, opacity: l.alpha, isotropic, backDriftShare: l.backDriftShare });

/** 3b's offshore spray, exactly. */
export const SPRAY_KIND: Readonly<ParticleKind> = { dragTauS: 0.45, gravityMs2: 1.2, sizeM: [0.3, 2], opacity: 0.08, isotropic: 0.3, backDriftShare: 1 };
/** 3c's impact explosion: heavier (falls back within about a second and a half), bigger, denser, whiter side-on. */
export const IMPACT_KIND: Readonly<ParticleKind> = { dragTauS: 1.1, gravityMs2: 7, sizeM: [0.8, 3.5], opacity: 0.32, isotropic: 0.6, backDriftShare: 1 };
/** The plume (whitewater §4.1): spray blown up and back over a pitching lip by an offshore wind: fewer, denser, longer-lived
 * puffs, slow to settle, glowing backlit without going grey side-on (KIND_LOOK.plume since womb-realism Task 5). */
export const PLUME_KIND: Readonly<ParticleKind> = fromLook(KIND_LOOK.plume, 0.3, 0.7);
/** The tube's spit (§4.3; KIND_LOOK.spit since womb-realism Task 5): a low, fast, horizontal jet out of the mouth, no
 * gravity (it stays within 0.2 A of the mouth's height), not blown back. */
export const SPIT_KIND: Readonly<ParticleKind> = fromLook(KIND_LOOK.spit, 0, 0.6);
/** Crest feathering (whitewater §4.2; KIND_LOOK.feather since womb-realism Task 5): thin wisps off a standing crest, blown
 * straight back, slower to settle than the veil. */
export const FEATHER_KIND: Readonly<ParticleKind> = fromLook(KIND_LOOK.feather, 0.5, 0.6);
/** A particle's kind (meta.y): one pool draws every kind; a pool's constructor kind is its births' default. */
export const KIND_INDEX = { spray: 0, plume: 1, impact: 2, spit: 3, feather: 4 } as const;
export const PARTICLE_KINDS: readonly Readonly<ParticleKind>[] = [SPRAY_KIND, PLUME_KIND, IMPACT_KIND, SPIT_KIND, FEATHER_KIND];
/** Plume and spit puffs dissolve by an animated noise threshold with age (whitewater §4.1), not a uniform fade. */
export const ERODING_KINDS: readonly number[] = [KIND_INDEX.plume, KIND_INDEX.spit];
/** The kind's index in PARTICLE_KINDS (by identity; an unknown kind is the spray). */
export const kindIndexOf = (k: Readonly<ParticleKind>): number => Math.max(0, PARTICLE_KINDS.indexOf(k));
