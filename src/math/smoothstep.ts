/** Hermite smoothstep, 0 at e0 and 1 at e1 (either order), clamped. Mirrors TSL/GLSL smoothstep. */
export function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}
