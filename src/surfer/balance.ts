import { Vector3 } from 'three/webgpu';
import { createRng, deriveSeed } from '../conditions/rng';

/** Offsets (m, chest frame) for the lead and trail hands, and a compression offset from the board's heave. */
export interface Balance {
  lead: Vector3;
  trail: Vector3;
  compression: number;
}

const AMP_M = 0.03;
const HEAVE_GAIN = 0.02;
const HEAVE_MAX = 0.15;

/**
 * The balance layer (spec §3.6): slow seeded drifts of a few centimetres at 0.3–0.8 Hz, and the knees soaking up the
 * board's heave. Deterministic in (seed, t), so a moment link reproduces it.
 */
export function balanceAt(seed: number, t: number, amount: number, heaveAccel: number): Balance {
  const a = Math.min(2, Math.max(0, amount));
  const rng = createRng(deriveSeed(seed, 0x5eed));
  const axis = (): number => {
    const f1 = 0.3 + 0.5 * rng.next(), f2 = 0.3 + 0.5 * rng.next(), p1 = 2 * Math.PI * rng.next(), p2 = 2 * Math.PI * rng.next();
    return AMP_M * a * (0.6 * Math.sin(2 * Math.PI * f1 * t + p1) + 0.4 * Math.sin(2 * Math.PI * f2 * t + p2));
  };
  const lead = new Vector3(axis(), axis(), axis()), trail = new Vector3(axis(), axis(), axis());
  return { lead, trail, compression: Math.min(HEAVE_MAX, Math.max(-HEAVE_MAX, heaveAccel * HEAVE_GAIN * a)) };
}
