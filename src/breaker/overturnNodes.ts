import { clamp, float, max, mix, select, smoothstep } from 'three/tsl';
import { LH82_AREA, MB_H_OVER_H0, PSI_FIT_MAX, PSI_FOIL_FULL, PSI_MIN, PSI_NONE, SHEET_POINTS, WIND_AREA_POINTS, WIND_ASPECT_POINTS } from './overturn';

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

/** overturn.windUC on the GPU: the onshore wind over the crest speed, −offshore / max(c, 0.5). */
export function windUCNode(offshoreMs: N, c: N): N {
  return float(offshoreMs).negate().div(max(float(c), 0.5));
}

/** overturn's piecewise-linear wind factors (three points, held past the ends). */
function piecewiseNode(points: readonly (readonly [number, number])[], x: N): N {
  const [[x0, y0], [x1, y1], [x2, y2]] = points;
  const v = clamp(float(x), x0, x2);
  return select(v.lessThanEqual(x1), v.sub(x0).mul((y1 - y0) / (x1 - x0)).add(y0), v.sub(x1).mul((y2 - y1) / (x2 - x1)).add(y1));
}

/** overturn.overturnShape on the GPU (inputs finite: the frame pass never feeds it NaN). */
export function overturnShapeNode(psi: N, H: N, uc: N): { presence: N; AO: N; AJ: N; W: N; L: N; theta: N } {
  const q = float(psi), h = max(float(H), 0.0);
  const p = clamp(q, PSI_MIN, PSI_FIT_MAX);
  const foil = smoothstep(PSI_FIT_MAX, PSI_FOIL_FULL, q);
  const fa = piecewiseNode(WIND_AREA_POINTS, uc), fw = piecewiseNode(WIND_ASPECT_POINTS, uc);
  const fit = p.mul(1.661).add(0.298);
  // meadBlackAspect(1 / (ψ·(H/h)^¼)) = 1 / (0.065 / (ψ·(H/h)^¼) + 0.821).
  const mb = float(1.0).div(float(0.065).div(max(q, 1e-6).mul(MB_H_OVER_H0 ** 0.25)).add(0.821));
  const WL = fit.add(max(mb, fit).sub(fit).mul(foil)).mul(fw).toVar();
  const AO = p.mul(5.319).sub(0.043).mul(h).mul(h).mul(fa).toVar();
  const AJ = p.mul(p).mul(37.072).sub(p.mul(0.587)).add(0.02).mul(h).mul(h).mul(fa).toVar();
  const L = AO.div(WL.mul(LH82_AREA)).sqrt().toVar();
  const theta = p.mul(p).mul(-5746.4).add(p.mul(225.2)).add(48.4).mul(Math.PI / 180).toVar();
  return { presence: smoothstep(PSI_NONE, PSI_MIN, q), AO, AJ, W: WL.mul(L), L, theta };
}
