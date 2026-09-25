export const MAX_FRAME_DT_S = 0.1;

export function clampFrameDt(dtS: number): number {
  if (!Number.isFinite(dtS) || dtS <= 0) return 0;
  return Math.min(dtS, MAX_FRAME_DT_S);
}

/** Never return a zero dimension: WebGPU cannot create 0×0 render targets (e.g. minimised window). */
export function viewportSize(width: number, height: number): { width: number; height: number } {
  return { width: Math.max(1, Math.floor(width)), height: Math.max(1, Math.floor(height)) };
}

/** Simulation time. Real time keeps flowing for cameras; sim time stops when paused. */
export class SimClock {
  simTime = 0;
  paused = false;

  tick(realDtS: number): number {
    const dt = clampFrameDt(realDtS);
    if (this.paused) return 0;
    this.simTime += dt;
    return dt;
  }

  setTime(t: number): void {
    this.simTime = Math.max(0, t);
  }
}
