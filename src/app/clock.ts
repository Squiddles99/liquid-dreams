export const MAX_FRAME_DT_S = 0.1;

export function clampFrameDt(dtS: number): number {
  if (!Number.isFinite(dtS) || dtS <= 0) return 0;
  return Math.min(dtS, MAX_FRAME_DT_S);
}

export const DEFAULT_MAX_FPS = 60;
/** Callbacks this close to their slot still render, absorbing requestAnimationFrame jitter on a display at the cap. */
const FRAME_SLACK_MS = 2;

/**
 * Skips animation-loop callbacks beyond `maxFps`, so a 240 Hz display doesn't render (and heat the GPU with)
 * four times the frames the 60 fps budget needs. `maxFps` 0 renders every display refresh.
 */
export class FrameLimiter {
  private nextMs = -Infinity;

  constructor(public maxFps = DEFAULT_MAX_FPS) {}

  shouldRender(nowMs: number): boolean {
    if (this.maxFps <= 0) return true;
    if (nowMs < this.nextMs - FRAME_SLACK_MS) return false;
    const interval = 1000 / this.maxFps;
    // Fell a whole slot behind (first frame, hidden tab, hitch): restart the schedule rather than bursting to catch up.
    this.nextMs = nowMs - this.nextMs > interval ? nowMs + interval : this.nextMs + interval;
    return true;
  }
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
