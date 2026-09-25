export interface SpringState {
  value: number;
  velocity: number;
}

/** Exact critically damped spring step: stable for any dt, never overshoots from rest. */
export function stepCriticalSpring(s: SpringState, target: number, omega: number, dt: number): SpringState {
  const x0 = s.value - target;
  const v0 = s.velocity;
  const e = Math.exp(-omega * dt);
  return {
    value: target + (x0 + (v0 + omega * x0) * dt) * e,
    velocity: (v0 - omega * (v0 + omega * x0) * dt) * e,
  };
}
