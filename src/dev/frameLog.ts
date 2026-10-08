/** One frame of the stall log (ride-stall spec §4): wall time, frame gap, sim time, the last resolved GPU ms, the
 * ticks each particle system ran, the underwater flag, whether the ribbon rebuilt, pipelines still building (and which). */
export interface FrameRecord {
  t: number;
  dt: number;
  sim: number;
  gpu: number;
  foam: number;
  spray: number;
  impact: number;
  kelp: number;
  under: 0 | 1;
  ribbon: 0 | 1;
  pending: number;
  /** The pending builds' labels (AsyncPipelines.inflight), '|'-joined; empty when none (ride-stall Task 4c). */
  building: string;
}

export const FRAME_LOG_CAP = 4096;

/** A ring of the last FRAME_LOG_CAP frames, written by App.frame while `on` (the profiler switches it on). */
export class FrameLog {
  on = false;
  private ring: FrameRecord[] = [];

  record(f: FrameRecord): void {
    if (!this.on) return;
    this.ring.push(f);
    if (this.ring.length > FRAME_LOG_CAP) this.ring.splice(0, this.ring.length - FRAME_LOG_CAP);
  }

  /** The records so far, oldest first; the ring is emptied. */
  drain(): FrameRecord[] {
    const out = this.ring;
    this.ring = [];
    return out;
  }
}
