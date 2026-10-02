import { smoothstep } from '../math/smoothstep';

/**
 * The kelp's lean (spec 2026-10-02-reef-flow-and-kelp-design.md §4.2–4.3). The lean is a vector in xz: its direction
 * is where the fronds stream, its length how far over the kelp lies (0 upright, 1 flat). It follows a steady lean set by
 * the flow 0.5 m above the bed, through a damped spring, on a toroidal grid of world cells around the camera.
 */

/** Flow speed (m/s) setting the steady lean: tanh((u / KELP_FLAT_MS)²) of flat, toward the flow. */
export const KELP_FLAT_MS = 2.2;
/** The spring: natural period (s) and damping ratio (overshoot ≈ 20%). */
export const KELP_PERIOD_S = 1.5;
export const KELP_DAMPING = 0.45;
/** The lean's rate (1/s) is clamped here: finite at any step. */
export const KELP_MAX_RATE = 20;
/** The canopy's standing height (m), and how much of it a flat lean takes away. */
export const KELP_HEIGHT_M = 0.8;
export const KELP_FLATTEN = 0.8;
/** The kelp reads the flow this far above the bed (m). */
export const KELP_FLOW_Y_M = 0.5;
/** The lean grid: KELP_GRID_N × KELP_GRID_N world cells of KELP_CELL_M m centred on the camera, motion fading over its last KELP_FADE_M. */
export const KELP_GRID_N = 128;
export const KELP_CELL_M = 1;
export const KELP_FADE_M = 8;
/** A jump in sim time replays this much (s): the spring's lag is right when the picture appears. */
export const KELP_REPLAY_S = 4;

export interface KelpState {
  lx: number;
  lz: number;
  vx: number;
  vz: number;
}

export function kelpSteadyLean(ux: number, uz: number): [number, number] {
  const u = Math.hypot(ux, uz);
  if (!(u > 1e-9)) return [0, 0];
  const lean = Math.tanh((u / KELP_FLAT_MS) ** 2);
  return [(ux / u) * lean, (uz / u) * lean];
}

const W0 = (2 * Math.PI) / KELP_PERIOD_S;

/** One semi-implicit Euler step of the spring toward the steady lean for flow (ux, uz); the lean stays within flat. */
export function kelpStep(s: KelpState, ux: number, uz: number, dt: number): KelpState {
  const [tx, tz] = kelpSteadyLean(ux, uz);
  let vx = s.vx + dt * (W0 * W0 * (tx - s.lx) - 2 * KELP_DAMPING * W0 * s.vx);
  let vz = s.vz + dt * (W0 * W0 * (tz - s.lz) - 2 * KELP_DAMPING * W0 * s.vz);
  const rate = Math.hypot(vx, vz);
  if (rate > KELP_MAX_RATE) { vx *= KELP_MAX_RATE / rate; vz *= KELP_MAX_RATE / rate; }
  let lx = s.lx + dt * vx, lz = s.lz + dt * vz;
  const l = Math.hypot(lx, lz);
  if (l > 1) {
    lx /= l; lz /= l;
    const out = vx * lx + vz * lz; // no speed further over than flat
    if (out > 0) { vx -= out * lx; vz -= out * lz; }
  }
  return { lx, lz, vx, vz };
}

export function kelpCanopyHeight(lean: number): number {
  return KELP_HEIGHT_M * (1 - KELP_FLATTEN * Math.min(1, Math.max(0, lean)));
}

const mod = (a: number, n: number): number => ((a % n) + n) % n;

export function kelpWindowMin(camX: number, camZ: number): [number, number] {
  return [Math.floor(camX / KELP_CELL_M) - KELP_GRID_N / 2, Math.floor(camZ / KELP_CELL_M) - KELP_GRID_N / 2];
}

export function kelpSlot(wx: number, wz: number): number {
  return mod(wx, KELP_GRID_N) + KELP_GRID_N * mod(wz, KELP_GRID_N);
}

/** The world cell slot `slot` holds in the window starting at (minX, minZ). */
export function kelpCellOfSlot(slot: number, minX: number, minZ: number): [number, number] {
  const sx = slot % KELP_GRID_N, sz = Math.floor(slot / KELP_GRID_N);
  return [minX + mod(sx - minX, KELP_GRID_N), minZ + mod(sz - minZ, KELP_GRID_N)];
}

export function kelpInWindow(wx: number, wz: number, minX: number, minZ: number): boolean {
  return wx >= minX && wx < minX + KELP_GRID_N && wz >= minZ && wz < minZ + KELP_GRID_N;
}

/** The lean's weight at world (x, z): 1 inside, fading to 0 over the window's last KELP_FADE_M, 0 outside. */
export function kelpWindowFade(x: number, z: number, minX: number, minZ: number): number {
  const x0 = minX * KELP_CELL_M, z0 = minZ * KELP_CELL_M, size = KELP_GRID_N * KELP_CELL_M;
  const edge = Math.min(x - x0, x0 + size - x, z - z0, z0 + size - z);
  return smoothstep(0, KELP_FADE_M, edge);
}
