import { clamp, float, mix, select, smoothstep } from 'three/tsl';
import { PSI_MIN, PSI_NONE, SHEET_POINTS } from './overturn';

type N = any;

/**
 * The GPU mirror of overturn.ts's sheet rules (the lip's tube is mirrored in lipProfileNodes.ts): the crest's ψ from the
 * record's ψ₀ and the game rules, and the trough drain and surge it sets. overturn.ts stays the source of truth.
 */

/** overturn.effectivePsi on the GPU: ψ₀ × drain × (1 + dial·draw) × (1 + nudge). */
export function effectivePsiNode(psi0: N, drain: N, draw: N, u: { psiNudge: N; randomDial: N }): N {
  return float(psi0).mul(drain).mul(float(1.0).add(u.randomDial.mul(draw))).mul(float(1.0).add(u.psiNudge));
}

/** overturn.sheetShape on the GPU: SHEET_POINTS, smoothstep-eased between neighbours, held past the ends. */
export function sheetShapeNode(psi: N): { troughDrain: N; pileSurge: N } {
  const [a, b, c] = SHEET_POINTS;
  const q = clamp(float(psi), a[0], c[0]);
  const upper = q.greaterThanEqual(b[0]);
  const t = select(upper, smoothstep(b[0], c[0], q), smoothstep(a[0], b[0], q));
  return {
    troughDrain: select(upper, mix(float(b[1]), float(c[1]), t), mix(float(a[1]), float(b[1]), t)),
    pileSurge: select(upper, mix(float(b[2]), float(c[2]), t), mix(float(a[2]), float(b[2]), t)),
  };
}

/** The tube's presence at ψ (overturn.overturnShape's presence): the sheet's plunge (breaking.lifecycle). */
export function plungeNode(psi: N): N {
  return smoothstep(PSI_NONE, PSI_MIN, float(psi));
}
