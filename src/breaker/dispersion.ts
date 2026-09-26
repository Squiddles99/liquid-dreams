import { GRAVITY } from '../ocean/spectrum';

/** Shallowest depth the wave physics uses; dry or negative depths are clamped to it. */
export const MIN_DEPTH_M = 0.05;

/** Wavenumber k (rad/m) solving ω² = g·k·tanh(k·h): Fenton–McKee start, then Newton. */
export function waveNumber(omega: number, depthM: number): number {
  const h = Math.max(depthM, MIN_DEPTH_M);
  const k0 = (omega * omega) / GRAVITY;
  let k = k0 / Math.pow(Math.tanh(Math.pow(k0 * h, 0.75)), 2 / 3);
  for (let i = 0; i < 6; i++) {
    const th = Math.tanh(k * h);
    const f = GRAVITY * k * th - omega * omega;
    const df = GRAVITY * th + GRAVITY * k * h * (1 - th * th);
    k -= f / df;
  }
  return k;
}

/** Group speed (m/s): cg = c·½·(1 + 2kh / sinh 2kh). */
export function groupSpeed(omega: number, k: number, depthM: number): number {
  const kh2 = 2 * k * Math.max(depthM, MIN_DEPTH_M);
  const n = kh2 > 40 ? 0.5 : 0.5 * (1 + kh2 / Math.sinh(kh2));
  return (omega / k) * n;
}
